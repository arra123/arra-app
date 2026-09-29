import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { transcribe } from '@/ara/upload';
import { haptic } from '@/lib/haptics';

/**
 * live — распознавание iOS, текст появляется в поле по ходу речи;
 * record — запасной путь: запись и расшифровка на ноутбуке (Handy) после ■;
 * transcribing — ждём ответа сервера.
 */
export type DictationMode = 'idle' | 'live' | 'record' | 'transcribing';

/** Кто распознаёт: телефон без сети, серверы Apple или ноутбук. */
export type DictationEngine = 'phone' | 'apple' | 'laptop';

const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/** Эти ошибки значат «здесь распознавание не работает» — пишем звук для ноутбука. */
const FALLBACK_ERRORS = new Set(['service-not-allowed', 'language-not-supported', 'not-allowed', 'network', 'audio-capture', 'busy']);

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'нет доступа к микрофону или распознаванию речи',
  'service-not-allowed': 'распознавание речи выключено (Настройки → Siri → Диктовка)',
  'language-not-supported': 'русский язык не поддерживается распознаванием',
  network: 'нет сети для распознавания',
  'audio-capture': 'микрофон занят или недоступен',
  busy: 'распознавание уже занято',
  'no-speech': 'не услышала речь',
  interrupted: 'прервано звонком или другим звуком',
};

