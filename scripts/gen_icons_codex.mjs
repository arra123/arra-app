// Иконки разделов — генерация ЛОКАЛЬНЫМ Codex CLI (фича image_generation, подписка Тимы).
// ⚠️ ProxyAPI и любые платные API для картинок использовать запрещено.
// Запуск: node scripts/gen_icons_codex.mjs [id ...]   (без аргументов — все)

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "noda-ios", "assets", "tabs");
const CODEX_JS = process.env.CODEX_JS
  || join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");

const STYLE = "квадратная иконка приложения в стиле iOS 26, заливка на весь кадр без полей и без "
  + "скруглений углов, насыщенный градиент, по центру белый непрозрачный пиктограммный символ с "
  + "мягкими скруглёнными краями, символ занимает около 58% кадра, высокий контраст, "
  + "чёткие векторные формы, никакого текста, цифр и лишних деталей";

const ICONS = {
  finance: "градиент от мятно-зелёного вверху к изумрудному внизу, символ — кошелёк с торчащей купюрой",
  assistant: "градиент от небесно-голубого вверху к насыщенному синему внизу, символ — округлый диалоговый пузырь с четырёхлучевой искрой",
  notes: "градиент от янтарного вверху к тёмно-оранжевому внизу, символ — лист бумаги с тремя строками и загнутым уголком",
  files: "градиент от сиреневого вверху к фиолетовому внизу, символ — фоторамка с горой и солнцем",
  transfer: "градиент от бирюзового вверху к тёмно-бирюзовому внизу, символ — две стрелки, замкнутые в круг синхронизации",
  remote: "градиент от кораллового вверху к тёмно-красному внизу, символ — монитор компьютера на подставке",
  projects: "градиент от барвинкового вверху к индиго внизу, символ — четыре скруглённых квадрата сеткой 2×2",
};

const list = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ICONS);
mkdirSync(OUT, { recursive: true });

for (const id of list) {
  const target = join(OUT, `${id}-raw.png`).replace(/\\/g, "/");
  const prompt = `Сгенерируй изображение: ${STYLE}. ${ICONS[id]}. `
    + `Сохрани готовый PNG в файл ${target} и напиши только путь.`;
  console.log(`→ ${id}`);
  // .cmd-обёртку Node 24 запускать отказывается (EINVAL) — зовём сам codex.js текущим node
  execFileSync(process.execPath, [CODEX_JS, "exec", "--skip-git-repo-check", prompt],
    { cwd: ROOT, stdio: "ignore", timeout: 900000 });
  console.log(`✓ ${id} → ${target}`);
}
