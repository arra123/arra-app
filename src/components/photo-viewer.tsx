import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ViewerImage = { uri: string; headers?: Record<string, string> };

const DISMISS_DISTANCE = 96;

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
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const dismissY = useSharedValue(0);

  useEffect(() => {
    setIdx(startIndex);
    dismissY.value = 0;
  }, [startIndex, dismissY]);

  const dismissGesture = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      dismissY.value = event.translationY;
    })
    .onEnd((event) => {
      const shouldClose = Math.abs(event.translationY) > DISMISS_DISTANCE || Math.abs(event.velocityY) > 780;
      if (shouldClose) {
        const direction = event.translationY >= 0 ? 1 : -1;
        dismissY.value = withTiming(direction * height, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        dismissY.value = withSpring(0, { damping: 24, stiffness: 260 });
      }
    });
  const viewerGesture = Gesture.Simultaneous(dismissGesture, Gesture.Native());
  const webPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2
    ),
    onPanResponderMove: (_, gesture) => {
      dismissY.value = gesture.dy;
    },
    onPanResponderRelease: (_, gesture) => {
      const shouldClose = Math.abs(gesture.dy) > DISMISS_DISTANCE || Math.abs(gesture.vy) > 0.78;
      if (shouldClose) {
        const direction = gesture.dy >= 0 ? 1 : -1;
        dismissY.value = withTiming(direction * height, { duration: 180 });
        setTimeout(onClose, 180);
      } else {
        dismissY.value = withSpring(0, { damping: 24, stiffness: 260 });
      }
    },
    onPanResponderTerminate: () => {
      dismissY.value = withSpring(0, { damping: 24, stiffness: 260 });
    },
  }), [dismissY, height, onClose]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dismissY.value), [0, height * 0.65], [1, 0.3], 'clamp'),
    transform: [{ translateY: dismissY.value }],
  }));
  const stage = (
    <Animated.View
      style={[styles.stage, stageStyle]}
      {...(Platform.OS === 'web' ? webPanResponder.panHandlers : {})}>
      <FlatList
        data={images}
        keyExtractor={(image, index) => `${index}:${image.uri}`}
        horizontal
        pagingEnabled
        directionalLockEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          setIdx(Math.max(0, Math.min(images.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))));
        }}
        renderItem={({ item: image, index }) => {
          const key = `${index}:${image.uri}`;
          const isLoaded = !!loaded[key];
          const hasFailed = !!failed[key];
          return (
            <View style={[styles.page, { width, height }]}>
              {!isLoaded && !hasFailed && <ActivityIndicator color="#FFFFFF" size="large" />}
              <Image
                source={image}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={120}
                recyclingKey={key}
                onLoad={() => setLoaded((current) => ({ ...current, [key]: true }))}
                onError={() => setFailed((current) => ({ ...current, [key]: true }))}
              />
              {hasFailed && (
                <View style={styles.error}>
                  <SymbolView name="photo.badge.exclamationmark" tintColor="#FFFFFF" size={30} />
                  <Text style={styles.errorText}>Фото не удалось открыть</Text>
                </View>
              )}
            </View>
          );
        }}
      />
    </Animated.View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}>
      <View style={styles.root}>
        {Platform.OS === 'web' ? stage : <GestureDetector gesture={viewerGesture}>{stage}</GestureDetector>}

        <Pressable onPress={onClose} style={[styles.close, { top: insets.top + 8 }]} accessibilityLabel="Закрыть фото">
          <SymbolView name="xmark" tintColor="#FFFFFF" size={19} />
        </Pressable>
        {images.length > 1 && (
          <View style={[styles.counter, { top: insets.top + 14 }]} pointerEvents="none">
            <Text style={styles.counterText}>{idx + 1} / {images.length}</Text>
          </View>
        )}
        <View style={[styles.hint, { bottom: insets.bottom + 14 }]} pointerEvents="none">
          <Text style={styles.hintText}>Смахни вверх или вниз, чтобы закрыть</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0B0E' },
  stage: { flex: 1 },
  page: { alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.28)' },
  counterText: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '600' },
  hint: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.34)' },
  hintText: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '500' },
  error: { alignItems: 'center', gap: 10 },
  errorText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
