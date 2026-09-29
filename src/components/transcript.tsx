import { SymbolView } from 'expo-symbols';
import { memo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { messageTime, stepIcon, tookLabel } from '@/ara/format';
import type { FileScope, PlanItem, StepItem, TranscriptMessage } from '@/ara/types';
import { Markdown } from '@/components/markdown';
import { LocalImage, RemoteImage, RemoteVideo } from '@/components/media';
import { Chip, Press, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

// Плавно и без отскока: пружина раскачивала край плана и шапки
const layout = LinearTransition.duration(240).easing(Easing.out(Easing.cubic));

function Chevron({ open }: { open: boolean }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 220 }) }] }));
  return (
    <Animated.View style={style}>
      <SymbolView name="chevron.down" size={12} tintColor={Colors.textSecondary} weight="semibold" />
    </Animated.View>
  );
}

// ---------- план ----------

function PlanIcon({ status }: { status: PlanItem['status'] }) {
  if (status === 'completed') return <SymbolView name="checkmark.circle.fill" size={18} tintColor={Colors.textSecondary} />;
  if (status === 'in_progress') return <SymbolView name="circle.inset.filled" size={18} tintColor={Colors.waiting} />;
  return <SymbolView name="circle" size={18} tintColor={Colors.textTertiary} />;
}

