import { requireOptionalNativeModule } from 'expo';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { ara } from '@/ara/client';
import { API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { isSpeech, joinText, ownSpeech, plainForSpeech } from '@/lib/voice-words';

/**
 * starting — включаем микрофон; listening — слушаем; thinking — ждём ответа;
 * speaking — ответ звучит; stopped — разговор не идёт (нет доступа, ошибка).
 */
export type TalkPhase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'stopped';

export type TalkView = {
  phase: TalkPhase;
  /** что распознаётся прямо сейчас */
  heard: string;
  /** последняя законченная реплика пользователя */
  said: string;
  /** последний ответ */
  reply: string;
  /** понятная причина, если что-то не так */
  notice: string | null;
  /** дело в разрешениях — на экране есть кнопка «Настройки» */
  needsSettings: boolean;
};

type Message = { role: 'user' | 'assistant'; content: string };
type Recognizer = 'off' | 'starting' | 'on' | 'stopping';
type Subscription = { remove: () => void };

/** Тишина после последнего распознанного слова, после которой реплика считается законченной. */
const SILENCE_MS = 1000;
/** Сколько последних реплик помнит разговор. */
const HISTORY = 20;
/**
 * Подавление эха средствами iOS: без него микрофон слышит ответ из динамика.
 * Побочный эффект — звук из динамика может стать тише.
 */
const ECHO_CANCEL = true;
const KEEP_AWAKE_TAG = 'arra-voice';

/** Эти ошибки распознавания сами не пройдут: нужен пользователь. */
const FATAL: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону или распознаванию речи',
  'service-not-allowed': 'Распознавание речи выключено: Настройки → Siri → Диктовка',
  'language-not-supported': 'Русский язык не поддерживается распознаванием на этом iPhone',
};

const TRANSIENT: Record<string, string> = {
  network: 'Нет сети для распознавания речи',
  'audio-capture': 'Микрофон занят другим приложением',
  interrupted: 'Разговор прервал звонок или другой звук',
};

// Экран не гаснет, пока идёт разговор. Модуль входит в сам Expo; если в сборке
// его вдруг нет — просто живём без него.
const keepAwake = requireOptionalNativeModule<{ activate?: (tag: string) => Promise<void>; deactivate?: (tag: string) => Promise<void> }>('ExpoKeepAwake');

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function post(path: string, body: unknown, signal: AbortSignal, timeoutMs: number) {
  const token = await getToken();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const stop = () => timeout.abort();
  signal.addEventListener('abort', stop);
  try {
    const res = await expoFetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new HttpError(data?.error || `Ошибка сервера (${res.status})`, res.status);
    }
    return res;
  } catch (error: any) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(signal.aborted ? 'Отменено' : 'Нет связи с сервером', 0);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

/** Быстрый ответ с сервера (POST /ai/talk). */
async function talkOnServer(messages: Message[], signal: AbortSignal): Promise<string> {
  const res = await post('/ai/talk', { messages }, signal, 35_000);
  const data = await res.json();
  return String(data?.text || '').trim();
}

/** Запасной путь: обычный чат Arra, ответ идёт с компьютера пользователя. */
async function talkThroughArra(chatId: string, messages: Message[]): Promise<string> {
  const question = messages[messages.length - 1];
  const history = messages.slice(0, -1).map((m) => ({ role: m.role, text: m.content }));
  let text = '';
  await ara.ask(
    {
      chatId,
      prompt: `${question.content}\n\n(Это разговор голосом: ответ прозвучит вслух. Ответь коротко и разговорно, одно-три предложения, без разметки и списков.)`,
      history,
      style: 'talk',
      model: 'haiku',
    },
    (delta) => {
      text += delta;
    },
  );
  return text.trim();
}

let speechFiles = 0;

/** Текст -> mp3 на сервере (POST /ai/speak) -> файл в кеше телефона. */
async function speechFile(text: string, signal: AbortSignal): Promise<File> {
  const res = await post('/ai/speak', { text }, signal, 45_000);
  const bytes = await res.bytes();
  if (!bytes.length) throw new HttpError('Пустой звук', 0);
  const file = new File(Paths.cache, `arra-voice-${Date.now().toString(36)}-${++speechFiles}.mp3`);
  if (!file.exists) file.create();
  file.write(bytes);
  return file;
}

function drop(file: File | null) {
  try {
    if (file?.exists) file.delete();
  } catch {
    /* кеш почистит система */
  }
}

const computerOnline = () => {
  const { devices } = ara.getState();
  return devices.laptop.online || devices.pc.online;
};

