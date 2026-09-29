import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Press, T } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

export type MenuItem = {
  label: string;
  icon?: SFSymbol;
  onPress: () => void;
  checked?: boolean;
  destructive?: boolean;
  subtitle?: string;
};

/** Раздел меню: просто пункты или пункты с маленьким заголовком («Модель»). */
export type MenuSection = MenuItem[] | { title?: string; items: MenuItem[] };

type Anchor = { x: number; y: number; width: number; height: number };
export type MenuAnchor = Anchor;

const MENU_WIDTH = 250;
const ITEM_H = 44;

const itemsOf = (s: MenuSection) => (Array.isArray(s) ? s : s.items);
const titleOf = (s: MenuSection) => (Array.isArray(s) ? undefined : s.title);

/**
 * Появление как в Codex: короткий fade и сдвиг на несколько точек, без пружины
 * и без масштаба. Анимация своя, а не layout-animation: внутри Modal та
 * срабатывала повторно, и меню «дышало».
 */
export function Appear({ from = -5, duration = 150, style, children }: {
  from?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [t, duration]);
  const animated = useAnimatedStyle(() => ({
    opacity: t.get(),
    transform: [{ translateY: (1 - t.get()) * from }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * Меню без своей кнопки: открывается там, где скажут (долгое нажатие на строку).
 * anchor — прямоугольник в координатах окна (measureInWindow), null — закрыто.
 */
export function GlassMenu({
  anchor,
  sections,
  align = 'right',
  onClose,
}: {
  anchor: Anchor | null;
  sections: MenuSection[];
  align?: 'left' | 'right';
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const list = sections.filter((s) => itemsOf(s).length);

  let position: ViewStyle = {};
  let below = true;
  if (anchor) {
    const count = list.reduce((n, s) => n + itemsOf(s).length, 0);
    const titles = list.filter((s) => titleOf(s)).length;
    const estimated = count * ITEM_H + titles * 26 + (list.length - 1) * 8 + 10;
    below = anchor.y + anchor.height + 6 + estimated < screenH - insets.bottom - 8;
    const left = align === 'right'
      ? Math.max(12, Math.min(anchor.x + anchor.width - MENU_WIDTH, screenW - MENU_WIDTH - 12))
      : Math.max(12, Math.min(anchor.x, screenW - MENU_WIDTH - 12));
    position = below
      ? { top: anchor.y + anchor.height + 6, left }
      : { top: Math.max(insets.top + 8, anchor.y - estimated - 6), left };
  }

  return (
    <Modal visible={!!anchor} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть меню" />
      {anchor ? (
        <Appear from={below ? -5 : 5} style={[styles.menu, position]}>
          <View style={styles.box}>
            {list.map((section, si) => (
              <View key={si} style={si > 0 ? styles.section : undefined}>
                {titleOf(section) ? (
                  <T v="caption" weight="600" color={Colors.textTertiary} style={styles.title}>{titleOf(section)}</T>
                ) : null}
                {itemsOf(section).map((item, ii) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="menuitem"
                    accessibilityState={{ checked: item.checked }}
                    onPress={() => {
                      haptic.select();
                      onClose();
                      // Меню успевает закрыться, прежде чем откроется следующий экран
                      setTimeout(item.onPress, 60);
                    }}
                    style={({ pressed }) => [styles.item, ii > 0 && styles.itemBorder, pressed && styles.pressed]}>
                    <View style={styles.check}>
                      {item.checked ? <SymbolView name="checkmark" size={13} tintColor={Colors.text} weight="semibold" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="callout" color={item.destructive ? Colors.danger : Colors.text} numberOfLines={1}>{item.label}</T>
                      {item.subtitle ? <T v="caption" color={Colors.textSecondary} numberOfLines={1}>{item.subtitle}</T> : null}
                    </View>
                    {item.icon ? (
                      <View style={styles.icon}>
                        <SymbolView name={item.icon} size={16} weight="regular" tintColor={item.destructive ? Colors.danger : Colors.textSecondary} />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </Appear>
      ) : null}
    </Modal>
  );
}

/**
 * Выпадающее меню: всплывает у кнопки, закрывается тапом мимо.
 * Меряем обычный View-обёртку (а не анимированную кнопку) и открываем один раз:
 * пока меню открыто или меряется, повторные тапы ничего не делают.
 */
export function MenuTrigger({
  sections,
  children,
  align = 'right',
  style,
  label,
}: {
  sections: MenuSection[];
  children: ReactNode;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  label: string;
}) {
  const ref = useRef<View>(null);
  const opening = useRef(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = (e: GestureResponderEvent) => {
    if (opening.current || anchor) return;
    opening.current = true;
    const { pageX, pageY, locationX, locationY } = e.nativeEvent;
    const fallback = { x: pageX - locationX, y: pageY - locationY, width: 40, height: 40 };
    const node = ref.current;
    if (!node) {
      setAnchor(fallback);
      opening.current = false;
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      opening.current = false;
      setAnchor(width > 0 && height > 0 ? { x, y, width, height } : fallback);
    });
  };

  return (
    <>
      <View ref={ref} collapsable={false} style={style}>
        <Press onPress={open} feedback="tap" accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
          {children}
        </Press>
      </View>
      <GlassMenu anchor={anchor} sections={sections} align={align} onClose={() => setAnchor(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  // Плотная подложка: полупрозрачное стекло поверх ленты читалось плохо
  box: {
    paddingVertical: 4,
    backgroundColor: Colors.cardRaised,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    overflow: 'hidden',
  },
  section: { borderTopWidth: 6, borderTopColor: Colors.card },
  title: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: ITEM_H, paddingVertical: 8 },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  pressed: { backgroundColor: Colors.cardPressed },
  check: { width: 16, alignItems: 'center' },
  icon: { width: 22, alignItems: 'center' },
});
