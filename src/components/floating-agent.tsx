import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { awaitedHelper, currentActivity, statusLine } from '@/ara/format';
import type { Agent, PlanItem, SubAgent, Transcript } from '@/ara/types';
import { HelpersStrip } from '@/components/agent-cards';
import { AraMascot } from '@/components/ara-mascot';
import { Appear } from '@/components/glass-menu';
import { PlanCard } from '@/components/transcript';
import { Spinner, T } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

/** Где висит агентик: сторона, высота (0…1 от доступной полосы), спрятан ли. */
type Place = { side: 0 | 1; frac: number; hidden: boolean };

const FILE_NAME = 'floating-agent.json';
const DEFAULT_PLACE: Place = { side: 1, frac: 0.28, hidden: false };

function loadPlace(): Place {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') raw = globalThis.localStorage?.getItem(FILE_NAME) ?? null;
    else {
      const file = new File(Paths.document, FILE_NAME);
      if (file.exists) raw = file.textSync();
    }
    if (!raw) return DEFAULT_PLACE;
    const p = JSON.parse(raw) as Partial<Place>;
    return {
      side: p.side === 0 ? 0 : 1,
      frac: typeof p.frac === 'number' ? Math.max(0, Math.min(1, p.frac)) : DEFAULT_PLACE.frac,
      hidden: !!p.hidden,
    };
  } catch {
    return DEFAULT_PLACE;
  }
}

function savePlace(place: Place) {
  try {
    const raw = JSON.stringify(place);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(FILE_NAME, raw);
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(raw);
  } catch {
    /* не сохранилось — место проживёт до перезапуска */
  }
}

const H = 52;
const MARGIN = 10;
/** Зона касания язычка у края; сама полоска тоньше */
const TAB_HIT = 24;
const TAB_H = 52;
/** Прилипание без перелёта */
const SPRING = { damping: 30, stiffness: 320, mass: 0.9, overshootClamping: true } as const;

type Props = {
  agent: Agent;
  transcript: Transcript | null;
  plan: PlanItem[];
  helpers: SubAgent[];
  now: number;
  stopping?: boolean;
  /** Нижний край шапки */
  top: number;
  /** Сколько снизу занимает поле ввода (с клавиатурой) */
  bottom: SharedValue<number>;
};

/**
 * Плавающий агентик как свёрнутое видео (картинка в картинке): маскот и статус.
 * Тянется пальцем и прилипает к ближайшему краю или углу, не заезжая на шапку
 * и поле ввода; смахнул за край — остаётся язычок; тап — подробности.
 */
