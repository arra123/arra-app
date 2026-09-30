import { router } from 'expo-router';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, Platform, StyleSheet, View, type ListRenderItem } from 'react-native';
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
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
  /** Кнопка «‹» слева в шапке (на вкладке «Разговор» её нет) */
  back?: boolean;
  /** Своя кнопка слева вместо «‹» (панель чатов у Arra) */
  left?: ReactNode;
  /** Место над шапкой под чужую панель (шапка главного экрана) */
  headerTop?: number;
  /**
   * Поверх ленты (плавающий агент): top — нижний край шапки,
   * bottom — сколько снизу занимает поле ввода вместе с клавиатурой.
   */
  overlay?: (bounds: { top: number; bottom: SharedValue<number> }) => ReactNode;
  /** Заголовок уже сам капсула (переключатель «Чат | Работа»): без второго стекла */
  bareTitle?: boolean;
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
export function ChatLayout<T>({ title, right, below, data, keyOf, renderItem, composer, empty, back = true, left, headerTop = 0, overlay, bareTitle = false }: Props<T>) {
  const insets = useSafeAreaInsets();
  // Капсула названия стоит ровно по центру экрана: поля с обеих сторон
  // по самой широкой боковой кнопке, так что кнопки её не сдвигают и не перекрывают
  const [sides, setSides] = useState({ left: 44, right: 44 });
  const side = Math.max(sides.left, sides.right) + 8;
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const composerHeight = useSharedValue(90);
  const keyboard = useReanimatedKeyboardAnimation();
  // Composer уже содержит нижний safe-area. При клавиатуре оставляем от него
  // 12 pt видимого воздуха, остальную часть компенсируем движением контейнера.
  const keyboardOpenOffset = Math.max(0, insets.bottom - 12);

  const spacer = useAnimatedStyle(() => ({
    height: composerHeight.get() + Math.max(0, -keyboard.height.get() - keyboardOpenOffset) + 8,
  }));

  // Пустой экран поднимается вместе с клавиатурой и полем ввода, а не прячется под ними
  const emptyLift = useAnimatedStyle(() => ({
    paddingBottom: composerHeight.get() + Math.max(0, -keyboard.height.get() - keyboardOpenOffset) + 16,
  }));

  const occupiedBottom = useDerivedValue(() => composerHeight.get() + Math.max(0, -keyboard.height.get() - keyboardOpenOffset));

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
        // iOS уже удерживает нижний край inverted-списка при движении клавиатуры.
        // Вторая коррекция слегка подбрасывала сообщения после её закрытия.
        maintainVisibleContentPosition={Platform.OS === 'ios' ? undefined : { minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
        initialNumToRender={14}
        windowSize={11}
        removeClippedSubviews={false}
        contentInsetAdjustmentBehavior="never"
      />

      {!data.length && empty ? (
        <Animated.View pointerEvents="box-none" style={[styles.empty, { paddingTop: headerHeight }, emptyLift]}>{empty}</Animated.View>
      ) : null}

      {/* Как в ChatGPT: сплошной полосы нет, лента уходит под плавающие капсулы, верх мягко затемнён */}
      <View pointerEvents="none" style={[styles.fade, { height: insets.top + headerTop + 84 }]}>
        {FADE.map((opacity, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: Colors.background, opacity }} />
        ))}
      </View>
      <View
        style={[styles.header, { paddingTop: insets.top + 4 + headerTop }]}
        pointerEvents="box-none"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <View style={styles.headerRow} pointerEvents="box-none">
          <View style={[styles.titleSlot, { paddingHorizontal: 12 + side }]} pointerEvents="box-none">
            {bareTitle ? title : <Glass radius={22} backing style={styles.titleCapsule}>{title}</Glass>}
          </View>
          <View pointerEvents="box-none" onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            setSides((s) => (s.left === width ? s : { ...s, left: width }));
          }}>
            {left ?? (back ? (
              <Glass radius={22} backing style={styles.backButton}>
                <IconButton icon="chevron.left" label="Назад" onPress={() => router.back()} size={44} glass={false} />
              </Glass>
            ) : null)}
          </View>
          <View style={{ flex: 1 }} pointerEvents="none" />
          <View pointerEvents="box-none" onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            setSides((s) => (s.right === width ? s : { ...s, right: width }));
          }}>
            {right}
          </View>
        </View>
        {below ? <Glass radius={18} backing style={styles.below}>{below}</Glass> : null}
      </View>

      {overlay ? overlay({ top: headerHeight, bottom: occupiedBottom }) : null}

      <KeyboardStickyView offset={{ closed: 0, opened: keyboardOpenOffset }} style={styles.composer}>
        {composer((h) => composerHeight.set(h))}
      </KeyboardStickyView>
    </View>
  );
}

/** Затемнение сверху: от почти сплошного к прозрачному */
const FADE = [0.96, 0.94, 0.9, 0.85, 0.78, 0.7, 0.6, 0.48, 0.36, 0.24, 0.13, 0.05];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 6 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleSlot: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  titleCapsule: { maxWidth: '100%', minHeight: 44, justifyContent: 'center', paddingLeft: 5, paddingRight: 14, paddingVertical: 4 },
  below: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: ScreenPadding - 4, paddingVertical: 8, gap: 8 },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
