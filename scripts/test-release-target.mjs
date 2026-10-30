import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const scenario of ['valid', 'missing', 'processing', 'forbidden']) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import crypto from 'node:crypto';
    const key = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({type:'pkcs8',format:'pem'});
    const read = fs.readFileSync;
    fs.readFileSync = (path, ...args) => String(path).endsWith('.p8') ? key : read(path, ...args);
    process.argv[2] = '127';
    globalThis.setTimeout = callback => queueMicrotask(callback);
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      let data;
      if (parsed.pathname === '/v1/builds') {
        if (parsed.searchParams.get('filter[version]') !== '127') throw new Error('Wrong release target');
        if ('${scenario}' === 'forbidden') return {ok:false,status:403,json:async()=>({errors:[{code:'FORBIDDEN'}]})};
        data = '${scenario}' === 'missing' ? [] : [{id:'new-build',attributes:{version:'127',processingState:'${scenario}' === 'processing' ? 'PROCESSING' : 'VALID'}}];
      } else {
        if ('${scenario}' !== 'valid') throw new Error('Unprocessed build reached group assignment');
        data = parsed.pathname === '/v1/betaGroups'
          ? [{id:'group',attributes:{name:'Автообновления',isInternalGroup:true,hasAccessToAllBuilds:true}}]
          : [{id:'new-build'}];
      }
      return {ok:true,status:200,json:async()=>({data})};
    };
    await import('./scripts/asc-add-latest-to-group.mjs');
  `], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, scenario === 'valid' ? 0 : 1, result.stdout + result.stderr);
  assert.equal(result.stdout.includes('доступен группе'), scenario === 'valid');
}
console.log('release target: exact build, only VALID, missing/error states fail closed');
