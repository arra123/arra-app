import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';

// Пять постоянных рабочих разделов; настройки открываются из шапки «Возвратов».
export default function AppTabs() {
  const colors = Colors.dark;

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.tint } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Возвраты</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="building.2.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>ИИ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="pc">
        <NativeTabs.Trigger.Label>ПК</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="desktopcomputer" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="files">
        <NativeTabs.Trigger.Label>Файлы</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="paperplane.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Label>Заметки</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="note.text" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
