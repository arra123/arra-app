/**
 * Разбор услышанного в разговоре голосом. Микрофон слушает и пока Arra говорит
 * (чтобы её можно было перебить), поэтому в распознанное попадает её же голос
 * из динамика. Здесь — как отличить слова человека от этого эха и как привести
 * ответ к виду, который удобно произнести.
 */

/** Одного такого слова хватает, чтобы перебить ответ. */
const STOP_WORDS = new Set(['стоп', 'стой', 'хватит', 'подожди', 'погоди', 'тихо', 'замолчи', 'достаточно']);

const norm = (word: string) => word.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

function words(text: string): string[] {
  return text.split(/\s+/).map(norm).filter(Boolean);
}

export function joinText(...parts: string[]) {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

/**
 * Услышанное без эха: всё, начиная с первого слова, которого не было в ответе
 * Arra. Распознавание копит текст с начала сеанса, поэтому эхо всегда впереди.
 */
export function ownSpeech(heard: string, echo: string): string {
  const tokens = heard.trim().split(/\s+/).filter(Boolean);
  if (!echo.trim()) return tokens.join(' ');
  const spoken = new Set(words(echo));
  const from = tokens.findIndex((token) => {
    const word = norm(token);
    return !!word && !spoken.has(word);
  });
  return from < 0 ? '' : tokens.slice(from).join(' ');
}

/**
 * Это человек заговорил, а не шум и не эхо? own — уже без эха (ownSpeech).
 * strict — пока звучит ответ: эхо распознаётся с ошибками, одно «чужое» слово
 * ещё ничего не значит; нужны два или явное «стоп».
 */
export function isSpeech(own: string, echo: string, strict: boolean): boolean {
  const list = words(own);
  if (!list.length) return false;
  if (STOP_WORDS.has(list[0])) return true;
  if (!strict) return list.join('').length >= 3;
  const spoken = new Set(words(echo));
  return list.filter((word) => !spoken.has(word)).length >= 2;
}

/** Ответ для произнесения и показа крупным текстом: без разметки, кода и ссылок. */
export function plainForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_`~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
