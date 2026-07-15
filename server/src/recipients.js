export const RECIPIENTS = ['Тима', 'Даня', 'Женя'];

export function normalizeRecipient(value, fallback = 'Тима') {
  const text = String(value || '').trim().toLowerCase();
  if (/жен|евген/.test(text)) return 'Женя';
  if (/дан|даниил/.test(text)) return 'Даня';
  if (/тим/.test(text)) return 'Тима';
  return RECIPIENTS.includes(fallback) ? fallback : 'Тима';
}
