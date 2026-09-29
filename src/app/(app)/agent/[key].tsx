import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmCloseAgent, stopAgent } from '@/ara/actions';
import { ara } from '@/ara/client';
import { AGENT_LABEL, DEVICE_META, limitFor, modelLabel, shortPath, STATE_META, statusLine } from '@/ara/format';
import { useAgentItem, useAra, useNow, useTranscript } from '@/ara/hooks';
import type { TranscriptMessage } from '@/ara/types';
import { uploadPhoto } from '@/ara/upload';
import { HelpersStrip, NeedsCard, QuestionCard } from '@/components/agent-cards';
import { ChatLayout, useFreshKeys } from '@/components/chat-layout';
import { Composer } from '@/components/composer';
import { LimitsInline } from '@/components/limits';
import { MenuTrigger, type MenuSection } from '@/components/glass-menu';
import { PlanCard, TranscriptRow, UserBubble } from '@/components/transcript';
import { AgentIcon, DeskBadge, Glass, Press, StatusDot, T } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Row =
  | { kind: 'message'; key: string; message: TranscriptMessage }
  | { kind: 'pending'; key: string; text: string; images: string[] };

const CLAUDE_MODELS = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

/** Стабильный ключ записи: роль + начало текста (+ номер повтора). */
function messageKeys(messages: TranscriptMessage[]) {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const head = m.role === 'steps' ? m.items[0]?.text || '' : m.text;
    const base = `${m.role}:${head.slice(0, 32)}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

export default function AgentScreen() {
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const key = String(rawKey || '');
  const { agent, recent } = useAgentItem(key);
  const transcript = useTranscript(key);
  const { limits } = useAra();
  const now = useNow(10_000);
  // Отправленное с телефона висит «отправляю…», пока в переписке не появится
  // соответствующее по счёту сообщение пользователя (или 90 с на всякий случай)
  const [pending, setPending] = useState<{ id: string; text: string; images: string[]; at: number; index: number }[]>([]);
  const [stopping, setStopping] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const item = agent || recent;
  const messages = useMemo(() => transcript?.messages || [], [transcript]);
  const plan = transcript?.plan || [];
  const model = transcript?.model || agent?.model || '';
  const needs = agent ? transcript?.needs || [] : [];
  const question = agent ? transcript?.question || null : null;
  const helpers = transcript?.agents || [];

  const userCount = messages.filter((m) => m.role === 'user').length;
  const visiblePending = pending.filter((p) => userCount <= p.index && now - p.at < 90_000);

  useEffect(() => {
    if (agent?.state !== 'working') setStopping(false);
  }, [agent?.state]);

  const keys = useMemo(() => messageKeys(messages), [messages]);
  const rows: Row[] = useMemo(() => [
    ...messages.map((message, i) => ({ kind: 'message' as const, key: keys[i], message })),
    ...visiblePending.map((p) => ({ kind: 'pending' as const, key: `pending:${p.id}`, text: p.text, images: p.images })),
  ], [messages, keys, visiblePending]);
  const isFresh = useFreshKeys(keys);

  async function send(text: string, photos: { uri: string; name: string; mime: string }[]) {
    if (!agent) throw new Error('Агент уже закрыт');
    const paths: string[] = [];
    for (const photo of photos) paths.push(await uploadPhoto(photo, { agentKey: agent.key }));
    const id = `${Date.now()}`;
    const at = Date.now();
    setPending((list) => {
      const alive = list.filter((p) => userCount <= p.index && at - p.at < 90_000);
      return [...alive, { id, text, images: paths, at, index: userCount + alive.length }];
    });
    try {
      await ara.sendText(agent.key, text, paths);
    } catch (error) {
      setPending((list) => list.filter((p) => p.id !== id));
      throw error;
    }
  }

  async function answer(index: number) {
    if (!agent) return;
    try {
      await ara.answerQuestion(agent.key, index);
      haptic.success();
    } catch (error: any) {
      haptic.error();
      Alert.alert('Ответ не ушёл', error?.message || 'Попробуй ещё раз');
      throw error;
    }
  }

  async function stop() {
    if (!agent) return;
    setStopping(true);
    try {
      await stopAgent(agent);
    } catch {
      setStopping(false);
    }
  }

  async function changeModel(value: string) {
    if (!agent) return;
    try {
      await ara.setModel(agent.key, value);
      haptic.success();
    } catch (error: any) {
      Alert.alert('Модель не сменилась', error?.message || '');
    }
  }

  const menu: MenuSection[] = [];
  if (agent?.agent === 'claude') {
    const current = modelLabel(model).toLowerCase();
    menu.push(CLAUDE_MODELS.map((m) => ({
      label: m.label,
      checked: current.startsWith(m.value),
      onPress: () => changeModel(m.value),
    })));
  }
  const tools: MenuSection = [];
  if (agent?.state === 'working') tools.push({ label: 'Остановить', icon: 'stop.circle', onPress: stop });
  if (item?.cwd) tools.push({ label: 'Скопировать путь к папке', icon: 'doc.on.doc', onPress: () => Clipboard.setStringAsync(item.cwd).then(() => haptic.success()) });
  if (item) {
    tools.push({
      label: 'Новый агент в этой папке',
      icon: 'plus.bubble',
      onPress: () => router.push({ pathname: '/new', params: { agent: item.agent, device: item.device, dir: item.cwd } }),
    });
  }
  if (tools.length) menu.push(tools);
  if (agent) menu.push([{ label: 'Закрыть терминал', icon: 'xmark.circle', destructive: true, onPress: () => confirmCloseAgent(agent) }]);

  const state = agent?.state;

  const title = (
    <View style={styles.title}>
      {item ? <AgentIcon agent={item.agent} size={30} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="headline" weight="700" numberOfLines={1}>{item?.project || (recent ? recent.title : 'Агент')}</T>
        {item ? (
          <View style={styles.subtitle}>
            <SymbolView name={DEVICE_META[item.device].icon} size={12} tintColor={Colors.textSecondary} accessibilityLabel={DEVICE_META[item.device].label} />
            {agent?.ws != null ? <DeskBadge ws={agent.ws} color={Colors.textSecondary} /> : null}
            <T v="caption" color={Colors.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>{shortPath(item.cwd)}</T>
          </View>
        ) : (
          <T v="caption" color={Colors.textSecondary} numberOfLines={1}>ищу агента…</T>
        )}
      </View>
    </View>
  );

  const right = menu.length ? (
    <MenuTrigger label="Модель и действия" sections={menu}>
      <Glass radius={18} interactive style={styles.modelPill}>
        <SymbolView name="bolt.fill" size={11} tintColor={Colors.textSecondary} />
        <T v="footnote" weight="600" numberOfLines={1} maxFontSizeMultiplier={1.2}>{modelLabel(model) || (item ? AGENT_LABEL[item.agent] : '')}</T>
        <SymbolView name="chevron.down" size={9} tintColor={Colors.textSecondary} weight="bold" />
      </Glass>
    </MenuTrigger>
  ) : null;

  const below = (
    <>
      <Animated.View key={state || 'none'} entering={FadeIn.duration(250)} style={styles.status}>
        {state ? <StatusDot state={state} /> : <View style={[styles.dotOff]} />}
        <T v="footnote" color={state ? Colors.text : Colors.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
          {statusLine(agent, transcript, now)}
        </T>
        {state ? <T v="caption" color={STATE_META[state].color}>{stopping ? 'останавливаю…' : ''}</T> : null}
      </Animated.View>
      {item ? (
        <LimitsInline
          title={item.agent === 'claude' ? 'Claude' : `Codex ${item.device === 'pc' ? 'ПК' : 'ноутбук'}`}
          limit={limitFor(limits, item.agent, item.device)}
        />
      ) : null}
      {agent ? <HelpersStrip helpers={helpers} /> : null}
      {plan.length ? <PlanCard plan={plan} /> : null}
    </>
  );

  const scope = { agentKey: key };
  const loading = !transcript && !!item;

  return (
    <ChatLayout
      title={title}
      right={right}
      below={below}
      data={rows}
      keyOf={(row) => row.key}
      renderItem={({ item: row }) =>
        row.kind === 'message' ? (
          <TranscriptRow message={row.message} scope={scope} animate={isFresh(row.key)} />
        ) : (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} style={styles.pendingRow}>
            <UserBubble text={row.text} images={row.images} scope={scope} pending />
          </Animated.View>
        )
      }
      empty={
        <View style={styles.empty}>
          <T v="subhead" color={Colors.textSecondary} style={{ textAlign: 'center' }}>
            {loading ? 'Загружаю переписку с компьютера…' : item ? 'Переписка пока пустая' : 'Агент не найден — возможно, терминал закрыт'}
          </T>
        </View>
      }
      composer={(onHeight) =>
        agent ? (
          <View onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
            {question || needs.length ? (
              <ScrollView style={styles.cards} contentContainerStyle={styles.cardsInner} keyboardShouldPersistTaps="handled">
                {question ? <QuestionCard question={question} onAnswer={answer} /> : null}
                {needs.length ? <NeedsCard needs={needs} onPress={() => inputRef.current?.focus()} /> : null}
              </ScrollView>
            ) : null}
            <Composer
              inputRef={inputRef}
              placeholder={question ? 'Свой ответ…' : agent.state === 'working' ? 'Напиши — агент увидит после текущего шага' : 'Напиши агенту — уйдёт в его терминал'}
              onSend={send}
            />
          </View>
        ) : (
          <ClosedBar
            onHeight={onHeight}
            onNew={item ? () => router.push({ pathname: '/new', params: { agent: item.agent, device: item.device, dir: item.cwd } }) : undefined}
          />
        )
      }
    />
  );
}

function ClosedBar({ onHeight, onNew }: { onHeight: (h: number) => void; onNew?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View onLayout={(e) => onHeight(e.nativeEvent.layout.height)} style={[styles.closedWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Glass radius={Radius.xl} style={styles.closed}>
        <SymbolView name="moon.zzz" size={16} tintColor={Colors.textSecondary} />
        <T v="footnote" color={Colors.textSecondary} style={{ flex: 1 }}>Сессия завершена — терминал закрыт</T>
        {onNew ? (
          <Press onPress={onNew} style={styles.closedButton} feedback="press" accessibilityLabel="Новый агент в этой папке">
            <T v="footnote" weight="700" color={Colors.onAccent}>Новый агент</T>
          </Press>
        ) : null}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  modelPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 34, maxWidth: 150 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dotOff: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.old },
  pendingRow: { paddingHorizontal: 16, paddingVertical: 7 },
  empty: { alignItems: 'center' },
  // Непрозрачная подложка: лента не просвечивает между карточками
  cards: { maxHeight: 320, flexGrow: 0, backgroundColor: Colors.background },
  cardsInner: { paddingHorizontal: 10, paddingTop: 8, gap: 6 },
  closedWrap: { paddingHorizontal: 10, paddingTop: 6 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  closedButton: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center' },
});
