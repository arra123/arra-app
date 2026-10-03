import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/(app)/index.tsx', import.meta.url), 'utf8');
const home = source.slice(source.indexOf('export default function Home()'));
assert.ok(home.includes('return <WorkList />;'), 'Launch must show project agents');
assert.ok(!home.includes('Redirect') && !home.includes('ensureCurrent'), 'Launch must not create/open a chat');
assert.ok(source.includes('id={agent.mascotId}'), 'Project agents must use their assigned mascots');
console.log('mobile entry: work screen, no automatic chat redirect');
