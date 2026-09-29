import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactNode, type Ref } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { AgentKind, AgentState } from '@/ara/types';
import { STATE_META } from '@/ara/format';
import { AraMascot } from '@/components/ara-mascot';
import { Colors, Radius, Type } from '@/constants/theme';
import { API_URL } from '@/lib/api';
import { haptic } from '@/lib/haptics';

// ---------- текст ----------

type Variant = keyof typeof Type;
const LINE: Record<Variant, number> = {
  largeTitle: 36, title: 25, headline: 22, body: 22, callout: 20, subhead: 19, footnote: 18, caption: 16, tiny: 14,
};

type TProps = TextProps & {
  v?: Variant;
  color?: string;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
};

/** Текст с системным шрифтом iOS; Dynamic Type работает, но не ломает вёрстку. */
export function T({ v = 'body', color = Colors.text, weight, style, ...rest }: TProps) {
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[{ fontSize: Type[v], lineHeight: LINE[v], color, fontWeight: weight }, style]}
    />
  );
}

// ---------- стекло ----------

const LIQUID = Platform.OS === 'ios' && isLiquidGlassAvailable();

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  interactive?: boolean;
};

/** Liquid Glass на iOS 26, на старых iOS — системный размытый материал. */
export function Glass({ children, style, radius = Radius.xl, interactive = false }: GlassProps) {
  if (LIQUID) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={Colors.glassTint}
        isInteractive={interactive}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: Colors.glassFallback }, styles.glassBorder, style]}>
      {Platform.OS === 'ios' ? <BlurView tint="systemChromeMaterialDark" intensity={80} style={StyleSheet.absoluteFill} /> : null}
      {children}
    </View>
  );
}

// ---------- нажатия ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressProps = Omit<PressableProps, 'style'> & {
  ref?: Ref<View>;
  style?: StyleProp<ViewStyle>;
  /** Насколько «проседает» при нажатии */
  scaleTo?: number;
  feedback?: 'tap' | 'press' | 'select' | 'none';
};

/** Кнопка с пружинкой и хаптикой. */
export function Press({ style, scaleTo = 0.97, feedback = 'tap', onPressIn, onPressOut, onPress, disabled, ...rest }: PressProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { damping: 20, stiffness: 400 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback !== 'none') haptic[feedback]();
        onPress?.(e);
      }}
      style={[style, animated, disabled && { opacity: 0.4 }]}
    />
  );
}

type IconButtonProps = {
  icon: SFSymbol;
  onPress?: () => void;
  size?: number;
  color?: string;
  label: string;
  glass?: boolean;
  background?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Круглая кнопка с SF Symbol — стеклянная для шапок и панели ввода. */
export function IconButton({ icon, onPress, size = 40, color = Colors.text, label, glass = true, background, disabled, style }: IconButtonProps) {
  const inner = <SymbolView name={icon} size={size * 0.45} tintColor={color} weight="semibold" />;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      scaleTo={0.9}
      style={style}>
      {glass && !background ? (
        <Glass radius={size / 2} style={[styles.center, { width: size, height: size }]}>{inner}</Glass>
      ) : (
        <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: background ?? 'transparent' }]}>{inner}</View>
      )}
    </Press>
  );
}

// ---------- статус ----------

/** Цветная точка статуса; у работающего агента мягко пульсирует. */
export function StatusDot({ state, size = 8 }: { state: AgentState; size?: number }) {
  const pulse = useSharedValue(0);
  const color = STATE_META[state].color;
  useEffect(() => {
    if (state === 'working') {
      pulse.set(withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1));
    } else {
      cancelAnimation(pulse);
      pulse.set(withTiming(0, { duration: 200 }));
    }
    return () => cancelAnimation(pulse);
  }, [state, pulse]);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.get()),
    transform: [{ scale: 1 + pulse.get() * 1.4 }],
  }));
  const dot = useAnimatedStyle(() => ({ backgroundColor: withTiming(color, { duration: 300 }) }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, halo]} />
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size }, dot]} />
    </View>
  );
}

