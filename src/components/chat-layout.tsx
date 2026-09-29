import { router } from 'expo-router';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass, IconButton } from '@/components/ui';
import { Colors, ScreenPadding } from '@/constants/theme';

type Props<T> = {
  /** Центр шапки (заголовок) */
  title: ReactNode;
  /** Справа в шапке */
  right?: ReactNode;
  /** Под шапкой, внутри стекла: строка статуса, план */
  below?: ReactNode;
  /** Сообщения от старых к новым */
  data: T[];
  keyOf: (item: T, index: number) => string;
  renderItem: ListRenderItem<T>;
  /** Рисует поле ввода; onHeight — чтобы лента не пряталась под ним */
  composer: (onHeight: (h: number) => void) => ReactElement;
  empty?: ReactNode;
};

/** Какие ключи появились после первой загрузки — только они въезжают анимацией. */
export function useFreshKeys(keys: string[]) {
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!keys.length) return;
    setSeen((prev) => {
      if (prev && keys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev ?? []);
      keys.forEach((k) => next.add(k));
      return next;
    });
  }, [keys]);
  return (key: string) => seen !== null && !seen.has(key);
}

/**
 * Экран переписки как в Codex / ChatGPT на iPhone: стеклянная шапка сверху,
 * перевёрнутая лента (новое внизу, открывается на последнем сообщении),
 * поле ввода прилипает к клавиатуре, свайп от края — назад.
 */
export function ChatLayout<T>({ title, right, below, data, keyOf, renderItem, composer, empty }: Props<T>) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const composerHeight = useSharedValue(90);
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomInset = insets.bottom;

  const spacer = useAnimatedStyle(() => ({
    height: composerHeight.get() + Math.max(0, -keyboard.height.get() - bottomInset) + 8,
  }));

  // Пустой экран поднимается вместе с клавиатурой и полем ввода, а не прячется под ними
  const emptyLift = useAnimatedStyle(() => ({
    paddingBottom: composerHeight.get() + Math.max(0, -keyboard.height.get() - bottomInset) + 16,
  }));

  const reversed = [...data].reverse();

  return (
    <View style={styles.root}>
      <FlatList
        data={reversed}
        inverted
        keyExtractor={(item, index) => keyOf(item, reversed.length - 1 - index)}
        renderItem={renderItem}
        ListHeaderComponent={<Animated.View style={spacer} />}
        ListFooterComponent={<View style={{ height: headerHeight + 6 }} />}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        indicatorStyle="white"
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
        initialNumToRender={14}
        windowSize={11}
        removeClippedSubviews={false}
        contentInsetAdjustmentBehavior="never"
      />

      {!data.length && empty ? (
        <Animated.View pointerEvents="box-none" style={[styles.empty, { paddingTop: headerHeight }, emptyLift]}>{empty}</Animated.View>
      ) : null}

      <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <Glass radius={0} style={[styles.headerGlass, { paddingTop: insets.top + 4 }]}>
          <View style={styles.headerRow}>
            <IconButton icon="chevron.left" label="Назад" onPress={() => router.back()} size={38} />
            <View style={styles.headerTitle}>{title}</View>
            {right}
          </View>
          {below ? <View style={styles.below}>{below}</View> : null}
        </Glass>
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: bottomInset }} style={styles.composer}>
        {composer((h) => composerHeight.set(h))}
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerGlass: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  headerTitle: { flex: 1, minWidth: 0 },
  below: { paddingHorizontal: ScreenPadding, paddingTop: 8, gap: 8 },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
