// Небольшой разбор Markdown для ответов агентов и Arra: заголовки, абзацы,
// списки (вложенные и чек-листы), код, цитаты, таблицы, разделители;
// в строке — жирный, курсив, зачёркнутый, `код`, ссылки и голые URL.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b' | 'i' | 's'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export type ListItem = { c: Inline[]; children: Block[]; checked?: boolean };
export type Align = 'left' | 'center' | 'right';

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][]; align: Align[] };

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const LIST = /^(\s*)([-*+•]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.match(/^\s*/)![0].replace(/\t/g, '    ').length;
const blank = (line: string) => !line.trim();

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      current += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function startsBlock(line: string, next?: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST.test(line)
    || (line.includes('|') && next !== undefined && TABLE_SEP.test(next) && next.includes('-'));
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++]);
      i++; // закрывающая ``` (или конец текста, пока ответ печатается)
      blocks.push({ t: 'code', lang: fence[2] || '', v: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: 'h', level: heading[1].length, c: parseInline(heading[2]) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !blank(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i++]);
        rows.push(head.map((_, ci) => parseInline(cells[ci] ?? '')));
      }
      blocks.push({ t: 'table', head: head.map(parseInline), rows, align: head.map((_, ci) => align[ci] || 'left') });
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && !blank(lines[i])) {
        const q = QUOTE.exec(lines[i]);
        inner.push(q ? q[1] : lines[i]);
        i++;
      }
      blocks.push({ t: 'quote', c: parseBlocks(inner) });
      continue;
    }

    if (LIST.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && !blank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++].trim());
    blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
  }
  return blocks;
}

function parseList(lines: string[], start: number): [Block, number] {
  const first = LIST.exec(lines[start])!;
  const base = indentOf(lines[start]);
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      // Пустая строка внутри списка: продолжаем, если дальше пункт или вложенный текст
      let j = i + 1;
      while (j < lines.length && blank(lines[j])) j++;
      if (j < lines.length && (indentOf(lines[j]) > base || (LIST.test(lines[j]) && indentOf(lines[j]) === base && /\d/.test(LIST.exec(lines[j])![2]) === ordered))) {
        i = j;
        continue;
      }
      break;
    }
    const m = LIST.exec(line);
    const indent = indentOf(line);
    if (!m || indent < base || (indent <= base + 1 && /\d/.test(m[2]) !== ordered)) {
      if (!m && indent <= base && items.length) {
        // «ленивое» продолжение пункта без отступа
        items[items.length - 1].c.push({ t: 'text', v: '\n' }, ...parseInline(line.trim()));
        i++;
        continue;
      }
      if (indent < base || m) break;
    }
    if (m && indent <= base + 1) {
      let text = m[3];
      let checked: boolean | undefined;
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
      if (task) {
        checked = task[1].toLowerCase() === 'x';
        text = task[2];
      }
      const content = m[1].length + m[2].length + 1;
      const sub: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (blank(next)) {
          let j = i + 1;
          while (j < lines.length && blank(lines[j])) j++;
          if (j < lines.length && indentOf(lines[j]) > base && !(LIST.test(lines[j]) && indentOf(lines[j]) <= base + 1)) {
            sub.push('');
            i++;
            continue;
          }
          break;
        }
        if (indentOf(next) > base + 1) {
          sub.push(next.slice(Math.min(content, indentOf(next))));
          i++;
          continue;
        }
        break;
      }
      // Первые строки без маркера списка — продолжение текста пункта
      while (sub.length && !blank(sub[0]) && !startsBlock(sub[0], sub[1])) text += '\n' + sub.shift()!.trim();
      items.push({ c: parseInline(text), children: parseBlocks(sub), checked });
      continue;
    }
    break;
  }
  const startNumber = ordered ? parseInt(first[2], 10) || 1 : 1;
  return [{ t: 'list', ordered, start: startNumber, items }, i];
}

// ---------- строка ----------

const INLINE = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*([^*\s][^*\n]*?)\*|_([^_\s][^_\n]*?)_|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»])/g;

const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let pending = '';
  const pushText = (v: string) => {
    pending += v;
  };
  const flush = () => {
    if (pending) out.push({ t: 'text', v: pending });
    pending = '';
  };
  // Свой экземпляр на каждый вызов: разбор рекурсивный, общий lastIndex сломался бы
  const re = new RegExp(INLINE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    // _курсив_ и *курсив* внутри слов (snake_case, 2*3*4) — это не разметка
    if ((m[9] !== undefined && (isWord(before) || isWord(after))) || (m[8] !== undefined && (isWord(before) && isWord(after)))) {
      re.lastIndex = m.index + 1;
      continue;
    }
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] !== undefined) {
      flush();
      out.push({ t: 'code', v: m[2].trim() || m[2] });
    } else if (m[3] !== undefined || m[4] !== undefined) {
      flush();
      out.push({ t: 'b', c: parseInline(m[3] ?? m[4]) });
    } else if (m[5] !== undefined) {
      flush();
      out.push({ t: 's', c: parseInline(m[5]) });
    } else if (m[6] !== undefined) {
      flush();
      out.push({ t: 'link', href: m[7], c: parseInline(m[6]) });
    } else if (m[8] !== undefined || m[9] !== undefined) {
      flush();
      out.push({ t: 'i', c: parseInline(m[8] ?? m[9]) });
    } else if (m[10] !== undefined) {
      flush();
      out.push({ t: 'link', href: m[10], c: [{ t: 'text', v: m[10] }] });
    }
  }
  pushText(text.slice(last));
  flush();
  return out;
}

/** Текст без разметки — для превью и подсчёта ширины колонок. */
export function plain(inlines: Inline[]): string {
  return inlines.map((node) => (node.t === 'text' || node.t === 'code' ? node.v : plain(node.c))).join('');
}
