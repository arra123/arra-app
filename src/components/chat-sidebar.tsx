import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import ReanimatedDrawerLayout, { DrawerKeyboardDismissMode, DrawerType, type DrawerLayoutMethods } from 'react-native-gesture-handler/ReanimatedDrawerLayout';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chats, useChats, type Chat } from '@/ara/chats';
import type { Limits } from '@/ara/types';
import { AraMascot } from '@/components/ara-mascot';
import { Press, T } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Props = {
  children: ReactNode; open: boolean; currentId: string; mode: 'work' | 'chat'; limits?: Limits | null;
  onOpen: () => void; onClose: () => void; onSelect: (id: string) => void; onNew: () => void;
  onWork?: () => void; onTalk?: () => void;
};

function DrawerSurface({ progress, children }: { progress: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    borderTopLeftRadius: interpolate(progress.get(), [0, 1], [0, 32]),
    borderBottomLeftRadius: interpolate(progress.get(), [0, 1], [0, 32]),
  }));
  // the shadow of a full-screen view was recomputed every frame of the swipe:
  // that made it jerk; a fixed soft shadow looks the same and costs nothing
  return <Animated.View style={[styles.surface, style]}>{children}</Animated.View>;
}

export function ChatSidebar({ children, open, currentId, mode, limits, onOpen, onClose, onSelect, onNew, onWork, onTalk }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(370, Math.round(screenW * 0.86));
  const drawer = useRef<DrawerLayoutMethods>(null);
  const list = useChats();

  useEffect(() => {
    if (open) drawer.current?.openDrawer({ animationSpeed: 1 });
    else drawer.current?.closeDrawer({ animationSpeed: 1 });
  }, [open]);

  const items = useMemo(() => list
    .filter((chat) => chat.messages.length || chat.id === currentId)
    .sort((a, b) => b.updatedAt - a.updatedAt), [list, currentId]);

  const go = (action: () => void) => () => { haptic.select(); onClose(); setTimeout(action, 210); };
  const remove = (chat: Chat) => {
    haptic.press();
    Alert.alert('Удалить диалог?', chat.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(chat.id) },
    ]);
  };

  const navigation = (
    <View style={[styles.panel, { width, paddingTop: insets.top + 8 }]} accessibilityLabel="Панель Arra">
      <View style={styles.head}>
        <View style={styles.brand}><AraMascot size={26} still /><T v="title" weight="800" style={styles.brandTitle}>Arra</T></View>
        <View style={styles.headActions}>
          <Press onPress={go(onNew)} feedback="tap" style={styles.headButton} accessibilityLabel="Новый диалог">
            <SymbolView name="square.and.pencil" size={18} tintColor={Colors.text} weight="semibold" />
          </Press>
          <Press onPress={go(() => router.push('/settings'))} feedback="tap" style={styles.headButton} accessibilityLabel="Настройки">
            <SymbolView name="gearshape" size={18} tintColor={Colors.text} />
          </Press>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" indicatorStyle="white">
        <T v="headline" weight="700" style={styles.section}>Недавнее</T>
        {items.length ? items.map((chat) => {
          const active = chat.id === currentId;
          const streaming = chat.messages.some((message) => message.streaming);
          return (
            <Pressable key={chat.id} onPress={active ? onClose : go(() => onSelect(chat.id))}
              onLongPress={chat.messages.length ? () => remove(chat) : undefined} delayLongPress={350}
              accessibilityRole="button" accessibilityState={{ selected: active }}
              accessibilityLabel={`${chat.messages.length ? chat.title : 'Новый диалог'}${active ? ', открыт' : ''}${streaming ? ', Arra отвечает' : ''}`}
              accessibilityHint={chat.messages.length ? 'Долгое нажатие — удалить' : undefined}
              style={({ pressed }) => [styles.chat, active && styles.chatActive, pressed && !active && styles.chatPressed]}>
              <T v="body" numberOfLines={1} style={styles.chatTitle}>{chat.messages.length ? chat.title : 'Новый диалог'}</T>
              {streaming ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        }) : <T v="subhead" color={Colors.textSecondary} style={styles.empty}>Диалогов пока нет</T>}
        <Press onPress={go(() => router.push('/subscriptions'))} style={styles.subscriptions} accessibilityLabel="Открыть подписки">
          <SymbolView name="chart.pie" size={22} tintColor={Colors.text} />
          <T v="body" weight="600">Подписки</T>
          <SymbolView name="chevron.right" size={14} tintColor={Colors.textSecondary} />
        </Press>
      </ScrollView>

      <View style={{ height: Math.max(insets.bottom, 8) }} />
    </View>
  );

  return (
    <ReanimatedDrawerLayout ref={drawer} drawerWidth={width} drawerType={DrawerType.BACK}
      keyboardDismissMode={DrawerKeyboardDismissMode.NONE} drawerBackgroundColor={Colors.background}
      overlayColor="rgba(0,0,0,0.12)" edgeWidth={40} minSwipeDistance={12} animationSpeed={1}
      onDrawerOpen={() => { haptic.select(); onOpen(); }}
      onDrawerClose={() => { if (open) haptic.select(); onClose(); }}
      renderNavigationView={() => navigation}>
      {(progress) => <DrawerSurface progress={progress!}>{children}</DrawerSurface>}
    </ReanimatedDrawerLayout>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, overflow: 'hidden', backgroundColor: Colors.background, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.hairline, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: -8, height: 0 } },
  panel: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 60 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandTitle: { fontSize: 24 },
  headActions: { flexDirection: 'row', gap: 4 },
  headButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  section: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, paddingHorizontal: 12, minHeight: 48, borderRadius: 14 },
  chatTitle: { flex: 1, fontSize: 17 },
  chatActive: { backgroundColor: Colors.cardPressed },
  chatPressed: { backgroundColor: Colors.card },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.link },
  empty: { paddingHorizontal: 20, paddingTop: 6 },
  subscriptions: { margin: 16, padding: 16, borderRadius: 16, backgroundColor: Colors.card, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottom: { marginHorizontal: 14, marginBottom: 8, flexDirection: 'row', gap: 8, paddingHorizontal: 5, paddingTop: 5, borderRadius: 29, backgroundColor: Colors.card },
  modeButton: { flex: 1, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modeActive: { backgroundColor: Colors.text },
});
