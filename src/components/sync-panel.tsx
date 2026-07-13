import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { GlassCard } from '@/components/glass-card';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Device = {
  id: string;
  name: string;
  role?: 'laptop' | 'pc' | null;
  hostname?: string | null;
  online: boolean;
  last_seen?: string | null;
  duplicate_count?: number;
};

type Editor = {
  type?: 'terminal' | 'process';
  name: string;
  title?: string;
  pid: number | null;
};

type SyncMode = 'push' | 'pull' | 'status';

type SyncState = {
  busy: boolean;
  mode: SyncMode | null;
  pct: number;
  speed: number;
  eta: number | null;
  done: number;
  total: number;
  currentFile: string;
  phase: string;
  message: string;
  error: string;
  verified: number;
  scanning: boolean;
  scanFiles: number;
  elapsed: number;
  blocked: { project?: string; file?: string; reason?: string }[];
};

type RemoteState = {
  busy?: boolean;
  mode?: SyncMode | null;
  updatedAt?: string | null;
  lastEvent?: Record<string, any> | null;
};

type SyncPanelProps = {
  preferredDeviceId?: string | null;
  compact?: boolean;
};

const WS_URL = API_URL.replace(/^http/, 'ws') + '/client';
const emptySync: SyncState = {
  busy: false,
  mode: null,
  pct: 0,
  speed: 0,
  eta: null,
  done: 0,
  total: 0,
  currentFile: '',
  phase: 'Готово',
  message: '',
  error: '',
  verified: 0,
  scanning: false,
  scanFiles: 0,
  elapsed: 0,
  blocked: [],
};

const formatSpeed = (value: number) => {
  if (!value) return '—';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} МБ/с`;
  return `${Math.max(1, Math.round(value / 1024))} КБ/с`;
};

const formatDuration = (seconds: number | null) => {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} сек`;
  return `${Math.floor(seconds / 60)} мин ${Math.round(seconds % 60)} сек`;
};

