import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Modal, StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ara } from '@/ara/client';
import { baseName, isAudioPath } from '@/ara/format';
import type { FileScope, RemoteFile } from '@/ara/types';
import { IconButton, Press, T } from '@/components/ui';
import { MenuTrigger } from '@/components/glass-menu';
import { Colors, Radius } from '@/constants/theme';
import { setVideoReview, type VideoReview } from '@/ara/video-reviews';

/** Файл с компьютера: просим ara-link загрузить его на сервер и получаем ссылку. */
function useRemoteFile(path: string, scope: FileScope) {
  const scopeKey = 'agentKey' in scope ? scope.agentKey : scope.chatId;
  const [state, setState] = useState<{ file: RemoteFile | null; error: string | null; attempt: number }>({ file: null, error: null, attempt: 0 });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, file: null, error: null }));
    ara.file(path, 'agentKey' in scope ? { agentKey: scopeKey } : { chatId: scopeKey })
      .then((file) => alive && setState((s) => ({ ...s, file })))
      .catch((error: Error) => alive && setState((s) => ({ ...s, error: error.message })));
    return () => {
      alive = false;
    };
    // scope пересоздаётся на каждом рендере — зависим от его ключа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, scopeKey, state.attempt]);
  return {
    ...state,
    retry: () => {
      ara.forgetFile(path, 'agentKey' in scope ? { agentKey: scopeKey } : { chatId: scopeKey });
      setState((s) => ({ ...s, attempt: s.attempt + 1 }));
    },
    /** Ссылка не загрузилась: файл на сервере мог устареть — один раз просим компьютер заново. */
    broken: () => {
      ara.forgetFile(path, 'agentKey' in scope ? { agentKey: scopeKey } : { chatId: scopeKey });
      setState((s) => (s.attempt < 1 ? { file: null, error: null, attempt: s.attempt + 1 } : { ...s, file: null, error: 'Не открылась' }));
    },
  };
}

