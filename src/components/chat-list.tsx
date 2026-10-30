import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { chats, useChats, type Chat } from '@/ara/chats';
import { Press, T } from '@/components/ui';
import { Colors, ScreenPadding } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const layout = LinearTransition.duration(220).easing(Easing.out(Easing.cubic));

export function openChat(id: string) {
  chats.open(id);
  // the chat takes the place of what was open (an agent, another chat):
  // there is one main screen, the panel on the left switches it
  router.replace({ pathname: '/chat/[id]', params: { id } });
}

/** An agent in place of the open screen. */
export function openAgentScreen(key: string) {
  router.replace({ pathname: '/agent/[key]', params: { key } });
}

/** Новый пустой диалог сразу на весь экран. */
export function openNewChat() {
  openChat(chats.startNew());
}

/** Вкладка «Разговор»: список диалогов с Arra и «Новый диалог». */
export function ChatList({ top, bottom }: { top: number; bottom: number }) {
  const list = useChats();
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
            <T v="headline" weight="700" style={styles.heading}>Недавние</T>
            {items.map((chat, i) => (
              <Animated.View key={chat.id} layout={layout} exiting={FadeOut.duration(150)}>
                <Press
                  onPress={() => openChat(chat.id)}
                  onLongPress={() => remove(chat)}
                  delayLongPress={350}
                  scaleTo={0.99}
                  style={[styles.row, i > 0 && styles.rowBorder]}
                  accessibilityLabel={chat.title}
                  accessibilityHint="Долгое нажатие — удалить">
                  <T v="body" numberOfLines={1} style={{ flex: 1 }}>{chat.title}</T>
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
  list: { paddingTop: 18, paddingHorizontal: 8 },
  heading: { paddingHorizontal: ScreenPadding - 2, paddingBottom: 8 },
  row: { minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  empty: { alignItems: 'center', gap: 8, marginTop: 100 },
});
