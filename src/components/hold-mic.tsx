import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type Phase = 'idle' | 'recording' | 'locked';

type Props = {
  /** Готовая запись: локальный файл. Вызывается только если запись не отменили. */
  onResult: (uri: string, seconds: number) => void;
  disabled?: boolean;
  /** Размер круглой кнопки. */
  size?: number;
  /** Отступ снизу для панели записи (обычно высота дока). */
  bottomOffset?: number;
};

const CANCEL_DISTANCE = 96;
const LOCK_DISTANCE = 78;
const BARS = 26;
const MIN_SECONDS = 1;

/**
 * Голосовая кнопка в духе Telegram.
 *
 * Зажал — пишет. Ведёшь влево — отмена, вверх — фиксация («руки свободны»).
 * Отпустил — отправляет. Уровень звука рисуется полосками в реальном времени.
 */
export function HoldMic({ onResult, disabled = false, size = 42, bottomOffset = 0 }: Props) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0));
  const [hint, setHint] = useState(false);
  // Отдельным состоянием, а не ref: от него зависит цвет кнопки и текст подсказки.
  const [nearCancel, setNearCancel] = useState(false);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const status = useAudioRecorderState(recorder, 90);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  // Палец на кнопке. Нужен, чтобы асинхронный старт записи не «догнал» отпускание.
  const holding = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const pulse = useSharedValue(1);
  const panel = useSharedValue(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Полоски уровня: сдвигаем окно влево и добавляем текущий уровень справа.
  useEffect(() => {
    if (phase === 'idle') return;
    const raw = status.metering;
    // metering приходит в дБ (примерно -60…0). Переводим в 0…1.
    const level = raw == null ? 0.12 : Math.max(0.08, Math.min(1, (raw + 55) / 55));
    setLevels((current) => [...current.slice(1), level]);
  }, [status.metering, phase]);

  useEffect(() => {
    if (phase === 'idle') {
      pulse.value = 1;
      panel.value = withTiming(0, { duration: 160 });
      return;
    }
    panel.value = withSpring(1, { damping: 22, stiffness: 240 });
    pulse.value = withRepeat(withTiming(1.28, { duration: 620, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [phase, pulse, panel]);

  const stopTimer = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const begin = useCallback(async () => {
    if (disabled || phaseRef.current !== 'idle') return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { haptic.error(); return; }
    // Разрешение и подготовка занимают время — палец мог уже подняться.
    // Без этой проверки быстрый тап запускал запись, которую нечем остановить.
    if (!holding.current || phaseRef.current !== 'idle') return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
    await recorder.prepareToRecordAsync();
    if (!holding.current) return;
    recorder.record();
    cancelled.current = false;
    setNearCancel(false);
    startedAt.current = Date.now();
    setSeconds(0);
    setLevels(new Array(BARS).fill(0));
    setPhase('recording');
    haptic.press();
    stopTimer();
    timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
  }, [disabled, recorder, stopTimer]);

  const finish = useCallback(async (send: boolean) => {
    if (phaseRef.current === 'idle') return;
    stopTimer();
    setPhase('idle');
    dx.value = withSpring(0);
    dy.value = withSpring(0);
    const elapsed = (Date.now() - startedAt.current) / 1000;
    try { await recorder.stop(); } catch { /* уже остановлен */ }
    const uri = recorder.uri;
    if (!send || cancelled.current || !uri || elapsed < MIN_SECONDS) {
      haptic.warning();
      return;
    }
    haptic.success();
    onResult(uri, Math.round(elapsed));
  }, [dx, dy, onResult, recorder, stopTimer]);

  const lock = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    setPhase('locked');
    haptic.success();
    dx.value = withSpring(0);
    dy.value = withSpring(0);
  }, [dx, dy]);

  const markCancelled = useCallback(() => {
    if (cancelled.current) return;
    cancelled.current = true;
    setNearCancel(true);
    haptic.warning();
  }, []);
  const showHint = useCallback(() => {
    setHint(true);
    setTimeout(() => setHint(false), 1600);
  }, []);

  const setHolding = useCallback((value: boolean) => { holding.current = value; }, []);

  const hold = Gesture.LongPress()
    .minDuration(180)
    .maxDistance(10_000)
    .shouldCancelWhenOutside(false)
    .onStart(() => { runOnJS(begin)(); });

  const move = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(() => { runOnJS(setHolding)(true); })
    .onUpdate((event) => {
      if (phaseRef.current !== 'recording') return;
      dx.value = Math.min(0, event.translationX);
      dy.value = Math.min(0, event.translationY);
      if (event.translationY < -LOCK_DISTANCE) runOnJS(lock)();
      else if (event.translationX < -CANCEL_DISTANCE) runOnJS(markCancelled)();
    })
    .onFinalize(() => {
      runOnJS(setHolding)(false);
      if (phaseRef.current === 'recording') runOnJS(finish)(true);
      else if (phaseRef.current === 'idle') runOnJS(showHint)();
    });

  const gesture = Gesture.Simultaneous(hold, move);

  const followStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { translateY: dy.value },
      { scale: phase === 'idle' ? 1 : interpolate(pulse.value, [1, 1.28], [1.1, 1.24]) },
    ],
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panel.value,
    transform: [{ translateY: interpolate(panel.value, [0, 1], [14, 0]) }],
    pointerEvents: panel.value > 0.5 ? 'auto' : 'none',
  }));

  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const cancelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.value, [-CANCEL_DISTANCE, 0], [1, 0.55], 'clamp'),
    transform: [{ translateX: interpolate(dx.value, [-CANCEL_DISTANCE, 0], [-16, 0], 'clamp') }],
  }));

  const active = phase !== 'idle';
  const willCancel = nearCancel;

  return (
    <>
      {active && (
        <Animated.View
          style={[
            styles.panel,
            { bottom: bottomOffset, backgroundColor: theme.backgroundElement, borderColor: theme.separator },
            panelStyle,
          ]}>
          <View style={styles.panelRow}>
            <Animated.View style={[styles.dot, { backgroundColor: theme.danger }, dotStyle]} />
            <ThemedText type="smallBold" style={{ minWidth: 46 }}>{mmss(seconds)}</ThemedText>
            <View style={styles.wave}>
              {levels.map((level, index) => (
                <View
                  key={index}
                  style={[styles.bar, { height: 4 + level * 22, backgroundColor: willCancel ? theme.danger : theme.tint }]}
                />
              ))}
            </View>
          </View>

          {phase === 'locked' ? (
            <View style={styles.lockedRow}>
              <Pressable
                onPress={() => { cancelled.current = true; setNearCancel(true); void finish(false); }}
                style={({ pressed }) => [styles.lockedButton, { borderColor: theme.separator, opacity: pressed ? 0.7 : 1 }]}>
                <SymbolView name="trash.fill" tintColor={theme.danger} size={17} />
                <ThemedText type="smallBold" style={{ color: theme.danger }}>Удалить</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void finish(true)}
                style={({ pressed }) => [styles.lockedButton, { backgroundColor: theme.tint, borderColor: theme.tint, opacity: pressed ? 0.8 : 1 }]}>
                <SymbolView name="checkmark" tintColor="#FFFFFF" size={17} />
                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Готово</ThemedText>
              </Pressable>
            </View>
          ) : (
            <Animated.View style={[styles.hintRow, cancelStyle]}>
              <SymbolView name="chevron.left" tintColor={theme.textSecondary} size={12} />
              <ThemedText type="small" themeColor="textSecondary">
                {willCancel ? 'Отпусти — запись удалится' : 'Влево — отмена, вверх — закрепить'}
              </ThemedText>
            </Animated.View>
          )}
        </Animated.View>
      )}

      {hint && !active && (
        <View style={[styles.toast, { bottom: bottomOffset, backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <ThemedText type="small" themeColor="textSecondary">Удерживай кнопку, чтобы записать</ThemedText>
        </View>
      )}

      <GestureDetector gesture={gesture}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel="Записать голосом"
          style={[
            styles.mic,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              // В покое — только символ: залитый кружок сливался с белой строкой ввода.
              backgroundColor: active ? (willCancel ? theme.danger : theme.tint) : 'transparent',
              borderColor: active ? 'transparent' : theme.separator,
              borderWidth: 0,
              opacity: disabled ? 0.5 : 1,
            },
            followStyle,
          ]}>
          <SymbolView
            name={phase === 'locked' ? 'lock.fill' : 'mic.fill'}
            tintColor={active ? '#FFFFFF' : theme.text}
            size={Math.round(size * 0.45)}
          />
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const mmss = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;

const styles = StyleSheet.create({
  mic: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  panel: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#101828',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: 6 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: 28 },
  bar: { width: 3, borderRadius: 2 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  lockedRow: { flexDirection: 'row', gap: Spacing.two },
  lockedButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    left: Spacing.four,
    right: Spacing.four,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
