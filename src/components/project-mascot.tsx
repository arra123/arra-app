import { Image } from 'expo-image';
import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AraMascot, type MascotMood } from './ara-mascot';

const ART: Record<number, number> = {
  3: require('../../assets/mascots/dot-03.svg'),
  4: require('../../assets/mascots/dot-04.svg'),
  5: require('../../assets/mascots/dot-05.svg'),
  6: require('../../assets/mascots/dot-06.svg'),
  8: require('../../assets/mascots/dot-08.svg'),
  11: require('../../assets/mascots/dot-11.svg'),
  12: require('../../assets/mascots/dot-12.svg'),
  13: require('../../assets/mascots/dot-13.svg'),
  14: require('../../assets/mascots/dot-14.svg'),
  15: require('../../assets/mascots/dot-15.svg'),
  16: require('../../assets/mascots/dot-16.svg'),
  19: require('../../assets/mascots/dot-19.svg'),
};

export function ProjectMascot({ id = 0, size = 40, still = false, mood = 'idle', interactive = false }: {
  id?: number; size?: number; still?: boolean; mood?: MascotMood; interactive?: boolean;
}) {
  const phase = useSharedValue(0);
  useEffect(() => {
    if (id && !still) phase.set(withRepeat(withTiming(1, { duration: mood === 'thinking' ? 850 : 1800 }), -1, true));
    else phase.set(0);
    return () => cancelAnimation(phase);
  }, [id, still, mood, phase]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: -phase.get() * size * 0.045 }] }));
  if (!ART[id]) return <AraMascot size={size} still={still} mood={mood} interactive={interactive} />;
  return <Animated.View style={[{ width: size, height: size }, motion]}>
    <Image source={ART[id]} style={{ width: size, height: size }} contentFit="contain" />
  </Animated.View>;
}
