// Генерация сетки 3D-иконок категорий через ProxyAPI (gpt-image-1)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KEY = process.env.PROXY_API_KEY;
const BASE = 'https://api.proxyapi.ru/openai/v1';
const out = resolve(process.cwd(), 'design/icons');
mkdirSync(out, { recursive: true });

// Порядок строго слева-направо, сверху-вниз (4 столбца × 5 строк)
const ORDER = [
  'shopping grocery basket', 'fast food burger', 'city bus', 'yellow taxi cab',
  'house with key', 'wifi signal tower', 'medical pill and red cross', 'folded t-shirt',
  'game controller', 'subscription loop arrows', 'graduation cap with book', 'wrapped gift box',
  'airplane', 'spray cleaning bottle', 'teddy bear', 'dog paw print',
  'car automobile', 'money bag with coins', 'money transfer two arrows', 'leather wallet',
];

const prompt = `A clean grid of exactly 4 columns and 5 rows (20 cells) of modern 3D app icons.
Each cell contains ONE single glossy 3D object, clay-render / Fluent 3D emoji style, vibrant saturated colors, soft studio lighting, smooth rounded shapes, subtle reflections.
Every icon is centered in its own equal-size cell with generous identical padding around it.
Fully TRANSPARENT background. No text, no numbers, no labels, no captions, no drop shadows on the background, no grid lines.
Icons in this exact order, left to right, top to bottom:
${ORDER.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;

const res = await fetch(`${BASE}/images/generations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    background: 'transparent',
    output_format: 'png',
    quality: 'high',
    n: 1,
  }),
});
const txt = await res.text();
if (!res.ok) { console.error('FAIL', res.status, txt.slice(0, 500)); process.exit(1); }
const data = JSON.parse(txt);
const b64 = data.data?.[0]?.b64_json;
if (!b64) { console.error('no image', JSON.stringify(data).slice(0, 400)); process.exit(1); }
writeFileSync(resolve(out, 'sheet.png'), Buffer.from(b64, 'base64'));
console.log('OK: design/icons/sheet.png');
