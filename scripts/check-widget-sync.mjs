import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../src/widgets/sync.ios.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
async function scenario(version = null, existing = 2) {
  const events = [], stored = new Map(version ? [['arra-widget-renderer',version]] : []);
  let active = 'active', resume, instances;
  const make = name => {
    const result = {
      end: async () => {events.push('end:' + name); instances = instances.filter(a => a !== result);},
      update: async () => events.push('update:' + name),
      addPushTokenListener: () => ({remove(){}}), getPushToken: async () => null,
    };
    return result;
  };
  instances = Array.from({length:existing},(_,i)=>make('old'+i));
  const deps = {
    'react-native': {AppState:{get currentState(){return active;},addEventListener:(_n,fn)=>{resume=fn;}}},
    'expo-secure-store': {getItemAsync:async key=>stored.get(key)??null,setItemAsync:async(key,value)=>stored.set(key,value)},
    '@/lib/api': {api:async()=>({})}, 'expo-widgets':{addPushToStartTokenListener(){}},
    './arra-widgets.ios':{ringsWidget:{updateSnapshot(){}},ringsActivity:{getInstances:()=>instances,
      start(){events.push('start');const value=make('new');instances.push(value);return value;}}},
    './props':{ringsProps:agents=>({agents,working:agents.length,waiting:0,updated:0})},
    '../../shared/dialog-widget':{compactDialogProps:props=>props},
  };
  const exports = {};
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(deps[name],name);return deps[name];},console,
    Date,Promise,setTimeout:()=>1,clearTimeout(){}});
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  return {events,stored, sync:async()=>{exports.syncWidgets([{key:'live:pc:1'}]);await flush();},
    resume:async()=>{resume('active');await flush();},
    background:()=>{active='background';}, foreground:()=>{active='active';},
    removed:()=>{instances=[];}, status:()=>exports.widgetStatus()};
}
const migrated = await scenario();
await migrated.sync();
assert.deepEqual(migrated.events,['end:old0','end:old1','start']);
assert.equal(migrated.stored.get('arra-widget-renderer'),'3');
await migrated.sync();
assert.equal(migrated.events.filter(e=>e==='start').length,1);
migrated.removed(); await migrated.resume();
assert.equal(migrated.events.filter(e=>e==='start').length,2,'OS-closed block restarts on foreground despite unchanged data');
const restored = await scenario('3');await restored.sync();
assert.deepEqual(restored.events,['end:old1','update:old0'],'reuse just one native block');
const background = await scenario();background.background();await background.sync();
assert.equal(background.events.length,0,'do not discard a block when iOS cannot start its replacement');
background.foreground();await background.resume();
assert.deepEqual(background.events,['end:old0','end:old1','start']);
console.log('Widget lifecycle: PASS (migration, one block, unchanged foreground, background safety)');
