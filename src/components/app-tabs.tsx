import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * Системная нижняя навигация.
 *
 * На iOS 26 UITabBar сам рисует Liquid Glass, а при прокрутке сворачивается
 * стандартной системной анимацией. SF Symbols важны: PNG в NativeTabs
 * интерпретировались как исходный размер в pt и раздували панель.
 */
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#FFFFFF"
      // Панель залита сплошным белым без размытия. Со стеклом её оттенок
      // «плыл» от того, что оказывалось под ней на каждом экране, и панель
      // выглядела так, будто постоянно меняет цвет.
      blurEffect="none"
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      labelVisibilityMode="labeled"
      tintColor="#007AFF"
      iconColor={{ default: '#555A64', selected: '#007AFF' }}
      labelStyle={{
        default: { color: '#555A64', fontSize: 11, fontWeight: '600' },
        selected: { color: '#007AFF', fontSize: 11, fontWeight: '700' },
      }}
      shadowColor="#C9CBD2"
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
