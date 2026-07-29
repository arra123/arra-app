import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AppleButton, AppleIconButton } from '@/components/apple-button';
import { DeviceSwitcher, deviceLabel, deviceRole, type DeviceChoice } from '@/components/device-switcher';
import { GlassCard } from '@/components/glass-card';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Device = DeviceChoice & {
  last_seen?: string | null;
  duplicate_count?: number;
};

type SyncEvent = { at?: string | null; device?: string | null; role?: string | null; files?: number | null; bytes?: number | null };

type SyncInfo = {
  upload: number;
  download: number;
  localFiles: number;
  remoteFiles: number;
  lastPush?: SyncEvent | null;
  lastPull?: SyncEvent | null;
  checkedAt: number;
};

type SyncState = {
  busy: boolean;
  mode: 'push' | 'pull' | 'status' | null;
  pct: number;
  speed: number;
  eta: number | null;
  done: number;
  total: number;
  currentFile: string;
  phase: string;
  message: string;
  error: string;
  stalled: boolean;
  blocked: { project?: string; file?: string; reason?: string }[];
};

const WS_URL = API_URL.replace(/^http/, 'ws') + '/client';
/** Если от компьютера нет ни одного события дольше этого времени — считаем, что подвисло. */
const STALL_MS = 45_000;

const emptySync: SyncState = {
  busy: false, mode: null, pct: 0, speed: 0, eta: null, done: 0, total: 0,
  currentFile: '', phase: 'Готово к команде', message: '', error: '', stalled: false, blocked: [],
};