function Failed({ error, onRetry, name }: { error: string; onRetry: () => void; name: string }) {
  return (
    <Press onPress={onRetry} style={styles.failed} accessibilityLabel="Повторить загрузку">
      <SymbolView name="arrow.clockwise" size={16} tintColor={Colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <T v="footnote" numberOfLines={1}>{name}</T>
        <T v="caption" color={Colors.textSecondary} numberOfLines={2}>{error}</T>
      </View>
    </Press>
  );
}

/** Картинка из переписки: миниатюра, по нажатию — на весь экран с зумом. */
export function RemoteImage({ path, scope, size = 180, square = false }: { path: string; scope: FileScope; size?: number; square?: boolean }) {
  const { file, error, retry, broken } = useRemoteFile(path, scope);
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(4 / 3);
  if (error) return <Failed error={error} onRetry={retry} name={baseName(path)} />;
  const width = square ? size : Math.min(size * ratio, 280);
  return (
    <>
      <Press onPress={() => file && setOpen(true)} scaleTo={0.98} accessibilityLabel={`Картинка ${baseName(path)}`} style={[styles.thumb, { width, height: square ? size : width / ratio }]}>
        {file ? (
          <Image
            source={{ uri: file.url, headers: ara.authHeaders() }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            recyclingKey={file.url}
            onLoad={(e) => !square && e.source.width && setRatio(Math.max(0.5, Math.min(2.2, e.source.width / e.source.height)))}
            onError={broken}
          />
        ) : (
          <ActivityIndicator color={Colors.textSecondary} />
        )}
      </Press>
      {file ? <ImageViewer uri={file.url} headers={ara.authHeaders()} visible={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Фото, которое лежит на самом телефоне (отправленное в чат). */
export function LocalImage({ uri, size = 120 }: { uri: string; size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Press onPress={() => setOpen(true)} scaleTo={0.98} accessibilityLabel="Фото" style={[styles.thumb, { width: size, height: size }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Press>
      <ImageViewer uri={uri} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Видео из переписки: грузится с компьютера и играет прямо в ленте. */
export function RemoteVideo({ path, scope, size }: { path: string; scope: FileScope; size?: number }) {
  const { file, error, retry } = useRemoteFile(path, scope);
  const { width } = useWindowDimensions();
  const w = size || Math.min(width - 64, 360);
  if (error) return <Failed error={error} onRetry={retry} name={baseName(path)} />;
  if (isAudioPath(path)) return file
    ? <AudioPlayerView uri={file.url} name={baseName(path)} onRetry={retry} />
    : <View style={styles.audio}><ActivityIndicator color={Colors.textSecondary} /><T v="caption">Загружаю {baseName(path)}…</T></View>;
  return (
    <View style={[styles.video, { width: w, height: w * 0.5625 + 44 }]}>
      {file ? (
        <VideoPlayerView uri={file.url} path={path} scope={scope} />
      ) : (
        <View style={styles.videoLoading}>
          <ActivityIndicator color={Colors.textSecondary} />
          <T v="caption" color={Colors.textSecondary} numberOfLines={1}>Загружаю {baseName(path)}…</T>
        </View>
      )}
    </View>
  );
}

function AudioPlayerView({ uri, name, onRetry }: { uri: string; name: string; onRetry: () => void }) {
  const player = useAudioPlayer({ uri, headers: ara.authHeaders() }, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // iOS emits the failure once, then periodic status resets error to null.
    // Keep retry visible until this player is replaced by a fresh remote file.
    if (status.error) setError('Не удалось загрузить аудио. Повторите загрузку.');
  }, [status.error]);
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  async function toggle() {
    try {
      if (status.playing) { player.pause(); return; }
      await setAudioModeAsync({ playsInSilentMode: true });
      if (status.didJustFinish || status.duration > 0 && status.currentTime >= status.duration) await player.seekTo(0);
      player.play();
    } catch { setError('Не удалось воспроизвести аудио. Нажмите, чтобы загрузить заново.'); }
  }
  if (error || status.error) return <Failed error={error || 'Не удалось загрузить аудио. Повторите загрузку.'} name={name} onRetry={onRetry} />;
  return <View style={styles.audio}>
    <Press onPress={toggle} disabled={!status.isLoaded} accessibilityRole="button" accessibilityLabel={`${status.playing ? 'Пауза' : 'Воспроизвести'}: ${name}`} style={styles.audioPlay}>
      {status.isLoaded ? <SymbolView name={status.playing ? 'pause.fill' : 'play.fill'} size={20} tintColor={Colors.text} /> : <ActivityIndicator color={Colors.textSecondary} />}
    </Press>
    <View style={{ flex: 1, gap: 6 }}>
      <T v="footnote" numberOfLines={1}>{name}</T>
      <T v="caption" color={Colors.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>{time(status.currentTime)} / {time(status.duration)}</T>
      <View style={styles.audioTrack} accessibilityLabel={`Прослушано ${Math.round(status.currentTime)} из ${Math.round(status.duration)} секунд`}>
        <View style={[styles.audioProgress, { width: `${status.duration > 0 ? Math.min(100, status.currentTime / status.duration * 100) : 0}%` }]} />
      </View>
    </View>
  </View>;
}

function VideoPlayerView({ uri, path, scope }: { uri: string; path?: string; scope?: FileScope }) {
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [strokes, setStrokes] = useState<VideoReview['strokes']>([]);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  const review = useRef<VideoReview | null>(null);
  const strokeRef = useRef<VideoReview['strokes']>([]);
  const player = useVideoPlayer({ uri, headers: ara.authHeaders() }, (p) => {
    p.loop = false;
    p.preservesPitch = true;
  });
  function annotate() {
    player.pause(); setOpen(true); setDrawing(true); setStrokes([]); strokeRef.current = [];
    review.current = {id: `${Date.now().toString(16).padStart(16, '0')}${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(16, '0')}`,
      source: path || uri, seconds: player.currentTime, size, strokes: []};
  }
  function save() {
    if (scope && review.current) setVideoReview(scope, {...review.current, size, strokes: strokeRef.current});
  }
  function point(event: GestureResponderEvent): [number, number] {
    return [Math.max(0, Math.min(1, event.nativeEvent.locationX / size[0])), Math.max(0, Math.min(1, event.nativeEvent.locationY / size[1]))];
  }
  function update(next: VideoReview['strokes']) { strokeRef.current = next; setStrokes(next); }
  const video = (editing: boolean) => <View style={{ flex: 1 }} onLayout={e => editing && setSize([e.nativeEvent.layout.width, e.nativeEvent.layout.height])}>
    <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={!drawing} contentFit="contain"
      fullscreenOptions={{ enable: !drawing }} allowsPictureInPicture={!drawing} />
    {!drawing ? <MenuTrigger label={`Скорость видео ${playbackRate}×, изменить`}
      sections={[{ title: 'Скорость видео', items: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => ({
        label: `${rate}×`, checked: rate === playbackRate,
        onPress: () => { player.playbackRate = rate; setPlaybackRate(rate); },
      })) }]}
      style={{ position: 'absolute', top: 8, right: 8, minWidth: 52, minHeight: 44, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#000b' }}>
      <T v="footnote" color="#fff">{playbackRate}×</T>
    </MenuTrigger> : null}
    {editing && drawing ? <View style={StyleSheet.absoluteFill} accessibilityLabel="Рисунок на остановленном кадре"
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onResponderGrant={e => update([...strokeRef.current, [point(e)]])}
      onResponderMove={e => {
        const s = strokeRef.current;
        if (s.length && s[s.length - 1].length < 10000) update([...s.slice(0, -1), [...s[s.length - 1], point(e)]]);
      }} onResponderRelease={save} onResponderTerminate={save}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {strokes.flatMap((stroke, si) => stroke.map((p, pi) => {
          const previous = stroke[Math.max(0, pi - 1)];
          const dx = (p[0] - previous[0]) * size[0], dy = (p[1] - previous[1]) * size[1];
          const length = Math.max(3, Math.hypot(dx, dy));
          return <View key={`${si}:${pi}`} style={{ position: 'absolute', left: (p[0] + previous[0]) / 2 * size[0] - length / 2,
            top: (p[1] + previous[1]) / 2 * size[1] - 1.5, width: length, height: 3, borderRadius: 2, backgroundColor: '#ff514f',
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
        }))}
      </View>
    </View> : null}
  </View>;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
      {!open ? video(false) : <View style={{ flex: 1 }} />}
      {scope && path ? <Press onPress={annotate} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12 }} accessibilityLabel="Поставить видео на паузу и нарисовать правку">
        <T v="caption">Пауза и рисунок на кадре</T>
      </Press> : null}
      <Modal visible={open} onRequestClose={() => { save(); setOpen(false); setDrawing(false); }} animationType="fade">
        <View style={{ flex: 1, backgroundColor: Colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={{ height: Math.max(180, dimensions.height - insets.top - insets.bottom - 144) }}>{video(true)}</View>
          <View style={{ padding: 16, gap: 12 }}>
            <T v="caption">{drawing ? 'Рисуй пальцем или мышью. Кадр прикрепится к сообщению.' : 'Продолжай смотреть или отметь другой кадр.'}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              <Press onPress={() => { save(); setDrawing(false); player.play(); }} accessibilityLabel="Продолжить видео"><T>Продолжить</T></Press>
              <Press onPress={annotate} accessibilityLabel="Новая правка на текущем кадре"><T>Рисовать</T></Press>
              <Press disabled={!drawing || !strokes.length} onPress={() => { update(strokeRef.current.slice(0, -1)); save(); }} accessibilityLabel="Отменить последний штрих"><T>Отменить штрих</T></Press>
              <Press onPress={() => { save(); player.pause(); setOpen(false); setDrawing(false); }} accessibilityLabel="Вернуться к сообщению и добавить текст или диктовку"><T>Текст / голос</T></Press>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

/** Полноэкранный просмотр: щипок — зум, двойной тап — приблизить, свайп вниз — закрыть. */
export function ImageViewer({ uri, headers, visible, onClose }: { uri: string; headers?: Record<string, string>; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const fade = useSharedValue(1);

  const reset = () => {
    scale.set(1);
    savedScale.set(1);
    tx.set(0);
    ty.set(0);
    savedX.set(0);
    savedY.set(0);
    fade.set(1);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.max(0.8, Math.min(6, savedScale.get() * e.scale)));
    })
    .onEnd(() => {
      if (scale.get() < 1) {
        scale.set(withSpring(1));
        tx.set(withSpring(0));
        ty.set(withSpring(0));
        savedX.set(0);
        savedY.set(0);
      }
      savedScale.set(Math.max(1, scale.get()));
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      tx.set(savedX.get() + e.translationX);
      ty.set(savedY.get() + e.translationY);
      if (savedScale.get() <= 1) fade.set(1 - Math.min(0.7, Math.abs(e.translationY) / 400));
    })
    .onEnd((e) => {
      if (savedScale.get() <= 1) {
        if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900) {
          scheduleOnRN(onClose);
          return;
        }
        tx.set(withSpring(0));
        ty.set(withSpring(0));
        fade.set(withTiming(1));
      } else {
        savedX.set(tx.get());
        savedY.set(ty.get());
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (savedScale.get() > 1) {
        scale.set(withSpring(1));
        savedScale.set(1);
        tx.set(withSpring(0));
        ty.set(withSpring(0));
        savedX.set(0);
        savedY.set(0);
      } else {
        scale.set(withSpring(2.5));
        savedScale.set(2.5);
      }
      void e;
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));
  const backdrop = useAnimatedStyle(() => ({ opacity: fade.get() }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={reset} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.viewerBackdrop, backdrop]} />
        <GestureDetector gesture={gesture}>
          <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
            <Image source={{ uri, headers }} style={StyleSheet.absoluteFill} contentFit="contain" />
          </Animated.View>
        </GestureDetector>
        <View style={[styles.viewerClose, { top: insets.top + 8 }]}>
          <IconButton icon="xmark" label="Закрыть" onPress={onClose} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  audio: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.card, width: '100%', minHeight: 76 },
  audioPlay: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  audioTrack: { height: 3, backgroundColor: Colors.hairline, borderRadius: 2, overflow: 'hidden' },
  audioProgress: { height: 3, backgroundColor: Colors.textSecondary },
  thumb: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    maxWidth: 300,
  },
  video: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  viewerBackdrop: { backgroundColor: '#000' },
  viewerClose: { position: 'absolute', right: 16 },
});

/** Компактное видео в отправленном сообщении; просмотр по нажатию. */
export function LocalVideo({ uri, size = 104, path, scope }: { uri: string; size?: number; path?: string; scope?: FileScope }) {
  const [open, setOpen] = useState(false);
  return <>
    <Press onPress={() => setOpen(true)} accessibilityLabel="Открыть прикреплённое видео" style={[styles.thumb, { width: size, height: size }]}>
      <SymbolView name="play.circle.fill" size={32} tintColor={Colors.text} />
      <T v="caption">Видео</T>
    </Press>
    <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: 60, paddingBottom: 40 }}>
        <View style={{ flex: 1 }}><VideoPlayerView uri={uri} path={path} scope={scope} /></View>
        <Press onPress={() => setOpen(false)} accessibilityLabel="Закрыть видео" style={{ padding: 20, alignItems: 'center' }}><T>Закрыть</T></Press>
      </View>
    </Modal>
  </>;
}
