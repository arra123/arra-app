import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

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
  onSend: (photos: Photo[]) => void;
  title?: string;
};

const LIMIT = 30;
const COLUMNS = 3;

/**
 * Выбор последних фото — сеткой настоящих превью.
 *
 * Выделять можно и тапом, и протаскиванием пальца по сетке: подряд идущие
 * снимки набираются одним движением.
 */
export function RecentPhotosSheet({ visible, onClose, onSend, title = 'Последние фото' }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const scrollY = useRef(0);
  // Режим протаскивания: выделяем или снимаем — решает первая задетая ячейка.
  const dragAdds = useRef(true);
  const dragSeen = useRef(new Set<string>());

  const cell = (width - Spacing.three * 2 - Spacing.two * (COLUMNS - 1)) / COLUMNS;
  const step = cell + Spacing.two;

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

  const toggle = useCallback((id: string) => {
    haptic.select();
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  /** Ячейка под пальцем: сетка фиксированная, поэтому считаем по координатам. */
  const applyAt = useCallback((x: number, y: number, first: boolean) => {
    const column = Math.floor(x / step);
    const row = Math.floor((y + scrollY.current) / step);
    if (column < 0 || column >= COLUMNS || row < 0) return;
    const index = row * COLUMNS + column;
    const photo = photos[index];
    if (!photo || dragSeen.current.has(photo.id)) return;
    dragSeen.current.add(photo.id);
    setPicked((current) => {
      const has = current.includes(photo.id);
      if (first) dragAdds.current = !has;
      if (dragAdds.current) return has ? current : [...current, photo.id];
      return has ? current.filter((item) => item !== photo.id) : current;
    });
    haptic.select();
  }, [photos, step]);

  const dragSelect = Gesture.Pan()
    .minDistance(12)
    .onBegin(() => { dragSeen.current = new Set(); })
    .onStart((event) => { applyAt(event.x, event.y, true); })
    .onUpdate((event) => { applyAt(event.x, event.y, false); })
    .runOnJS(true);

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
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Тапни или проведи пальцем по нескольким снимкам подряд
          </ThemedText>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}>
            <GestureDetector gesture={dragSelect}>
              <View style={styles.gridInner}>
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
              </View>
            </GestureDetector>
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  scroll: { maxHeight: 400 },
  grid: { padding: Spacing.three },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
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
