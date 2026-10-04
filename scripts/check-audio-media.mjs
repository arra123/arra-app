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
