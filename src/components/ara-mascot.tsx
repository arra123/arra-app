import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

export type MascotMood = 'idle' | 'happy' | 'thinking' | 'listening' | 'speaking' | 'hello' | 'sleepy' | 'sad' | 'surprised';
/** The mark at its top-left, like in a messenger: it types, it is done, it failed, it asks. */
export type MascotBadge = '' | 'typing' | 'ok' | 'error' | 'ask';

const WHITE = '#ffffff';
const EYE = '#0d0e12';
const TURN = Math.PI * 2;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, 'f').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}
function mix(hex: string, to: number, k: number) {
  return `rgb(${rgb(hex).map((c) => Math.round(c + (to - c) * k)).join(',')})`;
}
/** A sphere lit softly from the top-left: light, the colour itself, a darker underside. */
function shades(color: string) {
  const plain = rgb(color).every((c) => c > 236);
  return plain
    ? { top: '#ffffff', mid: '#f1f2f5', low: '#b4bac8', hand: '#e3e6ec', dots: '#8fb8ff' }
    : { top: mix(color, 255, 0.34), mid: color, low: mix(color, 0, 0.3), hand: mix(color, 0, 0.06), dots: color };
}
function gradient(c: { top: string; mid: string; low: string }): ViewStyle {
  const image = `radial-gradient(circle at 36% 28%, ${c.top} 0%, ${c.mid} 45%, ${c.low} 100%)`;
  return (Platform.OS === 'web' ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle;
}

/**
 * Arra — шарик с двумя глазами, тот же, что в tito и на острове компьютера.
 * Лицо живёт на сфере: голова поворачивается, глаза съезжают к краю и сужаются.
 * Дышит, моргает, оглядывается; у каждого настроения своё движение.
 */
export function AraMascot({
  size = 64,
  mood = 'idle',
  interactive = false,
  still = false,
  color = WHITE,
  badge,
  style,
}: {
  size?: number;
  mood?: MascotMood;
  interactive?: boolean;
  /** без движения — для маленьких значков в списках */
  still?: boolean;
  /** цвет шарика; по умолчанию белый, у проектов — свои цвета */
  color?: string;
  badge?: MascotBadge;
  style?: StyleProp<ViewStyle>;
}) {
  const [joy, setJoy] = useState(false);
  const shown: MascotMood = joy ? 'happy' : mood;
  const d = size / 1.1; // the ball is a little wider than tall
  const big = size >= 48;
  const mark: MascotBadge = badge ?? (shown === 'thinking' && !big && !still ? 'typing' : '');

  const yaw = useSharedValue(0);
  const pitch = useSharedValue(0);
  const tilt = useSharedValue(0);
  const hop = useSharedValue(0);
  const squash = useSharedValue(1);
  const breath = useSharedValue(1);
  const blink = useSharedValue(1);
  const lid = useSharedValue(1);
  const hands = useSharedValue(0);
  const wave = useSharedValue(0);
  const tall = useSharedValue(1);

  // it lives: breathes and blinks
  useEffect(() => {
    if (still) return;
    blink.set(withRepeat(withSequence(
      withDelay(2400, withTiming(0.05, { duration: 70 })),
      withTiming(1, { duration: 130 }),
      withDelay(3300, withTiming(0.05, { duration: 70 })),
      withTiming(1, { duration: 100 }),
      withDelay(90, withTiming(0.05, { duration: 70 })),
      withTiming(1, { duration: 130 }),
    ), -1));
    breath.set(withRepeat(withSequence(
      withTiming(1.03, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.985, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
    ), -1));
    return () => { cancelAnimation(blink); cancelAnimation(breath); };
  }, [still, blink, breath]);

  // what each mood does
  useEffect(() => {
    const soft = { duration: 320, easing: Easing.out(Easing.back(1.6)) };
    const sway = (a: number, b: number, ms: number) => withRepeat(withSequence(
      withTiming(a, { duration: ms, easing: Easing.inOut(Easing.sin) }),
      withTiming(b, { duration: ms, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    const rest = () => {
      yaw.set(withTiming(0, soft)); pitch.set(withTiming(0, soft)); tilt.set(withTiming(0, soft));
      hop.set(withTiming(0, { duration: 160 })); lid.set(withTiming(1, { duration: 200 }));
      hands.set(withTiming(0, { duration: 200 })); wave.set(withTiming(0, { duration: 200 })); tall.set(withTiming(1, { duration: 160 }));
    };
    rest();
    // every new mood lands with a squash and a bounce
    squash.set(withSequence(withTiming(0.88, { duration: 90 }), withTiming(1.05, { duration: 140 }), withSpring(1, { damping: 9, stiffness: 240 })));
    if (still) return;

    if (shown === 'idle') {
      // glances around now and then
      yaw.set(withRepeat(withSequence(
        withDelay(2600, withTiming(0.5, soft)), withDelay(1200, withTiming(0, soft)),
        withDelay(3400, withTiming(-0.45, soft)), withDelay(1000, withTiming(0, soft)),
        withDelay(4200, withTiming(0.3, soft)), withDelay(900, withTiming(0, soft)),
      ), -1));
      pitch.set(withRepeat(withSequence(
        withDelay(2600, withTiming(-0.18, soft)), withDelay(1200, withTiming(0, soft)),
        withDelay(3400, withTiming(0.12, soft)), withDelay(1000, withTiming(0, soft)),
        withDelay(4200, withTiming(-0.25, soft)), withDelay(900, withTiming(0, soft)),
      ), -1));
    } else if (shown === 'thinking') {
      // looks up, the eyes go slowly from side to side
      const slow = { duration: 1500, easing: Easing.inOut(Easing.sin) };
      pitch.set(withTiming(-0.45, soft));
      yaw.set(withSequence(withTiming(0.42, soft), withRepeat(withSequence(
        withDelay(500, withTiming(-0.42, slow)), withDelay(500, withTiming(0.42, slow)),
      ), -1)));
      tilt.set(withSequence(withTiming(5, soft), withRepeat(withSequence(
        withDelay(500, withTiming(-5, slow)), withDelay(500, withTiming(5, slow)),
      ), -1)));
      lid.set(withRepeat(withSequence(withDelay(7400, withTiming(0.5, { duration: 220 })), withDelay(800, withTiming(1, { duration: 150 }))), -1));
    } else if (shown === 'happy') {
      // one turn in the air, then a pleased sway
      yaw.set(withSequence(withTiming(0, { duration: 0 }), withTiming(TURN, { duration: 540, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 0 })));
      hop.set(withSequence(
        withTiming(-size * 0.26, { duration: 270, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 250, easing: Easing.in(Easing.quad) }),
      ));
      tilt.set(withDelay(560, sway(7, -7, 420)));
    } else if (shown === 'listening') {
      lid.set(withTiming(0.85, { duration: 200 }));
      pitch.set(withTiming(-0.1, soft));
      tilt.set(sway(-5, 5, 560));
    } else if (shown === 'speaking') {
      tilt.set(sway(4, -4, 380));
      hop.set(withRepeat(withSequence(
        withTiming(-size * 0.04, { duration: 190, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 190, easing: Easing.in(Easing.quad) }),
      ), -1));
    } else if (shown === 'hello') {
      hands.set(withSpring(1, { damping: 11, stiffness: 220 }));
      tilt.set(withTiming(-5, soft));
      wave.set(withDelay(200, withRepeat(withSequence(
        withTiming(1, { duration: 180, easing: Easing.inOut(Easing.quad) }),
        withTiming(-0.4, { duration: 180, easing: Easing.inOut(Easing.quad) }),
      ), -1)));
    } else if (shown === 'sleepy') {
      lid.set(withTiming(0.14, { duration: 500 }));
      pitch.set(withTiming(0.3, soft));
      tilt.set(withTiming(10, { duration: 900, easing: Easing.inOut(Easing.sin) }));
    } else if (shown === 'sad') {
      lid.set(withTiming(0.5, { duration: 300 }));
      pitch.set(withTiming(0.35, soft));
    } else if (shown === 'surprised') {
      tall.set(withTiming(1.4, { duration: 160 }));
      pitch.set(withTiming(-0.15, soft));
      hop.set(withSequence(withTiming(-size * 0.18, { duration: 170 }), withTiming(0, { duration: 170 })));
    }
    return () => { for (const v of [yaw, pitch, tilt, hop, lid, hands, wave, tall]) cancelAnimation(v); };
  }, [shown, still, size, yaw, pitch, tilt, hop, squash, lid, hands, wave, tall]);

  const body = useAnimatedStyle(() => {
    const s = squash.get() * breath.get();
    return { transform: [{ translateY: hop.get() }, { rotate: `${tilt.get()}deg` }, { scaleX: 2 - s }, { scaleY: s }] };
  });
  const c = shades(color);
  const handW = d * 0.25;
  const handH = d * 0.22;

  const face = (
    <View style={[{ width: size, height: d }, style]}>
      <Animated.View style={[{ width: size, height: d, transformOrigin: '50% 100%' }, body]}>
        <Hand side={-1} size={size} d={d} w={handW} h={handH} color={c.hand} hands={hands} wave={wave} />
        <Hand side={1} size={size} d={d} w={handW} h={handH} color={c.hand} hands={hands} wave={wave} />
        <View style={[styles.ball, { left: (size - d) / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: c.mid }, gradient(c)]} />
        <Eye side={-1} size={size} d={d} yaw={yaw} pitch={pitch} blink={blink} lid={lid} tall={tall} />
        <Eye side={1} size={size} d={d} yaw={yaw} pitch={pitch} blink={blink} lid={lid} tall={tall} />
        {mark ? <Badge kind={mark} d={d} size={size} still={still} /> : null}
      </Animated.View>
      {shown === 'thinking' && big && !still ? <Thought size={size} d={d} color={c.dots} /> : null}
    </View>
  );

  if (!interactive) return face;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Arra"
      onPress={() => {
        haptic.press();
        setJoy(true);
        setTimeout(() => setJoy(false), 1500);
      }}>
      {face}
    </Pressable>
  );
}

/** An eye on the sphere: slides with the head, narrows towards the edge, hides behind the ball. */
function Eye({ side, size, d, yaw, pitch, blink, lid, tall }: {
  side: number; size: number; d: number;
  yaw: SharedValue<number>; pitch: SharedValue<number>; blink: SharedValue<number>; lid: SharedValue<number>; tall: SharedValue<number>;
}) {
  const w0 = d * 0.132;
  const h0 = d * 0.265;
  const style = useAnimatedStyle(() => {
    const cy = Math.cos(yaw.get());
    const cp = Math.cos(pitch.get());
    const open = blink.get() * lid.get();
    const w = w0 * Math.pow(Math.max(0.2, cy), 0.6) * (1 - 0.14 * side * Math.sin(yaw.get())) * (open < 0.3 ? 1.35 : 1);
    const h = Math.max(d * 0.04, h0 * tall.get() * Math.pow(Math.max(0.3, cp), 0.8) * open);
    return {
      opacity: cy > -0.05 ? 1 : 0,
      transform: [
        { translateX: size * (Math.sin(yaw.get()) * 0.3 + side * 0.15 * cy) },
        { translateY: Math.sin(pitch.get()) * d * 0.27 },
        { scaleX: w / w0 },
        { scaleY: h / h0 },
      ],
    };
  });
  return <Animated.View style={[styles.eye, { left: size / 2 - w0 / 2, top: d / 2 - h0 / 2, width: w0, height: h0, borderRadius: w0 * 0.46 }, style]} />;
}

/** A hand: a small ball of the same colour; the right one waves. */
function Hand({ side, size, d, w, h, color, hands, wave }: {
  side: number; size: number; d: number; w: number; h: number; color: string;
  hands: SharedValue<number>; wave: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const k = hands.get();
    const up = side > 0 ? Math.max(0, wave.get()) : 0;
    return {
      opacity: k > 0.01 ? 1 : 0,
      transform: [
        { translateX: side * size * (0.42 + 0.2 * k) },
        { translateY: d * (side > 0 ? -0.08 - 0.3 * up * k : 0.1) },
        { rotate: `${side * 22 + (side > 0 ? wave.get() * 26 : 0)}deg` },
        { scale: k },
      ],
    };
  });
  return <Animated.View style={[styles.hand, { left: size / 2 - w / 2, top: d / 2 - h / 2, width: w, height: h, borderRadius: h / 2, backgroundColor: color }, style]} />;
}

/** One 0→1 clock for the three dots that take turns. */
function useDots(run: boolean) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    t.set(withRepeat(withTiming(1, { duration: 1250, easing: Easing.linear }), -1));
    return () => cancelAnimation(t);
  }, [run, t]);
  return t;
}
function Dot({ i, t, size, color, lift }: { i: number; t: SharedValue<number>; size: number; color: string; lift: number }) {
  const style = useAnimatedStyle(() => {
    const p = (t.get() - i * 0.14 + 1) % 1;
    const up = p < 0.42 ? Math.sin((p / 0.42) * Math.PI) : 0;
    return { opacity: 0.55 + up * 0.45, transform: [{ translateY: -up * lift }, { scale: 0.8 + up * 0.35 }] };
  });
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

function Badge({ kind, d, size, still }: { kind: Exclude<MascotBadge, ''>; d: number; size: number; still: boolean }) {
  const wide = kind === 'typing' || kind === 'ask';
  const w = d * (wide ? 0.36 : 0.19);
  const t = useDots(kind === 'typing' && !still);
  const tone = kind === 'typing' ? '#2f8cf6' : kind === 'ok' ? '#34d36f' : kind === 'error' ? '#ff4d5e' : '#f5c542';
  return (
    <View style={[styles.badge, { left: size * 0.07 - w / 2, top: d * 0.1 - w / 2, width: w, height: w, borderRadius: w / 2, backgroundColor: tone, borderWidth: Math.max(1.5, d * 0.022) }]}>
      {kind === 'typing' ? (
        <View style={[styles.row, { gap: w * 0.08 }]}>
          {[0, 1, 2].map((i) => <Dot key={i} i={i} t={t} size={w * 0.15} color="#ffffff" lift={w * 0.12} />)}
        </View>
      ) : kind === 'ask' ? (
        <View style={styles.center}>
          <View style={{ width: w * 0.12, height: w * 0.34, borderRadius: w * 0.06, backgroundColor: '#101114' }} />
          <View style={{ width: w * 0.13, height: w * 0.13, borderRadius: w * 0.07, backgroundColor: '#101114', marginTop: w * 0.07 }} />
        </View>
      ) : null}
    </View>
  );
}

/** Three dots over its head take turns while it thinks. */
function Thought({ size, d, color }: { size: number; d: number; color: string }) {
  const t = useDots(true);
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.set(withSpring(1, { damping: 10, stiffness: 180 }));
    return () => cancelAnimation(grow);
  }, [grow]);
  const dot = d * 0.13;
  const arc = useAnimatedStyle(() => ({ opacity: grow.get(), transform: [{ scale: 0.5 + grow.get() * 0.5 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.row, { position: 'absolute', left: 0, width: size, top: -d * 0.3, height: dot * 2, justifyContent: 'center', gap: dot * 0.8 }, arc]}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ marginTop: i === 1 ? -dot * 0.6 : 0 }}>
          <Dot i={i} t={t} size={dot} color={color} lift={dot * 0.55} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ball: { position: 'absolute', top: 0, transform: [{ scaleX: 1.1 }] },
  eye: { position: 'absolute', backgroundColor: EYE },
  hand: { position: 'absolute' },
  badge: { position: 'absolute', borderColor: '#101114', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
