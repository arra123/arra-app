import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
  ZoomOut,
  type SharedValue,
} from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocalPhoto } from '@/ara/upload';
import { Glass, Press, T } from '@/components/ui';
import { Colors, Radius, Type } from '@/constants/theme';
import { useDictation } from '@/lib/dictation';
import { haptic } from '@/lib/haptics';

type Props = {
  placeholder: string;
  /** Бросает ошибку — текст и фото остаются в поле. */
  onSend: (text: string, photos: LocalPhoto[]) => Promise<void>;
  disabled?: boolean;
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

export function Composer({ placeholder, onSend, disabled, onHeight, autoFocus, inputRef }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const dictation = useDictation(text, setText);
  const listening = dictation.mode === 'live' || dictation.mode === 'record';
  const transcribing = dictation.mode === 'transcribing';
  const ownInput = useRef<TextInput>(null);
  const input = inputRef ?? ownInput;

  const [focused, setFocused] = useState(false);
  const hasContent = text.trim().length > 0 || photos.length > 0;
  // Как в ChatGPT: в фокусе (или когда текста много) поле — две строки:
  // текст во всю ширину сверху, «+» слева и микрофон с отправкой справа снизу
  const expanded = focused || text.includes('\n') || text.length > 26;
  const canSend = !disabled && !sending && !listening && !transcribing && hasContent;
  const plusRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  function openMenu() {
    haptic.tap();
    plusRef.current?.measureInWindow((x, y, width, height) => setMenuAnchor({ x, y, width, height }));
  }

  /** ↑ во время диктовки: остановить, дождаться текста и сразу отправить. */
  async function finishAndSend() {
    const final = await dictation.finish();
    await send(final);
  }

  async function send(override?: string) {
    const body = override ?? text;
    if (disabled || sending || (!body.trim() && !photos.length)) return;
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

  async function pickFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const files = result.assets.map((a) => ({ uri: a.uri, name: a.name || `file-${Date.now()}`, mime: a.mimeType || 'application/octet-stream' }));
      setPhotos((current) => [...current, ...files].slice(0, 6));
      haptic.tap();
    } catch (error: any) {
      Alert.alert('Не удалось открыть файлы', error?.message || '');
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

  const dictating = listening || transcribing;

  // «Прикрепить недавнее фото» над полем, пока печатаешь: только свежий снимок
  // (последние 10 минут) и только если доступ к фото уже дан — без лишних запросов
  const [recent, setRecent] = useState<{ uri: string; id: string } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!focused) return;
    let alive = true;
    (async () => {
      try {
        const perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!perm.granted) return;
        const page = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
        const asset = page.assets[0];
        if (alive) setRecent(asset && Date.now() - asset.creationTime < 10 * 60_000 ? { uri: asset.uri, id: asset.id } : null);
      } catch {
        /* без подсказки */
      }
    })();
    return () => {
      alive = false;
    };
  }, [focused]);
  const suggestRecent = focused && !dictating && !!recent && dismissed !== recent.id && !photos.length && !text.trim();

  // Одно и то же поле в обеих раскладках — фокус и текст не теряются при переходе
  const input_el = (
    <TextInput
      ref={input}
      value={text}
      onChangeText={setText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      placeholderTextColor={Colors.textTertiary}
      style={[styles.input, expanded ? styles.inputExpanded : styles.inputInline]}
      multiline
      // в браузере textarea по умолчанию в две строки
      {...(Platform.OS === 'web' ? { rows: 1 } : null)}
      autoFocus={autoFocus}
      keyboardAppearance="dark"
      selectionColor={Colors.text}
      maxFontSizeMultiplier={1.4}
      accessibilityLabel={placeholder}
    />
  );

  return (
    <View
      style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 8) }]}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}>
      {suggestRecent && recent ? (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)}>
          <Press
            onPress={() => {
              setDismissed(recent.id);
              void attachLatest();
            }}
            feedback="tap"
            scaleTo={0.98}
            style={styles.suggest}
            accessibilityRole="button"
            accessibilityLabel="Прикрепить недавнее фото">
            <Image source={{ uri: recent.uri }} style={styles.suggestThumb} contentFit="cover" />
            <T v="callout" color={Colors.text}>Прикрепить недавнее фото</T>
          </Press>
        </Animated.View>
      ) : null}
      {dictation.notice ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
          <Press onPress={dictation.clearNotice} feedback="none" style={styles.notice} accessibilityRole="button" accessibilityLabel={`Диктовка: ${dictation.notice}. Нажми, чтобы скрыть`}>
            <SymbolView name={{ ios: 'exclamationmark.bubble', android: 'error', web: 'error' }} size={14} tintColor={Colors.waiting} />
            <T v="caption" color={Colors.textSecondary} style={{ flex: 1 }}>{dictation.notice}</T>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={11} tintColor={Colors.textTertiary} />
          </Press>
        </Animated.View>
      ) : null}
      <Glass radius={28} backing style={styles.capsule}>
        {photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos} keyboardShouldPersistTaps="handled">
            {photos.map((photo) => (
              <Animated.View key={photo.uri} entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(150)} style={styles.photo}>
                {photo.mime.startsWith('image/') ? (
                  <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={styles.fileTile}>
                    <SymbolView name={{ ios: 'doc', android: 'description', web: 'description' }} size={20} tintColor={Colors.textSecondary} />
                    <T v="tiny" color={Colors.textSecondary} numberOfLines={2} style={{ textAlign: 'center' }}>{photo.name}</T>
                  </View>
                )}
                <Press
                  onPress={() => setPhotos((current) => current.filter((p) => p.uri !== photo.uri))}
                  style={styles.photoRemove}
                  accessibilityRole="button"
                  accessibilityLabel="Убрать вложение"
                  hitSlop={8}>
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={9} tintColor={Colors.text} weight="bold" />
                </Press>
              </Animated.View>
            ))}
          </ScrollView>
        ) : null}

        {dictating ? (
          <>
            {/* Надиктованное видно сразу, пока говоришь */}
            <Animated.View entering={FadeIn.duration(150)} style={styles.live}>
              {text.trim() ? (
                <T v="body" color={Colors.text} numberOfLines={5}>{text}</T>
              ) : (
                <T v="body" color={Colors.textTertiary}>{transcribing ? 'Расшифровываю на ноутбуке…' : dictation.mode === 'record' ? 'Говори — расшифрую на ноутбуке' : 'Говори — текст появится здесь'}</T>
              )}
            </Animated.View>
            <View style={styles.row}>
              <Press onPress={dictation.cancel} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Отменить диктовку">
                <View style={styles.greyCircle}>
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={15} tintColor={Colors.text} weight="semibold" />
                </View>
              </Press>
              <View style={styles.waveSlot}>
                {transcribing ? (
                  <ActivityIndicator size="small" color={Colors.textSecondary} />
                ) : (
                  <ScrollingWave level={dictation.level} />
                )}
              </View>
              <Press onPress={() => void dictation.finish()} disabled={transcribing} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Остановить диктовку, текст останется в поле">
                <View style={styles.greyCircle}>
                  <SymbolView name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} size={13} tintColor={Colors.text} />
                </View>
              </Press>
              <Press onPress={() => void finishAndSend()} disabled={transcribing || disabled} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Остановить и сразу отправить">
                <View style={styles.whiteCircle}>
                  <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={17} tintColor={Colors.onAccent} weight="bold" />
                </View>
              </Press>
            </View>
          </>
        ) : (
          // Поле ввода всегда на одном месте в дереве (иначе оно пересоздаётся и теряет фокус):
          // в строку кнопки лежат поверх по краям, в фокусе — отдельным рядом под текстом
          <Animated.View layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}>
            {input_el}
            <View style={expanded ? styles.row : styles.inlineButtons} pointerEvents="box-none">
              <View ref={plusRef} collapsable={false}>
                <Press onPress={openMenu} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Прикрепить: фото, камера, файлы">
                  <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} tintColor={Colors.text} weight="regular" />
                </Press>
              </View>
              <View style={{ flex: 1 }} pointerEvents="none" />
              <Press onPress={() => void dictation.start()} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Диктовка">
                <SymbolView name={{ ios: 'mic', android: 'mic', web: 'mic' }} size={22} tintColor={Colors.text} weight="regular" />
              </Press>
              {hasContent || sending ? (
                <Press onPress={() => void send()} disabled={!canSend} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Отправить">
                  <Animated.View entering={ZoomIn.duration(140)} style={[styles.whiteCircle, !canSend && { opacity: 0.45 }]}>
                    {sending ? (
                      <SymbolView name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} size={13} tintColor={Colors.onAccent} />
                    ) : (
                      <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={17} tintColor={Colors.onAccent} weight="bold" />
                    )}
                  </Animated.View>
                </Press>
              ) : (
                <Press onPress={() => void dictation.start()} feedback="none" style={styles.tool} accessibilityRole="button" accessibilityLabel="Голосом">
                  <Animated.View entering={ZoomIn.duration(140)} style={styles.whiteCircle}>
                    <SymbolView name={{ ios: 'waveform', android: 'graphic_eq', web: 'graphic_eq' }} size={18} tintColor={Colors.onAccent} weight="semibold" />
                  </Animated.View>
                </Press>
              )}
            </View>
          </Animated.View>
        )}
      </Glass>

      <AttachMenu
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        onLatest={attachLatest}
        onCamera={() => pick(true)}
        onLibrary={() => pick(false)}
        onFiles={pickFiles}
        grabbing={grabbing}
      />
    </View>
  );
}

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Меню «+» как в ChatGPT: большой поповер растёт из кнопки вверх
 * (масштаб от её угла и прозрачность, без пружины), пункты с иконкой в круге.
 */
