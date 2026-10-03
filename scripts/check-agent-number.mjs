import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Run the actual helper without importing React Native or its app aliases.
const source = fs.readFileSync(new URL('../src/ara/format.ts', import.meta.url), 'utf8');
const fn = source.match(/export function agentNumber\([\s\S]*?\n}/)?.[0];
assert.ok(fn, 'agentNumber helper exists');
const js = ts.transpile(fn.replace('export ', ''));
const number = new Function(`${js}; return agentNumber;`)();
const agents = [
  { key: 'a', device: 'pc', cwd: '/helper' },
  { key: 'b', device: 'pc', cwd: '/helper' },
  { key: 'c', device: 'pc', cwd: '/visual' },
  { key: 'd', device: 'laptop', cwd: '/helper' },
];
assert.deepEqual(agents.map(agent => number(agent, agents)), [1, 2, 1, 1]);
assert.equal(number(agents[1], agents), 2, 'search/pinning does not renumber');
assert.equal(number({ ...agents[0], key: 'gone' }, agents), 0);
console.log('agent numbers: per project and device, stable during search/pinning');
