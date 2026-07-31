import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * Системная нижняя навигация с постоянным тёмным фоном.
 *
 * Почему оттенок «плавал». На iOS 26 панель рисуется адаптивным материалом
 * Liquid Glass: он подмешивает цвет того, что оказалось под ней, и сам
 * переключается между светлым и тёмным вариантом. Ни `backgroundColor`, ни
 * `blurEffect="none"` этого не отменяли — решение оставалось за системой.
 *
 * Лечится материалом с жёстко заданной схемой: `systemChromeMaterialDark`
 * всегда тёмный и не смотрит ни на контент под собой, ни на тему устройства.
 * Отсюда светлые иконки и подписи — на тёмном фоне они постоянны.
 *
 * SF Symbols обязательны: PNG в NativeTabs трактуются как размер в pt и
 * раздувают панель.
 */
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#1C1C1E"
      blurEffect="systemChromeMaterialDark"
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      labelVisibilityMode="labeled"
      tintColor="#0A84FF"
      iconColor={{ default: '#98989F', selected: '#0A84FF' }}
      labelStyle={{
        default: { color: '#98989F', fontSize: 11, fontWeight: '600' },
        selected: { color: '#0A84FF', fontSize: 11, fontWeight: '700' },
      }}
      shadowColor="#000000"
      backBehavior="history">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'wallet.bifold', selected: 'wallet.bifold.fill' }} />
        <NativeTabs.Trigger.Label>Финансы</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
        <NativeTabs.Trigger.Label>Помощник</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="pc">
        <NativeTabs.Trigger.Icon sf={{ default: 'desktopcomputer', selected: 'desktopcomputer' }} />
        <NativeTabs.Trigger.Label>ПК</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="files">
        <NativeTabs.Trigger.Icon sf={{ default: 'arrow.left.arrow.right', selected: 'arrow.left.arrow.right' }} />
        <NativeTabs.Trigger.Label>Передача</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Icon sf={{ default: 'note.text', selected: 'note.text' }} />
        <NativeTabs.Trigger.Label>Заметки</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile" hidden />
    </NativeTabs>
  );
}
