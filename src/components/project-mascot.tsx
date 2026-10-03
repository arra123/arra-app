import { Image } from 'expo-image';
import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AraMascot, type MascotMood } from './ara-mascot';
import { T } from './ui';

export function AgentNumber({ number, mascotId = 0 }: { number: number; mascotId?: number }) {
  const color = ({ 3: '#ffcf40', 4: '#ad7bed', 5: '#55b9f2', 6: '#ff6379', 8: '#8caf42', 11: '#984feb', 12: '#ffbd83', 13: '#ffd13b', 14: '#359fef', 15: '#d76b8d', 16: '#aaa194', 19: '#9b93ff' } as Record<number, string>)[mascotId] || '#ffffff';
  return <T v="subhead" weight="700" color={color} style={{ minWidth: 18, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{number || '—'}</T>;
}

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
