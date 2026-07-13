import * as DocumentPicker from 'expo-document-picker';
import { GlassView } from 'expo-glass-effect';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { GlassCard } from '@/components/glass-card';
import { PhotoViewer } from '@/components/photo-viewer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, getToken } from '@/lib/api';

type FileRec = {
  id: string;
  original_name: string;
  mime: string | null;
  size: number | null;
  status: 'uploaded' | 'delivered';
  created_at: string;
  target_token_id?: string | null;
};

type Device = {
  id: string;
  name: string;
  role?: 'laptop' | 'pc' | null;
  hostname?: string | null;
  online: boolean;
};

export function FilesPanel({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<FileRec[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [lastPicker, setLastPicker] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [pdf, setPdf] = useState<FileRec | null>(null);
  const screenW = Dimensions.get('window').width;
  const col = (screenW - Spacing.three * 2 - Spacing.two * 2) / 3;

  useEffect(() => { getToken().then(setTok); }, []);

  const load = useCallback(async () => {
    try {
      const [fileData, deviceData] = await Promise.all([
        api<{ files: FileRec[]; agentOnline: boolean }>('/files'),
        api<{ tokens: Device[] }>('/pc/tokens'),
      ]);
      setFiles(fileData.files);
      setAgentOnline(fileData.agentOnline);
      setDevices(deviceData.tokens || []);
      setDeviceId((current) => {
        if (current && (deviceData.tokens || []).some((device) => device.id === current)) return current;
        return (deviceData.tokens || []).find((device) => device.online)?.id || deviceData.tokens?.[0]?.id || null;
      });
    } catch {
      /* тихо */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function upload(uri: string, _name: string, _type: string) {
    setUploading(true);
    setUploadLabel('Отправляю файл…');
    try {
      const tk = await getToken();
      const target = deviceId ? `?targetTokenId=${encodeURIComponent(deviceId)}` : '';
      const res = await uploadAsync(`${API_URL}/files${target}`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        headers: tk ? { Authorization: `Bearer ${tk}` } : undefined,
      });
      if (res.status >= 400) throw new Error('Сервер вернул ошибку ' + res.status);
      await load();
    } catch (e: any) {
      Alert.alert('Не удалось отправить', e?.message || '');
    } finally {
      setUploading(false);
      setUploadLabel('');
    }
  }

  async function capture(fromCamera: boolean) {
    if (uploading) return;
    if (fromCamera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Нужен доступ к камере'); return; }
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images', 'videos'] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const name = a.fileName || `file_${Date.now()}.${(a.mimeType || 'image/jpeg').split('/')[1]}`;
    await upload(a.uri, name, a.mimeType || 'image/jpeg');
  }

  async function pickDocument() {
    if (uploading) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await upload(a.uri, a.name || `file_${Date.now()}`, a.mimeType || 'application/octet-stream');
    } catch (e: any) {
      Alert.alert('Не удалось выбрать файл', e?.message || '');
    }
  }

  async function sendLastPhotos(count: number) {
    if (uploading) return;
    setLastPicker(false);
    setUploading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Нужен доступ к фото'); return; }
      setUploadLabel('Ищу последние фото…');
      const res = await MediaLibrary.getAssetsAsync({ first: count, mediaType: 'photo', sortBy: [['creationTime', false]] });
      const assets = res.assets?.slice(0, count) || [];
      if (!assets.length) { Alert.alert('Фото не найдены'); return; }
      const tk = await getToken();
      for (let index = 0; index < assets.length; index++) {
        const asset = assets[index];
        setUploadLabel(`Отправляю ${index + 1} из ${assets.length}…`);
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = info.localUri || asset.uri;
        const target = deviceId ? `?targetTokenId=${encodeURIComponent(deviceId)}` : '';
        const result = await uploadAsync(`${API_URL}/files${target}`, uri, {
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          headers: tk ? { Authorization: `Bearer ${tk}` } : undefined,
        });
        if (result.status >= 400) throw new Error(`Не отправилось фото ${index + 1}`);
      }
      await load();
    } catch (e: any) {
      Alert.alert('Не удалось отправить последние фото', e?.message || '');
    } finally {
      setUploading(false);
      setUploadLabel('');
    }
  }

  const selectedDevice = devices.find((device) => device.id === deviceId) || null;
  const targetOnline = selectedDevice ? selectedDevice.online : agentOnline;

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: embedded ? Spacing.one : insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}>
        {!embedded && <ThemedText type="title" style={styles.h1}>Файлы</ThemedText>}

        <GlassCard radius={Radius.lg} style={styles.statusCard}>
          <View style={[styles.dot, { backgroundColor: agentOnline ? theme.success : theme.textSecondary }]} />
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">{selectedDevice?.name || (targetOnline ? 'Компьютер на связи' : 'Компьютер офлайн')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {targetOnline ? 'Файл сразу уйдёт на выбранное устройство' : 'Открой Noda на выбранном устройстве'}
            </ThemedText>
          </View>
        </GlassCard>

        {devices.length > 1 && (
          <View style={styles.deviceRow}>
            {devices.map((device) => {
              const active = device.id === deviceId;
              return (
                <TouchableOpacity key={device.id} activeOpacity={0.8} onPress={() => setDeviceId(device.id)}
                  style={[styles.deviceChoice, { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement, borderColor: active ? theme.tint : theme.separator }]}>
                  <SymbolView name={device.role === 'laptop' ? 'laptopcomputer' : 'desktopcomputer'} tintColor={active ? theme.tint : theme.textSecondary} size={17} />
                  <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>{device.role === 'laptop' ? 'Ноутбук' : 'ПК'}</ThemedText>
                  <View style={[styles.deviceDot, { backgroundColor: device.online ? theme.success : theme.textSecondary }]} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Быстрые источники. Камеру убрали: основной сценарий — уже снятые фото. */}
        <View style={styles.captureRow}>
          <TouchableOpacity activeOpacity={0.85} style={styles.captureWrap} onPress={() => setLastPicker(true)} disabled={uploading}>
            <GlassView isInteractive tintColor={theme.tint} style={[styles.capture, { borderRadius: Radius.lg }]}>
              <SymbolView name="photo.stack.fill" tintColor={theme.text} size={20} />
              <ThemedText type="small" style={{ fontWeight: '600' }}>Последние фото</ThemedText>
            </GlassView>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={styles.captureWrap} onPress={() => capture(false)} disabled={uploading}>
            <GlassView isInteractive tintColor={theme.tint} style={[styles.capture, { borderRadius: Radius.lg }]}>
              <SymbolView name="photo.on.rectangle" tintColor={theme.text} size={20} />
              <ThemedText type="small" style={{ fontWeight: '600' }}>Галерея</ThemedText>
            </GlassView>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={styles.captureWrap} onPress={pickDocument} disabled={uploading}>
            <GlassView isInteractive tintColor={theme.tint} style={[styles.capture, { borderRadius: Radius.lg }]}>
              <SymbolView name="doc.fill" tintColor={theme.text} size={20} />
              <ThemedText type="small" style={{ fontWeight: '600' }}>Файл</ThemedText>
            </GlassView>
          </TouchableOpacity>
        </View>

        {uploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={theme.tint} />
            <ThemedText type="small" themeColor="textSecondary">{uploadLabel || 'Отправляю…'}</ThemedText>
          </View>
        )}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.h2}>Недавние</ThemedText>
        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.four }} />
        ) : files.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>Пока пусто</ThemedText>
        ) : (
          <View style={styles.grid}>
            {files.map((f) => {
              const isImg = (f.mime || '').startsWith('image');
              const delivered = f.status === 'delivered';
              return (
                <TouchableOpacity
                  key={f.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    const isPdf = (f.mime || '').includes('pdf') || (f.original_name || '').toLowerCase().endsWith('.pdf');
                    if (isImg) {
                      const imgs = files.filter((x) => (x.mime || '').startsWith('image'));
                      const idx = imgs.findIndex((x) => x.id === f.id);
                      if (idx >= 0) setViewer(idx);
                    } else if (isPdf) {
                      setPdf(f);
                    }
                  }}
                  style={[styles.gridItem, { width: col, height: col, borderColor: theme.separator }]}>
                  {isImg && token ? (
                    <Image
                      source={{ uri: `${API_URL}/files/${f.id}/download`, headers: { Authorization: `Bearer ${token}` } }}
                      style={styles.gridImg}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.gridDoc}>
                      <SymbolView name={(f.mime || '').startsWith('video') ? 'film' : 'doc.fill'} tintColor={theme.textSecondary} size={26} />
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ maxWidth: '90%' }}>
                        {(f.original_name || '').split('.').pop()?.toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.badge}>
                    <SymbolView name={delivered ? 'checkmark.circle.fill' : 'clock'} tintColor={delivered ? theme.success : '#fff'} size={16} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {viewer !== null && token && (
        <PhotoViewer
          images={files.filter((x) => (x.mime || '').startsWith('image')).map((x) => ({
            uri: `${API_URL}/files/${x.id}/download`,
            headers: { Authorization: `Bearer ${token}` },
          }))}
          startIndex={viewer}
          onClose={() => setViewer(null)}
        />
      )}

      <Modal visible={lastPicker} transparent animationType="fade" onRequestClose={() => setLastPicker(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setLastPicker(false)}>
          <Pressable style={[styles.lastSheet, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <ThemedText style={styles.sheetTitle}>Сколько последних фото отправить?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Фото пойдут на выбранный компьютер по порядку — от самого нового.</ThemedText>
            <View style={styles.countGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity key={n} activeOpacity={0.75} onPress={() => sendLastPhotos(n)} style={[styles.countBtn, { backgroundColor: n === 1 ? theme.tint : theme.backgroundSelected }]}>
                  <ThemedText style={{ color: n === 1 ? '#fff' : theme.text, fontWeight: '700' }}>{n}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setLastPicker(false)} style={styles.sheetCancel}>
              <ThemedText type="smallBold" themeColor="textSecondary">Отмена</ThemedText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Просмотр PDF прямо в приложении */}
      <Modal visible={!!pdf} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPdf(null)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={styles.pdfHead}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>{pdf?.original_name || 'Документ'}</ThemedText>
            <TouchableOpacity onPress={() => setPdf(null)} hitSlop={10}>
              <SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={28} />
            </TouchableOpacity>
          </View>
          {pdf && token && (
            <WebView
              source={{ uri: `${API_URL}/files/${pdf.id}/download`, headers: { Authorization: `Bearer ${token}` } }}
              style={{ flex: 1, backgroundColor: theme.background }}
              startInLoadingState
              renderLoading={() => <ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} />}
            />
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  h1: { fontSize: 34, lineHeight: 40, marginTop: Spacing.two },
  h2: { marginLeft: 4 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  deviceRow: { flexDirection: 'row', gap: Spacing.two },
  deviceChoice: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  deviceDot: { width: 8, height: 8, borderRadius: Radius.pill },
  dot: { width: 12, height: 12, borderRadius: Radius.pill },
  captureRow: { flexDirection: 'row', gap: Spacing.two },
  captureWrap: { flex: 1 },
  capture: { height: 72, alignItems: 'center', justifyContent: 'center', gap: 5, overflow: 'hidden' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  gridItem: { borderRadius: Radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.04)' },
  gridImg: { width: '100%', height: '100%' },
  gridDoc: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  badge: { position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  pdfHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  lastSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.five, gap: Spacing.two },
  sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: Spacing.two },
  sheetTitle: { fontSize: 21, fontWeight: '700', lineHeight: 27 },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  countBtn: { width: '18%', aspectRatio: 1, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  sheetCancel: { alignItems: 'center', paddingVertical: 12, marginTop: Spacing.one },
});
