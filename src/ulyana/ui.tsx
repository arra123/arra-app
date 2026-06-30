import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { STK } from './assets';
import { U, UG, UR, US } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const pop = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
export const rigid = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
export const yay = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

// Праздничная серия вибраций — для победы в матче
export const celebrate = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 130);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 270);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 410);
};

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
  const leftRef = useRef(0); // абсолютная X-координата левого края трека (в окне)
  const containerRef = useRef<View>(null);
  const lastVal = useRef(value);

  const pct = (value - min) / (max - min);

  // pageX — абсолютная координата касания; вычитаем левый край трека.
  // Так перетаскивание работает, даже когда палец оказывается над «бегунком».
  const setFromX = (pageX: number) => {
    const width = widthRef.current;
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (pageX - leftRef.current) / width));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, snapped));
    if (clamped !== lastVal.current) {
      lastVal.current = clamped;
      if (clamped === min || clamped === max) pop(); // упор на краях — заметнее
      else tap();
      onChange(clamped);
    }
  };

  const measure = () => {
    containerRef.current?.measureInWindow((x, _y, width) => {
      leftRef.current = x;
      widthRef.current = width;
      setW(width);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // не отдаём жест скроллу
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.pageX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.pageX),
    }),
  ).current;

  return (
    <View
      ref={containerRef}
      {...pan.panHandlers}
      onLayout={measure}
      style={styles.sliderTouch}>
      <View style={styles.sliderTrack} pointerEvents="none">
        <View style={{ width: Math.max(0, pct * w), height: '100%', backgroundColor: tint, borderRadius: UR.pill }} />
      </View>
      <View
        pointerEvents="none"
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
    const nv = Math.max(min, Math.min(max, value + delta));
    if (nv === value) { rigid(); return; } // упёрлись в предел
    tap();
    onChange(nv);
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={btn(-1)} style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}>
        <Text style={styles.stepSign}>−</Text>
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={btn(1)} style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}>
        <Text style={styles.stepSign}>+</Text>
      </Pressable>
    </View>
  );
}

// ---------- Аудиоплеер ----------
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

export function AudioPlayerBtn({
  uri,
  headers,
  tint = U.blue,
}: {
  uri: string;
  headers?: Record<string, string>;
  tint?: string;
}) {
  const player = useAudioPlayer(headers ? ({ uri, headers } as any) : uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const dur = status.duration || 0;
  const cur = status.currentTime || 0;
  const pct = dur > 0 ? Math.min(1, cur / dur) : 0;

  useEffect(() => {
    if (status.didJustFinish) {
      try { player.seekTo(0); player.pause(); } catch { /* ignore */ }
    }
  }, [status.didJustFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    tap();
    try {
      if (playing) player.pause();
      else {
        if (status.didJustFinish || pct >= 0.999) player.seekTo(0);
        player.play();
      }
    } catch { /* ignore */ }
  };

  return (
    <View style={styles.audioRow}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.audioBtn, { backgroundColor: tint, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <Sticker src={playing ? STK.pause : STK.play} size={22} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={styles.audioTrack}>
          <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: tint, borderRadius: UR.pill }} />
        </View>
        <Text style={styles.audioTime}>{fmtTime(cur)} / {dur ? fmtTime(dur) : '—'}</Text>
      </View>
    </View>
  );
}

// ---------- Полноэкранный просмотр медиа (фото с зумом / аудио / видео-заглушка) ----------
export function MediaViewer({
  visible,
  onClose,
  kind,
  uri,
  headers,
}: {
  visible: boolean;
  onClose: () => void;
  kind: 'image' | 'audio' | 'video' | 'file' | null;
  uri: string | null;
  headers?: Record<string, string>;
}) {
  const { width, height } = Dimensions.get('window');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerRoot}>
        <Pressable style={styles.viewerClose} onPress={() => { tap(); onClose(); }} hitSlop={14}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>✕</Text>
        </Pressable>

        {kind === 'image' && uri ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}>
            <Image
              source={headers ? { uri, headers } : uri}
              style={{ width, height: height * 0.82 }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </ScrollView>
        ) : kind === 'audio' && uri ? (
          <View style={styles.viewerCenter}>
            <Sticker src={STK.sob} size={120} />
            <View style={{ height: US.lg }} />
            <View style={{ alignSelf: 'stretch', paddingHorizontal: US.xl }}>
              <AudioPlayerBtn uri={uri} headers={headers} />
            </View>
          </View>
        ) : (
          <View style={styles.viewerCenter}>
            <Sticker src={STK.tv} size={120} />
            <Text style={{ color: '#fff', fontSize: 16, marginTop: US.md, textAlign: 'center', paddingHorizontal: US.xl }}>
              Видео откроется после сохранения в галерею.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: US.sm },
  audioBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  audioTrack: { height: 8, borderRadius: UR.pill, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  audioTime: { color: U.textDim, fontSize: 12, fontWeight: '600', marginTop: 5 },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  viewerClose: { position: 'absolute', top: 54, right: 22, zIndex: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btn: {
    height: 58, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: US.lg,
    shadowColor: U.pink, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
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
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: U.cardSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: U.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stepBtnPressed: { backgroundColor: U.pink, transform: [{ scale: 0.92 }] },
  stepSign: { color: U.text, fontSize: 26, fontWeight: '700', marginTop: -2 },
  stepVal: { color: U.text, fontSize: 22, fontWeight: '800', minWidth: 40, textAlign: 'center' },
});