export function FloatingAgent({ agent, transcript, plan, helpers, now, stopping, top, bottom }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [saved] = useState(loadPlace);
  const [hiddenJS, setHiddenJS] = useState(saved.hidden);
  const [sideJS, setSideJS] = useState<number>(saved.side);
  const [open, setOpen] = useState(false);

  const side = useSharedValue<number>(saved.side);
  const frac = useSharedValue(saved.frac);
  const hidden = useSharedValue(saved.hidden ? 1 : 0);
  const w = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const placed = useSharedValue(0);
  const dragging = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const press = useSharedValue(1);
  const topSV = useSharedValue(top);
  const screenWSV = useSharedValue(screenW);
  const screenHSV = useSharedValue(screenH);

  useEffect(() => {
    topSV.set(top);
    screenWSV.set(screenW);
    screenHSV.set(screenH);
  }, [top, screenW, screenH, topSV, screenWSV, screenHSV]);

  function targetX(s: number, hid: number) {
    'worklet';
    const width = w.get();
    if (hid) return s ? screenWSV.get() + 8 : -width - 8;
    return s ? screenWSV.get() - width - MARGIN : MARGIN;
  }
  function bounds() {
    'worklet';
    const minY = topSV.get() + 8;
    const maxY = Math.max(minY, screenHSV.get() - bottom.get() - H - 10);
    return [minY, maxY] as const;
  }

  // Первое место и слежение за шапкой, клавиатурой, поворотом
  useAnimatedReaction(
    () => [bottom.get(), topSV.get(), screenWSV.get(), screenHSV.get(), w.get()],
    () => {
      if (dragging.get() || !w.get()) return;
      const [minY, maxY] = bounds();
      x.set(targetX(side.get(), hidden.get()));
      y.set(minY + frac.get() * (maxY - minY));
      placed.set(1);
    },
  );

  function remember(s: number, f: number, hid: number) {
    setHiddenJS(!!hid);
    setSideJS(s);
    savePlace({ side: s ? 1 : 0, frac: f, hidden: !!hid });
    if (hid) haptic.tap();
  }

  function show() {
    'worklet';
    hidden.set(0);
    x.set(withSpring(targetX(side.get(), 0), SPRING));
    scheduleOnRN(remember, side.get(), frac.get(), 0);
  }

  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => {
      press.set(withTiming(0.95, { duration: 120 }));
    })
    .onStart(() => {
      dragging.set(1);
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((e) => {
      const [minY, maxY] = bounds();
      x.set(startX.get() + e.translationX);
      y.set(Math.max(minY - 16, Math.min(maxY + 16, startY.get() + e.translationY)));
    })
    .onEnd((e) => {
      const width = w.get();
      const W = screenWSV.get();
      const startSide = startX.get() + width / 2 > W / 2 ? 1 : 0;
      const s = x.get() + width / 2 + e.velocityX * 0.15 > W / 2 ? 1 : 0;
      // Спрятать: вытащил за край больше чем на треть или смахнул к своему краю
      const over = s ? x.get() + width - W : -x.get();
      const outward = s ? e.velocityX : -e.velocityX;
      const flick = outward > 900 && Math.abs(e.velocityX) > Math.abs(e.velocityY) && startSide === s;
      const hid = over > width * 0.33 || flick ? 1 : 0;
      const [minY, maxY] = bounds();
      let ny = Math.max(minY, Math.min(maxY, y.get() + e.velocityY * 0.08));
      // Рядом с углом — в угол
      if (ny - minY < 44) ny = minY;
      if (maxY - ny < 44) ny = maxY;
      const f = maxY > minY ? (ny - minY) / (maxY - minY) : 0;
      side.set(s);
      frac.set(f);
      hidden.set(hid);
      x.set(withSpring(targetX(s, hid), { ...SPRING, velocity: e.velocityX }));
      y.set(withSpring(ny, SPRING));
      scheduleOnRN(remember, s, f, hid);
    })
    .onFinalize(() => {
      dragging.set(0);
      press.set(withTiming(1, { duration: 160 }));
    });

  const tap = Gesture.Tap()
    .maxDuration(400)
    .onBegin(() => {
      press.set(withTiming(0.95, { duration: 100 }));
    })
    .onEnd(() => {
      scheduleOnRN(setOpen, true);
    })
    .onFinalize(() => {
      press.set(withTiming(1, { duration: 160 }));
    });

  // Язычок: тап или потянуть от края — агентик возвращается
  const tabPan = Gesture.Pan()
    .minDistance(4)
    .onEnd((e) => {
      const inward = side.get() ? -e.translationX : e.translationX;
      const speed = side.get() ? -e.velocityX : e.velocityX;
      if (inward > 12 || speed > 250) show();
    });
  const tabTap = Gesture.Tap().onEnd(() => show());

  const floatStyle = useAnimatedStyle(() => ({
    opacity: placed.get() ? withTiming(hidden.get() && !dragging.get() ? 0 : 1, { duration: 180 }) : 0,
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: press.get() }],
  }));

  const tabStyle = useAnimatedStyle(() => ({
    opacity: withTiming(hidden.get() && !dragging.get() ? 1 : 0, { duration: 200 }),
    transform: [
      { translateX: side.get() ? screenWSV.get() - TAB_HIT : 0 },
      { translateY: y.get() + H / 2 - TAB_H / 2 },
    ],
  }));

  const state = agent.state;
  const tint = state === 'waiting' ? Colors.waiting : state === 'error' ? Colors.error : Colors.textSecondary;
  // На агентике только план и помощники; статус и минуты — в шапке
  const done = plan.filter((p) => p.status === 'completed').length;
  const active = helpers.filter((h) => h.active);
  // in words, like the buddy on the computer
  const waitsHelper = state === 'working' ? awaitedHelper(agent, transcript, now) : null;
  const saying = stopping ? 'останавливаю…'
    : state === 'working' ? (waitsHelper ? 'ждёт помощника' : (currentActivity(agent, transcript) || 'работает'))
    : state === 'waiting' ? 'ждёт тебя'
    : state === 'error' ? 'ошибка'
    : 'готов';

  return (
    <>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View
          style={[styles.float, floatStyle]}
          pointerEvents={hiddenJS ? 'none' : 'auto'}
          onLayout={(e) => w.set(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Агент: подробности"
          accessibilityHint="Тяни, чтобы передвинуть; смахни за край, чтобы спрятать">
          {/* a small copy of the computer's buddy: the mascot and, in words, what
              it is doing. At the right edge the layout is mirrored, so the
              mascot always stands at the screen's edge and the words inside. */}
          <View style={[styles.capsule, sideJS ? styles.capsuleRight : null]}>
            <AraMascot size={38} mood={state === 'working' ? 'thinking' : 'idle'} />
            <View style={[styles.words, { alignItems: sideJS ? 'flex-end' : 'flex-start' }]}>
              <T v="footnote" weight="600" color={state === 'waiting' ? Colors.waiting : state === 'error' ? Colors.error : Colors.text} numberOfLines={1}>
                {saying}
              </T>
              <View style={styles.sub}>
                {state === 'working' || stopping ? <Spinner size={9} color={Colors.working} /> : null}
                {plan.length ? (
                  <T v="tiny" weight="600" color={Colors.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>
                    план {done}/{plan.length}
                  </T>
                ) : null}
                {active.length ? (
                  <View style={styles.helpers} accessibilityLabel={`Помощников: ${active.length}`}>
                    {active.slice(0, 4).map((h, i) => (
                      <View key={h.id} style={[styles.helperDot, { backgroundColor: Colors.helpers[i % Colors.helpers.length] }]} />
                    ))}
                    {active.length > 4 ? <T v="tiny" color={Colors.textSecondary}>+{active.length - 4}</T> : null}
                  </View>
                ) : null}
                {!plan.length && !active.length && state !== 'working' ? <T v="tiny" color={Colors.textTertiary}>нажми: подробности</T> : null}
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      <GestureDetector gesture={Gesture.Race(tabPan, tabTap)}>
        <Animated.View
          style={[styles.tab, { alignItems: sideJS ? 'flex-end' : 'flex-start' }, tabStyle]}
          pointerEvents={hiddenJS ? 'auto' : 'none'}
          accessible={hiddenJS}
          accessibilityRole="button"
          accessibilityLabel="Показать агента">
          <View style={[styles.tabBar, { backgroundColor: tint }]} />
        </Animated.View>
      </GestureDetector>

      {open ? (
        <AgentSheet agent={agent} transcript={transcript} plan={plan} helpers={helpers} now={now} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** Подробности по тапу: чем занят, план, помощники. */
function AgentSheet({ agent, transcript, plan, helpers, now, onClose }: {
  agent: Agent;
  transcript: Transcript | null;
  plan: PlanItem[];
  helpers: SubAgent[];
  now: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const helper = agent.state === 'working' ? awaitedHelper(agent, transcript, now) : null;
  const doing = agent.state === 'working' && !helper ? currentActivity(agent, transcript) : '';
  const activeHelpers = helpers.filter((h) => h.active);
  const color = agent.state === 'waiting' ? Colors.waiting : agent.state === 'error' ? Colors.error : Colors.text;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Appear from={0} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: Colors.scrim }]} onPress={onClose} accessibilityLabel="Закрыть" />
      </Appear>
      <Appear from={14} duration={200} style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <AraMascot size={40} mood={agent.state === 'working' ? 'thinking' : 'idle'} interactive />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="headline" weight="700" numberOfLines={1}>{agent.project}</T>
            <T v="footnote" color={color} numberOfLines={2}>{statusLine(agent, transcript, now)}</T>
          </View>
        </View>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
          {doing ? (
            <View style={styles.block}>
              <T v="caption" weight="600" color={Colors.textSecondary} style={styles.caps}>Сейчас</T>
              <T v="callout">{doing}</T>
            </View>
          ) : null}
          {plan.length ? (
            <View style={styles.block}>
              <PlanCard plan={plan} initiallyOpen />
            </View>
          ) : null}
          {activeHelpers.length ? (
            <View style={styles.block}>
              <T v="caption" weight="600" color={Colors.textSecondary} style={styles.caps}>Помощники</T>
              <HelpersStrip helpers={helpers} />
            </View>
          ) : null}
          {!doing && !plan.length && !activeHelpers.length ? (
            <T v="footnote" color={Colors.textTertiary}>Плана и помощников нет</T>
          ) : null}
        </ScrollView>
      </Appear>
    </Modal>
  );
}

const styles = StyleSheet.create({
  float: {
    position: 'absolute',
    top: 0,
    left: 0,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  // Непрозрачный фон всегда: стекло поверх текста ленты на телефоне пропадало
  capsule: {
    height: H,
    borderRadius: H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 7,
    paddingRight: 14,
    minWidth: H + 8,
    maxWidth: 250,
    backgroundColor: Colors.cardRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
  },
  capsuleRight: { flexDirection: 'row-reverse', paddingLeft: 14, paddingRight: 7 },
  words: { flexShrink: 1, gap: 2 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 12 },
  helpers: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  helperDot: { width: 7, height: 7, borderRadius: 4 },
  tab: { position: 'absolute', top: 0, left: 0, width: TAB_HIT, height: TAB_H, justifyContent: 'center', paddingHorizontal: 2 },
  tabBar: { width: 5, height: 40, borderRadius: 3, opacity: 0.85 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.hairline },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  block: { gap: 6 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
