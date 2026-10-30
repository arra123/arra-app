import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { reviewPresentation } from '@/ara/attachment-presentation';
import { messageTime, stepIcon, tookLabel } from '@/ara/format';
import type { OutboxState } from '@/ara/outbox';
import type { FileScope, PlanItem, StepItem, TranscriptMessage } from '@/ara/types';
import { attachmentName, isImageAttachment, isVideoAttachment, localPhotoUri } from '@/ara/upload';
import { Markdown } from '@/components/markdown';
import { LocalImage, LocalVideo, RemoteImage, RemoteVideo } from '@/components/media';
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
  if (status === 'completed') return <SymbolView name="checkmark.circle.fill" size={16} tintColor={Colors.textSecondary} />;
  if (status === 'in_progress') return <SymbolView name="circle.inset.filled" size={16} tintColor={Colors.waiting} />;
  return <SymbolView name="circle" size={16} tintColor={Colors.textTertiary} />;
}

/** План: по умолчанию одна тонкая строка «План ▬▬ 8/9 ›», по тапу — чек-лист. */
export function PlanCard({ plan, initiallyOpen = false }: { plan: PlanItem[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const done = plan.filter((p) => p.status === 'completed').length;
  const progress = plan.length ? done / plan.length : 0;
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: withTiming(progress, { duration: 500 }) }] }));
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '90deg' : '0deg', { duration: 200 }) }] }));

  return (
    <Animated.View layout={layout}>
      <Press feedback="select" scaleTo={0.99} onPress={() => setOpen((v) => !v)} accessibilityLabel={`План: ${done} из ${plan.length}`} style={styles.planHeader}>
        <T v="caption" weight="600" color={Colors.textSecondary}>План</T>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, bar]} />
        </View>
        <T v="caption" color={Colors.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>{done}/{plan.length}</T>
        <Animated.View style={turn}>
          <SymbolView name="chevron.right" size={10} tintColor={Colors.textTertiary} weight="semibold" />
        </Animated.View>
      </Press>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(100)} style={styles.planList}>
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
  const grouped = items.reduce<{ icon?: string; text: string; count: number }[]>((out, item) => {
    const text = /^(exec|wait)$/i.test(item.text.trim())
      ? item.text.trim().toLowerCase() === 'wait' ? 'Ждёт завершения операции' : 'Работает в терминале'
      : item.text;
    const previous = out[out.length - 1];
    if (previous && previous.icon === item.icon && previous.text === text) previous.count += 1;
    else out.push({ icon: item.icon, text, count: 1 });
    return out;
  }, []);
  const currentText = thought?.text || grouped[grouped.length - 1]?.text || 'Работает';
  return (
    <Animated.View layout={layout} style={styles.steps}>
      <Press
        feedback="select"
        scaleTo={0.98}
        onPress={() => setOpen((v) => !v)}
        style={[styles.stepsHeader, thought && styles.thoughtHeader]}
        accessibilityLabel={`Сейчас: ${currentText}. Подробности: ${total} шагов`}>
        {thought ? (
          <>
            <SymbolView name="brain" size={15} tintColor={Colors.text} style={{ marginTop: 2 }} />
            <View style={styles.thoughtText}>
              <Animated.View key={thought.text} entering={FadeIn.duration(220)}>
                <T v="footnote" color={Colors.text} numberOfLines={2}>{thought.text}</T>
              </Animated.View>
              <T v="caption" color={Colors.textTertiary}>Сейчас · можно раскрыть подробности</T>
            </View>
          </>
        ) : (
          <>
            <SymbolView name={stepIcon(last?.icon)} size={14} tintColor={Colors.textSecondary} />
            <T v="footnote" color={Colors.textSecondary} numberOfLines={2} style={{ flexShrink: 1 }}>
              {currentText}
            </T>
          </>
        )}
        <Chevron open={open} />
      </Press>
      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(100)} style={styles.stepsList}>
          <T v="caption" color={Colors.textTertiary}>Что уже сделано · {total} шагов</T>
          {more ? <T v="caption" color={Colors.textTertiary}>Ещё {more} ранних шагов скрыто</T> : null}
          {grouped.map((item, i) => {
            const isThought = item.icon === THOUGHT;
            return (
              <View key={i} style={styles.stepRow}>
                <SymbolView
                  name={isThought ? 'brain' : stepIcon(item.icon)}
                  size={13}
                  tintColor={isThought ? Colors.text : Colors.textTertiary}
                  style={{ marginTop: 3 }}
                />
                <T v="footnote" color={isThought ? Colors.text : Colors.textSecondary} style={{ flex: 1 }} selectable>
                  {item.text}{item.count > 1 ? ` · ${item.count} раза` : ''}
                </T>
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

function FileTile({ path, size }: { path: string; size: number }) {
  return <View style={{ width: size, height: size, padding: 8, gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12 }}>
    <SymbolView name="doc" size={24} tintColor={Colors.textSecondary} />
    <T v="tiny" numberOfLines={2} style={{ textAlign: 'center' }}>{attachmentName(path)}</T>
  </View>;
}

/** Как в Telegram: кольцо поверх миниатюры, пока фото грузится. */
function UploadRing({ progress, failed }: { progress: number; failed?: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (failed) { cancelAnimation(spin); return; }
    spin.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [failed, spin]);
  const arc = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <View pointerEvents="none" style={styles.ringScrim}>
      {failed ? (
        <View style={styles.ringFailed}>
          <SymbolView name="exclamationmark" size={16} tintColor="#fff" weight="bold" />
        </View>
      ) : (
        <View style={styles.ring}>
          <Animated.View style={[styles.ringArc, arc]} />
          <T v="tiny" color="#fff" weight="600">{Math.round(progress * 100)}%</T>
        </View>
      )}
    </View>
  );
}

export type Outgoing = {
  state: OutboxState;
  /** 0..1 на каждое фото */
  progress: number[];
  error?: string;
  onRetry: () => void;
  onDiscard: () => void;
};

export function UserBubble({ text, images = [], videos = [], localImages = [], scope, pending, progress = 1, time, outgoing }: {
  text: string;
  images?: string[];
  localImages?: string[];
  videos?: string[];
  scope: FileScope;
  pending?: boolean;
  /** Тонкая полоса под фото; без крутилки и служебной надписи. */
  progress?: number;
  /** «12:40» под пузырём */
  time?: string;
  /** Сообщение из очереди телефона: кольца загрузки, «Не отправлено · Повторить» */
  outgoing?: Outgoing;
}) {
  const presentation = reviewPresentation(text);
  const attachments = [...images, ...videos];
  const count = localImages.length || attachments.length;
  const tile = count === 1 ? 112 : count === 2 ? 104 : 82;
  const columns = Math.min(3, count);
  const mediaWidth = columns ? columns * tile + (columns - 1) * 5 : 0;

  return (
    <View style={styles.userWrap}>
      {count || presentation.text || presentation.reviews.length ? (
        <View style={[styles.userBubble, count > 0 && styles.userBubbleWithMedia]}>
          {count ? (
            <View style={[styles.userMedia, { width: mediaWidth }]}>
              {localImages.length ? localImages.map((uri, n) => {
                const tileView = isVideoAttachment(uri) ? <LocalVideo uri={uri} size={tile} /> : isImageAttachment(uri) ? <LocalImage uri={uri} size={tile} /> : <FileTile path={uri} size={tile} />;
                const done = (outgoing?.progress[n] ?? 1) >= 1;
                if (!outgoing || (done && outgoing.state !== 'failed')) return <View key={uri}>{tileView}</View>;
                return (
                  <View key={uri}>
                    {tileView}
                    {outgoing.state === 'failed' ? (done ? null : <UploadRing progress={0} failed />) : <UploadRing progress={outgoing.progress[n] ?? 0} />}
                  </View>
                );
              }) : attachments.map((p) => {
                const local = localPhotoUri(p);
                if (isVideoAttachment(p)) return local ? <LocalVideo key={p} uri={local} path={p} scope={scope} size={tile} /> : <RemoteVideo key={p} path={p} scope={scope} size={tile} />;
                if (!isImageAttachment(p)) return <FileTile key={p} path={p} size={tile} />;
                return local ? <LocalImage key={p} uri={local} size={tile} /> : <RemoteImage key={p} path={p} scope={scope} size={tile} square />;
              })}
            </View>
          ) : null}
          {presentation.reviews.length ? <View style={styles.reviewCaptions}>{presentation.reviews.map(review => (
            <View key={`${review.source}:${review.seconds}`} style={styles.reviewCaption} accessibilityLabel={`Правка ${review.name} на ${review.label}`}>
              <SymbolView name="pencil" size={12} tintColor={Colors.textSecondary} />
              <T v="caption">Правка · {review.label}</T>
            </View>
          ))}</View> : null}
          {presentation.text ? <View style={count ? styles.userTextWithMedia : undefined}><T selectable>{presentation.text}</T></View> : null}
        </View>
      ) : null}
      {outgoing?.state === 'failed' ? (
        <View style={styles.failedRow}>
          <SymbolView name="exclamationmark.circle.fill" size={14} tintColor={Colors.danger} />
          <T v="caption" color={Colors.danger} numberOfLines={2} style={{ flexShrink: 1 }}>Не отправлено</T>
          <Press onPress={outgoing.onRetry} style={styles.failedButton} accessibilityRole="button" accessibilityLabel={`Повторить отправку${outgoing.error ? `: ${outgoing.error}` : ''}`}>
            <SymbolView name="arrow.clockwise" size={12} tintColor={Colors.text} weight="semibold" />
            <T v="caption" weight="600">Повторить</T>
          </Press>
          <Press onPress={outgoing.onDiscard} style={styles.failedButton} accessibilityRole="button" accessibilityLabel="Удалить сообщение">
            <SymbolView name="trash" size={12} tintColor={Colors.textSecondary} />
          </Press>
        </View>
      ) : outgoing ? (
        outgoing.state === 'sent' ? <SymbolView name="checkmark" size={11} tintColor={Colors.textTertiary} weight="semibold" />
          : <SymbolView name="clock" size={11} tintColor={Colors.textTertiary} />
      ) : pending && (localImages.length > 0 || images.length > 0) && progress < 1 ? (
        <View style={styles.uploadTrack}>
          <View style={[styles.uploadFill, { width: `${Math.max(8, Math.round(progress * 100))}%` }]} />
        </View>
      ) : time ? <T v="tiny" color={Colors.textTertiary}>{time}</T> : null}
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
        <UserBubble text={message.text} images={message.images} videos={message.videos} scope={scope} time={messageTime(message.ts)} />
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
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.separator, overflow: 'hidden' },
  progressFill: { height: 3, width: '100%', borderRadius: 2, backgroundColor: Colors.textSecondary, transformOrigin: 'left center' },
  planList: { marginTop: 8, marginBottom: 2, gap: 8 },
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
  userWrap: { alignItems: 'flex-end', alignSelf: 'flex-end', gap: 6, maxWidth: '88%' },
  userMedia: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 },
  userBubble: {
    backgroundColor: Colors.userBubble,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  userBubbleWithMedia: { padding: 6, borderRadius: 20 },
  reviewCaptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 6 },
  reviewCaption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.card },
  userTextWithMedia: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 5 },
  ringScrim: { ...StyleSheet.absoluteFill, borderRadius: Radius.md, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
  ring: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ringArc: { ...StyleSheet.absoluteFill, borderRadius: 22, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRightColor: '#fff' },
  ringFailed: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  failedButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, backgroundColor: Colors.card },
  uploadTrack: { width: 104, height: 2, borderRadius: 1, overflow: 'hidden', backgroundColor: Colors.separator },
  uploadFill: { height: 2, borderRadius: 1, backgroundColor: Colors.textSecondary },
  assistant: { gap: 10 },
  time: { marginTop: -4 },
  media: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  mediaBlock: { alignItems: 'flex-start' },
  sites: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
