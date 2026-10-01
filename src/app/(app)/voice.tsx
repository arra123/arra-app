import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AraMascot, type MascotMood } from '@/components/ara-mascot';
import { Press, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useVoiceTalk, type TalkPhase } from '@/lib/voice-talk';

const STATUS: Record<TalkPhase, string> = {
  starting: 'включаю микрофон',
  listening: 'слушаю',
  thinking: 'думаю',
  speaking: 'говорю',
  stopped: 'разговор на паузе',
};

const MOOD: Record<TalkPhase, MascotMood> = {
  starting: 'idle',
  listening: 'idle',
  thinking: 'thinking',
  speaking: 'happy',
  stopped: 'idle',
};

const MASCOT = 132;

/**
 * Разговор голосом с Arra: arra://voice (кнопка действия iPhone → «Открыть URL»).
 * Слушает сразу, отвечает вслух и снова слушает; заговорил поверх ответа или
 * нажал на Arra — ответ обрывается.
 */
export default function Voice() {
  const insets = useSafeAreaInsets();
  const { view, level, talk } = useVoiceTalk();
  const { phase } = view;
  const live = phase === 'listening' && !!view.heard;
  const question = view.heard || view.said;
  const canInterrupt = phase === 'speaking' || phase === 'thinking';

  function close() {
    talk.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.xl, paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm }]}>
      <Pressable
        style={styles.stage}
        onPress={() => talk.interrupt()}
        disabled={!canInterrupt}
        accessibilityRole="button"
        accessibilityLabel={`Arra: ${STATUS[phase]}`}
        accessibilityHint={canInterrupt ? 'Нажми, чтобы перебить ответ' : undefined}>
        <View style={styles.mascot}>
          <Halo level={level} />
          <AraMascot size={MASCOT} mood={MOOD[phase]} />
        </View>
        <Animated.View key={phase} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={styles.status}>
          <T v="headline" weight="600" color={phase === 'stopped' ? Colors.textTertiary : Colors.textSecondary}>{STATUS[phase]}</T>
        </Animated.View>
        <Wave level={level} dim={phase !== 'listening' && phase !== 'speaking'} />
        <T v="caption" color={Colors.textTertiary} style={[styles.hint, { opacity: phase === 'speaking' ? 1 : 0 }]}>
          заговори или нажми, чтобы перебить
        </T>
      </Pressable>

      <ScrollView style={styles.words} contentContainerStyle={styles.wordsContent} showsVerticalScrollIndicator={false}>
        {question ? (
          <T v="callout" color={live ? Colors.text : Colors.textSecondary} style={styles.center} numberOfLines={4}>{question}</T>
        ) : phase === 'listening' && !view.reply ? (
          <T v="callout" color={Colors.textTertiary} style={styles.center}>Говори — я слушаю</T>
        ) : null}
        {view.reply ? (
          <Animated.View key={view.reply} entering={FadeIn.duration(260)}>
            <T v="title" weight="500" style={[styles.center, styles.reply]}>{view.reply}</T>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        {view.notice ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <T v="footnote" color={phase === 'stopped' ? Colors.error : Colors.textSecondary} style={styles.center}>{view.notice}</T>
          </Animated.View>
        ) : null}
        {phase === 'stopped' ? (
          <View style={styles.buttons}>
            {view.needsSettings ? (
              <Press onPress={() => Linking.openSettings()} style={styles.button} accessibilityRole="button">
                <T v="headline" weight="600">Настройки</T>
              </Press>
            ) : null}
            <Press onPress={() => void talk.start()} feedback="press" style={[styles.button, styles.primary]} accessibilityRole="button">
              <T v="headline" weight="600" color={Colors.onAccent}>Продолжить</T>
            </Press>
          </View>
        ) : null}
        <Press onPress={close} feedback="press" style={styles.button} accessibilityRole="button" accessibilityLabel="Закончить разговор">
          <T v="headline" weight="600">Закончить</T>
        </Press>
      </View>
    </View>
  );
}

/** Мягкое свечение вокруг Arra: дышит вместе с громкостью. */
function Halo({ level }: { level: SharedValue<number> }) {
  const glow = useAnimatedStyle(() => ({
    opacity: 0.05 + level.get() * 0.13,
    transform: [{ scale: 1 + level.get() * 0.28 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.halo, glow]} />;
}

const WAVE_BARS = 33;

/**
 * Живая волна громкости: бежит от центра к краям, тихо — точки, громко —
 * столбики. Раз в 70 мс берём громкость и сдвигаем историю.
 */
function Wave({ level, dim }: { level: SharedValue<number>; dim: boolean }) {
  const half = (WAVE_BARS + 1) / 2;
  const [history, setHistory] = useState<number[]>(() => Array(half).fill(0));
  useEffect(() => {
    const id = setInterval(() => {
      const v = level.get();
      // тишина после тишины — нечего перерисовывать
      setHistory((h) => (v < 0.02 && h.every((x) => x < 0.02) ? h : [v, ...h.slice(0, -1)]));
    }, 70);
    return () => clearInterval(id);
  }, [level]);
  return (
    <View style={[styles.wave, dim && { opacity: 0.45 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: WAVE_BARS }, (_, i) => {
        const v = Math.min(1, history[Math.abs(i - (half - 1))]);
        const h = v < 0.08 ? 4 : 6 + v * 38;
        return <View key={i} style={[styles.waveBar, { height: h, opacity: 0.3 + 0.7 * Math.min(1, v * 1.6 + 0.15) }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: ScreenPadding + Spacing.sm },
  stage: { flex: 1.15, alignItems: 'center', justifyContent: 'center' },
  mascot: { width: MASCOT * 1.7, height: MASCOT * 1.3, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: MASCOT * 1.45, height: MASCOT * 1.45, borderRadius: MASCOT, backgroundColor: Colors.text },
  status: { marginTop: Spacing.lg, height: 24, alignItems: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 48, marginTop: Spacing.lg },
  waveBar: { width: 3.5, borderRadius: 2, backgroundColor: Colors.text },
  hint: { marginTop: Spacing.sm },
  words: { flex: 1 },
  wordsContent: { flexGrow: 1, justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  center: { textAlign: 'center' },
  reply: { fontSize: 21, lineHeight: 28 },
  bottom: { gap: Spacing.md, paddingTop: Spacing.md },
  buttons: { flexDirection: 'row', gap: Spacing.sm },
  button: {
    flexGrow: 1,
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.cardRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  primary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
