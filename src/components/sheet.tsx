import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Кнопка слева от заголовка (по умолчанию «Отмена»). */
  leftLabel?: string;
  /** Главное действие справа. Без него правая часть шапки пустая. */
  rightLabel?: string;
  onRight?: () => void;
  rightDisabled?: boolean;
  children: ReactNode;
};

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

type ScrollBridge = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
};

const SheetScrollContext = createContext<ScrollBridge | null>(null);

/**
 * Связывает прокручиваемое содержимое листа с жестом закрытия: пока список не
 * домотан до верха, палец листает его, а не тянет лист. Разложить на ScrollView
 * внутри `Sheet`: `<ScrollView {...useSheetScroll()}>`.
 */
export function useSheetScroll(): ScrollBridge {
  return useContext(SheetScrollContext) ?? { onScroll: () => {}, scrollEventThrottle: 16 };
}

/**
 * Нижний лист приложения.
 *
 * Пишем свой, а не `Modal presentationStyle="pageSheet"`: системный лист на iOS
 * открывается почти на весь экран, из-за чего форма на четыре поля выглядела
 * пустой простынёй. Здесь высота равна содержимому, лист тянется пальцем и
 * поднимается над клавиатурой.
 */
export function Sheet({
  visible,
  onClose,
  title,
  leftLabel = 'Отмена',
  rightLabel,
  onRight,
  rightDisabled = false,
  children,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  // mounted держим отдельно от visible, чтобы успела проиграть анимация закрытия.
  const [mounted, setMounted] = useState(visible);
  const [keyboard, setKeyboard] = useState(0);
  const translateY = useSharedValue(screenHeight);
  const backdrop = useSharedValue(0);
  // Прокручен ли внутренний список до самого верха. Пока нет — жест закрытия
  // не вмешивается, иначе лист уезжал бы вниз вместо прокрутки содержимого.
  const scrollAtTop = useSharedValue(true);

  const unmount = useCallback(() => setMounted(false), []);

  const scrollBridge = useMemo<ScrollBridge>(
    () => ({
      onScroll: (event) => {
        scrollAtTop.value = (event.nativeEvent.contentOffset?.y ?? 0) <= 0;
      },
      scrollEventThrottle: 16,
    }),
    [scrollAtTop],
  );

  // Открытие и закрытие разведены по разным эффектам. Раньше оба жили в одном
  // с зависимостью от mounted: установка mounted запускала эффект повторно, тот
  // возвращал лист вниз и анимировал заново — при открытии лист успевал
  // свернуться и выехать второй раз.
  useEffect(() => {
    if (!visible) return;
    setMounted(true);
    translateY.value = screenHeight;
    backdrop.value = 0;
    scrollAtTop.value = true;
    const id = requestAnimationFrame(() => {
      translateY.value = withSpring(0, SPRING);
      backdrop.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    });
    return () => cancelAnimationFrame(id);
  }, [visible, screenHeight, translateY, backdrop, scrollAtTop]);

  useEffect(() => {
    if (visible || !mounted) return;
    backdrop.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(screenHeight, { duration: 220, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(unmount)();
    });
  }, [visible, mounted, screenHeight, translateY, backdrop, unmount]);

  useEffect(() => {
    if (!mounted) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboard(event.endCoordinates?.height || 0);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboard(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [mounted]);

  const requestClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const finishDrag = useCallback(
    (translationY: number, velocityY: number) => {
      'worklet';
      if (translationY > 110 || velocityY > 900) {
        translateY.value = withTiming(screenHeight, { duration: 200 }, (finished) => {
          if (finished) runOnJS(requestClose)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    },
    [screenHeight, translateY, requestClose],
  );

  // Шапку и грабер тянем без порогов: под ними нет прокрутки, спорить не с кем.
  const headerDrag = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => finishDrag(event.translationY, event.velocityY));

  // По содержимому лист тоже тянется, но уступает внутренней прокрутке: пока
  // список не домотан до верха, палец листает его, а не закрывает лист.
  const bodyDrag = Gesture.Pan()
    .activeOffsetY([14, 9999])
    .failOffsetY(-8)
    .onUpdate((event) => {
      if (!scrollAtTop.value) return;
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (!scrollAtTop.value) return;
      finishDrag(event.translationY, event.velocityY);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel="Закрыть" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background,
              paddingBottom: (keyboard > 0 ? keyboard : insets.bottom) + Spacing.three,
              maxHeight: screenHeight - insets.top - Spacing.four,
            },
            sheetStyle,
          ]}>
          <View style={styles.dragArea}>
            <GestureDetector gesture={headerDrag}>
              <View>
                <View style={[styles.grabber, { backgroundColor: theme.separator }]} />
                <View style={[styles.head, { borderBottomColor: theme.separator }]}>
                  <Pressable onPress={requestClose} hitSlop={12} style={styles.side}>
                    <ThemedText style={[styles.action, { color: theme.tint }]}>{leftLabel}</ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>{title || ''}</ThemedText>
                  <Pressable
                    onPress={() => { if (!rightDisabled && onRight) { haptic.tap(); onRight(); } }}
                    disabled={rightDisabled || !onRight}
                    hitSlop={12}
                    style={[styles.side, styles.sideRight]}>
                    <ThemedText
                      style={[
                        styles.action,
                        styles.actionStrong,
                        { color: rightDisabled ? theme.disabledText : theme.tint, opacity: onRight ? 1 : 0 },
                      ]}>
                      {rightLabel || ''}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </GestureDetector>
            <GestureDetector gesture={bodyDrag}>
              <View style={styles.dragArea}>
                <SheetScrollContext.Provider value={scrollBridge}>{children}</SheetScrollContext.Provider>
              </View>
            </GestureDetector>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dragArea: { flexShrink: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16,20,28,0.34)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    shadowColor: '#101828',
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginTop: Spacing.two },
  head: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end' },
  title: { flex: 1.4, textAlign: 'center', fontSize: 16, lineHeight: 21 },
  action: { fontSize: 16, lineHeight: 21 },
  actionStrong: { fontWeight: '700' },
});
