// Provision only Arra's communication notifications. Reuse the existing
// distribution certificate; never revoke certificates or existing profiles.
import { execFileSync } from 'node:child_process';
import { sign, X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const mode = process.argv[2];
const prepare = mode === 'prepare' || mode === 'id';
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function api(method, path, body) {
  const now = Math.floor(Date.now()/1000);
  const input = enc({alg:'ES256',kid:'63Y56V3L2D',typ:'JWT'})+'.'+enc({iss:'63274269-2c9e-473b-a82d-c8c68c3718ab',iat:now,exp:now+600,aud:'appstoreconnect-v1'});
  const token = input+'.'+sign('sha256',Buffer.from(input),{key:readFileSync('credentials/AuthKey_63Y56V3L2D.p8'),dsaEncoding:'ieee-p1363'}).toString('base64url');
  const args=['-sS','--globoff','--max-time','45','-X',method,'https://api.appstoreconnect.apple.com'+path,'-H','Authorization: Bearer '+token,'-H','Content-Type: application/json','-w','\n%{http_code}'];
  if(body) args.push('--data',JSON.stringify(body));
  let output;
  try { output=execFileSync('curl',args,{encoding:'utf8',maxBuffer:10*1024*1024,stdio:['ignore','pipe','pipe']}); }
  catch { throw Error(`${method} ${path}: network request failed`); }
  const split=output.lastIndexOf('\n');
  const status=Number(output.slice(split+1));
  const result=JSON.parse(output.slice(0,split));
  if(status>=300) throw Error(`${method} ${path}: HTTP ${status}: ${JSON.stringify(result.errors?.map(e=>e.detail))}`);
  return result;
}
const credentials = JSON.parse(readFileSync('credentials.json', 'utf8'));
const signing = credentials.ios.Arra || credentials.ios;
const certPem = execFileSync('openssl', ['pkcs12','-legacy','-in',signing.distributionCertificate.path,'-clcerts','-nokeys','-passin','env:ARRA_P12_PASSWORD'], {env:{...process.env,ARRA_P12_PASSWORD:signing.distributionCertificate.password},stdio:['ignore','pipe','ignore']});
const serial = new X509Certificate(certPem).serialNumber.toUpperCase();
const certificates = api('GET','/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION,DISTRIBUTION&limit=50').data;
const matching = certificates.find(c=>new X509Certificate(Buffer.from(c.attributes.certificateContent,'base64')).serialNumber.toUpperCase()===serial);
const cert = matching || (certificates.length === 1 ? certificates[0] : null);
if(!cert) throw Error('Signing certificate is ambiguous; inspect the currently signed IPA');
console.log('Distribution certificate: '+cert.id+(matching ? ' (local)' : ' (only active Apple distribution certificate; CI signing must match)'));
for(const [bundle,name,file,secret] of [
  ['com.arratima.aura','Arra','profile.mobileprovision','IOS_PROFILE_B64'],
  ['com.arratima.aura.notifications','Arra Notifications','notifications.mobileprovision','IOS_NOTIFICATION_PROFILE_B64'],
]) {
  let id = api('GET',`/v1/bundleIds?filter[identifier]=${bundle}&limit=5`).data.find(b=>b.attributes.identifier===bundle)?.id;
  if(!id && prepare) id=api('POST','/v1/bundleIds',{data:{type:'bundleIds',attributes:{identifier:bundle,name,platform:'IOS'}}}).data.id;
  if(!id) { console.log(bundle+': not registered'); continue; }
  const caps = api('GET',`/v1/bundleIds/${id}/bundleIdCapabilities`).data.map(c=>c.attributes.capabilityType);
  console.log(bundle+': '+caps.join(', '));
  if(!prepare) continue;
  if(mode === 'id') continue;
  // The public App Store Connect API cannot enable this capability. Enable
  // Communication Notifications in the Developer portal, then verify profiles.
  const p=api('POST','/v1/profiles',{data:{type:'profiles',attributes:{name:`${name} AppStore ${Date.now()}`,profileType:'IOS_APP_STORE'},relationships:{bundleId:{data:{type:'bundleIds',id}},certificates:{data:[{type:'certificates',id:cert.id}]}}}});
  const data=Buffer.from(p.data.attributes.profileContent,'base64');
  const plist=execFileSync('openssl',['cms','-verify','-inform','DER','-noverify'],{input:data,stdio:['pipe','pipe','ignore']}).toString();
  if(!/<key>com\.apple\.developer\.usernotifications\.communication<\/key>\s*<true\s*\/>/.test(plist)) throw Error(bundle+': generated profile lacks communication entitlement');
  const target='credentials/'+file;
  if(existsSync(target)) copyFileSync(target,target+'.backup-'+Date.now());
  writeFileSync(target,data,{mode:0o600});
  execFileSync('gh',['secret','set',secret],{input:data.toString('base64'),stdio:['pipe','pipe','pipe']});
  console.log(bundle+': communication profile verified, CI secret updated');
}
