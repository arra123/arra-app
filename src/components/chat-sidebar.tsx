import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import ReanimatedDrawerLayout, {
  DrawerKeyboardDismissMode,
  DrawerType,
  type DrawerLayoutMethods,
} from 'react-native-gesture-handler/ReanimatedDrawerLayout';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { chats, useChats, type Chat } from '@/ara/chats';
import { AraMascot } from '@/components/ara-mascot';
import { Glass, Press, T } from '@/components/ui';
import { Colors, Radius, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Props = {
  children: ReactNode;
  open: boolean;
  currentId: string;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onWork?: () => void;
  onTalk?: () => void;
};

/** Основной экран уезжает вправо, открывая список диалогов под собой. */
function DrawerSurface({ progress, children }: { progress: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    borderTopLeftRadius: interpolate(progress.get(), [0, 1], [0, 30]),
    borderBottomLeftRadius: interpolate(progress.get(), [0, 1], [0, 30]),
    shadowOpacity: interpolate(progress.get(), [0, 1], [0, 0.42]),
  }));
  return <Animated.View style={[styles.surface, style]}>{children}</Animated.View>;
}

/**
 * Левая панель Arra повторяет механику ChatGPT: свайп двигает весь текущий
 * экран, панель остаётся под ним, а открытая клавиатура не закрывается.
 */
export function ChatSidebar({ children, open, currentId, onOpen, onClose, onSelect, onNew, onWork, onTalk }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(360, Math.round(screenW * 0.84));
  const drawer = useRef<DrawerLayoutMethods>(null);
  const list = useChats();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) drawer.current?.openDrawer({ animationSpeed: 1.1 });
    else drawer.current?.closeDrawer({ animationSpeed: 1.1 });
  }, [open]);

  const q = query.trim().toLowerCase();
  const items = useMemo(
    () => list
      .filter((c) => c.messages.length || c.id === currentId)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [list, q, currentId],
  );

  const go = (action: () => void) => () => {
    haptic.select();
    onClose();
    setTimeout(action, 220);
  };

  const remove = (chat: Chat) => {
    haptic.press();
    Alert.alert('Удалить диалог?', chat.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(chat.id) },
    ]);
  };

  const navigation = (
    <View style={[styles.panel, { width, paddingTop: insets.top + 8 }]} accessibilityLabel="Диалоги Arra">
      <View style={styles.head}>
        <View style={styles.brand}>
          <AraMascot size={26} still />
          <T v="title" weight="800" style={styles.brandTitle}>Arra</T>
        </View>
      </View>

      <View style={styles.search}>
        <SymbolView name="magnifyingglass" size={16} tintColor={Colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по диалогам"
          placeholderTextColor={Colors.textTertiary}
          style={styles.searchInput}
          keyboardAppearance="dark"
          clearButtonMode="while-editing"
          returnKeyType="search"
          maxFontSizeMultiplier={1.4}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        indicatorStyle="white">
        {q ? null : (
          <View style={styles.nav}>
            <NavRow icon="terminal" label="Работа" onPress={go(onWork || (() => router.dismissTo('/')))} />
            <NavRow icon="bubble.left" label="Разговоры" onPress={go(onTalk || onClose)} />
          </View>
        )}

        <T v="headline" weight="700" style={styles.section}>{q ? 'Найдено' : 'Недавнее'}</T>
        {items.length ? items.map((chat) => {
          const active = chat.id === currentId;
          const streaming = chat.messages.some((m) => m.streaming);
          return (
            <Pressable
              key={chat.id}
              onPress={active ? onClose : go(() => onSelect(chat.id))}
              onLongPress={chat.messages.length ? () => remove(chat) : undefined}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${chat.messages.length ? chat.title : 'Новый диалог'}${active ? ', открыт' : ''}${streaming ? ', Arra отвечает' : ''}`}
              accessibilityHint={chat.messages.length ? 'Долгое нажатие — удалить' : undefined}
              style={({ pressed }) => [styles.chat, active && styles.chatActive, pressed && !active && styles.chatPressed]}>
              <T v="body" numberOfLines={1} style={styles.chatTitle}>{chat.messages.length ? chat.title : 'Новый диалог'}</T>
              {streaming ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        }) : (
          <T v="subhead" color={Colors.textSecondary} style={styles.empty}>{q ? 'Ничего не нашлось' : 'Диалогов пока нет'}</T>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
        <Press onPress={go(onNew)} feedback="none" scaleTo={0.95} style={styles.newChat} accessibilityRole="button" accessibilityLabel="Новый диалог с Arra">
          <SymbolView name="square.and.pencil" size={19} tintColor={Colors.onAccent} weight="semibold" />
          <T v="headline" weight="600" color={Colors.onAccent}>Чат</T>
        </Press>
        <Glass radius={24} backing style={styles.settings}>
          <Press onPress={go(() => router.push('/settings'))} feedback="none" style={styles.settingsInner} accessibilityRole="button" accessibilityLabel="Настройки">
            <SymbolView name="gearshape" size={20} tintColor={Colors.text} />
          </Press>
        </Glass>
      </View>
    </View>
  );

  return (
    <ReanimatedDrawerLayout
      ref={drawer}
      drawerWidth={width}
      drawerType={DrawerType.BACK}
      keyboardDismissMode={DrawerKeyboardDismissMode.NONE}
      drawerBackgroundColor={Colors.background}
      overlayColor="rgba(0,0,0,0.14)"
      edgeWidth={34}
      minSwipeDistance={3}
      onDrawerOpen={onOpen}
      onDrawerClose={onClose}
      renderNavigationView={() => navigation}>
      {(progress) => <DrawerSurface progress={progress!}>{children}</DrawerSurface>}
    </ReanimatedDrawerLayout>
  );
}

function NavRow({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.navRow, pressed && styles.chatPressed]}>
      <View style={styles.navIcon}>
        <SymbolView name={icon} size={20} tintColor={Colors.text} />
      </View>
      <T v="body" style={{ fontSize: 17 }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Colors.background,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.hairline,
    shadowColor: '#000',
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
  },
  panel: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, minHeight: 60 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandTitle: { fontSize: 24 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14,
    marginTop: 6, marginBottom: 6, paddingHorizontal: 12, height: 40,
    borderRadius: Radius.pill, backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: Type.body, height: 40 },
  nav: { paddingTop: 4, paddingBottom: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 8, paddingHorizontal: 12, minHeight: 48, borderRadius: 16 },
  navIcon: { width: 26, alignItems: 'center' },
  section: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, paddingHorizontal: 12, minHeight: 46, borderRadius: 14 },
  chatTitle: { flex: 1, fontSize: 17 },
  chatActive: { backgroundColor: Colors.cardPressed },
  chatPressed: { backgroundColor: Colors.card },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.link },
  empty: { paddingHorizontal: 20, paddingTop: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  newChat: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 22,
    borderRadius: 25, backgroundColor: Colors.text, shadowColor: '#000',
    shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  settings: { width: 48, height: 48 },
  settingsInner: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
