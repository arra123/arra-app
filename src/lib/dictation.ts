import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { transcribe } from '@/ara/upload';
import { haptic } from '@/lib/haptics';

/**
 * live — распознавание iOS на телефоне, текст появляется в поле по ходу речи;
 * record — запасной путь: запись и расшифровка на компьютере (Handy) после ■;
 * transcribing — ждём ответа сервера.
 */
export type DictationMode = 'idle' | 'live' | 'record' | 'transcribing';

const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/** Эти ошибки значат «здесь распознавание не работает» — пишем звук для компьютера. */
const FALLBACK_ERRORS = new Set(['service-not-allowed', 'language-not-supported', 'not-allowed', 'network', 'audio-capture']);

function join(...parts: string[]) {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

function deniedMic() {
  Alert.alert('Нет доступа к микрофону', 'Разреши микрофон для «Ары» в Настройках.', [
    { text: 'Настройки', onPress: () => Linking.openSettings() },
    { text: 'OK', style: 'cancel' },
  ]);
}

/**
 * Диктовка в поле ввода. text/setText — состояние поля: распознанное
 * дописывается к тому, что уже набрано, и остаётся для правки (не отправляется).
 */
export function useDictation(text: string, setText: (text: string) => void) {
  const [mode, setMode] = useState<DictationMode>('idle');
  const [startedAt, setStartedAt] = useState(0);
  /** Громкость 0…1 для волны */
  const level = useSharedValue(0);
  const recorder = useAudioRecorder(RECORDING);
  const recorderState = useAudioRecorderState(recorder, 90);

  // Событие распознавания глобальное, а полей ввода может быть несколько
  const active = useRef(false);
  const base = useRef('');
  const committed = useRef('');
  const partial = useRef('');
  const heardAny = useRef(false);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  function render() {
    setText(join(base.current, committed.current, partial.current));
  }

  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    const heard = event.results[0]?.transcript ?? '';
    heardAny.current = heardAny.current || !!heard.trim();
    if (event.isFinal) {
      committed.current = join(committed.current, heard);
      partial.current = '';
    } else {
      // iOS после паузы иногда начинает распознавание заново — сохраняем сказанное
      const prev = partial.current.trim();
      const next = heard.trim();
      const firstWord = prev.split(/\s+/)[0]?.toLowerCase() || '';
      if (prev && next.length < prev.length * 0.6 && !next.toLowerCase().startsWith(firstWord)) {
        committed.current = join(committed.current, prev);
      }
      partial.current = heard;
    }
    render();
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (!active.current) return;
    level.set(withTiming(Math.max(0, Math.min(1, event.value / 10)), { duration: 90 }));
  });

  useSpeechRecognitionEvent('end', () => {
    if (!active.current) return;
    active.current = false;
    committed.current = join(committed.current, partial.current);
    partial.current = '';
    render();
    level.set(withTiming(0, { duration: 150 }));
    setMode((m) => (m === 'live' ? 'idle' : m));
    if (heardAny.current) haptic.success();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!active.current) return;
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (!heardAny.current && FALLBACK_ERRORS.has(event.error)) {
      active.current = false;
      setMode('idle');
      startRecording();
      return;
    }
    Alert.alert('Диктовка прервалась', event.message || 'Попробуй ещё раз');
  });

  // Громкость в запасном режиме — из метра записи (дБ от −60 до 0)
  const metering = recorderState.metering;
  useEffect(() => {
    if (mode !== 'record' || metering == null) return;
    level.set(withTiming(Math.max(0, Math.min(1, (metering + 55) / 50)), { duration: 90 }));
  }, [metering, mode, level]);

  async function startLive() {
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return false;
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      // Отказали в распознавании речи — пишем звук для расшифровки на компьютере
      if (!perm.granted) return false;
      base.current = textRef.current;
      committed.current = '';
      partial.current = '';
      heardAny.current = false;
      active.current = true;
      let onDevice = false;
      try {
        onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      } catch {
        onDevice = false;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'ru-RU',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        iosTaskHint: 'dictation',
        volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
      });
      setStartedAt(Date.now());
      setMode('live');
      haptic.press();
      return true;
    } catch {
      active.current = false;
      return false;
    }
  }

  async function startRecording() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      deniedMic();
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStartedAt(Date.now());
      setMode('record');
      haptic.press();
    } catch (error: any) {
      Alert.alert('Запись не началась', error?.message || '');
    }
  }

  async function stopRecording() {
    setMode('transcribing');
    level.set(withTiming(0, { duration: 150 }));
    haptic.tap();
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error('Запись пустая');
      const heard = await transcribe(uri);
      if (heard) {
        setText(join(textRef.current, heard));
        haptic.success();
      }
    } catch (error: any) {
      Alert.alert('Не расслышала', error?.message || 'Попробуй ещё раз');
    } finally {
      setMode('idle');
    }
  }

  async function toggle() {
    if (mode === 'transcribing') return;
    if (mode === 'live') {
      haptic.tap();
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    if (mode === 'record') {
      await stopRecording();
      return;
    }
    if (await startLive()) return;
    await startRecording();
  }

  // Ушли с экрана посреди диктовки — всё выключаем
  useEffect(() => () => {
    if (active.current) {
      active.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* уже остановлено */
      }
    }
  }, []);

  return { mode, startedAt, level, toggle };
}
