/* eslint-disable react-hooks/purity -- gesture lifecycle and live meter are synchronized through native recorder refs */
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Phase = 'idle' | 'preparing' | 'recording' | 'transcribing';

type Props = {
  onTranscript: (text: string) => void | Promise<void>;
  disabled?: boolean;
};

const BARS = 19;
const mmss = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * Голосовой ввод с поведением привычного мессенджера:
 * удержание записывает, свайп вверх фиксирует запись, свайп влево отменяет.
 * Волна строится из реального metering expo-audio, а не из декоративной анимации.
 */
export function VoiceRecorder({ onTranscript, disabled = false }: Props) {
  const theme = useTheme();
  const options = useMemo(() => ({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }), []);
  const recorder = useAudioRecorder(options);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>('idle');
  const [locked, setLocked] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));

  const phaseRef = useRef<Phase>('idle');
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startWanted = useRef(false);
  const pendingFinish = useRef<boolean | null>(null);
  const stopping = useRef(false);
  const startedAt = useRef(0);
  const drag = useRef(new Animated.ValueXY()).current;
  const activeAnim = useRef(new Animated.Value(0)).current;
  const smoothedLevel = useRef(0.08);

  const movePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const moveLocked = (next: boolean) => {
    lockedRef.current = next;
    setLocked(next);
  };
  const moveCancelled = (next: boolean) => {
    cancelledRef.current = next;
    setCancelled(next);
  };

  useEffect(() => {
    const visible = phase === 'preparing' || phase === 'recording' || phase === 'transcribing';
    if (visible) activeAnim.setValue(0);
    Animated.spring(activeAnim, {
      toValue: visible ? 1 : 0,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  }, [activeAnim, phase]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const db = typeof recorderState.metering === 'number' ? recorderState.metering : -60;
    const clampedDb = Math.max(-60, Math.min(0, db));
    const rawLevel = Math.max(0.06, Math.min(1, Math.pow(10, clampedDb / 28)));
    smoothedLevel.current = smoothedLevel.current * 0.58 + rawLevel * 0.42;
    setLevels((current) => [...current.slice(1), smoothedLevel.current]);
  }, [phase, recorderState.durationMillis, recorderState.metering]);

  async function begin() {
    if (disabled || phaseRef.current !== 'idle') return;
    startWanted.current = true;
    pendingFinish.current = null;
    stopping.current = false;
    moveLocked(false);
    moveCancelled(false);
    drag.setValue({ x: 0, y: 0 });
    movePhase('preparing');
    haptic.press();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        startWanted.current = false;
        movePhase('idle');
        Alert.alert('Нужен доступ к микрофону', 'Разрешите микрофон в настройках телефона.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!startWanted.current) {
        movePhase('idle');
        return;
      }
      recorder.record();
      startedAt.current = Date.now();
      movePhase('recording');
      if (pendingFinish.current !== null) {
        const shouldSend = pendingFinish.current;
        pendingFinish.current = null;
        await finish(shouldSend);
      }
    } catch (error: any) {
      startWanted.current = false;
      moveLocked(false);
      movePhase('idle');
      haptic.error();
      Alert.alert('Микрофон не запустился', error?.message || 'Попробуйте ещё раз.');
    }
  }

  async function finish(shouldSend: boolean) {
    if (stopping.current) return;
    if (phaseRef.current === 'preparing') {
      pendingFinish.current = shouldSend;
      return;
    }
    if (phaseRef.current !== 'recording') return;
    stopping.current = true;
    startWanted.current = false;
    const elapsed = Date.now() - startedAt.current;
    try {
      await recorder.stop();
    } catch {
      // Если системная запись уже остановилась, всё равно проверяем готовый URI.
    }
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    moveLocked(false);
    moveCancelled(false);
    drag.setValue({ x: 0, y: 0 });
    setLevels(Array(BARS).fill(0.08));
    smoothedLevel.current = 0.08;

    if (!shouldSend || !uri || elapsed < 500) {
      movePhase('idle');
      stopping.current = false;
      if (!shouldSend) haptic.warning();
      return;
    }

    movePhase('transcribing');
    try {
      const token = await getToken();
      const response = await uploadAsync(`${API_URL}/ai/transcribe`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.status >= 400) throw new Error(`Ошибка ${response.status}`);
      const data = JSON.parse(response.body || '{}');
      const text = String(data.text || '').trim();
      if (!text) throw new Error('Не удалось разобрать речь');
      await onTranscript(text);
      haptic.success();
    } catch (error: any) {
      haptic.error();
      Alert.alert('Не распознал голос', error?.message || 'Попробуйте ещё раз.');
    } finally {
      stopping.current = false;
      movePhase('idle');
    }
  }

  const pan = useRef(
    PanResponder.create({
      // Зона жеста всегда остаётся одной и той же круглой кнопкой. Панель записи
      // рисуется отдельным слоем и больше не сбрасывает responder на iOS.
      onStartShouldSetPanResponder: () => phaseRef.current === 'idle',
      onStartShouldSetPanResponderCapture: () => phaseRef.current === 'idle',
      onMoveShouldSetPanResponder: () => phaseRef.current === 'idle',
      onPanResponderGrant: () => { begin(); },
      onPanResponderMove: (_event, gesture) => {
        drag.setValue({ x: Math.min(0, gesture.dx), y: Math.min(0, gesture.dy) });
        const wantsCancel = gesture.dx < -86 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        if (wantsCancel !== cancelledRef.current && !lockedRef.current) {
          moveCancelled(wantsCancel);
          if (wantsCancel) haptic.warning();
        }
        if (gesture.dy < -52 && !lockedRef.current && !wantsCancel) {
          moveLocked(true);
          moveCancelled(false);
          haptic.success();
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        if (!lockedRef.current) finish(!cancelledRef.current);
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        if (!lockedRef.current) finish(false);
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  const active = phase === 'preparing' || phase === 'recording';
  const duration = phase === 'recording' ? recorderState.durationMillis : 0;

  return (
    <>
      <View style={styles.reserve} />
      <View pointerEvents="box-none" style={styles.overlayRoot}>
        {phase !== 'idle' && (
          <Animated.View
            pointerEvents={locked ? 'auto' : 'box-none'}
            style={[
              styles.recordingBar,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: phase === 'transcribing' ? theme.separator : theme.tint,
                opacity: activeAnim,
                transform: [{ scale: activeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
              },
            ]}>
            {phase === 'transcribing' ? (
              <>
                <ActivityIndicator size="small" color={theme.tint} />
                <View style={styles.transcribingWave}>
                  {[0.35, 0.7, 1, 0.58, 0.28].map((height, index) => (
                    <View key={index} style={[styles.transcribingBar, { height: 7 + height * 17, backgroundColor: theme.tint }]} />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Pressable onPress={() => finish(false)} hitSlop={8} style={[styles.cancelButton, locked && { backgroundColor: `${theme.danger}18` }]}>
                  <SymbolView name="xmark" tintColor={theme.danger} size={17} />
                </Pressable>
                <Animated.View style={[styles.wave, { opacity: cancelled ? 0.22 : 1 }]}>
                  {levels.map((level, index) => (
                    <View
                      key={index}
                      style={[styles.waveBar, { height: 4 + level * 23, backgroundColor: theme.tint, opacity: 0.4 + level * 0.6 }]}
                    />
                  ))}
                </Animated.View>
                <ThemedText type="smallBold" style={[styles.timer, cancelled && { color: theme.danger }]}>
                  {cancelled ? 'Отмена' : phase === 'preparing' ? '…' : mmss(duration)}
                </ThemedText>
                {locked && <SymbolView name="lock.fill" tintColor={theme.tint} size={15} />}
                {!locked && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.lockHint,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.separator },
                      {
                        transform: [{ translateY: drag.y.interpolate({ inputRange: [-52, 0], outputRange: [-10, 0], extrapolate: 'clamp' }) }],
                        opacity: drag.x.interpolate({ inputRange: [-86, -20, 0], outputRange: [0, 0.75, 1], extrapolate: 'clamp' }),
                      },
                    ]}>
                    <SymbolView name="lock.fill" tintColor={theme.tint} size={14} />
                    <SymbolView name="chevron.up" tintColor={theme.textSecondary} size={10} />
                  </Animated.View>
                )}
              </>
            )}
          </Animated.View>
        )}

        <View
          {...pan.panHandlers}
          pointerEvents={phase === 'transcribing' ? 'none' : 'auto'}
          style={styles.gestureSurface}>
          <Pressable
            accessibilityLabel={locked ? 'Отправить голос' : 'Удерживайте для записи голоса'}
            disabled={disabled || phase === 'transcribing'}
            onPress={locked ? () => finish(true) : undefined}
            style={[
              styles.mic,
              {
                backgroundColor: locked ? theme.tint : active ? theme.danger : theme.tint,
                opacity: disabled ? 0.45 : 1,
                transform: [{ scale: locked ? 1.04 : 1 }],
              },
            ]}>
            <SymbolView name={locked ? 'arrow.up' : 'mic.fill'} tintColor="#FFFFFF" size={21} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  reserve: { width: 40, height: 40 },
  overlayRoot: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 5,
    bottom: 5,
    overflow: 'visible',
    zIndex: 8,
  },
  recordingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingLeft: 8,
    paddingRight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  gestureSurface: { position: 'absolute', right: 0, top: 0, width: 40, height: 40, zIndex: 3 },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, height: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  waveBar: { width: 2.5, minHeight: 4, borderRadius: 2 },
  timer: { minWidth: 44, fontVariant: ['tabular-nums'] },
  lockHint: { position: 'absolute', right: -1, bottom: 48, width: 42, height: 58, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 4 },
  transcribingWave: { flex: 1, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  transcribingBar: { width: 3, borderRadius: 2, opacity: 0.75 },
});
