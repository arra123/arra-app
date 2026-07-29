import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

export type DrawerThread = {
  id: string;
  title: string;
  preset: string;
  preview?: string | null;
  count?: number;
  main?: boolean;
};

type Props = {
  visible: boolean;
  threads: DrawerThread[];
  activeId: string;
  onClose: () => void;
  onPick: (id: string) => void;
  onCreate: () => void;
  onDelete: (thread: DrawerThread) => void;
};

// Только timing с затуханием: пружина давала перелёт, и панель «улетала»
// правее, чем нужно.
const OPEN = { duration: 260, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 200, easing: Easing.in(Easing.cubic) };

const presetIcon = (preset: string): SFSymbol =>
  preset === 'tech' ? 'desktopcomputer' : preset === 'general' ? 'bubble.left.and.bubble.right.fill' : 'chart.pie.fill';

/**
 * Список переписок — выезжает слева и сдвигает экран, как в ChatGPT.
 */
export function ChatDrawer({ visible, threads, activeId, onClose, onPick, onCreate, onDelete }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(330, Math.round(screenWidth * 0.86));
  const [mounted, setMounted] = useState(visible);
  // progress: 0 — закрыт, 1 — открыт. Одно значение управляет и панелью, и фоном.
  const progress = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = 0;
      requestAnimationFrame(() => { progress.value = withTiming(1, OPEN); });
      return;
    }
    if (!mounted) return;
    progress.value = withTiming(0, CLOSE, (finished) => {
      if (finished) runOnJS(unmount)();
    });
  }, [visible, mounted, progress, unmount]);

  const drag = Gesture.Pan()
    .activeOffsetX([-9999, -10])
    .failOffsetY([-24, 24])
    .onUpdate((event) => {
      progress.value = Math.max(0, Math.min(1, 1 + event.translationX / width));
    })
    .onEnd((event) => {
      if (event.translationX < -width * 0.3 || event.velocityX < -650) {
        progress.value = withTiming(0, CLOSE, (finished) => { if (finished) runOnJS(onClose)(); });
      } else {
        progress.value = withTiming(1, OPEN);
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-width, 0]) }],
  }));
  // Экран под панелью уезжает вправо и темнеет — движение читается как одно целое.
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Закрыть список чатов" />
        </Animated.View>

        <GestureDetector gesture={drag}>
          <Animated.View
            style={[
              styles.panel,
              { width, backgroundColor: theme.background, paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.two },
              panelStyle,
            ]}>
            <View style={styles.head}>
              <ThemedText style={styles.title}>Чаты</ThemedText>
              <Pressable
                onPress={() => { haptic.tap(); onCreate(); }}
                accessibilityLabel="Новый чат"
                style={({ pressed }) => [styles.newButton, { backgroundColor: theme.tint, opacity: pressed ? 0.8 : 1 }]}>
                <SymbolView name="square.and.pencil" tintColor="#FFFFFF" size={18} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {threads.map((thread) => {
                const active = String(thread.id) === String(activeId);
                const item = (
                  <Pressable
                    onPress={() => { haptic.select(); onPick(String(thread.id)); }}
                    style={({ pressed }) => [
                      styles.item,
                      {
                        backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement,
                        borderColor: active ? theme.tint : theme.separator,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <View style={[styles.itemIcon, { backgroundColor: active ? theme.tint : theme.disabled }]}>
                      <SymbolView name={presetIcon(thread.preset)} tintColor={active ? '#FFFFFF' : theme.textSecondary} size={16} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <ThemedText type="smallBold" numberOfLines={1}>{thread.title || 'Новый чат'}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {thread.preview?.trim() || (thread.count ? `${thread.count} сообщений` : 'Пусто')}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
                if (thread.main) return <View key={thread.id}>{item}</View>;
                return (
                  <ReanimatedSwipeable
                    key={thread.id}
                    friction={1.1}
                    rightThreshold={30}
                    overshootRight={false}
                    renderRightActions={() => (
                      <Pressable
                        onPress={() => { haptic.warning(); onDelete(thread); }}
                        style={[styles.delete, { backgroundColor: theme.danger }]}>
                        <SymbolView name="trash.fill" tintColor="#FFFFFF" size={19} />
                      </Pressable>
                    )}>
                    {item}
                  </ReanimatedSwipeable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,16,24,0.38)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    shadowColor: '#101828',
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 8, height: 0 },
    elevation: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  title: { flex: 1, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  newButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  item: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  delete: { width: 62, marginLeft: Spacing.two, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
