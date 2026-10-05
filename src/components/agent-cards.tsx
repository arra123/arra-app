import { SymbolView } from 'expo-symbols';
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

import { allAnswered, answersByMessage, answersOnTap, type Selections } from '@/ara/questions';
import type { AgentQuestion, SubAgent } from '@/ara/types';
import { AraMascot } from '@/components/ara-mascot';
import { ProjectMascot } from '@/components/project-mascot';
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

/**
 * Что агент просит у пользователя. Свёрнуто — одна строка: число пунктов и
 * первый пункт; по нажатию раскрывается весь список, «Свернуть» — обратно.
 * Состояние раскрытия держит экран агента.
 */
export function NeedsCard({ needs, open, completed, busy, onToggle, onReply, onComplete }: {
  needs: string[];
  open: boolean;
  completed: Set<string>;
  busy: Set<string>;
  onToggle: () => void;
  onReply: () => void;
  onComplete: (need: string) => void;
}) {
  const left = needs.filter((need) => !completed.has(need)).length;
  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} layout={layout} style={[styles.card, styles.needs]}>
      <Press
        onPress={onToggle}
        scaleTo={0.99}
        feedback="select"
        style={styles.needsHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Нужно от тебя: ${needs.length} ${pointsWord(needs.length)}. ${open ? 'Свернуть' : needs[0]}`}>
        <Num n={left} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="caption" weight="700" color={Colors.waiting} style={styles.caps}>Нужно от тебя</T>
          {open ? null : <T v="footnote" numberOfLines={1}>{left ? needs.find((need) => !completed.has(need)) : 'Всё сделано'}</T>}
        </View>
        <Chevron open={open} />
      </Press>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(100)} style={styles.needsList}>
          {needs.map((need) => (
            <Press key={need} onPress={() => onComplete(need)} disabled={completed.has(need) || busy.has(need)} feedback="select"
              style={[styles.needRow, completed.has(need) && styles.needDone]} accessibilityRole="checkbox"
              accessibilityState={{ checked: completed.has(need), busy: busy.has(need) }}
              accessibilityLabel={`${completed.has(need) ? 'Сделано' : 'Отметить выполненным'}: ${need}`}>
              <View style={[styles.needCheck, completed.has(need) && styles.needCheckDone]}>
                {busy.has(need) ? <ActivityIndicator size="small" color={Colors.waiting} /> : completed.has(need) ? <SymbolView name="checkmark" size={12} tintColor={Colors.onAccent} weight="bold" /> : null}
              </View>
              <T v="subhead" selectable style={{ flex: 1 }}>{need}</T>
            </Press>
          ))}
          <View style={styles.needsActions}>
            <Press onPress={onReply} feedback="tap" style={styles.pill} accessibilityRole="button" accessibilityLabel="Ответить агенту">
              <SymbolView name="arrowshape.turn.up.left" size={13} tintColor={Colors.onAccent} weight="semibold" />
              <T v="footnote" weight="700" color={Colors.onAccent}>Ответить</T>
            </Press>
            <Press onPress={onToggle} feedback="select" style={styles.pillGhost} accessibilityRole="button" accessibilityLabel="Свернуть список">
              <T v="footnote" weight="600" color={Colors.textSecondary}>Свернуть</T>
            </Press>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function pointsWord(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return 'пункт';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'пункта';
  return 'пунктов';
}

function Chevron({ open }: { open: boolean }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 200 }) }] }));
  return (
    <Animated.View style={[styles.chevron, style]}>
      <SymbolView name="chevron.down" size={12} tintColor={Colors.textSecondary} weight="semibold" />
    </Animated.View>
  );
}

// ---------- вопрос с вариантами ----------

export type AnswerStatus = { state: 'idle' } | { state: 'sending' } | { state: 'sent'; at: number } | { state: 'error'; message: string };

/**
 * Вопросы агента по порядку: заголовок, текст, варианты (один или несколько),
 * «Свой ответ» — ставит курсор в поле чата. Одиночный вопрос с одним выбором
 * отвечается нажатием; иначе — кнопкой «Ответить», когда выбрано всё.
 * Выбор и статус отправки держит экран агента: при ошибке сети они не теряются.
 */
export function QuestionCard({ question, picked, onPick, onSubmit, onReopen, onOwnAnswer, status, open, onToggle, now }: {
  question: AgentQuestion;
  picked: Selections;
  onPick: (questionIndex: number, option: number) => void;
  onSubmit: () => void;
  /** Ответ ушёл, а вопрос так и висит — снова показать варианты */
  onReopen: () => void;
  onOwnAnswer: () => void;
  status: AnswerStatus;
  open: boolean;
  onToggle: () => void;
  now: number;
}) {
  const list = question.questions;
  const tap = answersOnTap(question);
  const busy = status.state === 'sending';
  const sent = status.state === 'sent';
  const ready = allAnswered(question, picked);
  const total = list.length;
  const answered = list.filter((_, i) => (picked[i]?.length ?? 0) > 0).length;

  if (sent) {
    const long = now - status.at > 20_000;
    return (
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} layout={layout} style={[styles.card, styles.sentRow]}>
        <SymbolView name="checkmark.circle.fill" size={16} tintColor={Colors.success} />
        <T v="footnote" color={Colors.textSecondary} style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {long ? 'Вопрос всё ещё открыт в терминале' : 'Ответ отправлен — жду агента'}
        </T>
        {long ? (
          <Press onPress={onReopen} feedback="tap" style={styles.pillGhost} accessibilityRole="button" accessibilityLabel="Показать вопрос и ответить ещё раз">
            <T v="footnote" weight="600">Ещё раз</T>
          </Press>
        ) : (
          <ActivityIndicator size="small" color={Colors.textSecondary} />
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} layout={layout} style={styles.card}>
      <Press
        onPress={onToggle}
        feedback="select"
        scaleTo={0.99}
        style={styles.questionHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${total > 1 ? `Вопросов агента: ${total}` : 'Вопрос агента'}. ${open ? 'Свернуть' : 'Развернуть'}`}>
        <SymbolView name="questionmark.bubble.fill" size={15} tintColor={Colors.waiting} />
        <T v="caption" weight="700" color={Colors.waiting} style={[styles.caps, { flexShrink: 0 }]}>
          {total > 1 ? `Вопросы · ${answered}/${total}` : 'Вопрос'}
        </T>
        {open ? <View style={{ flex: 1 }} /> : <T v="footnote" numberOfLines={1} style={{ flex: 1 }}>{list[0]?.question}</T>}
        <Chevron open={open} />
      </Press>

      {open ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.questions}>
          {list.map((q, qi) => (
            <View key={qi} style={[styles.question, qi > 0 && styles.questionBorder]}>
              {q.header ? (
                <T v="caption" weight="700" color={Colors.textSecondary} style={styles.caps}>
                  {total > 1 ? `${qi + 1}. ` : ''}{q.header}{q.multi ? ' · можно несколько' : ''}
                </T>
              ) : null}
              <T v="callout" weight="600" selectable>{q.question}</T>
              {q.options.length ? (
                <View accessibilityRole={q.multi ? undefined : 'radiogroup'}>
                  {q.options.map((option, oi) => {
                    const on = (picked[qi] || []).includes(oi);
                    const icon = q.multi ? (on ? 'checkmark.square.fill' : 'square') : on ? 'checkmark.circle.fill' : 'circle';
                    return (
                      <Press
                        key={oi}
                        onPress={() => onPick(qi, oi)}
                        disabled={busy}
                        scaleTo={0.985}
                        feedback="select"
                        style={[styles.option, oi > 0 && styles.optionBorder]}
                        accessibilityRole={q.multi ? 'checkbox' : 'radio'}
                        accessibilityState={q.multi ? { checked: on, disabled: busy } : { selected: on, disabled: busy }}
                        accessibilityLabel={`${option.label}${option.description ? `. ${option.description}` : ''}`}
                        accessibilityHint={tap ? 'Ответ сразу уйдёт агенту' : undefined}>
                        <SymbolView name={icon} size={20} tintColor={on ? Colors.waiting : Colors.textTertiary} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1, gap: 1 }}>
                          <T v="callout" weight={on ? '700' : '600'}>{option.label}</T>
                          {option.description ? <T v="footnote" color={Colors.textSecondary}>{option.description}</T> : null}
                        </View>
                        {busy && tap && on ? <ActivityIndicator size="small" color={Colors.textSecondary} /> : null}
                      </Press>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ))}

          <Press
            onPress={onOwnAnswer}
            disabled={busy}
            feedback="tap"
            style={[styles.option, styles.optionBorder]}
            accessibilityRole="button"
            accessibilityLabel="Свой ответ"
            accessibilityHint="Поставит курсор в поле ввода внизу">
            <SymbolView name="square.and.pencil" size={19} tintColor={Colors.textSecondary} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 1 }}>
              <T v="callout" weight="600">Свой ответ</T>
              <T v="footnote" color={Colors.textSecondary}>
                {answersByMessage(question) ? 'Напиши в поле внизу — уйдёт сообщением' : 'Напиши в поле внизу — вопрос в терминале закроется, ответ уйдёт сообщением'}
              </T>
            </View>
          </Press>
        </Animated.View>
      ) : null}

      {status.state === 'error' ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <SymbolView name="exclamationmark.triangle.fill" size={13} tintColor={Colors.error} />
          <T v="footnote" color={Colors.error} style={{ flex: 1 }}>{status.message}</T>
        </View>
      ) : null}

      {open && list.some((q) => q.options.length) && (!tap || status.state === 'error') ? (
        <Press
          onPress={onSubmit}
          disabled={busy || !ready}
          feedback="none"
          style={styles.submit}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !ready, busy }}
          accessibilityLabel={status.state === 'error' ? 'Отправить ответ ещё раз' : 'Ответить'}>
          {busy ? <ActivityIndicator size="small" color={Colors.onAccent} /> : null}
          <T v="callout" weight="700" color={Colors.onAccent}>
            {busy ? 'Отправляю…' : status.state === 'error' ? 'Повторить' : ready ? 'Ответить' : total > 1 ? `Выбери во всех (${answered}/${total})` : 'Выбери вариант'}
          </T>
        </Press>
      ) : null}
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
export function HelpersStrip({ helpers, mascotId = 0 }: { helpers: SubAgent[]; mascotId?: number }) {
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
            <ProjectMascot id={mascotId} size={30} mood={h.active ? 'thinking' : 'idle'} still={!h.active} />
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
  needs: { paddingVertical: 0, gap: 0 },
  needsHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6 },
  needsList: { gap: 10, paddingBottom: 12, paddingTop: 2 },
  needRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  needDone: { opacity: 0.52 },
  needCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.waitingLine, alignItems: 'center', justifyContent: 'center' },
  needCheckDone: { backgroundColor: Colors.waiting, borderColor: Colors.waiting },
  needsActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.text },
  pillGhost: { height: 36, paddingHorizontal: 14, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardPressed },
  chevron: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  questionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  questions: { gap: 0 },
  question: { gap: 6, paddingVertical: 8 },
  questionBorder: { borderTopWidth: 1, borderTopColor: Colors.waitingLine },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, minHeight: 44 },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.text,
  },
  strip: { gap: 6, paddingVertical: 2, alignItems: 'flex-start' },
  helper: { width: 84, alignItems: 'center', gap: 4 },
  helperText: { textAlign: 'center', minHeight: 28 },
  track: { width: 56, height: 2, borderRadius: 1, backgroundColor: Colors.separator, overflow: 'hidden' },
  trackEmpty: { height: 2 },
  runner: { position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 1, backgroundColor: Colors.textSecondary },
  more: { height: 44, justifyContent: 'center', paddingHorizontal: 6 },
});
