import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { transcribe, type LocalPhoto } from '@/ara/upload';
import { MenuTrigger } from '@/components/glass-menu';
import { Glass, IconButton, Press, T } from '@/components/ui';
import { Colors, Radius, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Props = {
  placeholder: string;
  /** Бросает ошибку — текст и фото остаются в поле. */
  onSend: (text: string, photos: LocalPhoto[]) => Promise<void>;
  disabled?: boolean;
  /** Слева от кнопки отправки (выбор модели в чате с Арой). */
  accessory?: ReactNode;
  onHeight?: (height: number) => void;
  autoFocus?: boolean;
  /** Снаружи — чтобы поставить курсор в поле (тап по карточке «нужно от тебя») */
  inputRef?: RefObject<TextInput | null>;
};

let photoSeq = 0;

function toPhoto(asset: ImagePicker.ImagePickerAsset): LocalPhoto {
  const mime = asset.mimeType || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('heic') ? 'heic' : 'jpg';
  return { uri: asset.uri, name: asset.fileName || `photo-${Date.now()}-${++photoSeq}.${ext}`, mime };
}

export function Composer({ placeholder, onSend, disabled, accessory, onHeight, autoFocus, inputRef }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordStart, setRecordStart] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const ownInput = useRef<TextInput>(null);
  const input = inputRef ?? ownInput;

  const canSend = !disabled && !sending && (text.trim().length > 0 || photos.length > 0);

  async function send() {
    if (!canSend) return;
    const body = text;
    const attached = photos;
    setSending(true);
    haptic.press();
    setText('');
    setPhotos([]);
    try {
      await onSend(body.trim(), attached);
      haptic.success();
    } catch (error: any) {
      haptic.error();
      setText((current) => current || body);
      setPhotos((current) => (current.length ? current : attached));
      Alert.alert('Не отправилось', error?.message || 'Попробуй ещё раз');
    } finally {
      setSending(false);
    }
  }

  async function pick(camera: boolean) {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Нет доступа к камере', 'Разреши камеру для «Ары» в Настройках.', [
            { text: 'Настройки', onPress: () => Linking.openSettings() },
            { text: 'OK', style: 'cancel' },
          ]);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: !camera, selectionLimit: 6 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      setPhotos((current) => [...current, ...result.assets.map(toPhoto)].slice(0, 6));
      haptic.tap();
    } catch (error: any) {
      Alert.alert('Не удалось открыть', error?.message || '');
    }
  }

  // Одно нажатие — самый свежий снимок экрана или фото из медиатеки, без галереи
  const [grabbing, setGrabbing] = useState(false);
  async function attachLatest() {
    if (grabbing) return;
    setGrabbing(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (!perm.granted) {
        Alert.alert('Нет доступа к фото', 'Разреши доступ к фото для «Ары» в Настройках.', [
          { text: 'Настройки', onPress: () => Linking.openSettings() },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      const page = await MediaLibrary.getAssetsAsync({
        first: 1,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const asset = page.assets[0];
      if (!asset) {
        Alert.alert('Фото нет', 'В медиатеке пока нет снимков');
        return;
      }
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      let uri = info.localUri || asset.uri;
      let name = asset.filename || `photo-${Date.now()}.jpg`;
      let mime = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
      // HEIC и прочее агент не прочитает — переводим в JPEG
      if (!/\.(png|jpe?g)$/i.test(name)) {
        const jpeg = await manipulateAsync(uri, [], { compress: 0.85, format: SaveFormat.JPEG });
        uri = jpeg.uri;
        name = name.replace(/\.[^.]+$/, '') + '.jpg';
        mime = 'image/jpeg';
      }
      const photo = { uri, name, mime };
      setPhotos((current) => (current.some((p) => p.uri === uri) ? current : [...current, photo].slice(0, 6)));
      haptic.tap();
    } catch (error: any) {
      Alert.alert('Не получилось взять фото', error?.message || '');
    } finally {
      setGrabbing(false);
    }
  }

  async function toggleDictation() {
    if (transcribing) return;
    if (!recording) {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа к микрофону', 'Разреши микрофон для «Ары» в Настройках.', [
          { text: 'Настройки', onPress: () => Linking.openSettings() },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecordStart(Date.now());
        setRecording(true);
        haptic.press();
      } catch (error: any) {
        Alert.alert('Запись не началась', error?.message || '');
      }
      return;
    }
    setRecording(false);
    setTranscribing(true);
    haptic.tap();
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error('Запись пустая');
      const heard = await transcribe(uri);
      if (heard) {
        setText((current) => (current.trim() ? `${current.trimEnd()} ${heard}` : heard));
        haptic.success();
      }
    } catch (error: any) {
      Alert.alert('Не расслышала', error?.message || 'Попробуй ещё раз');
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <View
      style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}>
      <Glass radius={26} style={styles.box}>
        {photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos} keyboardShouldPersistTaps="handled">
            {photos.map((photo) => (
              <Animated.View key={photo.uri} entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(150)} style={styles.photo}>
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Press
                  onPress={() => setPhotos((current) => current.filter((p) => p.uri !== photo.uri))}
                  style={styles.photoRemove}
                  accessibilityLabel="Убрать фото"
                  hitSlop={8}>
                  <SymbolView name="xmark" size={9} tintColor={Colors.text} weight="bold" />
                </Press>
              </Animated.View>
            ))}
          </ScrollView>
        ) : null}

        {recording ? (
          <RecordingBar since={recordStart} />
        ) : (
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder={transcribing ? 'Расшифровываю…' : placeholder}
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
            multiline
            autoFocus={autoFocus}
            keyboardAppearance="dark"
            selectionColor={Colors.text}
            maxFontSizeMultiplier={1.5}
            accessibilityLabel={placeholder}
          />
        )}

        <View style={styles.toolbar}>
          <MenuTrigger
            label="Прикрепить фото"
            align="left"
            sections={[[
              { label: 'Фото из галереи', icon: 'photo.on.rectangle', onPress: () => pick(false) },
              { label: 'Снять камерой', icon: 'camera', onPress: () => pick(true) },
            ]]}>
            <View style={styles.tool}>
              <SymbolView name="plus" size={19} tintColor={Colors.textSecondary} weight="semibold" />
            </View>
          </MenuTrigger>
          <Press onPress={attachLatest} feedback="none" accessibilityLabel="Прикрепить последнее фото" style={styles.tool} hitSlop={6}>
            {grabbing ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <SymbolView name="photo.badge.arrow.down" size={19} tintColor={Colors.textSecondary} weight="regular" />
            )}
          </Press>
          <Press onPress={toggleDictation} feedback="none" accessibilityLabel={recording ? 'Остановить диктовку' : 'Диктовка'} style={styles.tool} hitSlop={6}>
            {transcribing ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <SymbolView name={recording ? 'stop.circle.fill' : 'mic'} size={recording ? 22 : 19} tintColor={recording ? Colors.danger : Colors.textSecondary} weight="semibold" />
            )}
          </Press>
          <View style={{ flex: 1 }} />
          {accessory}
          <View style={styles.sendSlot}>
            {sending ? (
              <View style={[styles.send, { backgroundColor: Colors.cardPressed }]}>
                <ActivityIndicator size="small" color={Colors.text} />
              </View>
            ) : (
              <IconButton
                icon="arrow.up"
                label="Отправить"
                onPress={send}
                size={32}
                disabled={!canSend}
                background={canSend ? Colors.text : Colors.cardPressed}
                color={canSend ? Colors.onAccent : Colors.textTertiary}
              />
            )}
          </View>
        </View>
      </Glass>
    </View>
  );
}

function RecordingBar({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    pulse.set(withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.4, { duration: 600 })), -1));
    return () => {
      clearInterval(id);
      cancelAnimation(pulse);
    };
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={styles.recording}>
      <Animated.View style={[styles.recDot, dot]} />
      <T v="callout" color={Colors.text}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</T>
      <T v="footnote" color={Colors.textSecondary}>Говори — нажми ■, чтобы закончить</T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 10, paddingTop: 6 },
  box: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6 },
  input: {
    color: Colors.text,
    fontSize: Type.body,
    lineHeight: 21,
    minHeight: 38,
    maxHeight: 150,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 6,
  },
  // Все кнопки на одной линии: одна высота, центр по вертикали
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2, height: 36 },
  tool: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  sendSlot: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  photos: { gap: 8, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 4 },
  photo: { width: 62, height: 62, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.card },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recording: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.danger },
});
