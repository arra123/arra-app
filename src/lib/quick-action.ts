/**
 * Быстрые действия из виджета на рабочем столе и экране блокировки.
 *
 * Виджет открывает `aura://quick/car` или `aura://quick/note`. Корневой layout
 * переводит ссылку в действие, а нужный экран его «съедает» — так форма
 * открывается сразу, без промежуточных экранов.
 */

export type QuickAction = 'car' | 'note';

let pending: QuickAction | null = null;
const listeners = new Set<(action: QuickAction) => void>();

export function setQuickAction(action: QuickAction) {
  pending = action;
  listeners.forEach((listener) => listener(action));
}

/** Забрать отложенное действие, если оно предназначено этому экрану. */
export function takeQuickAction(kind: QuickAction) {
  if (pending !== kind) return false;
  pending = null;
  return true;
}

export function onQuickAction(listener: (action: QuickAction) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Разобрать ссылку виджета. Возвращает null, если это не быстрое действие. */
export function parseQuickAction(url: string | null | undefined): QuickAction | null {
  if (!url) return null;
  if (/\/quick\/car\b/.test(url)) return 'car';
  if (/\/quick\/note\b/.test(url)) return 'note';
  return null;
}
