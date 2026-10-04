import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dialogProps, compactDialogProps } from '../shared/dialog-widget.js';
import { replaceRequired, registerNativeSources } from '../plugins/with-dialog-widgets.js';
import xcode from 'xcode';
const agents = Array.from({length:60}, (_,i)=>({key:`live:pc:${1000000+i}`,device:'pc',cwd:'/helper',project:'Помощник',title:'Длинное название диалога '.repeat(10),stage:'Сверяет результат и исправляет границы '.repeat(10),state:i===3?'old':'working',mascotId:i%2?14:3}));
const props = dialogProps(agents, 100);
assert.equal(props.agents.length,60);
assert.equal(props.agents[3].state,'idle');
assert.equal(props.agents[59].number,60);
assert.equal(props.agents[1].mascotId,14);
const compact = compactDialogProps(props);
assert.equal(compact.agents.length,60);
assert.equal(compact.agents[59][0],agents[59].key);
assert.ok(Buffer.byteLength(JSON.stringify({aps:{timestamp:100,event:'update','content-state':{name:'ArraRings',props:JSON.stringify(compact)}}}))<4096);
assert.equal(replaceRequired('before after','before','new','test'),'new after');
assert.equal(replaceRequired('new after','before','new','test'),'new after');
assert.throws(()=>replaceRequired('unexpected','before','new','test'));
assert.equal(dialogProps([],100).agents.length,0);
assert.match(fs.readFileSync(new URL('../plugins/native/ArraWidgetIntents.swift', import.meta.url), 'utf8'), /^internal import ExpoWidgets$/m);
assert.match(fs.readFileSync(new URL('../plugins/native/ArraWidgetIntents.swift', import.meta.url), 'utf8'), /struct ArraCycleDialog: LiveActivityIntent/);
// Verify actual PBX source membership, not merely a physical metadata file.
const project = xcode.project(new URL('../ios/Arra.xcodeproj/project.pbxproj', import.meta.url).pathname);
project.parseSync();
registerNativeSources(project);
const objects = project.hash.project.objects;
function sourcePaths(name) {
  const target = objects.PBXNativeTarget[project.findTargetKey(name)];
  return target.buildPhases.flatMap(ref => objects.PBXSourcesBuildPhase[ref.value]?.files ?? [])
    .map(ref => objects.PBXFileReference[objects.PBXBuildFile[ref.value].fileRef].path.replaceAll('"',''));
}
for (const name of ['Arra','ExpoWidgetsTarget']) for (const file of ['ArraDialogWidgets.swift','ArraWidgetIntents.swift']) {
  assert.ok(sourcePaths(name).includes(`${name}/${file}`), `${name} must compile ${file}`);
  const ref = Object.values(objects.PBXFileReference).find(ref => ref.path?.replaceAll('"','') === `${name}/${file}`);
  assert.equal(ref.sourceTree.replaceAll('"',''),'SOURCE_ROOT', 'full native paths must not be prefixed by their group');
}
const count = Object.keys(objects.PBXBuildFile).length;
registerNativeSources(project);
assert.equal(Object.keys(objects.PBXBuildFile).length,count,'source membership must be idempotent');
console.log('Dialog widgets: PASS (all 60 agents, idle, number, mascot, APNs size, native plugin gates)');