/**
 * Разговор голосом: слушаем → отправляем реплику → озвучиваем ответ → снова
 * слушаем. Распознавание работает всё время, в том числе пока звучит ответ:
 * человек заговорил — ответ обрывается, и мы слушаем дальше.
 */
export class VoiceTalk {
  private view: TalkView = { phase: 'starting', heard: '', said: '', reply: '', notice: null, needsSettings: false };
  private listeners = new Set<() => void>();
  private subs: Subscription[] = [];

  /** разговор идёт: распознавание должно работать */
  private wanted = false;
  /** номер запуска: stop() во время запроса разрешений отменяет этот запуск */
  private run = 0;
  private recognizer: Recognizer = 'off';
  private recognizerSince = 0;
  /** новые сеансы распознавания, которые сразу же оборвались */
  private quickEnds = 0;
  /** сами оборвали сеанс, чтобы начать с чистого текста */
  private resetting = false;
  private onDevice = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  // Текст текущего сеанса распознавания (копится с его начала)
  private committed = '';
  private partial = '';
  /** ответ Arra, который звучал в этом сеансе: его слова — эхо, а не человек */
  private echo = '';
  private echoHeard = false;
  /** сколько первых слов сеанса — не речь человека (эхо, шум до ответа) */
  private skip = 0;
  private echoTailUntil = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  private history: Message[] = [];
  /** реплика, которую человек продолжил, не дождавшись ответа */
  private carry = '';
  /** номер хода: всё, что пришло для старого хода, выбрасываем */
  private turn = 0;
  private request: AbortController | null = null;

  private player: AudioPlayer | null = null;
  private playerSub: Subscription | null = null;
  private playerFile: File | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private waveTimer: ReturnType<typeof setInterval> | null = null;

  /** на сервере нет /ai/talk — до конца разговора ходим через чат Arra */
  private talkMissing = false;
  /** озвучка недоступна — отвечаем текстом */
  private voiceOff = false;
  private voiceFails = 0;
  private voiceNoticeShown = false;

  private readonly chatId = `voice-${Date.now().toString(36)}`;

  constructor(private readonly level: SharedValue<number>) {}

  // ---------- состояние для React ----------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = () => this.view;

