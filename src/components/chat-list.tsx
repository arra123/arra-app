import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { chats, useChats, type Chat } from '@/ara/chats';
import { ago } from '@/ara/format';
import { useNow } from '@/ara/hooks';
import { Press, T } from '@/components/ui';
import { Colors, ScreenPadding } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const layout = LinearTransition.duration(220).easing(Easing.out(Easing.cubic));

export function openChat(id: string) {
  chats.open(id);
  router.push({ pathname: '/chat/[id]', params: { id } });
}

/** Новый пустой диалог сразу на весь экран. */
export function openNewChat() {
  openChat(chats.startNew());
}

function lastLine(chat: Chat) {
  const last = [...chat.messages].reverse().find((m) => m.text);
  return (last?.text || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
}

/** Вкладка «Разговор»: список диалогов с Арой и «Новый диалог». */
export function ChatList({ top, bottom }: { top: number; bottom: number }) {
  const list = useChats();
  const now = useNow(30_000);
  const items = useMemo(
    () => list.filter((c) => c.messages.length).sort((a, b) => b.updatedAt - a.updatedAt),
    [list],
  );

  const remove = (chat: Chat) => {
    haptic.press();
    Alert.alert('Удалить диалог?', chat.title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(chat.id) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }} indicatorStyle="white">
      <Animated.View entering={FadeIn.duration(220)}>
        {items.length ? (
          <Animated.View layout={layout} style={styles.list}>
            <T v="title" weight="700" style={styles.heading}>Недавние</T>
            {items.map((chat, i) => (
              <Animated.View key={chat.id} layout={layout} exiting={FadeOut.duration(150)}>
                <Press
                  onPress={() => openChat(chat.id)}
                  onLongPress={() => remove(chat)}
                  delayLongPress={350}
                  scaleTo={0.99}
                  style={styles.row}
                  accessibilityLabel={chat.title}
                  accessibilityHint="Долгое нажатие — удалить">
                  <View style={styles.rowTop}>
                    <T v="body" weight="600" numberOfLines={1} style={{ flex: 1 }}>{chat.title}</T>
                    <T v="caption" color={Colors.textTertiary}>{ago(chat.updatedAt, now)}</T>
                  </View>
                  <T v="callout" color={Colors.textSecondary} numberOfLines={1}>{lastLine(chat)}</T>
                </Press>
              </Animated.View>
            ))}
          </Animated.View>
        ) : (
          <View style={styles.empty}>
            <T v="title" weight="700">Начни разговор</T>
            <T v="subhead" color={Colors.textSecondary}>Нажми кнопку справа сверху</T>
          </View>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 18 },
  heading: { paddingHorizontal: ScreenPadding, paddingBottom: 12 },
  row: { marginHorizontal: 10, paddingHorizontal: 12, paddingVertical: 14, gap: 3, borderRadius: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center', gap: 8, marginTop: 100 },
});
