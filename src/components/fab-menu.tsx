import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

export type FabAction = {
  id: string;
  label: string;
  systemImage: SFSymbol;
  /** Цвет плитки действия; по умолчанию — акцент приложения. */
  tint?: string;
  onPress: () => void;
};

type Props = {
  actions: FabAction[];
  /** Подпись главной кнопки для VoiceOver. */
  label?: string;
};

const ITEM_HEIGHT = 52;
const ITEM_GAP = 6;
const SPRING = { damping: 18, stiffness: 240, mass: 0.7 };

/**
 * Плавающая кнопка в левом нижнем углу над таб-баром.
 *
 * Действия «распускаются» из самой кнопки: каждая плитка растёт от точки нажатия
 * вверх со сдвигом по времени, поэтому переход читается как одно движение,
 * а не как появление отдельного меню.
 */
export function FabMenu({ actions, label = 'Быстрые действия' }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // Держим плитки в дереве, пока играет анимация закрытия, но не дольше —
  // иначе невидимый слой перехватывает нажатия по списку.
  const [rendered, setRendered] = useState(false);
  const progress = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setRendered(true);
      progress.value = withSpring(1, SPRING);
    } else {
      progress.value = withTiming(0, { duration: 190, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setRendered)(false);
      });
    }
    rotation.value = withSpring(open ? 1 : 0, SPRING);
  }, [open, progress, rotation]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.9 }));

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 135}deg` }],
  }));

  function toggle() {
    haptic.press();
    setOpen((current) => !current);
  }

  function pick(action: FabAction) {
    haptic.tap();
    setOpen(false);
    // Даём меню схлопнуться, иначе лист открывается поверх ещё живой анимации.
    setTimeout(action.onPress, 140);
  }

  // Плавающая панель iOS 26 занимает снизу больше, чем safe-area, но с запасом
  // в 74 pt кнопка висела слишком высоко — держим ближе к панели.
  const bottom = insets.bottom + BottomTabInset + 40;

  return (
    <>
      {/* Подложку рендерим только в открытом состоянии: невидимый слой с
          анимированным pointerEvents перехватывал бы нажатия по списку. */}
      {rendered && (
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents={open ? 'auto' : 'none'}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Закрыть меню" />
        </Animated.View>
      )}

      <View style={[styles.dock, { left: Spacing.three, bottom }]} pointerEvents="box-none">
        {rendered && actions.map((action, index) => (
          <FabItem
            key={action.id}
            action={action}
            index={index}
            total={actions.length}
            progress={progress}
            onPress={() => pick(action)}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={({ pressed }) => [
            styles.trigger,
            { backgroundColor: theme.tint, opacity: pressed ? 0.82 : 1 },
          ]}>
          <Animated.View style={plusStyle}>
            <SymbolView name="plus" tintColor="#FFFFFF" size={26} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

function FabItem({
  action,
  index,
  total,
  progress,
  onPress,
}: {
  action: FabAction;
  index: number;
  total: number;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const theme = useTheme();
  // Нижняя плитка стартует первой: считаем от кнопки вверх.
  const order = total - 1 - index;
  const start = order * 0.12;
  const end = Math.min(1, start + 0.7);
  const offset = (total - index) * (ITEM_HEIGHT + ITEM_GAP);

  const style = useAnimatedStyle(() => {
    const local = interpolate(progress.value, [start, end], [0, 1], 'clamp');
    return {
      opacity: local,
      transform: [
        { translateY: interpolate(local, [0, 1], [offset - 4, 0]) },
        { scale: interpolate(local, [0, 1], [0.55, 1]) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.item, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.itemInner,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.separator,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <View style={[styles.itemIcon, { backgroundColor: action.tint || theme.tint }]}>
          <SymbolView name={action.systemImage} tintColor="#FFFFFF" size={19} />
        </View>
        <ThemedText type="smallBold" numberOfLines={1}>{action.label}</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(242,243,247,0.72)' },
  dock: { position: 'absolute', alignItems: 'flex-start', gap: ITEM_GAP },
  item: { transformOrigin: 'left bottom' },
  itemInner: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: 7,
    paddingRight: Spacing.four,
    borderRadius: ITEM_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      default: { elevation: 6 },
    }),
  },
  itemIcon: { width: 38, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  trigger: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#0A84FF', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      default: { elevation: 10 },
    }),
  },
});