function AttachMenu({ anchor, onClose, onLatest, onCamera, onLibrary, onFiles, grabbing }: {
  anchor: Anchor | null;
  onClose: () => void;
  onLatest: () => void;
  onCamera: () => void;
  onLibrary: () => void;
  onFiles: () => void;
  grabbing: boolean;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Широкое меню как на снимке ChatGPT: ~3/4 экрана, но не шире 300 pt
  const menuW = Math.min(300, Math.max(250, screenW * 0.72), screenW - 24);
  const [thumb, setThumb] = useState<string | null>(null);
  const t = useSharedValue(0);
  const open = !!anchor;

  useEffect(() => {
    if (!open) return;
    t.set(0);
    t.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
    // Миниатюра последнего фото — только если доступ уже дан (без лишнего запроса)
    let alive = true;
    (async () => {
      try {
        const perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!perm.granted) return;
        const page = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
        if (alive && page.assets[0]) setThumb(page.assets[0].uri);
      } catch {
        /* без миниатюры */
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, t]);

  const appear = useAnimatedStyle(() => ({
    opacity: t.get(),
    transform: [{ scale: 0.55 + 0.45 * t.get() }],
  }));

  if (!anchor) return null;
  const choose = (action: () => void) => () => {
    haptic.select();
    onClose();
    setTimeout(action, 120);
  };
  const items: { label: string; icon: SFSymbol; android: string; onPress: () => void; thumb?: string | null }[] = [
    { label: 'Последнее фото', icon: 'photo.badge.arrow.down', android: 'photo', onPress: onLatest, thumb },
    { label: 'Камера', icon: 'camera', android: 'photo_camera', onPress: onCamera },
    { label: 'Фото', icon: 'photo.on.rectangle', android: 'photo_library', onPress: onLibrary },
    { label: 'Файлы', icon: 'paperclip', android: 'attach_file', onPress: onFiles },
  ];

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть меню" />
      <Animated.View
        style={[
          styles.menu,
          { width: menuW, left: Math.max(12, Math.min(anchor.x - 4, screenW - menuW - 12)), bottom: screenH - anchor.y + 10, transformOrigin: 'left bottom' },
          appear,
        ]}>
        <Glass radius={34} backing style={styles.menuBox}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              onPress={choose(item.onPress)}
              accessibilityRole="menuitem"
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: Colors.cardPressed }]}>
              <View style={styles.menuIcon}>
                {item.thumb ? (
                  <Image source={{ uri: item.thumb }} style={styles.menuThumb} contentFit="cover" />
                ) : item.label === 'Последнее фото' && grabbing ? (
                  <ActivityIndicator size="small" color={Colors.textSecondary} />
                ) : (
                  <SymbolView name={{ ios: item.icon, android: item.android as any, web: item.android as any }} size={20} tintColor={Colors.text} weight="regular" />
                )}
              </View>
              <T v="body" color={Colors.text} style={styles.menuLabel}>{item.label}</T>
            </Pressable>
          ))}
        </Glass>
      </Animated.View>
    </Modal>
  );
}

