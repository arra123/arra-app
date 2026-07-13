/* eslint-disable react-hooks/refs, react-hooks/purity, react-hooks/set-state-in-effect -- gesture lifecycle and live meter are synchronized through native recorder refs */
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
import { ActivityIndicator, Alert, PanResponder, Pressable, StyleSheet, View } from 'react-native';

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

const BARS = 25;
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
  const recorderState = useAudioRecorderState(recorder, 80);
  const [phase, setPhase] = useState<Phase>('idle');
  const [locked, setLocked] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));

  const phaseRef = useRef<Phase>('idle');
  const lockedRef = useRef(false);
  const startWanted = useRef(false);
  const pendingFinish = useRef<boolean | null>(null);
  const stopping = useRef(false);
  const startedAt = useRef(0);

  const movePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const moveLocked = (next: boolean) => {
    lockedRef.current = next;
    setLocked(next);
  };

  useEffect(() => {
    if (phase !== 'recording') return;
    const db = typeof recorderState.metering === 'number' ? recorderState.metering : -60;
    const normalized = Math.max(0.08, Math.min(1, (db + 58) / 48));
    setLevels((current) => [...current.slice(1), normalized]);
  }, [phase, recorderState.durationMillis, recorderState.metering]);

  async function begin() {
    if (disabled || phaseRef.current !== 'idle') return;
    startWanted.current = true;
    pendingFinish.current = null;
    stopping.current = false;
    moveLocked(false);
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
    setLevels(Array(BARS).fill(0.08));

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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { begin(); },
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy < -66 && !lockedRef.current) {
          moveLocked(true);
          haptic.success();
        }
        if (gesture.dx < -108 && phaseRef.current === 'recording') {
          finish(false);
        }
      },
      onPanResponderRelease: () => {
        if (!lockedRef.current) finish(true);
      },
      onPanResponderTerminate: () => {
        if (!lockedRef.current) finish(false);
      },
    }),
  ).current;

  const active = phase === 'preparing' || phase === 'recording';
  const duration = phase === 'recording' ? recorderState.durationMillis : 0;

  if (phase === 'transcribing') {
    return (
      <View style={[styles.composerOverlay, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
        <ActivityIndicator size="small" color={theme.tint} />
        <View style={styles.transcribingWave}>
          {[0.35, 0.7, 1, 0.58, 0.28].map((height, index) => (
            <View key={index} style={[styles.transcribingBar, { height: 7 + height * 17, backgroundColor: theme.tint }]} />
          ))}
        </View>
      </View>
    );
  }

  if (active) {
    return (
      <View style={[styles.composerOverlay, styles.activeBar, { backgroundColor: theme.backgroundElement, borderColor: theme.tint }]}>
        <Pressable onPress={() => finish(false)} hitSlop={10} style={styles.cancelButton}>
          <SymbolView name="xmark" tintColor={theme.danger} size={17} />
        </Pressable>
        <View style={styles.wave}>
          {levels.map((level, index) => (
            <View
              key={index}
              style={[styles.waveBar, { height: 4 + level * 23, backgroundColor: theme.tint, opacity: 0.4 + level * 0.6 }]}
            />
          ))}
        </View>
        <ThemedText type="smallBold" style={styles.timer}>{phase === 'preparing' ? '…' : mmss(duration)}</ThemedText>
        {locked && <SymbolView name="lock.fill" tintColor={theme.tint} size={15} />}
        <View {...pan.panHandlers}>
          <Pressable
            onPress={locked ? () => finish(true) : undefined}
            style={[styles.mic, { backgroundColor: locked ? theme.tint : theme.danger }]}>
            <SymbolView name={locked ? 'arrow.up' : 'mic.fill'} tintColor="#FFFFFF" size={21} />
          </Pressable>
        </View>
        {!locked && (
          <View style={styles.lockHint} pointerEvents="none">
            <SymbolView name="lock.fill" tintColor={theme.textSecondary} size={13} />
            <SymbolView name="chevron.up" tintColor={theme.textSecondary} size={10} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View {...pan.panHandlers}>
      <Pressable accessibilityLabel="Записать голос" disabled={disabled} style={[styles.mic, { backgroundColor: theme.tint, opacity: disabled ? 0.45 : 1 }]}>
        <SymbolView name="mic.fill" tintColor="#FFFFFF" size={21} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  composerOverlay: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    bottom: 4,
    zIndex: 4,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  activeBar: { borderWidth: 1 },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, height: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  waveBar: { width: 2.5, minHeight: 4, borderRadius: 2 },
  timer: { minWidth: 40, fontVariant: ['tabular-nums'] },
  lockHint: { position: 'absolute', right: 18, bottom: 51, alignItems: 'center' },
  transcribingWave: { flex: 1, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  transcribingBar: { width: 3, borderRadius: 2, opacity: 0.75 },
});
