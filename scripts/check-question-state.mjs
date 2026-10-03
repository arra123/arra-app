import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/ara/questions.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const api = {};
new Function('exports', output)(api);
const question = { id: 'ask', answerVia: 'message', questions: [
  { question: 'Где блок?', header: '', multi: false, options: [{ label: 'На экране блокировки' }, { label: 'На домашнем экране' }] },
] };
assert.equal(api.answerMessage(question, [[0]]), 'На экране блокировки');
assert.equal(api.answerMessage(question, [], 'Другой вариант'), 'Где блок?: Другой вариант');
assert.equal(api.answerMessage(question, [[0]], 'Компактный'), 'На экране блокировки\nСвоими словами: Компактный');
assert.equal(api.allAnswered(question, []), false);
assert.equal(api.allAnswered(question, [[0]]), true);
assert.equal(api.answersOnTap(question), true);
console.log('question answers: explicit choice/own answer, no empty auto-submit');
