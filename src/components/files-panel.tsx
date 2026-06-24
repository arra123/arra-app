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
};

export function FilesPanel({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<FileRec[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [pdf, setPdf] = useState<FileRec | null>(null);
  const screenW = Dimensions.get('window').width;
  const col = (screenW - Spacing.three * 2 - Spacing.two * 2) / 3;

  useEffect(() => { getToken().then(setTok); }, []);

  const load = useCallback(async () => {
    try {
      const r = await api<{ files: FileRec[]; agentOnline: boolean }>('/files');
      setFiles(r.files);
      setAgentOnline(r.agentOnline);
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
    try {
      const tk = await getToken();
      const res = await uploadAsync(`${API_URL}/files`, uri, {
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

  async function sendLastPhoto() {
    if (uploading) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Нужен доступ к фото'); return; }
      const res = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: 'photo', sortBy: [['creationTime', false]] });
      const asset = res.assets?.[0];
      if (!asset) { Alert.alert('Фото не найдено'); return; }
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const uri = info.localUri || asset.uri;
      await upload(uri, asset.filename || `photo_${Date.now()}.jpg`, 'image/jpeg');
    } catch (e: any) {
      Alert.alert('Не удалось взять последнее фото', e?.message || '');
    }
  }

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
            <ThemedText type="smallBold">{agentOnline ? 'Компьютер на связи' : 'Компьютер офлайн'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {agentOnline ? 'Файл сразу уйдёт на компьютер' : 'Открой приложение на компьютере'}
            </ThemedText>
          </View>
        </GlassCard>

        {/* Кнопки захвата — компактные */}
        <View style={styles.captureRow}>
          <TouchableOpacity activeOpacity={0.85} style={styles.captureWrap} onPress={() => capture(true)} disabled={uploading}>
            <GlassView isInteractive tintColor={theme.accent} style={[styles.capture, { borderRadius: Radius.lg }]}>
              <SymbolView name="camera.fill" tintColor={theme.text} size={20} />
              <ThemedText type="small" style={{ fontWeight: '600' }}>Снять</ThemedText>
            </GlassView>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={styles.captureWrap} onPress={sendLastPhoto} disabled={uploading}>
            <GlassView isInteractive tintColor={theme.tint} style={[styles.capture, { borderRadius: Radius.lg }]}>
              <SymbolView name="bolt.fill" tintColor={theme.text} size={20} />
              <ThemedText type="small" style={{ fontWeight: '600' }}>Последнее</ThemedText>
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
            <ThemedText type="small" themeColor="textSecondary">Отправляю…</ThemedText>
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
});
