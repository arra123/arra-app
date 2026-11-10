import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../src/ara/format.ts',import.meta.url),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const exports = {};
vm.runInNewContext(code,{exports,require:name=>{assert.equal(name,'@/constants/theme');return {Colors:{}};}});
for (const ext of ['mp3','m4a','wav','aac','ogg','flac']) {
  const path = `/home/audio/voice.${ext}`;
  assert.equal(exports.isAudioPath(path),true);
  const media = exports.mediaPaths(`Слушай: ${path}.`);
  assert.deepEqual(Array.from(media.videos),[path]);
  assert.equal(media.images.length,0);
}
assert.equal(exports.isAudioPath('/home/secret.mp3.txt'),false);
assert.deepEqual(Array.from(exports.mediaPaths('/home/a.png /home/v.mp4').images),['/home/a.png']);
assert.deepEqual(Array.from(exports.mediaPaths('/home/a.png /home/v.mp4').videos),['/home/v.mp4']);
console.log('Audio media: PASS (six formats, text extraction, non-audio rejection, existing media)');

// Exercise the shared retry hook, not just a source-string assertion.
const events = [];
let state;
const mediaCode = ts.transpileModule(fs.readFileSync(new URL('../src/components/media.tsx',import.meta.url),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText + '\nexports.remoteFileCheck = useRemoteFile; exports.audioPlayerCheck = AudioPlayerView;';
const mediaExports = {};
const ara = {file:async()=>({url:'cached'}),forgetFile:(path,scope)=>events.push({path,scope})};
let audioStatus = {};
const modules = {
  '@/ara/client':{ara}, '@/ara/format':exports, '@/constants/theme':{Colors:{},Radius:{}},
  'react':{useState:initial=>{state ??= initial;return [state,fn=>{state=typeof fn==='function'?fn(state):fn;}];},useEffect:fn=>fn()},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  'expo-audio':{useAudioPlayer:()=>({}),useAudioPlayerStatus:()=>audioStatus},
  'react-native':{StyleSheet:{create:value=>value}},
};
vm.runInNewContext(mediaCode,{exports:mediaExports,require:name=>modules[name]??{}});
for (const scope of [{agentKey:'live:pc:1'},{chatId:'chat'}]) {
  state = undefined;
  const hook = mediaExports.remoteFileCheck('/home/A-zhivo.mp3',scope);
  await new Promise(resolve=>setImmediate(resolve));
  hook.retry();
  assert.equal(state.attempt,1);
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))),{path:'/home/A-zhivo.mp3',scope});
}
console.log('Media retry: PASS (agent/chat cache invalidation and retry state)');
ara.authHeaders = () => ({});
state = undefined;
audioStatus = {error:'Decode failed',currentTime:0,duration:0};
mediaExports.audioPlayerCheck({uri:'audio',name:'voice.mp3',onRetry:()=>{}});
audioStatus = {error:null,currentTime:0,duration:0};
const failed = mediaExports.audioPlayerCheck({uri:'audio',name:'voice.mp3',onRetry:()=>{}});
assert.match(failed.props.error,/Повторите загрузку/);
console.log('Audio failure: PASS (retry stays visible after transient iOS status error)');
