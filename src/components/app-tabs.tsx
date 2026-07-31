import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * Нижняя навигация с постоянным тёмным фоном.
 *
 * Системная панель (NativeTabs) здесь не годится. На iOS 26 она рисуется
 * адаптивным материалом: подмешивает то, что оказалось под ней, и сама
 * выбирает светлую или тёмную схему. Ни `backgroundColor`, ни `blurEffect`,
 * ни материал с жёсткой схемой (`systemChromeMaterialDark`) не удержали её —
 * на части экранов панель всё равно оказывалась белой. Поэтому рисуем панель
 * сами: цвет задан явно и не зависит ни от контента, ни от темы устройства.
 *
 * SF Symbols, а не PNG: растровые иконки трактуются как размер в pt и раздувают
 * панель.
 */

const BAR = {
  background: '#1C1C1E',
  border: '#000000',
  active: '#0A84FF',
  inactive: '#98989F',
} as const;

const TAB_ICONS: Record<string, { regular: SFSymbol; selected: SFSymbol }> = {
  index: { regular: 'wallet.bifold', selected: 'wallet.bifold.fill' },
  chat: { regular: 'sparkles', selected: 'sparkles' },
  pc: { regular: 'desktopcomputer', selected: 'desktopcomputer' },
  files: { regular: 'arrow.left.arrow.right', selected: 'arrow.left.arrow.right' },
  notes: { regular: 'note.text', selected: 'note.text' },
};

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const barHeight = (Platform.OS === 'ios' ? 49 : 56) + insets.bottom;

  return (
    <Tabs
      screenOptions={({ route }) => {
        const icons = TAB_ICONS[route.name] || TAB_ICONS.index;
        return {
          headerShown: false,
          sceneStyle: styles.scene,
          tabBarActiveTintColor: BAR.active,
          tabBarInactiveTintColor: BAR.inactive,
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.item,
          tabBarStyle: [styles.bar, { height: barHeight, paddingBottom: insets.bottom }],
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? icons.selected : icons.regular}
              tintColor={String(color)}
              size={focused ? 23 : 22}
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
    backgroundColor: BAR.background,
    borderTopColor: BAR.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    elevation: 0,
    shadowColor: 'transparent',
  },
  item: { paddingVertical: 1 },
  label: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
});