const LOGOS = {
  claude: require('@/assets/images/claude-mark.png'),
  codex: require('@/assets/images/openai-mark.png'),
};

/** Бейдж агента: фирменный «спарк» Claude, узел OpenAI у Codex, маскот у Ары. */
export function AgentIcon({ agent, size = 32 }: { agent: AgentKind | 'ara'; size?: number }) {
  if (agent === 'ara') {
    return (
      <View style={[styles.center, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: 'rgba(255,255,255,0.07)' }]}>
        <AraMascot size={size * 0.68} still />
      </View>
    );
  }
  const bg = agent === 'claude' ? 'rgba(217,119,87,0.14)' : 'rgba(255,255,255,0.08)';
  const logo = size * (agent === 'claude' ? 0.6 : 0.56);
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg }]}>
      <Image source={LOGOS[agent]} style={{ width: logo, height: logo }} contentFit="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/**
 * Иконка проекта (PNG с компьютера через сервер) со значком Claude/Codex
 * в правом нижнем углу. Нет иконки — просто значок агента.
 */
export function ProjectIcon({ iconName, agent, size = 34 }: { iconName?: string | null; agent: AgentKind; size?: number }) {
  if (!iconName) return <AgentIcon agent={agent} size={size} />;
  const badge = Math.round(size * 0.46);
  const logo = badge * (agent === 'claude' ? 0.66 : 0.6);
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={{ uri: `${API_URL}/ara/icon/${encodeURIComponent(iconName)}` }}
        style={{ width: size, height: size, borderRadius: Radius.sm, backgroundColor: Colors.cardRaised }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        accessibilityIgnoresInvertColors
      />
      <View style={[styles.center, styles.badge, { width: badge, height: badge, borderRadius: badge / 2, right: -badge * 0.28, bottom: -badge * 0.28 }]}>
        <Image source={LOGOS[agent]} style={{ width: logo, height: logo }} contentFit="contain" />
      </View>
    </View>
  );
}

/** Маленькая крутящаяся дуга «идёт работа». */
export function Spinner({ size = 12, color = Colors.textSecondary }: { size?: number; color?: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1));
    return () => cancelAnimation(turn);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));
  const stroke = Math.max(1.5, size / 7);
  return (
    <Animated.View
      accessibilityLabel="работает"
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color, borderTopColor: 'transparent', borderRightColor: 'transparent' },
        spin,
      ]}
    />
  );
}

/** Номер рабочего стола: маленький экранчик с цифрой, серым, без плашки. */
export function DeskBadge({ ws, color = Colors.textTertiary }: { ws: number; color?: string }) {
  return (
    <View
      style={styles.desk}
      accessible
      accessibilityLabel={`Рабочий стол ${ws}`}>
      <View style={[styles.deskScreen, { borderColor: color }]}>
        <Text style={[styles.deskNumber, { color }]} maxFontSizeMultiplier={1.2}>{ws}</Text>
      </View>
      <View style={[styles.deskStand, { backgroundColor: color }]} />
    </View>
  );
}

/** Маленькая «пилюля» — стол, модель, статус. */
export function Chip({ children, color = Colors.textSecondary, background = 'rgba(255,255,255,0.07)', style }: {
  children: ReactNode;
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: background }, style]}>
      {typeof children === 'string' ? <T v="tiny" color={color} weight="600" numberOfLines={1}>{children}</T> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.background },
  glassBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.hairline },
  desk: { alignItems: 'center' },
  deskScreen: {
    minWidth: 17,
    height: 13,
    paddingHorizontal: 3,
    borderWidth: 1.3,
    borderRadius: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deskNumber: { fontSize: 9, lineHeight: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deskStand: { width: 7, height: 1.3, borderRadius: 1, marginTop: 1.5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
});
