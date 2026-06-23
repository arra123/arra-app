import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ViewerImage = { uri: string; headers?: Record<string, string> };

export function PhotoViewer({
  images,
  startIndex,
  onClose,
}: {
  images: ViewerImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(startIndex);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: startIndex * width, y: 0 }}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {images.map((im, i) => (
            <Pressable key={i} onPress={onClose} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={im} style={{ width, height: height * 0.9 }} contentFit="contain" />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onClose} style={[styles.close, { top: insets.top + 8 }]}>
          <SymbolView name="xmark" tintColor="#fff" size={20} />
        </Pressable>
        {images.length > 1 && (
          <View style={[styles.counter, { top: insets.top + 14 }]} pointerEvents="none">
            <Text style={styles.ct}>{idx + 1} / {images.length}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', alignSelf: 'center' },
  ct: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
});
