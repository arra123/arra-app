import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type Photo = { id: string; uri: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Выбранные фото по порядку нажатия — от первого к последнему. */
  onSend: (photos: { id: string; uri: string }[]) => void;
  title?: string;
};

const LIMIT = 30;

/**
 * Выбор последних фото — сеткой настоящих превью.
 *
 * Раньше здесь крутили колесо «1 фото / 2 фото», и было не видно, что именно
 * уедет на компьютер.
 */
export function RecentPhotosSheet({ visible, onClose, onSend, title = 'Последние фото' }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const cell = (width - Spacing.three * 2 - Spacing.two * 2) / 3;

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) { setDenied(true); return; }
      const result = await MediaLibrary.getAssetsAsync({
        first: LIMIT,
        mediaType: 'photo',
        sortBy: [['creationTime', false]],
      });
      setPhotos((result.assets || []).map((asset) => ({ id: asset.id, uri: asset.uri })));
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setPicked([]);
    load();
  }, [visible, load]);

  function toggle(id: string) {
    haptic.select();
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function send() {
    const chosen = picked
      .map((id) => photos.find((photo) => photo.id === id))
      .filter((photo): photo is Photo => !!photo);
    if (chosen.length) onSend(chosen);
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      rightLabel={picked.length ? `Отправить · ${picked.length}` : 'Отправить'}
      onRight={send}
      rightDisabled={!picked.length}>
      {denied ? (
        <View style={styles.state}>
          <SymbolView name="photo.badge.exclamationmark" tintColor={theme.textSecondary} size={30} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.stateText}>
            Нет доступа к фото. Разреши его в настройках iPhone — «Noda → Фото».
          </ThemedText>
        </View>
      ) : loading ? (
        <View style={styles.state}><ActivityIndicator color={theme.tint} /></View>
      ) : photos.length === 0 ? (
        <View style={styles.state}><ThemedText type="small" themeColor="textSecondary">Фото не нашлись</ThemedText></View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {photos.map((photo) => {
            const index = picked.indexOf(photo.id);
            const on = index >= 0;
            return (
              <Pressable
                key={photo.id}
                onPress={() => toggle(photo.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.cell, { width: cell, height: cell, borderColor: on ? theme.tint : 'transparent' }]}>
                <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" />
                <View style={[styles.mark, { backgroundColor: on ? theme.tint : 'rgba(12,16,24,0.42)', borderColor: on ? theme.tint : 'rgba(255,255,255,0.7)' }]}>
                  {on && <ThemedText style={styles.markText}>{index + 1}</ThemedText>}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, padding: Spacing.three },
  cell: { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 2, backgroundColor: 'rgba(120,120,128,0.14)' },
  image: { width: '100%', height: '100%' },
  mark: {
    position: 'absolute',
    right: 6,
    top: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  markText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  state: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six, paddingHorizontal: Spacing.four },
  stateText: { textAlign: 'center' },
});
