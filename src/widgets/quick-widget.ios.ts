import type { QuickAddProps } from './quick-add.types';

/** Обновляет виджет на рабочем столе и экране блокировки. */
export function updateQuickWidget(props: QuickAddProps) {
  try {
    // Ленивый require: пока в сборке нет нативного таргета виджета,
    // модуль не должен грузиться и падать на старте.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { QuickAddWidget } = require('./quick-add') as typeof import('./quick-add');
    QuickAddWidget.updateSnapshot(props);
  } catch {
    /* нет таргета виджета в этой сборке */
  }
}
