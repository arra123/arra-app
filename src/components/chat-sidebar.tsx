import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { SFSymbol } from 'sf-symbols-typescript';

import { chats, useChats, type Chat } from '@/ara/chats';
import { AraMascot } from '@/components/ara-mascot';
import { Glass, Press, T } from '@/components/ui';
import { Colors, Radius, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const EASE = Easing.out(Easing.cubic);

/**
 * Панель диалогов с Арой, как боковое меню ChatGPT: выезжает слева поверх чата,
 * сверху поиск и переходы (агенты, настройки), ниже «Недавнее» с выделенным
 * текущим диалогом, снизу белая капсула «Новый чат». Закрывается тапом мимо
 * или смахиванием влево.
 */
export function ChatSidebar({ open, currentId, onClose, onSelect, onNew }: {
  open: boolean;
  currentId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(360, Math.round(screenW * 0.84));
  const list = useChats();
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(open);
  const t = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      drag.set(0);
      t.set(withTiming(1, { duration: 260, easing: EASE }));
    } else {
      t.set(withTiming(0, { duration: 200, easing: EASE }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      }));
    }
  }, [open, t, drag]);

  const q = query.trim().toLowerCase();
  const items = useMemo(
    () => list
      .filter((c) => c.messages.length || c.id === currentId)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [list, q, currentId],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => drag.set(Math.min(0, e.translationX)))
    .onEnd((e) => {
      if (e.translationX < -width * 0.3 || e.velocityX < -600) scheduleOnRN(onClose);
      else drag.set(withTiming(0, { duration: 180, easing: EASE }));
    });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: (t.get() - 1) * width + drag.get() }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: t.get() * (1 + drag.get() / width) }));

  if (!mounted) return null;

  const go = (action: () => void) => () => {
    haptic.select();
    onClose();
    setTimeout(action, 180);
  };

  const remove = (chat: Chat) => {
    haptic.press();
    Alert.alert('Удалить диалог?', chat.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(chat.id) },
    ]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть список диалогов" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.panel, { width, paddingTop: insets.top + 8 }, panel]}
          accessibilityViewIsModal
          accessibilityLabel="Диалоги с Арой">
          <View style={styles.head}>
            <View style={styles.brand}>
              <AraMascot size={26} still />
              <T v="title" weight="800">Ара</T>
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
                <NavRow icon="terminal" label="Агенты" onPress={go(() => router.dismissTo('/'))} />
              </View>
            )}

            <T v="headline" weight="700" style={styles.section}>{q ? 'Найдено' : 'Недавнее'}</T>
            {items.length ? (
              items.map((chat) => {
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
                    accessibilityLabel={`${chat.messages.length ? chat.title : 'Новый диалог'}${active ? ', открыт' : ''}${streaming ? ', Ара отвечает' : ''}`}
                    accessibilityHint={chat.messages.length ? 'Долгое нажатие — удалить' : undefined}
                    style={({ pressed }) => [styles.chat, active && styles.chatActive, pressed && !active && styles.chatPressed]}>
                    <T v="body" numberOfLines={1} style={{ flex: 1, fontSize: 17 }}>{chat.messages.length ? chat.title : 'Новый диалог'}</T>
                    {streaming ? <View style={styles.dot} /> : null}
                  </Pressable>
                );
              })
            ) : (
              <T v="subhead" color={Colors.textSecondary} style={styles.empty}>{q ? 'Ничего не нашлось' : 'Диалогов пока нет'}</T>
            )}
          </ScrollView>

          <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
            <Press onPress={go(onNew)} feedback="none" scaleTo={0.95} style={styles.newChat} accessibilityRole="button" accessibilityLabel="Новый диалог с Арой">
              <SymbolView name="square.and.pencil" size={19} tintColor={Colors.onAccent} weight="semibold" />
              <T v="headline" weight="600" color={Colors.onAccent}>Чат</T>
            </Press>
            <Glass radius={24} backing style={styles.settings}>
              <Press onPress={go(() => router.push('/settings'))} feedback="none" style={styles.settingsInner} accessibilityRole="button" accessibilityLabel="Настройки">
                <SymbolView name="gearshape" size={20} tintColor={Colors.text} />
              </Press>
            </Glass>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
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
  scrim: { backgroundColor: Colors.scrim },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.background,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.hairline,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, minHeight: 48 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: Type.body, height: 40 },
  nav: { paddingTop: 4, paddingBottom: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 8, paddingHorizontal: 12, minHeight: 48, borderRadius: 16 },
  navIcon: { width: 26, alignItems: 'center' },
  section: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, paddingHorizontal: 12, minHeight: 48, borderRadius: 16 },
  chatActive: { backgroundColor: Colors.cardPressed },
  chatPressed: { backgroundColor: Colors.card },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.link },
  empty: { paddingHorizontal: 20, paddingTop: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 22,
    borderRadius: 25,
    backgroundColor: Colors.text,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  settings: { width: 48, height: 48 },
  settingsInner: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
