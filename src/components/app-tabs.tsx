import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

const TAB_ICONS: Record<string, { regular: SFSymbol; selected: SFSymbol }> = {
  index: { regular: 'wallet.bifold', selected: 'wallet.bifold.fill' },
  chat: { regular: 'sparkles', selected: 'sparkles' },
  pc: { regular: 'desktopcomputer', selected: 'desktopcomputer' },
  files: { regular: 'arrow.left.arrow.right', selected: 'arrow.left.arrow.right' },
  notes: { regular: 'note.text', selected: 'note.text' },
};

/**
 * Фиксированная панель вкладок без системного прозрачного материала.
 *
 * Экспериментальные Native Tabs на iOS меняли оттенок в зависимости от
 * контента под панелью. Обычная панель Expo Router сохраняет один белый фон
 * на всех экранах и не сворачивается при прокрутке.
 */
export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const barHeight = (Platform.OS === 'ios' ? 50 : 58) + insets.bottom;

  return (
    <Tabs
      screenOptions={({ route }) => {
        const icons = TAB_ICONS[route.name] || TAB_ICONS.index;
        return {
          headerShown: false,
          sceneStyle: styles.scene,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#686D77',
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.item,
          tabBarStyle: [styles.bar, { height: barHeight, paddingBottom: insets.bottom }],
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? icons.selected : icons.regular}
              tintColor={String(color)}
              size={focused ? 22 : 21}
            />
          ),
        };
      }}>
      <Tabs.Screen name="index" options={{ title: 'Финансы' }} />
      <Tabs.Screen name="chat" options={{ title: 'Помощник' }} />
      <Tabs.Screen name="pc" options={{ title: 'ПК' }} />
      <Tabs.Screen name="files" options={{ title: 'Передача' }} />
      <Tabs.Screen name="notes" options={{ title: 'Заметки' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: '#F2F3F7' },
  bar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#D7D9E0',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 5,
    elevation: 0,
    shadowColor: 'transparent',
  },
  item: { paddingVertical: 1 },
  label: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
});
