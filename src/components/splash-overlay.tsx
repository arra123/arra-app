import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AraMascot, type MascotMood } from '@/components/ara-mascot';
import { T } from '@/components/ui';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Живой загрузочный экран поверх приложения. Первый кадр совпадает с системной
 * заставкой (тот же маскот 110 pt по центру), дальше: Ара подпрыгивает,
 * радуется, вокруг расходится свечение — и экран растворяется, пока Ара
 * «влетает» в приложение. Уходит, когда готово и прошло не меньше ~1,2 с.
 */
export function SplashOverlay({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [minDone, setMinDone] = useState(false);

  const lift = useSharedValue(0);
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  const title = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    lift.set(withSequence(
      withTiming(-10, { duration: 260, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 7, stiffness: 260 }),
    ));
    scale.set(withSequence(withTiming(1.08, { duration: 260 }), withSpring(1, { damping: 8, stiffness: 240 })));
    ring.set(withDelay(200, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
    title.set(withDelay(320, withTiming(1, { duration: 420 })));
    const joy = setTimeout(() => setMood('happy'), 420);
    const min = setTimeout(() => setMinDone(true), 1250);
    return () => {
      clearTimeout(joy);
      clearTimeout(min);
    };
  }, [lift, scale, ring, title]);

  useEffect(() => {
    if (!ready || !minDone) return;
    scale.set(withTiming(9, { duration: 520, easing: Easing.in(Easing.cubic) }));
    title.set(withTiming(0, { duration: 180 }));
    fade.set(withDelay(160, withTiming(0, { duration: 380 }, (done) => {
      if (done) runOnJS(setGone)(true);
    })));
  }, [ready, minDone, scale, title, fade]);

  const root = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const mascot = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }, { scale: scale.get() }] }));
  const halo = useAnimatedStyle(() => ({
    opacity: (1 - ring.get()) * 0.45,
    transform: [{ scale: 0.6 + ring.get() * 2.2 }],
  }));
  const label = useAnimatedStyle(() => ({
    opacity: title.get(),
    transform: [{ translateY: (1 - title.get()) * 8 }],
  }));

  if (gone) return null;
  return (
    <Animated.View pointerEvents={ready && minDone ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.root, root]}>
      <View style={styles.center} onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
        <Animated.View style={[styles.halo, halo]} />
        <Animated.View style={mascot}>
          <AraMascot size={110} mood={mood} still />
        </Animated.View>
      </View>
      <Animated.View style={[styles.label, label]}>
        <T v="title" weight="700">Arra</T>
        <T v="footnote" color={Colors.textSecondary}>твои агенты рядом</T>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  label: { position: 'absolute', bottom: '32%', alignItems: 'center', gap: 4 },
});
