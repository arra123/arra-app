import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AraMascot, type MascotMood } from '@/components/ara-mascot';
import { T } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

SplashScreen.preventAutoHideAsync().catch(() => {});

const SIZE = 110;
const SPARKS = 8;
const TITLE = 'Arra'.split('');

export type SplashVariant = 'apple' | 'wave' | 'roll';

/**
 * The loading screen over the app. «apple» (the default): quiet, like Apple —
 * Arra is already there (as on the system splash), breathes once and the app
 * comes through it. «wave» and «roll» are brighter variants, in «Тесты».
 */
export function SplashOverlay({ ready, variant = 'apple', onDone }: { ready: boolean; variant?: SplashVariant; onDone?: () => void }) {
  if (variant === 'wave') return <WaveSplash ready={ready} onDone={onDone} />;
  if (variant === 'roll') return <RollSplash ready={ready} onDone={onDone} />;
  return <AppleSplash ready={ready} onDone={onDone} />;
}

/** Apple-like: no show. A soft breath, then Arra grows a little and the screen dissolves (~0.8 s). */
function AppleSplash({ ready, onDone }: { ready: boolean; onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const [minDone, setMinDone] = useState(false);
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    scale.set(withSequence(withTiming(0.96, { duration: 260, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) })));
    glow.set(withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => setMinDone(true), 650);
    return () => clearTimeout(t);
  }, [scale, glow]);

  useEffect(() => {
    if (!ready || !minDone) return;
    scale.set(withTiming(1.12, { duration: 360, easing: Easing.in(Easing.cubic) }));
    fade.set(withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(setGone)(true);
      if (done && onDone) runOnJS(onDone)();
    }));
  }, [ready, minDone, scale, fade, onDone]);

  const root = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const mascot = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() * 0.06, transform: [{ scale: 0.8 + glow.get() * 0.4 }] }));
  if (gone) return null;
  return (
    <Animated.View pointerEvents={ready && minDone ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.root, root]}>
      <View style={styles.center} onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
        <Animated.View style={[styles.disc, { width: 220, height: 220, borderRadius: 110 }, halo]} />
        <Animated.View style={mascot}><AraMascot size={SIZE} mood="idle" still /></Animated.View>
      </View>
    </Animated.View>
  );
}

/** Arra rolls in from the left, stops with a bounce, smiles, and the app opens out of it. */
function RollSplash({ ready, onDone }: { ready: boolean; onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [minDone, setMinDone] = useState(false);
  const x = useSharedValue(-320);
  const turn = useSharedValue(-540);
  const squash = useSharedValue(1);
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);

  useEffect(() => {
    x.set(withTiming(0, { duration: 760, easing: Easing.out(Easing.cubic) }));
    turn.set(withTiming(0, { duration: 760, easing: Easing.out(Easing.cubic) }));
    squash.set(withDelay(720, withSequence(withTiming(0.82, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 300 }))));
    const joy = setTimeout(() => { setMood('happy'); haptic.select(); }, 820);
    const t = setTimeout(() => setMinDone(true), 1500);
    return () => { clearTimeout(joy); clearTimeout(t); };
  }, [x, turn, squash]);

  useEffect(() => {
    if (!ready || !minDone) return;
    scale.set(withTiming(7, { duration: 520, easing: Easing.in(Easing.cubic) }));
    fade.set(withDelay(180, withTiming(0, { duration: 340 }, (done) => {
      if (done) runOnJS(setGone)(true);
      if (done && onDone) runOnJS(onDone)();
    })));
  }, [ready, minDone, scale, fade, onDone]);

  const root = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const mascot = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { rotate: `${turn.get()}deg` }, { scaleY: squash.get() }, { scaleX: 2 - squash.get() }, { scale: scale.get() }],
  }));
  if (gone) return null;
  return (
    <Animated.View pointerEvents={ready && minDone ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.root, root]}>
      <View style={styles.center} onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
        <Animated.View style={mascot}><AraMascot size={SIZE} mood={mood} still /></Animated.View>
      </View>
    </Animated.View>
  );
}

/**
 * Живой загрузочный экран поверх приложения. Первый кадр совпадает с системной
 * заставкой (тот же маскот 110 pt по центру). Дальше Arra подпрыгивает,
 * радуется и машет рукой («привет!»), вокруг вспыхивают искры и мягкое
 * свечение, буквы названия выезжают по одной. Когда приложение готово (и
 * прошло ~2 с), Arra ныряет вверх, а экран растворяется.
 */