function join(...parts: string[]) {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

function deniedMic() {
  Alert.alert('Нет доступа к микрофону', 'Разреши микрофон для «Arra» в Настройках.', [
    { text: 'Настройки', onPress: () => Linking.openSettings() },
    { text: 'OK', style: 'cancel' },
  ]);
}

/**
 * Диктовка в поле ввода. Распознанное дописывается к набранному и остаётся
 * для правки. finish() — остановить и получить итоговый текст поля,
 * cancel() — отменить и вернуть поле как было.
 * notice — понятная причина, если что-то не так (видна прямо под полем).
 */
export function useDictation(text: string, setText: (text: string) => void) {
  const [mode, setMode] = useState<DictationMode>('idle');
  const [engine, setEngine] = useState<DictationEngine | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** Громкость 0…1 для волны */
  const level = useSharedValue(0);
  const recorder = useAudioRecorder(RECORDING);
  const recorderState = useAudioRecorderState(recorder, 90);

  // Событие распознавания глобальное, а полей ввода может быть несколько
  const active = useRef(false);
  const started = useRef(false);
  const base = useRef('');
  const committed = useRef('');
  const partial = useRef('');
  const heardAny = useRef(false);
  const cancelled = useRef(false);
  const waiters = useRef<((text: string) => void)[]>([]);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  function current() {
    return join(base.current, committed.current, partial.current);
  }

  function render() {
    const next = current();
    textRef.current = next;
    setText(next);
  }

  function settle(result: string) {
    const list = waiters.current;
    waiters.current = [];
    list.forEach((resolve) => resolve(result));
  }

  function finishLive() {
    active.current = false;
    started.current = false;
    level.set(withTiming(0, { duration: 150 }));
    if (cancelled.current) {
      textRef.current = base.current;
      setText(base.current);
    } else {
      committed.current = join(committed.current, partial.current);
      partial.current = '';
      render();
    }
    setMode((m) => (m === 'live' ? 'idle' : m));
    settle(textRef.current);
  }

  useSpeechRecognitionEvent('start', () => {
    if (active.current) started.current = true;
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current || cancelled.current) return;
    started.current = true;
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
    started.current = true;
    level.set(withTiming(Math.max(0, Math.min(1, (event.value + 0.5) / 9)), { duration: 80 }));
  });

  useSpeechRecognitionEvent('end', () => {
    if (!active.current) return;
    finishLive();
    if (heardAny.current && !cancelled.current) haptic.success();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!active.current) return;
    if (event.error === 'aborted') return;
    const reason = `${ERROR_TEXT[event.error] || event.error}${event.message ? ` — ${event.message}` : ''}`;
    if (event.error === 'no-speech') {
      if (!heardAny.current) setNotice('Не услышала речь — говори ближе к микрофону');
      return;
    }
    if (!heardAny.current && FALLBACK_ERRORS.has(event.error)) {
      // Распознавание на телефоне не заработало — пишем звук для ноутбука
      finishLive();
      setNotice(`Распознавание iPhone: ${reason}. Пишу звук для ноутбука`);
      void startRecording();
      return;
    }
    setNotice(`Диктовка прервалась: ${reason}`);
  });

  // Громкость в запасном режиме — из метра записи (дБ от −60 до 0)
  const metering = recorderState.metering;
  useEffect(() => {
    if (mode !== 'record' || metering == null) return;
    level.set(withTiming(Math.max(0, Math.min(1, (metering + 50) / 42)), { duration: 80 }));
  }, [metering, mode, level]);

  async function startLive(): Promise<boolean> {
    let step = 'проверка';
    try {
      if (Platform.OS === 'web') return false;
      step = 'доступность';
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setNotice('Распознавание iPhone сейчас недоступно — пишу звук для ноутбука');
        return false;
      }
      step = 'разрешения';
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setNotice('Нет доступа к распознаванию речи — пишу звук для ноутбука. Разрешить: Настройки → Arra');
        return false;
      }
      // Без сети — только если русский скачан на телефон, иначе через Apple
      step = 'языки';
      let onDevice = false;
      try {
        const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        onDevice = installedLocales.some((l) => l.replace('_', '-').toLowerCase() === 'ru-ru');
      } catch {
        onDevice = false;
      }
      base.current = textRef.current;
      committed.current = '';
      partial.current = '';
      heardAny.current = false;
      cancelled.current = false;
      started.current = false;
      active.current = true;
      step = 'запуск';
      ExpoSpeechRecognitionModule.start({
        lang: 'ru-RU',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        iosTaskHint: 'dictation',
        iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'measurement' },
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
      });
      setEngine(onDevice ? 'phone' : 'apple');
      setStartedAt(Date.now());
      setMode('live');
      setNotice(null);
      haptic.press();
      // Сторож: если за 4 с распознавание так и не ожило — пишем звук для ноутбука
      setTimeout(() => {
        if (active.current && !started.current && !heardAny.current) {
          try {
            ExpoSpeechRecognitionModule.abort();
          } catch {
            /* уже остановлено */
          }
          finishLive();
          setNotice('Распознавание iPhone не запустилось за 4 с — пишу звук для ноутбука');
          void startRecording();
        }
      }, 4000);
      return true;
    } catch (error: any) {
      active.current = false;
      setNotice(`Распознавание iPhone (${step}): ${error?.message || error}. Пишу звук для ноутбука`);
      return false;
    }
  }

  async function startRecording() {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        deniedMic();
        setNotice('Нет доступа к микрофону: Настройки → Arra → Микрофон');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      cancelled.current = false;
      base.current = textRef.current;
      setEngine('laptop');
      setStartedAt(Date.now());
      setMode('record');
      haptic.press();
    } catch (error: any) {
      setNotice(`Запись не началась: ${error?.message || error}`);
    }
  }

  async function stopRecording(): Promise<string> {
    setMode('transcribing');
    level.set(withTiming(0, { duration: 150 }));
    haptic.tap();
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (cancelled.current) return base.current;
      const uri = recorder.uri;
      if (!uri) throw new Error('запись пустая');
      const heard = await transcribe(uri);
      if (heard) {
        const next = join(base.current, heard);
        textRef.current = next;
        setText(next);
        haptic.success();
      } else {
        setNotice('Ноутбук ничего не расслышал');
      }
      return textRef.current;
    } catch (error: any) {
      setNotice(`Не расшифровалось на ноутбуке: ${error?.message || error}`);
      return textRef.current;
    } finally {
      setMode('idle');
    }
  }

  async function start() {
    if (mode !== 'idle') return;
    setNotice(null);
    if (await startLive()) return;
    await startRecording();
  }

  /** Остановить и дождаться итогового текста (он остаётся в поле). */
  function finish(): Promise<string> {
    if (mode === 'record') return stopRecording();
    if (mode !== 'live' || !active.current) return Promise.resolve(textRef.current);
    haptic.tap();
    return new Promise<string>((resolve) => {
      waiters.current.push(resolve);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        finishLive();
      }
      // Если «end» не придёт — берём то, что уже распознано
      setTimeout(() => {
        if (active.current) finishLive();
      }, 2500);
    });
  }

  /** Отменить: надиктованное не сохраняется. */
  function cancel() {
    cancelled.current = true;
    haptic.tap();
    if (mode === 'live') {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* уже остановлено */
      }
      finishLive();
      return;
    }
    if (mode === 'record') {
      void stopRecording();
    }
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

  return { mode, engine, startedAt, level, notice, clearNotice: () => setNotice(null), start, finish, cancel };
}