  private set(patch: Partial<TalkView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---------- жизненный цикл ----------

  async start() {
    if (this.wanted) return;
    const run = ++this.run;
    this.set({ phase: 'starting', notice: null, needsSettings: false });
    try {
      if (Platform.OS === 'web' || !ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        this.set({ phase: 'stopped', notice: 'Распознавание речи здесь недоступно' });
        return;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (run !== this.run) return;
      if (!perm.granted) {
        this.set({ phase: 'stopped', notice: 'Нет доступа к микрофону или распознаванию речи. Разреши их для Arra в Настройках.', needsSettings: true });
        return;
      }
      // Без сети — только если русский скачан на телефон, иначе через Apple
      try {
        const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        this.onDevice = installedLocales.some((l) => l.replace('_', '-').toLowerCase() === 'ru-ru');
      } catch {
        this.onDevice = false;
      }
      // Звук ответа и микрофон работают одновременно
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    } catch (error: any) {
      if (run !== this.run) return;
      this.set({ phase: 'stopped', notice: `Микрофон не включился: ${error?.message || error}` });
      return;
    }
    if (run !== this.run || this.wanted) return;

    this.wanted = true;
    this.quickEnds = 0;
    this.listen();
    void keepAwake?.activate?.(KEEP_AWAKE_TAG)?.catch(() => {});
    this.watchdog = setInterval(() => this.check(), 2500);
    this.startRecognizer();
  }

  /** Закончить разговор и всё выключить. */
  stop() {
    const was = this.wanted;
    this.wanted = false;
    this.run++;
    this.turn++;
    this.request?.abort();
    this.request = null;
    this.clearSilence();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.restartTimer = null;
    this.watchdog = null;
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this.stopPlayer();
    if (this.recognizer !== 'off') {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* уже остановлено */
      }
    }
    this.recognizer = 'off';
    this.level.set(withTiming(0, { duration: 150 }));
    if (was) {
      void keepAwake?.deactivate?.(KEEP_AWAKE_TAG)?.catch(() => {});
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (this.view.phase !== 'stopped') this.set({ phase: 'stopped', heard: '' });
  }

  /** Оборвать ответ (нажатие на экран) и слушать дальше. */
  interrupt() {
    if (this.view.phase !== 'speaking' && this.view.phase !== 'thinking') return;
    haptic.tap();
    this.cutAnswer();
    // Нажатием вопрос отменяют, а не продолжают
    this.carry = '';
    this.resetRecognizer();
    this.set({ phase: 'listening', heard: '' });
  }

  private listen() {
    const module = ExpoSpeechRecognitionModule;
    this.subs = [
      module.addListener('start', () => this.onStart()),
      module.addListener('end', () => this.onEnd()),
      module.addListener('result', (event) => this.onResult(event.results[0]?.transcript ?? '', event.isFinal)),
      module.addListener('error', (event) => this.onError(event.error, event.message)),
      module.addListener('volumechange', (event) => {
        if (this.view.phase === 'speaking' || this.recognizer !== 'on') return;
        this.level.set(withTiming(Math.max(0, Math.min(1, (event.value + 0.5) / 9)), { duration: 80 }));
      }),
      AppState.addEventListener('change', (next) => {
        if (next === 'active') this.resume();
        else if (next === 'background') this.pause();
      }),
    ];
  }

  /** Приложение ушло в фон: iOS всё равно отберёт микрофон — останавливаемся сами. */
  private pause() {
    if (!this.wanted) return;
    this.cutAnswer();
    this.clearSilence();
    this.clearText();
    this.resetting = true;
    if (this.recognizer !== 'off') {
      this.recognizer = 'stopping';
      this.recognizerSince = Date.now();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        this.recognizer = 'off';
      }
    }
    this.set({ phase: 'starting', heard: '' });
  }

  private resume() {
    if (!this.wanted) return;
    this.quickEnds = 0;
    this.startRecognizer();
  }

  // ---------- распознавание ----------

  private startRecognizer() {
    if (!this.wanted || this.recognizer !== 'off' || AppState.currentState !== 'active') return;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.recognizer = 'starting';
    this.recognizerSince = Date.now();
    this.resetting = false;
    this.clearText();
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'ru-RU',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: this.onDevice,
        iosTaskHint: 'dictation',
        // voiceChat: система сама убирает из микрофона то, что играет динамик
        iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: ECHO_CANCEL ? 'voiceChat' : 'default' },
        iosVoiceProcessingEnabled: ECHO_CANCEL,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
      });
    } catch (error: any) {
      this.recognizer = 'off';
      this.failedStart(`Микрофон не включился: ${error?.message || error}`);
    }
  }

  private restartSoon(delay: number) {
    if (!this.wanted || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startRecognizer();
    }, delay);
  }

  /** Сеанс не запустился или сразу оборвался: пробуем ещё, но не бесконечно. */
  private failedStart(reason: string) {
    this.quickEnds++;
    if (this.quickEnds >= 5) {
      this.fail(reason);
      return;
    }
    this.restartSoon(300 * this.quickEnds);
  }

  private fail(notice: string, needsSettings = false) {
    this.stop();
    this.set({ phase: 'stopped', notice, needsSettings });
  }

  /** Начать распознавание с чистого текста (после реплики и после эха). */
  private resetRecognizer() {
    this.clearSilence();
    this.clearText();
    if (this.recognizer === 'on' || this.recognizer === 'starting') {
      this.resetting = true;
      this.recognizer = 'stopping';
      this.recognizerSince = Date.now();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        this.recognizer = 'off';
        this.startRecognizer();
      }
    } else if (this.recognizer === 'off') {
      this.startRecognizer();
    }
  }

  /** Сторож: «end» не пришёл или сеанс тихо умер — поднимаем распознавание заново. */
  private check() {
    if (!this.wanted || AppState.currentState !== 'active') return;
    if (this.recognizer === 'off') {
      this.restartSoon(0);
      return;
    }
    if (Date.now() - this.recognizerSince < 2000) return;
    ExpoSpeechRecognitionModule.getStateAsync()
      .then((state) => {
        if (this.recognizer === 'off' || Date.now() - this.recognizerSince < 2000) return;
        // событие «start» потерялось, а сеанс идёт
        if (state === 'recognizing' && this.recognizer === 'starting') this.onStart();
        if (state !== 'inactive') return;
        this.recognizer = 'off';
        this.startRecognizer();
      })
      .catch(() => {});
  }

  private clearText() {
    this.committed = '';
    this.partial = '';
    this.echo = '';
    this.echoHeard = false;
    this.skip = 0;
  }

  private tokens() {
    return joinText(this.committed, this.partial).split(/\s+/).filter(Boolean);
  }

  private clearSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private onStart() {
    if (!this.wanted) return;
    this.recognizer = 'on';
    this.recognizerSince = Date.now();
    this.clearText();
    // Сеанс мог начаться заново посреди ответа — его слова по-прежнему эхо
    if (this.view.phase === 'speaking') this.echo = this.view.reply;
    if (this.view.phase === 'starting') {
      haptic.press();
      this.set({ phase: 'listening', notice: null });
    }
  }

  private onEnd() {
    const lived = Date.now() - this.recognizerSince;
    const was = this.recognizer;
    this.recognizer = 'off';
    this.level.set(withTiming(0, { duration: 150 }));
    if (!this.wanted) return;
    // Сеанс кончился сам (у iOS есть предел длины) посреди реплики — не теряем её
    const pending = this.view.phase === 'listening' && !this.resetting ? this.view.heard : '';
    this.clearSilence();
    if (pending) {
      this.takeUtterance(pending);
      return;
    }
    if (lived >= 1500) this.quickEnds = 0;
    else if (!this.resetting && was !== 'stopping') {
      this.failedStart('Распознавание речи не запускается. Закрой разговор и открой снова.');
      return;
    }
    this.restartSoon(this.resetting ? 0 : 150);
  }

  private onError(code: string, message?: string) {
    if (!this.wanted || code === 'aborted' || code === 'no-speech') return;
    if (FATAL[code]) {
      this.fail(FATAL[code], code !== 'language-not-supported');
      return;
    }
    // Остальное проходит само: «end» или сторож перезапустят распознавание
    this.set({ notice: TRANSIENT[code] || `Распознавание прервалось: ${message || code}` });
  }

  private onResult(heard: string, isFinal: boolean) {
    if (!this.wanted || this.recognizer !== 'on') return;
    if (isFinal) {
      this.committed = joinText(this.committed, heard);
      this.partial = '';
    } else {
      // iOS после паузы иногда начинает распознавание заново — сохраняем сказанное
      const prev = this.partial.trim();
      const next = heard.trim();
      const firstWord = prev.split(/\s+/)[0]?.toLowerCase() || '';
      if (prev && next.length < prev.length * 0.6 && !next.toLowerCase().startsWith(firstWord)) {
        this.committed = joinText(this.committed, prev);
      }
      this.partial = heard;
    }
    const tokens = this.tokens();
    let rest = tokens.slice(this.skip).join(' ');
    const phase = this.view.phase;

    if (phase === 'speaking' || phase === 'thinking') {
      const own = ownSpeech(rest, this.echo);
      if (!isSpeech(own, this.echo, phase === 'speaking')) {
        if (rest) this.echoHeard = true;
        return;
      }
      // Человек заговорил поверх ответа — замолкаем и слушаем
      this.skip = tokens.length - own.split(/\s+/).length;
      this.cutAnswer();
      this.set({ phase: 'listening', heard: own });
      this.armSilence();
      return;
    }
    if (phase !== 'listening') return;
    if (this.echo && Date.now() < this.echoTailUntil) {
      // Хвост ответа ещё долетает до микрофона пару секунд после конца фразы
      const own = ownSpeech(rest, this.echo);
      if (!isSpeech(own, this.echo, true)) {
        if (rest) this.resetRecognizer();
        return;
      }
      this.skip = tokens.length - own.split(/\s+/).length;
      this.echoTailUntil = 0;
      rest = own;
    }
    if (!rest) return;
    if (rest !== this.view.heard) this.set({ heard: rest, notice: null });
    this.armSilence();
  }

  private armSilence() {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.view.phase === 'listening' && this.view.heard.trim()) this.takeUtterance(this.view.heard);
    }, SILENCE_MS);
  }

  // ---------- ход разговора ----------

  private takeUtterance(text: string) {
    this.clearSilence();
    const said = joinText(this.carry, text);
    this.carry = '';
    if (!said) return;
    this.history.push({ role: 'user', content: said });
    this.set({ phase: 'thinking', said, heard: '', reply: '', notice: null });
    haptic.tap();
    // Следующая реплика начинается с чистого текста
    this.resetRecognizer();
    const turn = ++this.turn;
    this.request = new AbortController();
    void this.respond(turn, this.request.signal);
  }

  /** Оборвать то, что сейчас думается или звучит. */
  private cutAnswer() {
    const unanswered = this.view.phase === 'thinking';
    this.turn++;
    this.request?.abort();
    this.request = null;
    this.stopPlayer();
    if (unanswered) {
      // Человек продолжил мысль, не дождавшись ответа: склеиваем в одну реплику
      const last = this.history[this.history.length - 1];
      if (last?.role === 'user') {
        this.history.pop();
        this.carry = last.content;
      }
    }
  }

  private async respond(turn: number, signal: AbortSignal) {
    let reply = '';
    try {
      reply = plainForSpeech(await this.answer(signal));
      if (turn !== this.turn) return;
      if (!reply) throw new Error('Ответ пришёл пустой');
    } catch (error: any) {
      if (turn !== this.turn) return;
      // Вопрос без ответа в истории не держим: его зададут заново
      if (this.history[this.history.length - 1]?.role === 'user') this.history.pop();
      haptic.warning();
      this.set({ phase: 'listening', notice: error?.message || 'Не получилось ответить' });
      return;
    }
    this.history.push({ role: 'assistant', content: reply });
    this.history = this.history.slice(-HISTORY);
    this.set({ reply });

    let file: File | null = null;
    if (!this.voiceOff) {
      try {
        file = await speechFile(reply, signal);
        this.voiceFails = 0;
      } catch (error: any) {
        // Маршрута нет вовсе или озвучка упорно не работает — дальше текстом
        if (error?.status === 404 || ++this.voiceFails >= 3) this.voiceOff = true;
      }
    }
    if (turn !== this.turn) {
      drop(file);
      return;
    }
    if (!file) {
      this.set({ phase: 'listening', notice: this.voiceNoticeShown ? null : 'Голос сейчас недоступен — отвечаю текстом' });
      this.voiceNoticeShown = true;
      return;
    }
    this.play(turn, file, reply);
  }

  private async answer(signal: AbortSignal): Promise<string> {
    const messages = this.history.slice(-HISTORY);
    if (!this.talkMissing) {
      try {
        return await talkOnServer(messages, signal);
      } catch (error: any) {
        if (signal.aborted) throw error;
        if (error?.status === 404) this.talkMissing = true;
        // Сервер не смог ответить сам — спросим Arra на компьютере, если он в сети
        else if (!computerOnline()) throw error;
      }
    }
    if (!computerOnline()) throw new Error('Компьютер не в сети — Arra не ответит');
    return talkThroughArra(this.chatId, messages);
  }

  // ---------- голос ----------

  private play(turn: number, file: File, text: string) {
    try {
      // keepAudioSessionActive: иначе по окончании звука плеер выключит и микрофон
      const player = createAudioPlayer({ uri: file.uri }, { updateInterval: 100, keepAudioSessionActive: true });
      this.player = player;
      this.playerFile = file;
      this.playerSub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) this.finishSpeaking(turn);
      });
      // Всё, что микрофон поймал до начала ответа, — не реплика
      this.skip = this.tokens().length;
      this.echo = text;
      this.echoHeard = false;
      player.play();
    } catch {
      this.stopPlayer();
      drop(file);
      this.set({ phase: 'listening', notice: 'Не получилось проиграть ответ — читай текст' });
      return;
    }
    this.set({ phase: 'speaking' });
    // Волна ответа: мягко «дышит», пока звучит голос
    let step = 0;
    this.waveTimer = setInterval(() => {
      step++;
      const value = 0.3 + 0.22 * Math.sin(step / 1.7) + 0.2 * Math.sin(step / 0.9) + 0.18 * Math.random();
      this.level.set(withTiming(Math.max(0.1, Math.min(1, value)), { duration: 90 }));
    }, 90);
    // Если плеер не сообщит о конце — не зависаем в «говорю»
    this.speakTimer = setTimeout(() => this.finishSpeaking(turn), 6000 + text.length * 130);
  }

  private stopPlayer() {
    if (this.speakTimer) clearTimeout(this.speakTimer);
    if (this.waveTimer) clearInterval(this.waveTimer);
    this.speakTimer = null;
    this.waveTimer = null;
    this.playerSub?.remove();
    this.playerSub = null;
    const player = this.player;
    this.player = null;
    if (player) {
      try {
        player.pause();
        player.remove();
      } catch {
        /* уже освобождён */
      }
    }
    drop(this.playerFile);
    this.playerFile = null;
    this.level.set(withTiming(0, { duration: 150 }));
  }

  private finishSpeaking(turn: number) {
    if (turn !== this.turn || this.view.phase !== 'speaking') return;
    this.stopPlayer();
    this.echoTailUntil = Date.now() + 1500;
    this.set({ phase: 'listening', heard: '' });
    // В распознанное попало эхо ответа — начинаем слушать с чистого текста
    if (this.echoHeard) this.resetRecognizer();
  }
}

/** Разговор живёт, пока открыт экран. */
export function useVoiceTalk() {
  const level = useSharedValue(0);
  const [talk] = useState(() => new VoiceTalk(level));
  const view = useSyncExternalStore(talk.subscribe, talk.getView);
  useEffect(() => {
    void talk.start();
    return () => talk.stop();
  }, [talk]);
  return { view, level, talk };
}