function WaveSplash({ ready, onDone }: { ready: boolean; onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [minDone, setMinDone] = useState(false);

  const lift = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const wave = useSharedValue(0);
  const hand = useSharedValue(0);
  const sparks = useSharedValue(0);
  const title = useSharedValue(0);
  const hello = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    // hop
    lift.set(withSequence(
      withTiming(-14, { duration: 280, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 7, stiffness: 240 }),
    ));
    scale.set(withSequence(withTiming(1.07, { duration: 280 }), withSpring(1, { damping: 8, stiffness: 230 })));
    // the glow breathes behind
    glow.set(withDelay(150, withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true)));
    // the hand comes up and waves three times
    hand.set(withDelay(420, withSpring(1, { damping: 11, stiffness: 220 })));
    wave.set(withDelay(520, withRepeat(withSequence(
      withTiming(1, { duration: 170, easing: Easing.inOut(Easing.quad) }),
      withTiming(-1, { duration: 170, easing: Easing.inOut(Easing.quad) }),
    ), 3, true)));
    hello.set(withDelay(560, withSpring(1, { damping: 12, stiffness: 200 })));
    // sparks burst out once
    sparks.set(withDelay(380, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    title.set(withDelay(300, withTiming(1, { duration: 700 })));
    const joy = setTimeout(() => { setMood('happy'); haptic.select(); }, 430);
    const min = setTimeout(() => setMinDone(true), 1900);
    return () => {
      clearTimeout(joy);
      clearTimeout(min);
    };
  }, [lift, scale, glow, hand, wave, hello, sparks, title]);

  useEffect(() => {
    if (!ready || !minDone) return;
    // Arra dives up into the app, the screen dissolves
    hello.set(withTiming(0, { duration: 160 }));
    hand.set(withTiming(0, { duration: 160 }));
    lift.set(withTiming(-260, { duration: 520, easing: Easing.in(Easing.cubic) }));
    scale.set(withTiming(0.4, { duration: 520, easing: Easing.in(Easing.cubic) }));
    title.set(withTiming(0, { duration: 200 }));
    fade.set(withDelay(220, withTiming(0, { duration: 380 }, (done) => {
      if (done) runOnJS(setGone)(true);
      if (done && onDone) runOnJS(onDone)();
    })));
  }, [ready, minDone, hello, hand, lift, scale, title, fade, onDone]);

  const root = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const mascot = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }, { scale: scale.get() }] }));
  // three soft discs, each fainter and wider: a glow, not grey circles
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + glow.get() * 0.65,
    transform: [{ scale: 1 + glow.get() * 0.1 }],
  }));
  // the hand is a little white mitten at the right side, turning on its wrist
  const handStyle = useAnimatedStyle(() => ({
    opacity: hand.get(),
    transform: [
      { translateX: SIZE * 0.52 },
      { translateY: SIZE * 0.02 - hand.get() * SIZE * 0.18 },
      { rotate: `${20 + wave.get() * 22}deg` },
      { scale: 0.6 + hand.get() * 0.4 },
    ],
  }));
  const helloStyle = useAnimatedStyle(() => ({
    opacity: hello.get(),
    transform: [{ translateY: -SIZE * 0.72 - hello.get() * 10 }, { translateX: SIZE * 0.62 }, { scale: 0.7 + hello.get() * 0.3 }],
  }));

  if (gone) return null;
  return (
    <Animated.View pointerEvents={ready && minDone ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.root, root]}>
      <View style={styles.center} onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
        <Animated.View style={[styles.glow, glowStyle]}>
          <View style={[styles.disc, { width: 340, height: 340, borderRadius: 170, opacity: 0.025 }]} />
          <View style={[styles.disc, { width: 260, height: 260, borderRadius: 130, opacity: 0.035 }]} />
          <View style={[styles.disc, { width: 190, height: 190, borderRadius: 95, opacity: 0.05 }]} />
          <View style={[styles.disc, { width: 140, height: 140, borderRadius: 70, opacity: 0.06 }]} />
        </Animated.View>
        {Array.from({ length: SPARKS }, (_, i) => <Spark key={i} i={i} t={sparks} />)}
        <Animated.View style={mascot}>
          <Animated.View style={[styles.hand, handStyle]} />
          <AraMascot size={SIZE} mood={mood} still />
          <Animated.View style={[styles.hello, helloStyle]}>
            <T v="subhead" weight="700" color={Colors.background}>привет!</T>
          </Animated.View>
        </Animated.View>
      </View>
      <View style={styles.label}>
        <View style={styles.titleRow}>
          {TITLE.map((ch, i) => <Letter key={i} ch={ch} i={i} t={title} />)}
        </View>
        <Letter ch="твои агенты рядом" i={TITLE.length} t={title} small />
      </View>
    </Animated.View>
  );
}

/** One spark: flies out from Arra at its angle, flashes and fades. */
function Spark({ i, t }: { i: number; t: SharedValue<number> }) {
  const angle = (i / SPARKS) * Math.PI * 2 + 0.3;
  const far = 92 + (i % 3) * 18;
  const style = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v > 0 && v < 1 ? Math.sin(v * Math.PI) : 0,
      transform: [
        { translateX: Math.cos(angle) * far * v },
        { translateY: Math.sin(angle) * far * v * 0.8 },
        { scale: 0.4 + Math.sin(v * Math.PI) * 0.8 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, i % 2 ? styles.sparkSmall : null, style]} />;
}

/** A letter (or the subtitle) of the title: rises in, one after another. */
function Letter({ ch, i, t, small = false }: { ch: string; i: number; t: SharedValue<number>; small?: boolean }) {
  const style = useAnimatedStyle(() => {
    const v = Math.max(0, Math.min(1, t.get() * 1.8 - i * 0.18));
    return { opacity: v, transform: [{ translateY: (1 - v) * 14 }] };
  });
  return (
    <Animated.View style={style}>
      {small
        ? <T v="footnote" color={Colors.textSecondary}>{ch}</T>
        : <T v="largeTitle" weight="800">{ch}</T>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 340, height: 340, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', backgroundColor: '#ffffff' },
  spark: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff' },
  sparkSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#cfd6ff' },
  hand: {
    position: 'absolute',
    alignSelf: 'center',
    width: SIZE * 0.2,
    height: SIZE * 0.3,
    borderRadius: SIZE * 0.1,
    backgroundColor: '#f4f4f7',
  },
  hello: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f4f4f7',
  },
  label: { position: 'absolute', bottom: '30%', alignItems: 'center', gap: 6 },
  titleRow: { flexDirection: 'row' },
});
