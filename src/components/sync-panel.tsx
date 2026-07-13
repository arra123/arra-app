import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

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
  verified: number;
  blocked: { project?: string; file?: string; reason?: string }[];
};

const WS_URL = API_URL.replace(/^http/, 'ws') + '/client';
const emptySync: SyncState = {
  busy: false, mode: null, pct: 0, speed: 0, eta: null, done: 0, total: 0,
  currentFile: '', phase: 'Готово к команде', message: '', error: '', verified: 0, blocked: [],
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

export function SyncPanel() {
  const theme = useTheme();
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<string | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>(emptySync);

  deviceRef.current = deviceId;
  const selected = devices.find((device) => device.id === deviceId) || null;

  useEffect(() => {
    let alive = true;

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
          setSync((current) => ({ ...current, busy: true, error: '', phase: message.message || 'Команда запущена' }));
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
  }, []);

  function applyEvent(event: any) {
    if (event.type === 'phase') {
      setSync((current) => ({ ...current, busy: true, phase: event.msg || current.phase, message: event.detail || '' }));
    } else if (event.type === 'plan') {
      setSync((current) => ({ ...current, busy: true, total: event.files || 0, phase: 'План передачи готов', message: `${event.files || 0} файлов` }));
    } else if (event.type === 'preflight') {
      setSync((current) => ({ ...current, busy: true, phase: 'Проверяю открытые файлы', done: event.checked || 0, total: event.total || current.total }));
    } else if (event.type === 'progress') {
      const pct = event.totalBytes ? Math.round((event.bytes || 0) / event.totalBytes * 100) : 0;
      setSync((current) => ({
        ...current, busy: true, pct, speed: event.speed || 0, eta: event.eta ?? null,
        done: event.done || 0, total: event.total || 0, currentFile: event.file || '',
        phase: event.direction === 'pull' ? 'Получаю с сервера' : 'Отправляю на сервер',
        message: event.project || event.scope || '', error: '',
      }));
    } else if (event.type === 'verify' || event.type === 'verify_progress') {
      setSync((current) => ({ ...current, busy: true, phase: 'Проверяю целостность', verified: event.verified || 0, done: event.done || 0, total: event.total || current.total }));
    } else if (event.type === 'blocked') {
      setSync((current) => ({ ...current, busy: false, blocked: event.files || [], error: event.error || 'Некоторые файлы открыты', phase: 'Нужна проверка' }));
      haptic.error();
    } else if (event.type === 'done') {
      setSync((current) => ({ ...current, busy: false, pct: 100, speed: 0, eta: 0, currentFile: '', verified: event.verified || event.transferred || 0, phase: event.msg || 'Синхронизация завершена', message: `${event.transferred || 0} файлов подтверждено`, error: '' }));
      haptic.success();
    } else if (event.type === 'error') {
      setSync((current) => ({ ...current, busy: false, error: event.error || 'Ошибка синхронизации', phase: 'Не удалось выполнить' }));
      haptic.error();
    }
  }

  function send(type: string) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== 1 || !deviceRef.current) return false;
    socket.send(JSON.stringify({ to: 'pc', deviceId: deviceRef.current, type, reqId: `sync-${Date.now()}` }));
    return true;
  }

  function run(mode: 'push' | 'pull' | 'status') {
    if (!selected?.online) {
      setSync((current) => ({ ...current, busy: false, error: 'Выбранный компьютер не в сети', phase: 'Команда не доставлена' }));
      return;
    }
    const type = mode === 'push' ? 'sync_remote_push' : mode === 'pull' ? 'sync_remote_pull' : 'sync_remote_status';
    setSync({ ...emptySync, busy: true, mode, phase: mode === 'push' ? 'Запускаю отправку…' : mode === 'pull' ? 'Запускаю получение…' : 'Проверяю изменения…' });
    if (!send(type)) setSync((current) => ({ ...current, busy: false, error: 'Нет связи с сервером', phase: 'Команда не отправлена' }));
    else haptic.press();
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: BottomTabInset + Spacing.five }]} showsVerticalScrollIndicator={false}>
      <View style={styles.deviceHeader}>
        <View>
          <ThemedText type="smallBold">Устройство</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Команда выполнится именно на выбранном компьютере</ThemedText>
        </View>
        {!connected && <ActivityIndicator size="small" color={theme.tint} />}
      </View>

      <View style={styles.devices}>
        {devices.map((device) => {
          const active = device.id === deviceId;
          return (
            <TouchableOpacity key={device.id} activeOpacity={0.8} onPress={() => { setDeviceId(device.id); setSync(emptySync); haptic.select(); }}
              style={[styles.deviceCard, { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement, borderColor: active ? theme.tint : theme.separator }]}>
              <View style={[styles.deviceIcon, { backgroundColor: active ? theme.tint : theme.backgroundSelected }]}>
                <SymbolView name={device.role === 'laptop' ? 'laptopcomputer' : 'desktopcomputer'} tintColor={active ? '#fff' : theme.text} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" numberOfLines={1}>{device.name || (device.role === 'laptop' ? 'Ноутбук' : 'ПК')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{device.online ? 'в сети' : 'не в сети'}{device.hostname ? ` · ${device.hostname}` : ''}</ThemedText>
              </View>
              <View style={[styles.onlineDot, { backgroundColor: device.online ? theme.success : theme.textSecondary }]} />
            </TouchableOpacity>
          );
        })}
      </View>

      <GlassCard radius={Radius.lg} style={styles.routeCard}>
        <View style={styles.routeNode}>
          <SymbolView name={selected?.role === 'laptop' ? 'laptopcomputer' : 'desktopcomputer'} tintColor={theme.text} size={24} />
          <ThemedText type="smallBold" numberOfLines={1}>{selected?.role === 'laptop' ? 'Ноутбук' : 'ПК'}</ThemedText>
        </View>
        <View style={styles.routeLine}>
          <SymbolView name="arrow.left.arrow.right" tintColor={theme.tint} size={18} />
        </View>
        <View style={styles.routeNode}>
          <SymbolView name="externaldrive.connected.to.line.below" tintColor={theme.success} size={24} />
          <ThemedText type="smallBold">Сервер</ThemedText>
        </View>
      </GlassCard>

      <View style={styles.actions}>
        <TouchableOpacity disabled={!selected?.online || sync.busy} onPress={() => run('push')} activeOpacity={0.82}
          style={[styles.actionPrimary, { backgroundColor: theme.tint }, (!selected?.online || sync.busy) && styles.disabled]}>
          <SymbolView name="arrow.up.to.line" tintColor="#fff" size={20} />
          <View style={{ flex: 1 }}><ThemedText type="smallBold" style={{ color: '#fff' }}>Отправить на сервер</ThemedText><ThemedText type="small" style={{ color: '#fff', opacity: 0.72 }}>Закончил работу на этом устройстве</ThemedText></View>
        </TouchableOpacity>
        <TouchableOpacity disabled={!selected?.online || sync.busy} onPress={() => run('pull')} activeOpacity={0.82}
          style={[styles.actionSecondary, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }, (!selected?.online || sync.busy) && styles.disabled]}>
          <SymbolView name="arrow.down.to.line" tintColor={theme.success} size={20} />
          <View style={{ flex: 1 }}><ThemedText type="smallBold">Забрать с сервера</ThemedText><ThemedText type="small" themeColor="textSecondary">Продолжить работу на этом устройстве</ThemedText></View>
        </TouchableOpacity>
      </View>

      <GlassCard radius={Radius.lg} style={styles.progressCard}>
        <View style={styles.progressHead}>
          <View style={{ flex: 1 }}><ThemedText type="smallBold">{sync.phase}</ThemedText><ThemedText type="small" themeColor={sync.error ? 'danger' : 'textSecondary'} numberOfLines={2}>{sync.error || sync.message || (selected?.online ? 'Можно запускать синхронизацию' : 'Открой Noda на компьютере')}</ThemedText></View>
          {sync.busy ? <ActivityIndicator color={theme.tint} /> : <TouchableOpacity onPress={() => run('status')} disabled={!selected?.online}><SymbolView name="arrow.clockwise" tintColor={selected?.online ? theme.tint : theme.textSecondary} size={21} /></TouchableOpacity>}
        </View>
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}><View style={[styles.fill, { width: `${sync.pct}%`, backgroundColor: sync.error ? theme.danger : theme.success }]} /></View>
        <View style={styles.metrics}>
          <View><ThemedText type="small" themeColor="textSecondary">ПРОГРЕСС</ThemedText><ThemedText type="smallBold">{sync.pct}%</ThemedText></View>
          <View><ThemedText type="small" themeColor="textSecondary">СКОРОСТЬ</ThemedText><ThemedText type="smallBold">{formatSpeed(sync.speed)}</ThemedText></View>
          <View><ThemedText type="small" themeColor="textSecondary">ОСТАЛОСЬ</ThemedText><ThemedText type="smallBold">{formatEta(sync.eta)}</ThemedText></View>
        </View>
        {!!sync.currentFile && <View style={[styles.currentFile, { borderTopColor: theme.separator }]}><SymbolView name="doc" tintColor={theme.textSecondary} size={15} /><ThemedText type="small" numberOfLines={2} style={{ flex: 1 }}>{sync.currentFile}</ThemedText><ThemedText type="small" themeColor="textSecondary">{sync.done}/{sync.total}</ThemedText></View>}
      </GlassCard>

      {sync.blocked.length > 0 && (
        <View style={[styles.blocked, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" themeColor="danger">Открытые файлы не дают начать</ThemedText>
          {sync.blocked.slice(0, 5).map((file, index) => <ThemedText key={`${file.file}-${index}`} type="small" themeColor="textSecondary" numberOfLines={2}>• {file.project ? `${file.project}: ` : ''}{file.file || file.reason}</ThemedText>)}
          <ThemedText type="small">Открой «ПК → Экран», сохрани изменения и закрой указанный редактор, затем повтори.</ThemedText>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  devices: { gap: Spacing.two },
  deviceCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
  deviceIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { width: 9, height: 9, borderRadius: Radius.pill },
  routeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.three },
  routeNode: { flex: 1, minWidth: 0, alignItems: 'center', gap: Spacing.one },
  routeLine: { width: 52, height: 34, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.two },
  actionPrimary: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: Radius.md },
  actionSecondary: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
  disabled: { opacity: 0.42 },
  progressCard: { padding: Spacing.three, gap: Spacing.three },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  track: { height: 7, overflow: 'hidden', borderRadius: Radius.pill },
  fill: { height: '100%', borderRadius: Radius.pill },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  currentFile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  blocked: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
});