/** Карточка плана: прогресс, текущий шаг, раскрывается в чек-лист. */
export function PlanCard({ plan }: { plan: PlanItem[] }) {
  const [open, setOpen] = useState(false);
  const done = plan.filter((p) => p.status === 'completed').length;
  const current = plan.find((p) => p.status === 'in_progress');
  const progress = plan.length ? done / plan.length : 0;
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: withTiming(progress, { duration: 500 }) }] }));

  return (
    <Animated.View layout={layout} style={styles.plan}>
      <Press feedback="select" scaleTo={0.99} onPress={() => setOpen((v) => !v)} accessibilityLabel={`План: ${done} из ${plan.length}`} style={styles.planHeader}>
        <T v="subhead" weight="700">План</T>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, bar]} />
        </View>
        <T v="caption" color={Colors.textSecondary}>{done} из {plan.length}</T>
        <Chevron open={open} />
      </Press>
      {!open && current ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
          <T v="footnote" color={Colors.textSecondary} numberOfLines={1} style={styles.planCurrent}>
            сейчас: {current.text}
          </T>
        </Animated.View>
      ) : null}
      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.planList}>
          {plan.map((item, i) => (
            <View key={i} style={styles.planRow}>
              <PlanIcon status={item.status} />
              <T
                v="footnote"
                color={item.status === 'pending' ? Colors.textSecondary : Colors.text}
                weight={item.status === 'in_progress' ? '600' : undefined}
                style={{ flex: 1 }}>
                {item.text}
              </T>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ---------- действия ----------

/** Шаг-мысль: короткий пересказ того, о чём агент сейчас думает. */
const THOUGHT = 'psychology';

/** «18 действий · Читает ara14.png» — раскрывается в список. Мысль агента видна сразу. */
export function StepsRow({ items, more = 0 }: { items: StepItem[]; more?: number }) {
  const [open, setOpen] = useState(false);
  const total = items.length + (more || 0);
  const last = items[items.length - 1];
  const thought = last?.icon === THOUGHT ? last : null;
  const word = total % 10 === 1 && total % 100 !== 11 ? 'действие' : [2, 3, 4].includes(total % 10) && ![12, 13, 14].includes(total % 100) ? 'действия' : 'действий';
  return (
    <Animated.View layout={layout} style={styles.steps}>
      <Press
        feedback="select"
        scaleTo={0.98}
        onPress={() => setOpen((v) => !v)}
        style={[styles.stepsHeader, thought && styles.thoughtHeader]}
        accessibilityLabel={thought ? `Думает: ${thought.text}. ${total} ${word}` : `${total} ${word}`}>
        {thought ? (
          <>
            <SymbolView name="brain" size={15} tintColor={Colors.text} style={{ marginTop: 2 }} />
            <View style={styles.thoughtText}>
              <Animated.View key={thought.text} entering={FadeIn.duration(220)}>
                <T v="footnote" color={Colors.text} numberOfLines={2}>{thought.text}</T>
              </Animated.View>
              <T v="caption" color={Colors.textTertiary}>{total} {word}</T>
            </View>
          </>
        ) : (
          <>
            <SymbolView name={stepIcon(last?.icon)} size={14} tintColor={Colors.textSecondary} />
            <T v="footnote" color={Colors.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>
              {total} {word}{last ? ` · ${last.text}` : ''}
            </T>
          </>
        )}
        <Chevron open={open} />
      </Press>
      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(100)} style={styles.stepsList}>
          {more ? <T v="caption" color={Colors.textTertiary}>…и ещё {more} раньше</T> : null}
          {items.map((item, i) => {
            const isThought = item.icon === THOUGHT;
            return (
              <View key={i} style={styles.stepRow}>
                <SymbolView
                  name={isThought ? 'brain' : stepIcon(item.icon)}
                  size={13}
                  tintColor={isThought ? Colors.text : Colors.textTertiary}
                  style={{ marginTop: 3 }}
                />
                <T v="footnote" color={isThought ? Colors.text : Colors.textSecondary} style={{ flex: 1 }} selectable>{item.text}</T>
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ---------- сообщения ----------

function MediaRow({ children }: { children: ReactNode }) {
  return <View style={styles.media}>{children}</View>;
}

export function UserBubble({ text, images = [], localImages = [], scope, pending, time }: {
  text: string;
  images?: string[];
  localImages?: string[];
  scope: FileScope;
  pending?: boolean;
  /** «12:40» под пузырём */
  time?: string;
}) {
  return (
    <View style={styles.userWrap}>
      {localImages.length ? (
        <MediaRow>{localImages.map((uri) => <LocalImage key={uri} uri={uri} size={110} />)}</MediaRow>
      ) : images.length ? (
        <MediaRow>{images.map((p) => <RemoteImage key={p} path={p} scope={scope} size={110} />)}</MediaRow>
      ) : null}
      {text ? (
        <View style={[styles.userBubble, pending && { opacity: 0.6 }]}>
          <T selectable>{text}</T>
        </View>
      ) : null}
      {pending ? <T v="tiny" color={Colors.textTertiary}>отправляю…</T> : time ? <T v="tiny" color={Colors.textTertiary}>{time}</T> : null}
    </View>
  );
}

export function AssistantMessage({ text, images = [], videos = [], sites = [], scope, footer }: {
  text: string;
  images?: string[];
  videos?: string[];
  sites?: string[];
  scope: FileScope;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.assistant}>
      {text ? <Markdown text={text} /> : null}
      {images.length ? <MediaRow>{images.map((p) => <RemoteImage key={p} path={p} scope={scope} />)}</MediaRow> : null}
      {videos.map((p) => <View key={p} style={styles.mediaBlock}><RemoteVideo path={p} scope={scope} /></View>)}
      {sites.length ? (
        <View style={styles.sites}>
          {sites.map((url) => (
            <Chip key={url}>
              <SymbolView name="globe" size={11} tintColor={Colors.textSecondary} />
              <T v="tiny" color={Colors.textSecondary} numberOfLines={1}>{url.replace(/^https?:\/\//, '')}</T>
            </Chip>
          ))}
        </View>
      ) : null}
      {footer}
    </View>
  );
}

/** Одна запись переписки агента; новые въезжают снизу. */
export const TranscriptRow = memo(function TranscriptRow({ message, scope, animate }: {
  message: TranscriptMessage;
  scope: FileScope;
  animate: boolean;
}) {
  const entering = animate ? FadeInDown.duration(240).easing(Easing.out(Easing.cubic)) : undefined;
  return (
    <Animated.View entering={entering} style={styles.row}>
      {message.role === 'user' ? (
        <UserBubble text={message.text} images={message.images} scope={scope} time={messageTime(message.ts)} />
      ) : message.role === 'assistant' ? (
        <AssistantMessage
          text={message.text}
          images={message.images}
          videos={message.videos}
          sites={message.sites}
          scope={scope}
          footer={message.ts ? (
            <T v="tiny" color={Colors.textTertiary} style={styles.time}>
              {[messageTime(message.ts), tookLabel(message.took)].filter(Boolean).join(' · ')}
            </T>
          ) : null}
        />
      ) : (
        <StepsRow items={message.items} more={message.more} />
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.lg, paddingVertical: 7 },
  plan: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.separator, overflow: 'hidden' },
  progressFill: { height: 3, width: '100%', borderRadius: 2, backgroundColor: Colors.textSecondary, transformOrigin: 'left center' },
  planCurrent: { marginTop: 6 },
  planList: { marginTop: 10, gap: 9 },
  planRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  steps: { alignSelf: 'flex-start', maxWidth: '100%' },
  stepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
  },
  thoughtHeader: { alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 11 },
  thoughtText: { flexShrink: 1, gap: 2 },
  stepsList: { marginTop: 8, marginLeft: 6, gap: 6, borderLeftWidth: 1, borderLeftColor: Colors.separator, paddingLeft: 12 },
  stepRow: { flexDirection: 'row', gap: 8 },
  userWrap: { alignItems: 'flex-end', gap: 6, paddingLeft: 48 },
  userBubble: {
    backgroundColor: Colors.userBubble,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  assistant: { gap: 10 },
  time: { marginTop: -4 },
  media: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mediaBlock: { alignItems: 'flex-start' },
  sites: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
