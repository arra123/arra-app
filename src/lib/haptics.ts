import * as Haptics from 'expo-haptics';

// Тактильный отклик (Taptic Engine на iPhone). Все вызовы безопасны — не падают,
// если устройство не поддерживает. Используем по всему приложению на ключевых действиях.
const safe = (p: Promise<void>) => p.catch(() => {});

export const haptic = {
  /** Лёгкий тап — обычное нажатие, выбор */
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Средний — заметное действие (кнопка, переключение) */
  press: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Тяжёлый — важное/крупное действие */
  heavy: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Прокрутка по элементам */
  select: () => safe(Haptics.selectionAsync()),
  /** Успех — сохранено, отправлено, готово */
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Предупреждение */
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Ошибка */
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
