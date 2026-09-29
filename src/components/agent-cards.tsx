import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { AgentQuestion, SubAgent } from '@/ara/types';
import { AraMascot } from '@/components/ara-mascot';
import { Press, T } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';

const layout = LinearTransition.duration(220).easing(Easing.out(Easing.cubic));

/** Жёлтый кружок с номером пункта. */
function Num({ n }: { n: number }) {
  return (
    <View style={styles.num}>
      <T v="tiny" weight="800" color={Colors.onAccent} maxFontSizeMultiplier={1.2}>{n}</T>
    </View>
  );
}

// ---------- нужно от тебя ----------

/** Что агент просит у пользователя; тап — к полю ввода. */
export function NeedsCard({ needs, onPress }: { needs: string[]; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} layout={layout}>
      <Press onPress={onPress} scaleTo={0.99} feedback="select" style={styles.card} accessibilityLabel={`Нужно от тебя: ${needs.join('; ')}`}>
        <T v="caption" weight="700" color={Colors.waiting} style={styles.caps}>Нужно от тебя</T>
        {needs.map((need, i) => (
          <View key={i} style={styles.needRow}>
            <Num n={i + 1} />
            <T v="subhead" style={{ flex: 1 }}>{need}</T>
          </View>
        ))}
      </Press>
    </Animated.View>
  );
}

// ---------- вопрос с вариантами ----------

/** Вопрос агента: варианты крупными строками, тап — ответ в терминал. */
export function QuestionCard({ question, onAnswer }: { question: AgentQuestion; onAnswer: (index: number) => Promise<unknown> }) {
  const q = question.questions[0];
  const [sent, setSent] = useState<number | null>(null);

  // Новый вопрос — снова можно отвечать
  useEffect(() => setSent(null), [question.id]);

  if (!q) return null;

  async function choose(index: number) {
    if (sent !== null) return;
    setSent(index);
    try {
      await onAnswer(index);
    } catch {
      setSent(null);
    }
  }

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} layout={layout} style={styles.card}>
      {q.header ? <T v="caption" weight="700" color={Colors.waiting} style={styles.caps}>{q.header}</T> : null}
      <T v="callout" weight="600">{q.question}</T>
      <View style={styles.options}>
        {q.options.map((option, i) => (
          <Press
            key={i}
            onPress={() => choose(i + 1)}
            disabled={sent !== null && sent !== i + 1}
            scaleTo={0.985}
            feedback="press"
            style={[styles.option, i > 0 && styles.optionBorder]}
            accessibilityLabel={`${i + 1}. ${option.label}${option.description ? `. ${option.description}` : ''}`}>
            <Num n={i + 1} />
            <View style={{ flex: 1, gap: 1 }}>
              <T v="callout" weight="700">{option.label}</T>
              {option.description ? <T v="footnote" color={Colors.textSecondary}>{option.description}</T> : null}
            </View>
            {sent === i + 1 ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : null}
          </Press>
        ))}
      </View>
    </Animated.View>
  );
}

// ---------- помощники ----------

/** Тонкая бегущая полоска «идёт работа». */
function RunningBar() {
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1));
    return () => cancelAnimation(x);
  }, [x]);
  const run = useAnimatedStyle(() => ({ left: `${-40 + x.get() * 140}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.runner, run]} />
    </View>
  );
}

/** Цвет помощника закрепляется за ним при первом появлении и не прыгает. */
function useHelperColors(helpers: SubAgent[]) {
  const map = useRef(new Map<string, string>());
  const palette = Colors.helpers;
  for (const h of [...helpers].reverse()) {
    if (map.current.has(h.id)) continue;
    const used = new Set(map.current.values());
    const free = palette.find((c) => !used.has(c)) || palette[map.current.size % palette.length];
    map.current.set(h.id, free);
  }
  return (id: string) => map.current.get(id) || palette[0];
}

/** Полоса маленьких маскотов-помощников; закончившие свёрнуты в «ещё N готовых». */
export function HelpersStrip({ helpers }: { helpers: SubAgent[] }) {
  const [showDone, setShowDone] = useState(false);
  const colorOf = useHelperColors(helpers);
  const active = helpers.filter((h) => h.active);
  const done = helpers.filter((h) => !h.active);
  if (!active.length) return null;
  const shown = showDone ? [...active, ...done] : active;
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {shown.map((h) => (
          <Animated.View key={h.id} entering={FadeIn.duration(200)} layout={layout} style={[styles.helper, !h.active && { opacity: 0.45 }]}>
            <AraMascot size={30} color={colorOf(h.id)} mood={h.active ? 'thinking' : 'idle'} still={!h.active} />
            <T v="tiny" color={Colors.textSecondary} numberOfLines={2} style={styles.helperText}>{h.description}</T>
            {h.active ? <RunningBar /> : <View style={styles.trackEmpty} />}
          </Animated.View>
        ))}
        {done.length ? (
          <Press onPress={() => setShowDone((v) => !v)} feedback="select" style={styles.more} accessibilityLabel={showDone ? 'Свернуть готовых' : `Ещё готовых: ${done.length}`}>
            <T v="tiny" color={Colors.textTertiary}>{showDone ? 'свернуть' : `ещё ${done.length} ${done.length % 10 === 1 && done.length % 100 !== 11 ? 'готовый' : 'готовых'}`}</T>
          </Press>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.waitingSoft,
    borderLeftWidth: 2,
    borderLeftColor: Colors.waitingLine,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6 },
  num: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 1,
    backgroundColor: Colors.waiting,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  options: { marginTop: 2 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  strip: { gap: 6, paddingVertical: 2, alignItems: 'flex-start' },
  helper: { width: 84, alignItems: 'center', gap: 4 },
  helperText: { textAlign: 'center', minHeight: 28 },
  track: { width: 56, height: 2, borderRadius: 1, backgroundColor: Colors.separator, overflow: 'hidden' },
  trackEmpty: { height: 2 },
  runner: { position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 1, backgroundColor: Colors.textSecondary },
  more: { height: 44, justifyContent: 'center', paddingHorizontal: 6 },
});
