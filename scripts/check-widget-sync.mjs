import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../src/widgets/sync.ios.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
async function scenario(version = null, existing = 2) {
  const events = [], stored = new Map(version ? [['arra-widget-renderer',version]] : []);
  let snapshots = 0, calls = 0, fail = false;
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
    '@/lib/api': {api:async(path, options)=>{assert.equal(path,'/push/activity');assert.equal(options.method,'DELETE');calls++;if(fail)throw Error('offline');return {};}}, 'expo-widgets':{addPushToStartTokenListener(){}},
    './arra-widgets.ios':{ringsWidget:{updateSnapshot(props){assert.deepEqual(JSON.parse(JSON.stringify(props.agents)),[]);snapshots++;}},ringsActivity:{getInstances:()=>instances,
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
    fail: value=>{fail=value;}, snapshots:()=>snapshots, calls:()=>calls, status:()=>exports.widgetStatus()};
}
const migrated = await scenario();
await migrated.sync();
assert.deepEqual(migrated.events,['end:old0','end:old1']);
assert.equal(migrated.snapshots(),1);
assert.equal(migrated.calls(),1);
await migrated.sync();
await migrated.resume();
assert.equal(migrated.snapshots(),1,'static shortcut does not follow messages');
assert.equal(migrated.calls(),2,'foreground cleans up registrations from older builds');
assert.ok(!migrated.events.includes('start'),'never restart cards');
const restored = await scenario('5');await restored.sync();
assert.deepEqual(restored.events,['end:old0','end:old1'],'all previous renderers are retired');
const background = await scenario();background.background();await background.sync();
assert.equal(background.events.length,0);
background.foreground();await background.resume();
assert.deepEqual(background.events,['end:old0','end:old1']);
const offline = await scenario();offline.fail(true);await offline.sync();
assert.match(offline.status(),/повторится/);
offline.fail(false);await offline.sync();
assert.equal(offline.calls(),2,'failed migration retries without needing a new app launch');
assert.match(offline.status(),/лента отключена/);
console.log('Widget lifecycle: PASS (retirement, no restart, static shortcut, foreground/offline retry)');
