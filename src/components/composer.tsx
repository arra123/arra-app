import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  ZoomIn,
  ZoomOut,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocalPhoto } from '@/ara/upload';
import { MenuTrigger } from '@/components/glass-menu';
import { Glass, Press, T } from '@/components/ui';
import { Colors, Radius, Type } from '@/constants/theme';
import { useDictation } from '@/lib/dictation';
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
  const dictation = useDictation(text, setText);
  const listening = dictation.mode === 'live' || dictation.mode === 'record';
  const transcribing = dictation.mode === 'transcribing';
  const ownInput = useRef<TextInput>(null);
  const input = inputRef ?? ownInput;

  const canSend = !disabled && !sending && !listening && !transcribing && (text.trim().length > 0 || photos.length > 0);

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

        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          editable={!listening}
          placeholder={dictation.mode === 'live' ? 'Говори — текст появится здесь' : dictation.mode === 'record' ? 'Слушаю… нажми ■, чтобы расшифровать' : transcribing ? 'Расшифровываю…' : placeholder}
          placeholderTextColor={Colors.textTertiary}
          style={styles.input}
          multiline
          autoFocus={autoFocus}
          keyboardAppearance="dark"
          selectionColor={Colors.text}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={placeholder}
        />

        <View style={styles.toolbar}>
          <MenuTrigger
            label="Прикрепить фото"
            align="left"
            sections={[[
              { label: 'Фото из галереи', icon: 'photo.on.rectangle', onPress: () => pick(false) },
              { label: 'Снять камерой', icon: 'camera', onPress: () => pick(true) },
            ]]}>
            <View style={styles.tool}>
              <View style={styles.plusCircle}>
                <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={17} tintColor={Colors.text} weight="semibold" />
              </View>
            </View>
          </MenuTrigger>
          <Press onPress={attachLatest} feedback="none" accessibilityLabel="Прикрепить последнее фото" style={styles.tool}>
            {grabbing ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <SymbolView name={{ ios: 'photo', android: 'photo', web: 'photo' }} size={23} tintColor={Colors.textSecondary} weight="regular" />
            )}
          </Press>
          <Press
            onPress={dictation.toggle}
            feedback="none"
            accessibilityLabel={listening ? 'Остановить диктовку' : 'Диктовка'}
            style={styles.tool}>
            {transcribing ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : listening ? (
              <Animated.View entering={ZoomIn.duration(160)} style={styles.micActive}>
                <SymbolView name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} size={13} tintColor={Colors.text} weight="bold" />
              </Animated.View>
            ) : (
              <SymbolView name={{ ios: 'mic', android: 'mic', web: 'mic' }} size={23} tintColor={Colors.textSecondary} weight="regular" />
            )}
          </Press>
          <View style={styles.middle}>
            {listening ? <DictationMeter since={dictation.startedAt} level={dictation.level} live={dictation.mode === 'live'} /> : null}
          </View>
          {accessory}
          <Press onPress={send} disabled={!canSend} feedback="none" accessibilityLabel="Отправить" style={styles.tool}>
            {sending ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <SymbolView
                name={{ ios: 'arrow.up.circle.fill', android: 'arrow_circle_up', web: 'arrow_circle_up' }}
                size={32}
                tintColor={canSend ? Colors.text : Colors.textTertiary}
                weight="regular"
              />
            )}
          </Press>
        </View>
      </Glass>
    </View>
  );
}

/** Волна громкости и таймер, пока идёт диктовка. */
function DictationMeter({ since, level, live }: { since: number; level: SharedValue<number>; live: boolean }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={styles.meter} accessibilityLabel={live ? 'Идёт диктовка' : 'Идёт запись'}>
      <View style={styles.wave}>
        {WAVE.map((k, i) => <WaveBar key={i} k={k} level={level} />)}
      </View>
      <T v="footnote" color={Colors.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>
        {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
      </T>
    </Animated.View>
  );
}

/** Высоты полосок волны относительно громкости: выше в середине */
const WAVE = [0.45, 0.7, 1, 0.8, 0.55, 0.9, 0.6];

function WaveBar({ k, level }: { k: number; level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ height: 4 + Math.min(1, level.get() * 1.3) * 16 * k }));
  return <Animated.View style={[styles.waveBar, style]} />;
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 10, paddingTop: 6 },
  box: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2 },
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
  // Все кнопки на одной линии: зона касания 44 pt, центр по вертикали
  toolbar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  tool: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  plusCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.cardPressed, alignItems: 'center', justifyContent: 'center' },
  micActive: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: Colors.danger },
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
});