export function SyncPanel({ preferredDeviceId = null, compact = false }: SyncPanelProps) {
  const theme = useTheme();
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<string | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemoteEventAt = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(preferredDeviceId);
  const [sync, setSync] = useState<SyncState>(emptySync);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [needsForce, setNeedsForce] = useState(false);

  const selected = devices.find((device) => device.id === deviceId) || null;

  useEffect(() => {
    deviceRef.current = deviceId;
  }, [deviceId]);

  const applyEvent = useCallback((event: any) => {
    if (event.type === 'phase') {
      setSync((current) => ({
        ...current,
        busy: true,
        scanning: /скан|подключ/i.test(`${event.msg || ''} ${event.detail || ''}`),
        phase: event.msg || current.phase,
        message: event.detail || '',
        error: '',
      }));
    } else if (event.type === 'scan') {
      const scopeIndex = Math.max(1, Number(event.scopeIndex) || 1);
      const scopeTotal = Math.max(scopeIndex, Number(event.scopeTotal) || scopeIndex);
      const completedSteps = (scopeIndex - 1) * 2 + (event.side === 'local' ? 1 : 0) + (event.done ? 1 : 0);
      const pct = Math.min(99, Math.round(completedSteps / Math.max(1, scopeTotal * 2) * 100));
      setSync((current) => ({
        ...current,
        busy: true,
        scanning: true,
        pct,
        scanFiles: Number(event.files) || 0,
        elapsed: Number(event.elapsed) || 0,
        phase: event.msg || 'Сканирую файлы',
        message: `${event.files || 0} файлов · ${event.scope || ''}`,
        error: '',
      }));
    } else if (event.type === 'status') {
      const changes = (Number(event.upload) || 0) + (Number(event.download) || 0);
      setSync((current) => ({
        ...current,
        busy: false,
        scanning: false,
        pct: 100,
        elapsed: Number(event.elapsed) || current.elapsed,
        phase: 'Проверка завершена',
        message: changes ? `${changes} изменений · ↑ ${event.upload || 0} · ↓ ${event.download || 0}` : 'Изменений нет',
        error: event.conflicts ? `${event.conflicts} конфликтов требуют проверки` : '',
      }));
    } else if (event.type === 'plan') {
      setSync((current) => ({
        ...current,
        busy: true,
        scanning: false,
        total: event.files || 0,
        phase: 'План передачи готов',
        message: `${event.files || 0} файлов`,
        blocked: [],
      }));
    } else if (event.type === 'preflight') {
      setSync((current) => ({
        ...current,
        busy: true,
        scanning: false,
        phase: 'Проверяю открытые файлы',
        done: event.checked || 0,
        total: event.total || current.total,
        currentFile: event.file || current.currentFile,
      }));
    } else if (event.type === 'progress') {
      const pct = event.totalBytes ? Math.round((event.bytes || 0) / event.totalBytes * 100) : 0;
      setSync((current) => ({
        ...current,
        busy: true,
        scanning: false,
        pct,
        speed: event.speed || 0,
        eta: event.eta ?? null,
        done: event.done || 0,
        total: event.total || 0,
        currentFile: event.file || '',
        phase: event.direction === 'pull' ? 'Получаю с сервера' : 'Отправляю на сервер',
        message: event.project || event.scope || '',
        error: '',
        blocked: [],
      }));
    } else if (event.type === 'verify' || event.type === 'verify_progress') {
      setSync((current) => ({
        ...current,
        busy: true,
        scanning: false,
        phase: 'Проверяю целостность',
        verified: event.verified || 0,
        done: event.done || 0,
        total: event.total || current.total,
        currentFile: event.file || '',
      }));
    } else if (event.type === 'blocked') {
      setSync((current) => ({
        ...current,
        busy: false,
        scanning: false,
        blocked: event.files || [],
        error: event.error || 'Некоторые файлы открыты',
        phase: 'Передача остановлена',
      }));
      haptic.error();
    } else if (event.type === 'done') {
      setSync((current) => ({
        ...current,
        busy: false,
        scanning: false,
        pct: 100,
        speed: 0,
        eta: 0,
        currentFile: '',
        verified: event.verified || event.transferred || 0,
        elapsed: Number(event.elapsed) || current.elapsed,
        phase: event.msg || 'Синхронизация завершена',
        message: `${event.transferred || 0} файлов подтверждено`,
        error: event.errors ? `${event.errors} файлов завершились с ошибкой` : '',
        blocked: [],
      }));
      haptic.success();
    } else if (event.type === 'error') {
      setSync((current) => ({
        ...current,
        busy: false,
        scanning: false,
        error: event.error || 'Ошибка синхронизации',
        phase: 'Не удалось выполнить',
      }));
      haptic.error();
    } else if (event.type === 'closed') {
      setSync((current) => ({ ...current, busy: false, scanning: false }));
    }
  }, []);

  const applyRemoteState = useCallback((state?: RemoteState | null) => {
    if (!state) return;
    const isNewEvent = !state.updatedAt || state.updatedAt !== lastRemoteEventAt.current;
    if (isNewEvent && state.lastEvent) applyEvent(state.lastEvent);
    if (state.updatedAt) lastRemoteEventAt.current = state.updatedAt;
    setSync((current) => ({
      ...current,
      busy: !!state.busy,
      mode: state.mode || current.mode,
      scanning: !!state.busy && current.scanning,
    }));
  }, [applyEvent]);

  const send = useCallback((type: string, payload: Record<string, any> = {}) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== 1 || !deviceRef.current) return false;
    socket.send(JSON.stringify({
      to: 'pc',
      deviceId: deviceRef.current,
      type,
      reqId: `sync-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      ...payload,
    }));
    return true;
  }, []);

  const refreshSelected = useCallback(() => {
    send('sync_remote_snapshot');
    send('sync_remote_blockers');
  }, [send]);

  useEffect(() => {
    let alive = true;
    let pollCount = 0;

    async function connect() {
      const token = await getToken();
      if (!token || !alive) return;
      const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = socket;
      socket.onopen = () => {
        if (!alive) return;
        setConnected(true);
        socket.send(JSON.stringify({ type: 'list_devices' }));
      };
      socket.onclose = () => {
        if (!alive) return;
        setConnected(false);
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
            if (preferredDeviceId && next.some((device) => device.id === preferredDeviceId)) return preferredDeviceId;
            if (current && next.some((device) => device.id === current)) return current;
            return next.find((device) => device.online)?.id || next[0]?.id || null;
          });
          return;
        }
        if (message.deviceId && deviceRef.current && message.deviceId !== deviceRef.current) return;
        if (message.type === 'pc_offline') {
          setSync((current) => ({ ...current, busy: false, error: 'Компьютер не в сети', phase: 'Команда не доставлена' }));
          return;
        }
        if (message.type === 'sync_remote_ack') {
          applyRemoteState(message.state);
          setSync((current) => ({ ...current, busy: true, error: '', phase: message.message || 'Команда запущена' }));
          return;
        }
        if (message.type === 'sync_remote_state') {
          applyRemoteState(message.state);
          return;
        }
        if (message.type === 'sync_remote_blockers') {
          setEditors((message.items || []).filter((item: Editor) => item.pid));
          return;
        }
        if (message.type === 'sync_remote_blockers_result') {
          const result = message.result || {};
          const remaining = (result.remaining || []).map((item: Editor) => ({ ...item, type: 'process' as const }));
          setEditorBusy(false);
          setEditors(remaining);
          setNeedsForce(!!result.needsForce || remaining.length > 0);
          if (result.error) {
            setEditorMessage(result.error);
            haptic.error();
          } else if (remaining.length) {
            setEditorMessage(`Не закрылись: ${remaining.length}`);
          } else {
            setEditorMessage(`Закрыто: ${result.closed || 0}`);
            haptic.success();
            setTimeout(() => send('sync_remote_blockers'), 800);
          }
          return;
        }
        if (message.type !== 'sync_remote_event') return;
        applyEvent(message.event || {});
        if (message.state?.updatedAt) lastRemoteEventAt.current = message.state.updatedAt;
        if (message.state) {
          setSync((current) => ({
            ...current,
            busy: !!message.state.busy,
            mode: message.state.mode || current.mode,
          }));
        }
        if (message.event?.type === 'blocked') {
          socket.send(JSON.stringify({
            to: 'pc', deviceId: deviceRef.current, type: 'sync_remote_blockers', reqId: `blockers-${Date.now()}`,
          }));
        }
      };
    }

    connect();
    const poll = setInterval(() => {
      const socket = wsRef.current;
      if (socket?.readyState !== 1) return;
      pollCount += 1;
      socket.send(JSON.stringify({ type: 'list_devices' }));
      if (!deviceRef.current) return;
      socket.send(JSON.stringify({ to: 'pc', deviceId: deviceRef.current, type: 'sync_remote_snapshot', reqId: `snapshot-${Date.now()}` }));
      if (pollCount % 3 === 0) socket.send(JSON.stringify({ to: 'pc', deviceId: deviceRef.current, type: 'sync_remote_blockers', reqId: `blockers-${Date.now()}` }));
    }, 2500);
    return () => {
      alive = false;
      clearInterval(poll);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try { wsRef.current?.close(); } catch {}
    };
  }, [applyEvent, applyRemoteState, preferredDeviceId, send]);

  useEffect(() => {
    if (!connected || !deviceId) return;
    const timer = setTimeout(() => {
      setSync(emptySync);
      setEditors([]);
      setEditorMessage('');
      setNeedsForce(false);
      lastRemoteEventAt.current = null;
      refreshSelected();
    }, 0);
    return () => clearTimeout(timer);
  }, [connected, deviceId, refreshSelected]);

  function run(mode: SyncMode) {
    if (!selected?.online) {
      setSync((current) => ({ ...current, busy: false, error: 'Выбранный компьютер не в сети', phase: 'Команда не доставлена' }));
      return;
    }
    const type = mode === 'push' ? 'sync_remote_push' : mode === 'pull' ? 'sync_remote_pull' : 'sync_remote_status';
    setSync({
      ...emptySync,
      busy: true,
      mode,
      scanning: true,
      phase: mode === 'push' ? 'Запускаю отправку…' : mode === 'pull' ? 'Запускаю получение…' : 'Запускаю сканирование…',
    });
    if (!send(type)) setSync((current) => ({ ...current, busy: false, error: 'Нет связи с сервером', phase: 'Команда не отправлена' }));
    else haptic.press();
  }

  function askClose(items: Editor[], force = false) {
    const pids = items.map((item) => Number(item.pid)).filter((pid) => pid > 0);
    if (!pids.length) return;
    Alert.alert(
      force ? 'Закрыть принудительно?' : 'Закрыть редакторы?',
      force
        ? 'Несохранённые изменения в этих приложениях могут потеряться.'
        : 'Noda попросит приложения закрыться. Если есть несохранённые файлы, на компьютере может появиться окно сохранения.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: force ? 'Закрыть принудительно' : 'Закрыть',
          style: force ? 'destructive' : 'default',
          onPress: () => {
            setEditorBusy(true);
            setEditorMessage(force ? 'Завершаю процессы…' : 'Закрываю и жду до 15 секунд…');
            setNeedsForce(false);
            if (!send(force ? 'sync_remote_force_close_blockers' : 'sync_remote_close_blockers', { pids })) {
              setEditorBusy(false);
              setEditorMessage('Команда не отправлена');
            }
          },
        },
      ],
    );
  }

  const retryLabel = sync.mode === 'pull' ? 'Повторить получение' : sync.mode === 'status' ? 'Проверить снова' : 'Повторить отправку';
  const statusText = sync.error || sync.message || (selected?.online ? 'Можно запускать' : 'Noda на устройстве не в сети');

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, compact && styles.compactContent, { paddingBottom: BottomTabInset + Spacing.five }]}
      showsVerticalScrollIndicator={false}>
      {!compact && (
        <>
          <View style={styles.deviceHeader}>
            <ThemedText type="smallBold">Устройства</ThemedText>
            {!connected && <ActivityIndicator size="small" color={theme.tint} />}
          </View>

          <View style={styles.devices}>
            {devices.map((device) => {
              const active = device.id === deviceId;
              return (
                <TouchableOpacity
                  key={device.id}
                  activeOpacity={0.8}
                  onPress={() => { setDeviceId(device.id); haptic.select(); }}
                  style={[styles.deviceCard, { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement, borderColor: active ? theme.tint : theme.separator }]}>
                  <View style={[styles.deviceIcon, { backgroundColor: active ? theme.tint : theme.backgroundSelected }]}>
                    <SymbolView name={device.role === 'laptop' ? 'laptopcomputer' : 'desktopcomputer'} tintColor={active ? '#fff' : theme.text} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" numberOfLines={1}>{device.name || (device.role === 'laptop' ? 'Ноутбук' : 'ПК')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {device.online ? 'в сети' : 'не в сети'}{device.hostname ? ` · ${device.hostname}` : ''}
                    </ThemedText>
                  </View>
                  <View style={[styles.onlineDot, { backgroundColor: device.online ? theme.success : theme.textSecondary }]} />
                </TouchableOpacity>
              );
            })}
          </View>

          <GlassCard radius={Radius.lg} style={styles.routeCard}>
            <View style={styles.routeNode}>
              <SymbolView name={selected?.role === 'laptop' ? 'laptopcomputer' : 'desktopcomputer'} tintColor={theme.text} size={24} />
              <ThemedText type="smallBold">{selected?.role === 'laptop' ? 'Ноутбук' : 'ПК'}</ThemedText>
            </View>
            <View style={styles.routeLine}><SymbolView name="arrow.left.arrow.right" tintColor={theme.tint} size={18} /></View>
            <View style={styles.routeNode}>
              <SymbolView name="externaldrive.connected.to.line.below" tintColor={theme.success} size={24} />
              <ThemedText type="smallBold">Сервер</ThemedText>
            </View>
          </GlassCard>
        </>
      )}

      {compact && (
        <View style={styles.compactDevice}>
          <View style={[styles.onlineDot, { backgroundColor: selected?.online ? theme.success : theme.textSecondary }]} />
          <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>{selected?.name || 'Устройство'}</ThemedText>
          {!connected && <ActivityIndicator size="small" color={theme.tint} />}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          disabled={!selected?.online || sync.busy}
          onPress={() => run('push')}
          activeOpacity={0.82}
          style={[styles.actionPrimary, { backgroundColor: theme.tint }, (!selected?.online || sync.busy) && styles.disabled]}>
          <View style={styles.actionIcon}><SymbolView name="paperplane.fill" tintColor="#fff" size={21} /></View>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>Отправить на сервер</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!selected?.online || sync.busy}
          onPress={() => run('pull')}
          activeOpacity={0.82}
          style={[styles.actionSecondary, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }, (!selected?.online || sync.busy) && styles.disabled]}>
          <View style={[styles.actionIcon, { backgroundColor: `${theme.success}18` }]}><SymbolView name="tray.and.arrow.down.fill" tintColor={theme.success} size={22} /></View>
          <ThemedText type="smallBold">Забрать с сервера</ThemedText>
        </TouchableOpacity>
      </View>

      <GlassCard radius={Radius.lg} style={styles.progressCard}>
        <View style={styles.progressHead}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">{sync.phase}</ThemedText>
            <ThemedText type="small" themeColor={sync.error ? 'danger' : 'textSecondary'} numberOfLines={3}>{statusText}</ThemedText>
          </View>
          {sync.busy
            ? <ActivityIndicator color={theme.tint} />
            : <TouchableOpacity onPress={() => run('status')} disabled={!selected?.online} hitSlop={10}><SymbolView name="arrow.clockwise" tintColor={selected?.online ? theme.tint : theme.textSecondary} size={21} /></TouchableOpacity>}
        </View>
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { width: `${sync.pct}%`, backgroundColor: sync.error ? theme.danger : theme.success }]} />
        </View>
        <View style={styles.metrics}>
          <View><ThemedText type="small" themeColor="textSecondary">ПРОГРЕСС</ThemedText><ThemedText type="smallBold">{sync.pct}%</ThemedText></View>
          <View><ThemedText type="small" themeColor="textSecondary">{sync.scanning ? 'ФАЙЛОВ' : 'СКОРОСТЬ'}</ThemedText><ThemedText type="smallBold">{sync.scanning ? sync.scanFiles : formatSpeed(sync.speed)}</ThemedText></View>
          <View><ThemedText type="small" themeColor="textSecondary">{sync.scanning ? 'ПРОШЛО' : 'ОСТАЛОСЬ'}</ThemedText><ThemedText type="smallBold">{formatDuration(sync.scanning ? sync.elapsed : sync.eta)}</ThemedText></View>
        </View>
        {!!sync.currentFile && (
          <View style={[styles.currentFile, { borderTopColor: theme.separator }]}>
            <SymbolView name="doc" tintColor={theme.textSecondary} size={15} />
            <ThemedText type="small" numberOfLines={2} style={{ flex: 1 }}>{sync.currentFile}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{sync.done}/{sync.total}</ThemedText>
          </View>
        )}
      </GlassCard>

      <GlassCard radius={Radius.lg} style={styles.editorsCard}>
        <View style={styles.sectionHead}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">Редакторы</ThemedText>
            <ThemedText type="small" themeColor={editorMessage ? 'text' : 'textSecondary'}>{editorMessage || (editors.length ? `Открыто: ${editors.length}` : 'Открытых редакторов нет')}</ThemedText>
          </View>
          {editorBusy
            ? <ActivityIndicator size="small" color={theme.tint} />
            : <TouchableOpacity onPress={refreshSelected} disabled={!selected?.online} hitSlop={10}><SymbolView name="arrow.clockwise" tintColor={selected?.online ? theme.tint : theme.textSecondary} size={20} /></TouchableOpacity>}
        </View>
        {editors.map((editor) => (
          <View key={`${editor.type}-${editor.pid}`} style={[styles.editorRow, { borderTopColor: theme.separator }]}>
            <View style={[styles.editorIcon, { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView name={editor.type === 'terminal' ? 'terminal.fill' : 'hammer.fill'} tintColor={theme.text} size={17} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" numberOfLines={1}>{editor.name}</ThemedText>
              {!!editor.title && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{editor.title}</ThemedText>}
            </View>
            <TouchableOpacity onPress={() => askClose([editor])} disabled={editorBusy} hitSlop={8}>
              <SymbolView name="xmark.circle.fill" tintColor={theme.danger} size={22} />
            </TouchableOpacity>
          </View>
        ))}
        {editors.length > 0 && (
          <TouchableOpacity
            disabled={editorBusy}
            onPress={() => askClose(editors, needsForce)}
            style={[styles.closeAll, { backgroundColor: needsForce ? `${theme.danger}18` : theme.backgroundSelected }]}>
            <SymbolView name={needsForce ? 'exclamationmark.triangle.fill' : 'xmark.app.fill'} tintColor={needsForce ? theme.danger : theme.text} size={18} />
            <ThemedText type="smallBold" themeColor={needsForce ? 'danger' : 'text'}>{needsForce ? 'Закрыть оставшиеся принудительно' : 'Закрыть все редакторы'}</ThemedText>
          </TouchableOpacity>
        )}
      </GlassCard>

      {sync.blocked.length > 0 && (
        <View style={[styles.blocked, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">Открытые файлы остановили передачу</ThemedText>
          {sync.blocked.slice(0, 5).map((file, index) => (
            <ThemedText key={`${file.file}-${index}`} type="small" themeColor="textSecondary" numberOfLines={2}>
              • {file.project ? `${file.project}: ` : ''}{file.file || file.reason}
            </ThemedText>
          ))}
          <TouchableOpacity onPress={() => sync.mode && run(sync.mode)} style={[styles.retryButton, { backgroundColor: theme.tint }]}>
            <SymbolView name="arrow.clockwise" tintColor="#fff" size={17} />
            <ThemedText type="smallBold" style={{ color: '#fff' }}>{retryLabel}</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  compactContent: { paddingTop: Spacing.three },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  devices: { gap: Spacing.two },
  deviceCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
  deviceIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { width: 9, height: 9, borderRadius: Radius.pill },
  compactDevice: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  routeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.three },
  routeNode: { flex: 1, minWidth: 0, alignItems: 'center', gap: Spacing.one },
  routeLine: { width: 52, height: 34, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.two },
  actionPrimary: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: Radius.md },
  actionSecondary: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
  actionIcon: { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.42 },
  progressCard: { padding: Spacing.three, gap: Spacing.three },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  track: { height: 7, overflow: 'hidden', borderRadius: Radius.pill },
  fill: { height: '100%', borderRadius: Radius.pill },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  currentFile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  editorsCard: { padding: Spacing.three, gap: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  editorRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  editorIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  closeAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, borderRadius: Radius.md, marginTop: Spacing.one },
  blocked: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  retryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, borderRadius: Radius.md, marginTop: Spacing.one },
});