const formatSpeed = (value: number) => {
  if (!value) return '—';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} МБ/с`;
  return `${Math.max(1, Math.round(value / 1024))} КБ/с`;
};

const formatEta = (seconds: number | null) => {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} сек`;
  return `${Math.floor(seconds / 60)} мин ${Math.round(seconds % 60)} сек`;
};

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const files = (n: number) => `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;

const whenText = (event?: SyncEvent | null) => {
  if (!event?.at) return null;
  const date = new Date(event.at);
  if (Number.isNaN(date.getTime())) return null;
  const author = event.device || (event.role === 'laptop' ? 'Ноутбук' : 'Компьютер');
  const stamp = date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `${stamp} · ${author}`;
};

export function SyncPanel() {
  const theme = useTheme();
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<string | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventRef = useRef(0);
  // Список устройств нужен и внутри колбэков с пустыми зависимостями.
  const devicesRef = useRef<Device[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>(emptySync);
  const [info, setInfo] = useState<SyncInfo | null>(null);

  const selected = devices.find((device) => device.id === deviceId) || null;

  useEffect(() => { deviceRef.current = deviceId; }, [deviceId]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const applyEvent = useCallback((event: any) => {
    lastEventRef.current = Date.now();
    const alive = (current: SyncState): SyncState => ({ ...current, busy: true, stalled: false });

    if (event.type === 'phase') {
      setSync((current) => ({ ...alive(current), phase: event.msg || current.phase, message: event.detail || '' }));
    } else if (event.type === 'scan') {
      // Сверка 36 тысяч файлов идёт больше минуты. Без этих событий экран
      // выглядел зависшим на «Проверяю защищённое соединение».
      setSync((current) => ({
        ...alive(current),
        phase: event.side === 'remote' ? 'Смотрю, что на сервере' : 'Смотрю, что на компьютере',
        message: `${event.scope || ''}${event.files ? ` · ${files(event.files)}` : ''}`.trim(),
      }));
    } else if (event.type === 'status') {
      // Итог сверки: сколько файлов новее здесь и там + кто последним трогал сервер.
      const server = event.serverState || {};
      setInfo({
        upload: Number(event.upload || 0),
        download: Number(event.download || 0),
        localFiles: Number(event.localFiles || 0),
        remoteFiles: Number(event.remoteFiles || 0),
        lastPush: server.lastPush || null,
        lastPull: server.lastPull || null,
        checkedAt: Date.now(),
      });
      setSync((current) => ({ ...current, busy: false, stalled: false, phase: 'Сверил с сервером', message: '', error: '' }));
    } else if (event.type === 'plan') {
      const historyExcluded = (event.excludedScopes || []).length > 0;
      setSync((current) => ({
        ...alive(current),
        total: event.files || 0,
        phase: 'План передачи готов',
        message: `${files(event.files || 0)}${historyExcluded ? ' · журналы Codex исключены' : ''}`,
      }));
    } else if (event.type === 'preflight') {
      setSync((current) => ({ ...alive(current), phase: 'Проверяю открытые файлы', done: event.checked || 0, total: event.total || current.total }));
    } else if (event.type === 'progress') {
      const pct = event.totalBytes ? Math.round((event.bytes || 0) / event.totalBytes * 100) : 0;
      setSync((current) => ({
        ...alive(current), pct, speed: event.speed || 0, eta: event.eta ?? null,
        done: event.done || 0, total: event.total || 0, currentFile: event.file || '',
        phase: event.direction === 'pull' ? 'Получаю с сервера' : 'Отправляю на сервер',
        message: event.project || event.scope || '', error: '',
      }));
    } else if (event.type === 'retry') {
      setSync((current) => ({
        ...alive(current),
        phase: `Повтор ${event.attempt || 1} из ${event.maxAttempts || 3}`,
        message: event.file || current.message,
        error: event.error || '',
      }));
    } else if (event.type === 'fileerror') {
      setSync((current) => ({
        ...alive(current),
        phase: 'Файл пропущен после трёх попыток',
        message: event.file || current.message,
        error: event.error || '',
      }));
    } else if (event.type === 'verify' || event.type === 'verify_progress') {
      setSync((current) => ({ ...alive(current), phase: 'Проверяю целостность', done: event.done || 0, total: event.total || current.total }));
    } else if (event.type === 'blocked') {
      setSync((current) => ({ ...current, busy: false, stalled: false, blocked: event.files || [], error: event.error || 'Некоторые файлы открыты', phase: 'Файлы заняты на компьютере' }));
      haptic.error();
    } else if (event.type === 'done') {
      setSync((current) => ({
        ...current, busy: false, stalled: false, pct: 100, speed: 0, eta: 0, currentFile: '',
        phase: event.msg || 'Синхронизация завершена',
        message: `${files(event.transferred || 0)} подтверждено`,
        error: '',
      }));
      haptic.success();
      // После передачи сразу пересверяем — иначе на экране остаются старые цифры.
      setTimeout(() => run('status', true), 600);
    } else if (event.type === 'error') {
      setSync((current) => ({ ...current, busy: false, stalled: false, error: event.error || 'Ошибка синхронизации', phase: 'Не удалось выполнить' }));
      haptic.error();
    } else if (event.type === 'cancelled') {
      setSync((current) => ({ ...current, busy: false, stalled: false, phase: 'Передача остановлена', message: '', error: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;

    async function connect() {
      const token = await getToken();
      if (!token || !alive) return;
      const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = socket;
      socket.onopen = () => {
        if (!alive) return;
        socket.send(JSON.stringify({ type: 'list_devices' }));
      };
      socket.onclose = () => {
        if (!alive) return;
        reconnectRef.current = setTimeout(connect, 2500);
      };
      socket.onerror = () => { try { socket.close(); } catch {} };
      socket.onmessage = (event) => {
        let message: any;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.type === 'devices') {
          const next = (message.devices || []) as Device[];
          setDevices(next);
          setDeviceId((current) => {
            if (current && next.some((device) => device.id === current)) return current;
            return next.find((device) => device.online)?.id || next[0]?.id || null;
          });
          return;
        }
        if (message.deviceId && deviceRef.current && message.deviceId !== deviceRef.current) return;
        if (message.type === 'pc_offline') {
          setSync((current) => ({ ...current, busy: false, stalled: false, error: 'Компьютер не в сети', phase: 'Команда не доставлена' }));
          return;
        }
        if (message.type === 'sync_remote_ack') {
          lastEventRef.current = Date.now();
          setSync((current) => ({ ...current, busy: true, stalled: false, error: '', phase: message.message || 'Команда запущена' }));
          return;
        }
        if (message.type !== 'sync_remote_event') return;
        applyEvent(message.event || {});
      };
    }

    connect();
    const poll = setInterval(() => {
      const socket = wsRef.current;
      if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'list_devices' }));
    }, 5000);
    return () => {
      alive = false;
      clearInterval(poll);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try { wsRef.current?.close(); } catch {}
    };
  }, [applyEvent]);

  // Сторож зависания: компьютер молчит дольше STALL_MS — разблокируем кнопки
  // и честно пишем, что связь потерялась. Раньше экран замирал навсегда.
  useEffect(() => {
    if (!sync.busy) return;
    const timer = setInterval(() => {
      if (Date.now() - lastEventRef.current > STALL_MS) {
        setSync((current) => current.busy
          ? { ...current, stalled: true, error: 'Компьютер молчит больше 45 секунд', phase: 'Похоже, зависло' }
          : current);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [sync.busy]);

  function send(type: string) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== 1 || !deviceRef.current) return false;
    socket.send(JSON.stringify({ to: 'pc', deviceId: deviceRef.current, type, reqId: `sync-${Date.now()}` }));
    return true;
  }

  function run(mode: 'push' | 'pull' | 'status', silent = false) {
    const target = devicesRef.current.find((device) => device.id === deviceRef.current);
    if (!target?.online) {
      setSync((current) => ({ ...current, busy: false, error: 'Выбранный компьютер не в сети', phase: 'Команда не доставлена' }));
      return;
    }
    const type = mode === 'push' ? 'sync_remote_push' : mode === 'pull' ? 'sync_remote_pull' : 'sync_remote_status';
    lastEventRef.current = Date.now();
    setSync({
      ...emptySync,
      busy: true,
      mode,
      phase: mode === 'push' ? 'Отправляю на сервер…' : mode === 'pull' ? 'Забираю с сервера…' : 'Сверяю с сервером…',
    });
    if (!send(type)) setSync((current) => ({ ...current, busy: false, error: 'Нет связи с сервером', phase: 'Команда не отправлена' }));
    else if (!silent) haptic.press();
  }

  /** Стоп всегда разблокирует экран, даже если компьютер не ответил. */
  function cancel() {
    send('sync_remote_cancel');
    haptic.warning();
    setSync((current) => ({ ...current, busy: false, stalled: false, phase: 'Передача остановлена', message: '', error: '' }));
  }

  const upload = info?.upload ?? 0;
  const download = info?.download ?? 0;
  const state = !info
    ? { tint: theme.textSecondary, icon: 'questionmark.circle', title: 'Ещё не сверял', text: 'Нажми «Сверить» — сравню компьютер с сервером.' }
    : upload && download
      ? { tint: theme.warning, icon: 'arrow.left.arrow.right', title: 'Менялись обе стороны', text: `Здесь новее ${files(upload)}, на сервере — ${files(download)}. Обычно сперва отправляют свои изменения.` }
      : upload
        ? { tint: theme.tint, icon: 'arrow.up.circle.fill', title: 'Актуальнее компьютер', text: `${files(upload)} ещё не сохранены на сервере.` }
        : download
          ? { tint: theme.success, icon: 'arrow.down.circle.fill', title: 'Актуальнее сервер', text: `${files(download)} нужно забрать на компьютер.` }
          : { tint: theme.success, icon: 'checkmark.circle.fill', title: 'Версии совпадают', text: 'На компьютере и на сервере одинаковые файлы.' };

  const lastPush = whenText(info?.lastPush);
  const lastPull = whenText(info?.lastPull);
  const canRun = !!selected?.online && !sync.busy;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: BottomTabInset + Spacing.five }]}
      showsVerticalScrollIndicator={false}>

      {/* Маршрут: устройство ↔ сервер. Подписи «Устройство / выбери где запустить»
          убраны — переключатель и так показывает, что выбрано. */}
      <GlassCard radius={Radius.lg} style={styles.routeCard}>
        <View style={styles.routeNode}>
          <SymbolView
            name={(deviceRole(selected) === 'laptop' ? 'laptopcomputer' : 'desktopcomputer') as never}
            tintColor={theme.text}
            size={24}
          />
          <ThemedText type="smallBold" numberOfLines={1}>{deviceLabel(selected)}</ThemedText>
          <ThemedText type="small" themeColor={selected?.online ? 'success' : 'textSecondary'}>
            {selected?.online ? 'в сети' : 'не в сети'}
          </ThemedText>
        </View>
        <SymbolView name="arrow.left.arrow.right" tintColor={theme.tint} size={18} />
        <View style={styles.routeNode}>
          <SymbolView name="externaldrive.connected.to.line.below" tintColor={theme.success} size={24} />
          <ThemedText type="smallBold">Сервер</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{info ? files(info.remoteFiles) : '—'}</ThemedText>
        </View>
        <DeviceSwitcher
          devices={devices}
          value={deviceId}
          onChange={(id) => { setDeviceId(id); setSync(emptySync); setInfo(null); }}
          compact
        />
      </GlassCard>

      {/* Что происходит и что делать. */}
      <GlassCard radius={Radius.lg} style={styles.stateCard}>
        <View style={styles.stateHead}>
          <SymbolView name={state.icon as never} tintColor={state.tint} size={26} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <ThemedText type="smallBold">{state.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{state.text}</ThemedText>
          </View>
          <AppleIconButton
            label="Сверить"
            systemImage="arrow.clockwise"
            onPress={() => run('status')}
            disabled={!canRun}
            variant="glass"
            size={38}
          />
        </View>

        {(lastPush || lastPull) && (
          <View style={[styles.history, { borderTopColor: theme.separator }]}>
            <View style={styles.historyRow}>
              <ThemedText type="small" themeColor="textSecondary">На сервере — версия от</ThemedText>
              <ThemedText type="small" numberOfLines={1} style={styles.historyValue}>{lastPush || 'ещё не отправляли'}</ThemedText>
            </View>
            <View style={styles.historyRow}>
              <ThemedText type="small" themeColor="textSecondary">Последний раз забирали</ThemedText>
              <ThemedText type="small" numberOfLines={1} style={styles.historyValue}>{lastPull || 'ещё не забирали'}</ThemedText>
            </View>
          </View>
        )}
      </GlassCard>

      <View style={styles.actions}>
        <AppleButton
          label={upload ? `Отправить на сервер · ${files(upload)}` : 'Отправить на сервер'}
          onPress={() => run('push')}
          disabled={!canRun}
          variant="prominent"
          full
        />
        <AppleButton
          label={download ? `Забрать с сервера · ${files(download)}` : 'Забрать с сервера'}
          onPress={() => run('pull')}
          disabled={!canRun}
          variant="glass"
          tint={theme.success}
          full
        />
      </View>

      {/* Прогресс показываем только когда есть что показывать. */}
      {(sync.busy || sync.error || sync.pct > 0) && (
        <GlassCard radius={Radius.lg} style={styles.progressCard}>
          <View style={styles.progressHead}>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold">{sync.phase}</ThemedText>
              <ThemedText type="small" themeColor={sync.error ? 'danger' : 'textSecondary'} numberOfLines={2}>
                {sync.error || sync.message || (selected?.online ? 'Компьютер работает' : 'Открой Noda на компьютере')}
              </ThemedText>
            </View>
            {sync.busy && (
              <AppleButton
                label="Остановить"
                onPress={cancel}
                variant="plain"
                role="destructive"
                size="small"
              />
            )}
          </View>

          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${sync.pct}%`, backgroundColor: sync.error ? theme.danger : theme.success }]} />
          </View>

          <View style={styles.metrics}>
            <View><ThemedText type="small" themeColor="textSecondary">ПРОГРЕСС</ThemedText><ThemedText type="smallBold">{sync.pct}%</ThemedText></View>
            <View><ThemedText type="small" themeColor="textSecondary">СКОРОСТЬ</ThemedText><ThemedText type="smallBold">{formatSpeed(sync.speed)}</ThemedText></View>
            <View><ThemedText type="small" themeColor="textSecondary">ОСТАЛОСЬ</ThemedText><ThemedText type="smallBold">{formatEta(sync.eta)}</ThemedText></View>
          </View>

          {!!sync.currentFile && (
            <View style={[styles.currentFile, { borderTopColor: theme.separator }]}>
              <SymbolView name="doc" tintColor={theme.textSecondary} size={15} />
              <ThemedText type="small" numberOfLines={2} style={{ flex: 1 }}>{sync.currentFile}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{sync.done}/{sync.total}</ThemedText>
            </View>
          )}

          {sync.stalled && (
            <Pressable
              onPress={() => { cancel(); setTimeout(() => run(sync.mode === 'status' ? 'status' : sync.mode || 'status'), 400); }}
              style={({ pressed }) => [styles.retry, { borderColor: theme.warning, opacity: pressed ? 0.7 : 1 }]}>
              <SymbolView name="arrow.clockwise" tintColor={theme.warning} size={16} />
              <ThemedText type="smallBold" style={{ color: theme.warning }}>Остановить и попробовать заново</ThemedText>
            </Pressable>
          )}
        </GlassCard>
      )}

      {sync.blocked.length > 0 && (
        <View style={[styles.blocked, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">Эти файлы заняты на компьютере</ThemedText>
          {sync.blocked.slice(0, 5).map((file, index) => (
            <ThemedText key={`${file.file}-${index}`} type="small" themeColor="textSecondary" numberOfLines={2}>
              • {file.project ? `${file.project}: ` : ''}{file.file || file.reason}
            </ThemedText>
          ))}
          <AppleButton
            label="Освободить и повторить"
            onPress={() => { send('sync_remote_unblock'); setSync((current) => ({ ...current, blocked: [] })); setTimeout(() => run(sync.mode === 'pull' ? 'pull' : 'push'), 800); }}
            variant="bordered"
            role="destructive"
            size="small"
            full
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  routeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  routeNode: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  stateCard: { padding: Spacing.three, gap: Spacing.three },
  stateHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  history: { gap: 6, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  historyValue: { flex: 1, minWidth: 0, textAlign: 'right', fontWeight: '600' },
  actions: { gap: Spacing.two },
  progressCard: { padding: Spacing.three, gap: Spacing.three },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  track: { height: 7, overflow: 'hidden', borderRadius: Radius.pill },
  fill: { height: '100%', borderRadius: Radius.pill },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  currentFile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  retry: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  blocked: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
});
