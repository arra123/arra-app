import * as Clipboard from 'expo-clipboard';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Press, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding } from '@/constants/theme';
import { shareFile } from '@/ara/upload';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';

/** The title the computer recognizes: tito-kb pull puts such a share into «С телефона» and the PC clipboard. */
const CLIP_TITLE = 'Буфер iPhone';

type Phase = 'sending' | 'sent' | 'empty' | 'error' | 'denied';

/** The newest photo or screenshot, as a file the computer can paste (HEIC → JPEG). */
async function latestPhoto() {
  const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!perm.granted) return 'denied' as const;
  const page = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
  const asset = page.assets[0];
  if (!asset) return null;
  const info = await MediaLibrary.getAssetInfoAsync(asset);
  let uri = info.localUri || asset.uri;
  let name = asset.filename || `photo-${Date.now()}.jpg`;
  let mime = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
  if (!/\.(png|jpe?g)$/i.test(name) || !uri.startsWith('file:')) {
    const jpeg = await manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
    uri = jpeg.uri;
    name = name.replace(/\.[^.]+$/, '') + '.jpg';
    mime = 'image/jpeg';
  }
  return { uri, name, mime };
}

/**
 * The «Буфер на ПК» and «Фото на ПК» widgets: arra://clip sends the phone's
 * clipboard, arra://photo the newest photo; both land in the PC clipboard.
 */
export function SendToComputer({ kind }: { kind: 'clip' | 'photo' }) {
  const { t } = useLocalSearchParams<{ t?: string }>();
  const [phase, setPhase] = useState<Phase>('sending');
  const [text, setText] = useState('');
  const [picture, setPicture] = useState('');
  const [error, setError] = useState('');
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(async () => {
    setPhase('sending');
    setError('');
    try {
      if (kind === 'photo') {
        const photo = await latestPhoto();
        if (photo === 'denied') {
          setPhase('denied');
          haptic.error();
          return;
        }
        if (!photo) {
          setPhase('empty');
          haptic.error();
          return;
        }
        setPicture(photo.uri);
        await shareFile(photo, CLIP_TITLE);
        setPhase('sent');
        haptic.success();
        leave.current = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 1400);
        return;
      }
      let value = (await Clipboard.getStringAsync()).trim();
      if (!value && (await Clipboard.hasUrlAsync())) value = ((await Clipboard.getUrlAsync()) || '').trim();
      setText(value);
      if (!value) {
        setPhase('empty');
        haptic.error();
        return;
      }
      await api('/kb/share', { method: 'POST', body: { text: value, title: CLIP_TITLE }, timeoutMs: 20000 });
      setPhase('sent');
      haptic.success();
      leave.current = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
      haptic.error();
    }
  }, [kind]);

  // every tap on the widget sends again, even when this screen is already open
  useEffect(() => {
    send();
    return () => {
      if (leave.current) clearTimeout(leave.current);
    };
  }, [send, t]);

  const icon = phase === 'sent' ? 'checkmark.circle.fill' : phase === 'sending' ? 'arrow.up.circle' : 'exclamationmark.circle';
  const title =
    phase === 'sent' ? 'Отправлено на компьютер' : phase === 'sending' ? 'Отправляю…' : phase === 'empty' ? (kind === 'photo' ? 'Фото нет' : 'Буфер пуст')
      : phase === 'denied' ? 'Нет доступа к фото' : 'Не отправилось';

  return (
    <View style={styles.screen}>
      <Animated.View entering={FadeIn.duration(160)} style={styles.card}>
        <SymbolView name={icon} size={44} tintColor={phase === 'sent' ? Colors.done : phase === 'sending' ? Colors.textSecondary : Colors.error} />
        <T v="headline" weight="600" style={styles.center}>
          {title}
        </T>
        {picture ? <Image source={{ uri: picture }} style={styles.picture} contentFit="cover" /> : null}
        {text ? (
          <T v="subhead" color={Colors.textSecondary} numberOfLines={4} style={styles.center}>
            {text}
          </T>
        ) : null}
        {phase === 'error' && error ? (
          <T v="footnote" color={Colors.textTertiary} numberOfLines={3} style={styles.center}>
            {error}
          </T>
        ) : null}
        {phase === 'error' || phase === 'empty' || phase === 'denied' ? (
          <View style={styles.row}>
            <Press style={styles.button} onPress={phase === 'denied' ? () => Linking.openSettings() : send}>
              <T v="callout" weight="600">
                {phase === 'denied' ? 'Настройки' : 'Повторить'}
              </T>
            </Press>
            <Press style={styles.button} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              <T v="callout" color={Colors.textSecondary}>
                Закрыть
              </T>
            </Press>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', padding: ScreenPadding },
  card: { alignItems: 'center', gap: 12, padding: 24, borderRadius: Radius.xl, backgroundColor: Colors.card },
  center: { textAlign: 'center' },
  picture: { width: 160, height: 160, borderRadius: Radius.lg, backgroundColor: Colors.cardRaised },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: Radius.lg, backgroundColor: Colors.cardRaised },
});
