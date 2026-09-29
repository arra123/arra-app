import { SymbolView } from 'expo-symbols';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeOut, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Glass, Press, T } from '@/components/ui';
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

export type MenuSection = MenuItem[];

type Anchor = { x: number; y: number; width: number; height: number };

const MENU_WIDTH = 250;

const menuEnter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.86 }] },
    animations: {
      opacity: withTiming(1, { duration: 140 }),
      transform: [{ scale: withSpring(1, { damping: 18, stiffness: 320 }) }],
    },
  };
};

export type MenuAnchor = Anchor;

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

  let position: ViewStyle = {};
  if (anchor) {
    const count = sections.reduce((n, s) => n + s.length, 0);
    const estimated = count * 46 + (sections.length - 1) * 8 + 12;
    const below = anchor.y + anchor.height + 8 + estimated < screenH - insets.bottom - 8;
    const left = align === 'right'
      ? Math.max(12, Math.min(anchor.x + anchor.width - MENU_WIDTH, screenW - MENU_WIDTH - 12))
      : Math.max(12, Math.min(anchor.x, screenW - MENU_WIDTH - 12));
    position = below
      ? { top: anchor.y + anchor.height + 8, left, transformOrigin: align === 'right' ? 'top right' : 'top left' }
      : { top: Math.max(insets.top + 8, anchor.y - estimated - 8), left, transformOrigin: align === 'right' ? 'bottom right' : 'bottom left' };
  }

  return (
    <Modal visible={!!anchor} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть меню" />
      {anchor ? (
        <Animated.View entering={menuEnter} exiting={FadeOut.duration(120)} style={[styles.menu, position]}>
          <Glass radius={Radius.lg} style={styles.glass}>
            {sections.map((section, si) => (
              <View key={si} style={si > 0 ? styles.section : undefined}>
                {section.map((item, ii) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="menuitem"
                    onPress={() => {
                      haptic.select();
                      onClose();
                      // Меню успевает закрыться, прежде чем откроется следующий экран
                      setTimeout(item.onPress, 60);
                    }}
                    style={({ pressed }) => [styles.item, ii > 0 && styles.itemBorder, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    <View style={styles.check}>
                      {item.checked ? <SymbolView name="checkmark" size={13} tintColor={Colors.text} weight="bold" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="callout" color={item.destructive ? Colors.danger : Colors.text} numberOfLines={1}>{item.label}</T>
                      {item.subtitle ? <T v="caption" color={Colors.textSecondary} numberOfLines={1}>{item.subtitle}</T> : null}
                    </View>
                    {item.icon ? <SymbolView name={item.icon} size={17} tintColor={item.destructive ? Colors.danger : Colors.text} /> : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </Glass>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

/**
 * Выпадающее меню на Liquid Glass (без нативных SwiftUI-контролов):
 * всплывает от кнопки, закрывается тапом мимо.
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
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = () => {
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };

  return (
    <>
      <Press ref={ref} onPress={open} style={style} feedback="tap" accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
        {children}
      </Press>
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
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  // Прозрачное стекло поверх ленты читалось плохо: пункты наезжали на текст.
  // Под меню — плотная подложка, стекло остаётся сверху для блика.
  glass: { paddingVertical: 4, backgroundColor: Colors.glassFallback, borderRadius: Radius.lg, overflow: 'hidden' },
  section: { borderTopWidth: 6, borderTopColor: 'rgba(0,0,0,0.25)' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 46, paddingVertical: 8 },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  check: { width: 16, alignItems: 'center' },
});
