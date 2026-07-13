import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STK, UL } from '../assets';
import { aiChat, type ChatMsg } from '../api';
import { U, UG, UR, US } from '../theme';
import { Gradient, Sticker, T, tap } from '../ui';

const GREETING: ChatMsg = {
  role: 'assistant',
  content: 'Ну привет 🙃 Я Ульяна. Можешь поныть, похвастаться или просто потрещать — я тут. Чё стряслось?',
};

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    tap();
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const reply = await aiChat(next.filter((m) => m !== GREETING));
      setMessages((cur) => [...cur, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages((cur) => [...cur, { role: 'assistant', content: 'Связь упала 📵 Попробуй ещё раз.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      {/* Шапка */}
      <View style={[styles.header, { paddingTop: insets.top + US.sm }]}>
        <Gradient g={UG.candy} radius={UR.pill} style={styles.avatar}>
          <Sticker src={UL.calm} size={40} style={{ borderRadius: 20 }} />
        </Gradient>
        <View style={{ flex: 1 }}>
          <T kind="h2">Ульяна</T>
          <T kind="tiny" color={U.success}>● на связи</T>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: US.md, paddingBottom: US.md, gap: US.sm }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {sending && (
          <View style={[styles.bubble, styles.bubbleAi]}>
            <ActivityIndicator color={U.textDim} />
          </View>
        )}
      </ScrollView>

      {/* Ввод */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom ? insets.bottom + 90 : US.md + 90 }]}>
        <TextInput
          placeholder="написать Ульяне…"
          placeholderTextColor={U.textFaint}
          value={input}
          onChangeText={setInput}
          style={styles.input}
          multiline
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable onPress={send} disabled={!input.trim() || sending} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.92 : 1 }], opacity: !input.trim() || sending ? 0.4 : 1 }]}>
          <Gradient g={UG.candy} radius={UR.pill} style={styles.sendBtn}>
            <Sticker src={STK.send} size={22} />
          </Gradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const mine = msg.role === 'user';
  if (mine) {
    return (
      <Gradient g={UG.pingB} radius={UR.lg} style={[styles.bubble, styles.bubbleMine]}>
        <T kind="body" color="#fff">{msg.content}</T>
      </Gradient>
    );
  }
  return (
    <View style={[styles.bubble, styles.bubbleAi]}>
      <T kind="body" color={U.text}>{msg.content}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: US.sm,
    paddingHorizontal: US.md, paddingBottom: US.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: U.border,
  },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', paddingHorizontal: US.md, paddingVertical: US.sm, borderRadius: UR.lg },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: UR.sm },
  bubbleAi: {
    alignSelf: 'flex-start', borderBottomLeftRadius: UR.sm,
    backgroundColor: U.card, borderWidth: StyleSheet.hairlineWidth, borderColor: U.border,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: US.sm,
    paddingHorizontal: US.md, paddingTop: US.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: U.border,
  },
  input: {
    flex: 1, minHeight: 46, maxHeight: 120,
    backgroundColor: U.card, borderRadius: UR.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: U.border,
    paddingHorizontal: US.md, paddingVertical: US.sm,
    color: U.text, fontSize: 16,
  },
  sendBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
});
