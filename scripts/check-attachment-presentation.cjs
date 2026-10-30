const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mobileFile = path.join(__dirname, '../src/ara/attachment-presentation.ts');
const mobile = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync(mobileFile, 'utf8'), {module: ts.ModuleKind.CommonJS}), {exports: mobile.exports});
const native = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../../helper/notch-island/ara/Markdown.js'), 'utf8').replace(/^\.pragma library\s*/, ''), native);
const fixture = 'Убери надпись\n/home/tima/Pictures/Ara-reviews/review-abc123.json\nПравка видео: /home/tima/Videos/part a.mp4\nТаймкод: 1.068 с. Рисунок на кадре приложен.\n\nИ сделай плавнее';
for (const present of [mobile.exports.reviewPresentation, native.reviewPresentation]) {
  const result = present(fixture);
  assert.equal(result.text, 'Убери надпись\n\nИ сделай плавнее');
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].source, '/home/tima/Videos/part a.mp4');
  assert.equal(result.reviews[0].label, '0:01.068');
  assert.equal(present('/home/tima/Documents/config.json\n{"keep":true}').text, '/home/tima/Documents/config.json\n{"keep":true}');
  assert.equal(present('Правка видео: измени цвет\nТаймкод: 5 с').text, 'Правка видео: измени цвет\nТаймкод: 5 с');
  assert.equal(present(fixture + '\n' + fixture).reviews.length, 1);
}
console.log('Attachment presentation: OK (mobile and native)');
