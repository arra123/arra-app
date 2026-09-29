import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

export type MascotMood = 'idle' | 'happy' | 'thinking';

const FACE = '#f4f4f7';
const EYE = '#16171b';

/**
 * Ара — белая капсула с глазами, как на острове и в приложении на компьютере.
 * Моргает, слегка покачивается; «думает» — глаза бегают; по нажатию радуется.
 */
export function AraMascot({
  size = 64,
  mood = 'idle',
  interactive = false,
  still = false,
  style,
}: {
  size?: number;
  mood?: MascotMood;
  interactive?: boolean;
  /** без покачивания и моргания — для маленьких значков в списках */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [joy, setJoy] = useState(false);
  const shown: MascotMood = joy ? 'happy' : mood;

  const blink = useSharedValue(1);
  const bob = useSharedValue(0);
  const look = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (still) return;
    blink.set(withRepeat(withSequence(
      withDelay(2600, withTiming(0.12, { duration: 70 })),
      withTiming(1, { duration: 110 }),
      withDelay(180, withTiming(0.12, { duration: 70 })),
      withTiming(1, { duration: 110 }),
    ), -1));
    bob.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => {
      cancelAnimation(blink);
      cancelAnimation(bob);
    };
  }, [still, blink, bob]);

  useEffect(() => {
    if (shown === 'thinking') {
      look.set(withRepeat(withSequence(
        withTiming(-1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ), -1, true));
    } else {
      cancelAnimation(look);
      look.set(withTiming(0, { duration: 200 }));
    }
    return () => cancelAnimation(look);
  }, [shown, look]);

  const w = size;
  const h = Math.round(size * 0.68);
  const body = useAnimatedStyle(() => ({
    transform: [
      { translateY: (bob.get() - 0.5) * size * 0.05 },
      { scale: pop.get() },
    ],
  }));
  const eyes = useAnimatedStyle(() => ({
    transform: [{ translateX: look.get() * size * 0.07 }, { scaleY: shown === 'happy' ? 1 : blink.get() }],
  }));

  const eyeW = size * 0.095;
  const eyeH = size * 0.2;
  const arcW = size * 0.17;
  const stroke = Math.max(2, size * 0.045);

  const eye = shown === 'happy'
    ? <View style={{ width: arcW, height: arcW * 0.62, borderTopLeftRadius: arcW, borderTopRightRadius: arcW, borderWidth: stroke, borderBottomWidth: 0, borderColor: EYE }} />
    : <View style={{ width: eyeW, height: eyeH, borderRadius: eyeW, backgroundColor: EYE }} />;

  const face = (
    <Animated.View
      style={[
        styles.face,
        { width: w, height: h, borderRadius: h * 0.46, shadowRadius: size * 0.22, shadowOpacity: still ? 0 : 0.35 },
        body,
        style,
      ]}>
      <View style={[styles.gloss, { top: h * 0.08, left: w * 0.12, width: w * 0.5, height: h * 0.22, borderRadius: h }]} />
      <Animated.View style={[styles.eyes, { gap: size * 0.2 }, eyes]}>
        {eye}
        {eye}
      </Animated.View>
    </Animated.View>
  );

  if (!interactive) return face;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ара"
      onPress={() => {
        haptic.press();
        setJoy(true);
        pop.set(withSequence(withSpring(1.14, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10, stiffness: 220 })));
        setTimeout(() => setJoy(false), 1400);
      }}>
      {face}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: FACE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
  },
  gloss: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.7)' },
  eyes: { flexDirection: 'row', alignItems: 'center' },
});
