import type { QuickAddProps } from './quick-add.types';

/**
 * Заглушка для веба и Android: там виджетов нет, а сам модуль тянет
 * нативные вью SwiftUI и роняет страницу ещё на импорте.
 */
export function updateQuickWidget(_props: QuickAddProps) {
  /* виджеты только на iOS */
}
