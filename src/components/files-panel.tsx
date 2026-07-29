import * as DocumentPicker from 'expo-document-picker';
import { MenuView } from '@expo/ui/community/menu';
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
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { GlassCard } from '@/components/glass-card';
import { AppleButton, AppleIconButton } from '@/components/apple-button';
import { DeviceSwitcher, type DeviceChoice } from '@/components/device-switcher';
import { PhotoViewer } from '@/components/photo-viewer';
import { RecentPhotosSheet } from '@/components/recent-photos-sheet';
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

type Device = DeviceChoice;

export function FilesPanel({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<FileRec[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [transferNotice, setTransferNotice] = useState<{ text: string; delivered: boolean } | null>(null);
  const [lastPicker, setLastPicker] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [pdf, setPdf] = useState<FileRec | null>(null);
  const { width: screenW } = useWindowDimensions();
  const col = (screenW - Spacing.three * 2 - Spacing.two * 2) / 3;

  useEffect(() => { getToken().then(setTok); }, []);

  useEffect(() => {
    if (!transferNotice || uploading) return;
    const timer = setTimeout(() => setTransferNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [transferNotice, uploading]);

  const load = useCallback(async () => {
    try {
      const [fileData, deviceData] = await Promise.all([
        api<{ files: FileRec[]; agentOnline: boolean }>('/files'),
        api<{ tokens: Device[] }>('/pc/tokens'),
      ]);
      setFiles(fileData.files);
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
      const result = JSON.parse(res.body || '{}');
      setTransferNotice({
        delivered: !!result.delivered,
        text: result.delivered ? 'Доставлено' : 'В очереди',
      });
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

  /** Самое свежее фото уходит сразу — самый частый сценарий. */
  async function sendLatestPhoto() {
    if (uploading) return;
    setUploading(true);
    setUploadLabel('Ищу последнее фото…');
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) { Alert.alert('Нужен доступ к фото'); return; }
      const result = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: 'photo', sortBy: [['creationTime', false]] });
      const asset = result.assets?.[0];
      if (!asset) { Alert.alert('Фото не нашлись'); return; }
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      await upload(info?.localUri || asset.uri, asset.filename || 'photo.jpg', 'image/jpeg');
    } catch (e: any) {
      Alert.alert('Не удалось отправить', e?.message || '');
    } finally {
      setUploading(false);
      setUploadLabel('');
    }
  }

  async function sendPickedPhotos(photos: { id: string; uri: string }[]) {
    if (uploading || !photos.length) return;
    setLastPicker(false);
    setUploading(true);
    try {
      const tk = await getToken();
      let deliveredAll = true;
      for (let index = 0; index < photos.length; index++) {
        setUploadLabel(`Отправляю ${index + 1} из ${photos.length}…`);
        // localUri нужен для iCloud-фото: asset.uri сам по себе может быть недоступен.
        const info = await MediaLibrary.getAssetInfoAsync(photos[index].id);
        const uri = info?.localUri || photos[index].uri;
        const target = deviceId ? `?targetTokenId=${encodeURIComponent(deviceId)}` : '';
        const result = await uploadAsync(`${API_URL}/files${target}`, uri, {
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          headers: tk ? { Authorization: `Bearer ${tk}` } : undefined,
        });
        if (result.status >= 400) throw new Error(`Не отправилось фото ${index + 1}`);
        const body = JSON.parse(result.body || '{}');
        deliveredAll = deliveredAll && !!body.delivered;
      }
      setTransferNotice({ delivered: deliveredAll, text: deliveredAll ? 'Доставлено' : 'В очереди' });
      await load();
    } catch (e: any) {
      Alert.alert('Не удалось отправить фото', e?.message || '');
    } finally {
      setUploading(false);
      setUploadLabel('');
    }
  }

  const selectedDevice = devices.find((device) => device.id === deviceId) || null;

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: embedded ? Spacing.one : insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}>
        {!embedded && <ThemedText type="title" style={styles.h1}>Передача</ThemedText>}

        <GlassCard radius={Radius.lg} style={styles.statusCard}>
          <View style={styles.statusTop}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.deviceName}>
              {selectedDevice?.name || 'Выберите устройство'}
            </ThemedText>
            <DeviceSwitcher
              devices={devices}
              value={deviceId}
              onChange={setDeviceId}
              compact
            />
          </View>
        </GlassCard>

        {/* Три действия в одну линию: одно последнее фото, выбор нескольких, всё остальное. */}
        <View style={styles.captureRow}>
          <AppleButton
            label="Последнее"
            systemImage="photo"
            variant="glass"
            onPress={() => void sendLatestPhoto()}
            disabled={uploading}
            size="regular"
            style={styles.captureWrap}
          />
          <AppleButton
            label="Выбрать"
            systemImage="square.grid.2x2"
            variant="glass"
            onPress={() => setLastPicker(true)}
            disabled={uploading}
            size="regular"
            style={styles.captureWrap}
          />
          <MenuView
            title="Что передать"
            actions={[
              { id: 'camera', title: 'Снять фото', image: 'camera.fill' },
              { id: 'gallery', title: 'Выбрать из галереи', image: 'photo.on.rectangle' },
              { id: 'file', title: 'Выбрать файл', image: 'doc.fill' },
            ]}
            onPressAction={(event) => {
              const action = event.nativeEvent.event;
              if (action === 'camera') void capture(true);
              else if (action === 'gallery') void capture(false);
              else if (action === 'file') void pickDocument();
            }}
            style={styles.addMenu}>
            <AppleIconButton
              label="Добавить"
              systemImage="plus"
              variant="prominent"
              disabled={uploading}
              size={44}
            />
          </MenuView>
        </View>

        <View style={styles.noticeSlot}>
          {uploading ? (
            <View style={styles.noticeContent}>
              <ActivityIndicator color={theme.tint} />
              <ThemedText type="small" themeColor="textSecondary">{uploadLabel || 'Отправляю…'}</ThemedText>
            </View>
          ) : transferNotice ? (
            <View style={[styles.noticeContent, styles.notice, { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView
                name={transferNotice.delivered ? 'checkmark.circle.fill' : 'clock.fill'}
                tintColor={transferNotice.delivered ? theme.success : theme.warning}
                size={18}
              />
              <ThemedText type="small">{transferNotice.text}</ThemedText>
            </View>
          ) : null}
        </View>

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

      <RecentPhotosSheet
        visible={lastPicker}
        onClose={() => setLastPicker(false)}
        onSend={(photos) => void sendPickedPhotos(photos)}
        title="Последние фото"
      />

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
  statusCard: { padding: Spacing.three },
  statusTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  deviceName: { flex: 1, minWidth: 0 },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  captureWrap: { flex: 1, minWidth: 0, paddingHorizontal: Spacing.two },
  addMenu: { width: 44, height: 44 },
  noticeSlot: { height: 20, alignItems: 'center', justifyContent: 'center' },
  noticeContent: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  notice: { alignSelf: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.md },
  empty: { textAlign: 'center', marginTop: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  gridItem: { borderRadius: Radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'rgba(120,120,128,0.12)' },
  gridImg: { width: '100%', height: '100%' },
  gridDoc: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  badge: { position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  pdfHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
});