/**
 * Волна как в ChatGPT: бежит справа налево; тихо — точки, громко — столбики.
 * Раз в 70 мс берём громкость и сдвигаем историю.
 */
const WAVE_BARS = 34;

function ScrollingWave({ level }: { level: SharedValue<number> }) {
  const [history, setHistory] = useState<number[]>(() => Array(WAVE_BARS).fill(0));
  useEffect(() => {
    const id = setInterval(() => {
      const v = level.get();
      setHistory((h) => [...h.slice(1), v]);
    }, 70);
    return () => clearInterval(id);
  }, [level]);
  return (
    <View style={styles.wave} accessibilityLabel="Идёт диктовка">
      {history.map((v, i) => {
        const h = v < 0.08 ? 3 : 4 + Math.min(1, v) * 22;
        return <View key={i} style={[styles.waveBar, { height: h, opacity: 0.35 + 0.65 * Math.min(1, v * 1.6 + 0.2) }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 12, paddingTop: 6, gap: 6 },
  capsule: { paddingHorizontal: 6, paddingVertical: 6, minHeight: 56 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  inlineButtons: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  inputInline: { marginLeft: 44, marginRight: 88 },
  inputExpanded: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, minHeight: 44 },
  suggestThumb: { width: 26, height: 36, borderRadius: 5, backgroundColor: Colors.card },
  input: {
    color: Colors.text,
    fontSize: Type.body,
    lineHeight: 22,
    minHeight: 44,
    maxHeight: 160,
    paddingHorizontal: 4,
    paddingTop: 11,
    paddingBottom: 11,
  },
  tool: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  whiteCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center' },
  greyCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cardPressed, alignItems: 'center', justifyContent: 'center' },
  live: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, maxHeight: 140 },
  waveSlot: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2.5, height: 30 },
  waveBar: { width: 3, borderRadius: 1.5, backgroundColor: Colors.text },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.card,
  },
  photos: { gap: 8, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 6 },
  photo: { width: 62, height: 62, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.card },
  fileTile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
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
  menu: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  menuBox: { paddingVertical: 12, paddingHorizontal: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingVertical: 10, minHeight: 64, borderRadius: 24 },
  menuIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardPressed, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  menuThumb: { width: 44, height: 44 },
  menuLabel: { fontSize: 19, lineHeight: 24 },
});
