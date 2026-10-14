import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Press, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding } from '@/constants/theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';

/** The title the computer recognizes: tito-kb pull puts such a share into «С телефона» and the PC clipboard. */
const CLIP_TITLE = 'Буфер iPhone';

type Phase = 'sending' | 'sent' | 'empty' | 'error';

/** The «Буфер на ПК» widget: arra://clip sends the phone's clipboard to the computer. */
export default function ClipToComputer() {
  const { t } = useLocalSearchParams<{ t?: string }>();
  const [phase, setPhase] = useState<Phase>('sending');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(async () => {
    setPhase('sending');
    setError('');
    try {
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
  }, []);

  // every tap on the widget sends again, even when this screen is already open
  useEffect(() => {
    send();
    return () => {
      if (leave.current) clearTimeout(leave.current);
    };
  }, [send, t]);

  const icon = phase === 'sent' ? 'checkmark.circle.fill' : phase === 'sending' ? 'arrow.up.circle' : 'exclamationmark.circle';
  const title =
    phase === 'sent' ? 'Отправлено на компьютер' : phase === 'sending' ? 'Отправляю…' : phase === 'empty' ? 'Буфер пуст' : 'Не отправилось';

  return (
    <View style={styles.screen}>
      <Animated.View entering={FadeIn.duration(160)} style={styles.card}>
        <SymbolView name={icon} size={44} tintColor={phase === 'sent' ? Colors.done : phase === 'sending' ? Colors.textSecondary : Colors.error} />
        <T v="headline" weight="600" style={styles.center}>
          {title}
        </T>
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
        {phase === 'error' || phase === 'empty' ? (
          <View style={styles.row}>
            <Press style={styles.button} onPress={send}>
              <T v="callout" weight="600">
                Повторить
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
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: Radius.lg, backgroundColor: Colors.cardRaised },
});
