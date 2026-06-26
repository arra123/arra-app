import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { U, UG, UR, US } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const pop = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
export const yay = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

// ---------- Текст ----------
type TextKind = 'h1' | 'h2' | 'h3' | 'body' | 'label' | 'tiny' | 'huge';
const TEXT: Record<TextKind, TextStyle> = {
  huge: { fontSize: 72, fontWeight: '800', letterSpacing: -1 },
  h1: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  h3: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '500', lineHeight: 23 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  tiny: { fontSize: 12, fontWeight: '600' },
};

export function T({
  kind = 'body',
  color = U.text,
  style,
  children,
  numberOfLines,
}: {
  kind?: TextKind;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[TEXT[kind], { color }, style]}>
      {children}
    </Text>
  );
}

// ---------- Стикер (OpenMoji) ----------
export function Sticker({ src, size = 44, style }: { src: string; size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={src}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      transition={200}
      cachePolicy="memory-disk"
    />
  );
}

// ---------- Градиентная подложка ----------
export function Gradient({
  g,
  radius = 0,
  style,
  children,
}: {
  g: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <View style={[{ experimental_backgroundImage: g, borderRadius: radius, overflow: 'hidden' } as any, style]}>
      {children}
    </View>
  );
}

// ---------- Карточка ----------
export function Card({
  children,
  style,
  radius = UR.lg,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: U.card,
          borderColor: U.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius,
          padding: US.md,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

// ---------- Кнопка ----------
export function Btn({
  label,
  onPress,
  g = UG.candy,
  disabled,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  g?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        pop();
        onPress();
      }}
      style={({ pressed }) => [
        { borderRadius: UR.pill, opacity: disabled ? 0.4 : pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}>
      <Gradient g={g} radius={UR.pill} style={styles.btn}>
        {icon ? <Sticker src={icon} size={22} /> : null}
        <Text style={styles.btnTxt}>{label}</Text>
      </Gradient>
    </Pressable>
  );
}

// ---------- Чипы выбора ----------
export function Chips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string; icon?: string }[];
  value: V | null;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.chipsWrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            {active ? (
              <Gradient g={UG.candy} radius={UR.pill} style={styles.chip}>
                {o.icon ? <Sticker src={o.icon} size={18} /> : null}
                <Text style={[styles.chipTxt, { color: '#fff' }]}>{o.label}</Text>
              </Gradient>
            ) : (
              <View style={[styles.chip, { backgroundColor: U.card, borderColor: U.border, borderWidth: StyleSheet.hairlineWidth }]}>
                {o.icon ? <Sticker src={o.icon} size={18} /> : null}
                <Text style={[styles.chipTxt, { color: U.textDim }]}>{o.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Слайдер ----------
export function Slider({
  value,
  min = 1,
  max = 10,
  step = 1,
  onChange,
  tint = U.pink,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  tint?: string;
}) {
  const [w, setW] = useState(0);
  const widthRef = useRef(0);
  const lastVal = useRef(value);

  const pct = (value - min) / (max - min);

  const setFromX = (x: number) => {
    const width = widthRef.current;
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, snapped));
    if (clamped !== lastVal.current) {
      lastVal.current = clamped;
      tap();
      onChange(clamped);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        widthRef.current = width;
        setW(width);
      }}
      style={styles.sliderTouch}>
      <View style={styles.sliderTrack}>
        <View style={{ width: Math.max(0, pct * w), height: '100%', backgroundColor: tint, borderRadius: UR.pill }} />
      </View>
      <View
        style={[
          styles.sliderThumb,
          { left: Math.max(0, Math.min(w - 28, pct * w - 14)), borderColor: tint },
        ]}>
        <Text style={{ color: tint, fontWeight: '800', fontSize: 13 }}>{value}</Text>
      </View>
    </View>
  );
}

// ---------- Степпер ----------
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const btn = (delta: number) => () => {
    tap();
    onChange(Math.max(min, Math.min(max, value + delta)));
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={btn(-1)} style={styles.stepBtn}>
        <Text style={styles.stepSign}>−</Text>
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={btn(1)} style={styles.stepBtn}>
        <Text style={styles.stepSign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { height: 58, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: US.lg },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: UR.pill },
  chipTxt: { fontSize: 14, fontWeight: '700' },
  sliderTouch: { height: 40, justifyContent: 'center' },
  sliderTrack: { height: 12, borderRadius: UR.pill, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  sliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    top: 6,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: U.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: U.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSign: { color: U.text, fontSize: 26, fontWeight: '700', marginTop: -2 },
  stepVal: { color: U.text, fontSize: 22, fontWeight: '800', minWidth: 40, textAlign: 'center' },
});
