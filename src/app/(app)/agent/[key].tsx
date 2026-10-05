import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmCloseAgent, stopAgent } from '@/ara/actions';
import { ara } from '@/ara/client';
import { limitFor, modelLabel, shortAgo } from '@/ara/format';
import { useAgentItem, useAra, useNow, useTranscript } from '@/ara/hooks';
import { answerMessage, answersByMessage, answersOnTap, claudeKeys, type Selections } from '@/ara/questions';
import type { TranscriptMessage } from '@/ara/types';
import { uploadPhoto } from '@/ara/upload';
import { NeedsCard, QuestionCard, type AnswerStatus } from '@/components/agent-cards';
import { useCurrentChatId } from '@/ara/chats';
import { setOpenAgent } from '@/lib/push';
import { ChatLayout, useFreshKeys } from '@/components/chat-layout';
import { openChat, openNewChat } from '@/components/chat-list';
import { ChatSidebar } from '@/components/chat-sidebar';
import { Composer } from '@/components/composer';
import { FloatingAgent } from '@/components/floating-agent';
import { WeekRing } from '@/components/limits';
import { MenuTrigger, type MenuSection } from '@/components/glass-menu';
import { PlanCard, TranscriptRow, UserBubble } from '@/components/transcript';
import { ProjectMascot, stateLook } from '@/components/project-mascot';
import { Glass, Press, ProjectIcon, StatusDot, T } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Row =
  | { kind: 'message'; key: string; message: TranscriptMessage }
  | { kind: 'pending'; key: string; text: string; images: string[]; localImages: string[]; progress: number; total: number };

// the same choice as in tito on the computer: exact models, not just families
const CLAUDE_MODELS = [
  { value: 'opus', label: 'Opus 5.5', hint: 'самый умный' },
  { value: 'opus[1m]', label: 'Opus 5.5 · 1M', hint: 'длинный контекст' },
  { value: 'sonnet', label: 'Sonnet 5.5', hint: 'быстрый и умный' },
  { value: 'haiku', label: 'Haiku 4.5', hint: 'самый быстрый' },
  { value: 'claude-fable-5-1', label: 'Fable 5.1', hint: 'новая модель' },
];

const CODEX_MODELS = [
  { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', hint: 'доступна в Codex' },
  { value: 'gpt-6-sol', label: 'GPT-6 Sol', hint: 'код и задачи' },
  { value: 'gpt-6-luna', label: 'GPT-6 Luna', hint: 'быстрые задачи' },
  { value: 'gpt-6-astra', label: 'GPT-6 Astra', hint: 'новейшая' },
  { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', hint: 'сложные задачи' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', hint: 'баланс' },
  { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'быстрее' },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [sidebar, setSidebar] = useState(false);
  // its notifications are not shown while its chat is open
  useEffect(() => { setOpenAgent(key); return () => setOpenAgent(null); }, [key]);
  const currentChatId = useCurrentChatId() || '';
  const now = useNow(10_000);
  // Отправленное с телефона сразу выглядит как обычное сообщение. Оно исчезает
  // из локальной очереди, когда появляется в переписке компьютера (или через 90 с).
  const [pending, setPending] = useState<{
    id: string;
    text: string;
    images: string[];
    localImages: string[];
    progress: number;
    total: number;
    at: number;
    index: number;
  }[]>([]);
  const [stopping, setStopping] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { height: screenH } = useWindowDimensions();

  const item = agent || recent;
  const messages = useMemo(() => transcript?.messages || [], [transcript]);
  const plan = transcript?.plan || [];
  const model = transcript?.model || agent?.model || '';
  const needs = useMemo(() => agent ? transcript?.needs || [] : [], [agent, transcript?.needs]);
  const question = agent ? transcript?.question || null : null;
  const helpers = transcript?.agents || [];

  // «Нужно от тебя» свёрнуто в строку; новый список снова приходит свёрнутым
  const needsKey = needs.join('\n');
  const [needsOpen, setNeedsOpen] = useState(false);
  const [completedNeeds, setCompletedNeeds] = useState<Set<string>>(new Set());
  const [busyNeeds, setBusyNeeds] = useState<Set<string>>(new Set());
  useEffect(() => setNeedsOpen(false), [needsKey]);
  useEffect(() => {
    setCompletedNeeds((done) => new Set([...done].filter((need) => needs.includes(need))));
  }, [needs, needsKey]);

  // Ответ на вопрос: выбор, статус отправки и раскрытие живут здесь, а не в карточке —
  // при сетевой ошибке ничего не теряется, повторное нажатие не шлёт ответ дважды
  const questionId = question?.id || '';
  const [answer, setAnswer] = useState<{ id: string; picked: Selections; status: AnswerStatus; escaped: boolean; open: boolean }>({
    id: '', picked: [], status: { state: 'idle' }, escaped: false, open: true,
  });
  const current = answer.id === questionId ? answer : { id: questionId, picked: [], status: { state: 'idle' } as AnswerStatus, escaped: false, open: true };
  const answering = useRef(false);
  useEffect(() => {
    if (questionId) setAnswer((a) => (a.id === questionId ? a : { id: questionId, picked: [], status: { state: 'idle' }, escaped: false, open: true }));
  }, [questionId]);
  const patchAnswer = (patch: Partial<typeof current>) => setAnswer((a) => ({ ...(a.id === questionId ? a : current), ...patch }));
  const questionOpen = !!question && current.status.state !== 'sent';


  const userCount = messages.filter((m) => m.role === 'user').length;
  // a sent message leaves the local queue when the computer's log has it. The
  // count alone is not enough: a long log is cut to its last messages, so the
  // count stays the same and the message stood twice (once from the log, once
  // from here) for a minute and a half. So it is matched by its text too.
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 80);
  const lastUsers = messages.filter((m) => m.role === 'user').slice(-6);
  // only messages the log got AFTER this one was sent count («да», «ок» sent
  // twice in a row are different messages and both must show)
  const landed = (p: { text: string; index: number; at: number }) => {
    const mine = squash(p.text);
    if (userCount > p.index) return true;
    return !!mine && lastUsers.some((m) => {
      const t = squash(m.text || '');
      const after = !m.ts || m.ts * 1000 >= p.at - 4000;
      return after && (t === mine || (mine.length > 12 && (t.startsWith(mine) || mine.startsWith(t))));
    });
  };
  const visiblePending = pending.filter((p) => !landed(p) && now - p.at < 90_000);

  useEffect(() => {
    if (agent?.state !== 'working') setStopping(false);
  }, [agent?.state]);

  const keys = useMemo(() => messageKeys(messages), [messages]);
  const rows: Row[] = useMemo(() => [
    ...messages.map((message, i) => ({ kind: 'message' as const, key: keys[i], message })),
    ...visiblePending.map((p) => ({
      kind: 'pending' as const,
      key: `pending:${p.id}`,
      text: p.text,
      images: p.images,
      localImages: p.localImages,
      progress: p.progress,
      total: p.total,
    })),
  ], [messages, keys, visiblePending]);
  const isFresh = useFreshKeys(keys);

  /** Оптимистичное сообщение, пока оно не появилось в переписке компьютера. */
  function addPending(text: string, photos: { uri: string }[]) {
    const id = `${Date.now()}`;
    const at = Date.now();
    setPending((list) => {
      const alive = list.filter((p) => userCount <= p.index && at - p.at < 90_000);
      return [...alive, {
        id,
        text,
        images: [],
        localImages: photos.map((photo) => photo.uri),
        progress: 0,
        total: photos.length,
        at,
        index: userCount + alive.length,
      }];
    });
    return id;
  }

  async function sendMessage(text: string, paths: string[], pendingId?: string) {
    if (!agent) throw new Error('Агент уже закрыт');
    const id = pendingId || addPending(text, []);
    setPending((list) => list.map((p) => p.id === id ? { ...p, images: paths, progress: p.total } : p));
    try {
      await ara.sendText(agent.key, text, paths);
    } catch (error) {
      setPending((list) => list.filter((p) => p.id !== id));
      throw error;
    }
  }

  async function completeNeed(need: string) {
    if (completedNeeds.has(need) || busyNeeds.has(need)) return;
    setBusyNeeds((items) => new Set(items).add(need));
    try {
      await sendMessage(`Готово: ${need}`, []);
      setCompletedNeeds((items) => new Set(items).add(need));
      haptic.success();
    } catch (error: any) {
      haptic.error();
      Alert.alert('Не удалось сообщить агенту', error?.message || 'Попробуй ещё раз');
    } finally {
      setBusyNeeds((items) => { const next = new Set(items); next.delete(need); return next; });
    }
  }

  /** Поле ввода. Пока открыт вопрос — это «свой ответ» на него. */
  async function send(text: string, photos: { uri: string; name: string; mime: string }[]) {
    if (!agent) throw new Error('Агент уже закрыт');
    const outgoing = question && questionOpen ? answerMessage(question, current.picked, text) || text : text;
    const pendingId = addPending(outgoing, photos);
    const paths: string[] = [];
    try {
      for (const photo of photos) {
        paths.push(await uploadPhoto(photo, { agentKey: agent.key }));
        setPending((list) => list.map((p) => p.id === pendingId ? { ...p, images: [...paths], progress: paths.length } : p));
      }
    } catch (error) {
      setPending((list) => list.filter((p) => p.id !== pendingId));
      throw error;
    }
    if (!question || !questionOpen) return sendMessage(outgoing, paths, pendingId);
    if (answering.current) throw new Error('Ответ уже отправляется');
    answering.current = true;
    patchAnswer({ status: { state: 'sending' } });
    try {
      // В окне вопроса Claude текст ушёл бы в меню выбора — сначала закрываем его Esc
      if (!answersByMessage(question) && !current.escaped) {
        await ara.pressKeys(agent.key, ['escape']);
        patchAnswer({ escaped: true });
        await wait(700);
      }
      await sendMessage(outgoing, paths, pendingId);
      patchAnswer({ status: { state: 'sent', at: Date.now() } });
      haptic.success();
    } catch (error: any) {
      setPending((list) => list.filter((p) => p.id !== pendingId));
      patchAnswer({ status: { state: 'error', message: error?.message || 'Ответ не ушёл' } });
      throw error;
    } finally {
      answering.current = false;
    }
  }

  /** Отправить выбранные варианты: Codex — сообщением, Claude — клавишами в окне вопроса. */
  async function submitAnswer(picked = current.picked) {
    if (!agent || !question || answering.current) return;
    answering.current = true;
    patchAnswer({ picked, status: { state: 'sending' } });
    try {
      if (answersByMessage(question)) await sendMessage(answerMessage(question, picked), []);
      else await ara.pressKeys(agent.key, claudeKeys(question, picked));
      patchAnswer({ picked, status: { state: 'sent', at: Date.now() } });
      haptic.success();
    } catch (error: any) {
      haptic.error();
      patchAnswer({ picked, status: { state: 'error', message: error?.message || 'Ответ не ушёл — попробуй ещё раз' } });
    } finally {
      answering.current = false;
    }
  }

  function pickOption(qi: number, oi: number) {
    if (!question || current.status.state === 'sending') return;
    const q = question.questions[qi];
    const picked = question.questions.map((_, i) => [...(current.picked[i] || [])]);
    const list = picked[qi];
    if (q?.multi) picked[qi] = list.includes(oi) ? list.filter((n) => n !== oi) : [...list, oi];
    else picked[qi] = [oi];
    if (answersOnTap(question)) {
      void submitAnswer(picked);
      return;
    }
    patchAnswer({ picked, status: current.status.state === 'error' ? { state: 'idle' } : current.status });
  }

  async function stop() {
    if (!agent || stopping) return;
    setStopping(true);
    try {
      await stopAgent(agent);
    } catch {
      setStopping(false);
    }
  }

  async function changeModel(value: string, effort?: string) {
    if (!agent) return;
    try {
      const result = await ara.setModel(agent.key, value, effort);
      if (result.queued) Alert.alert('Смена после ответа', `${value}${effort ? ' · ' + effort : ''} применится, когда агент закончит текущий ответ.`);
      haptic.success();
    } catch (error: any) {
      Alert.alert('Модель не сменилась', error?.message || '');
    }
  }

  // Компактное меню под «⋯»: сначала модель и действия, затем отдельный список моделей.
  const menu: MenuSection[] = [];
  if (agent) {
    const currentModel = modelLabel(model);
    const models = agent.agent === 'claude' ? CLAUDE_MODELS : CODEX_MODELS;
    menu.push({
      title: 'Модель',
      subtitle: [currentModel, transcript?.effort].filter(Boolean).join(' · ') || undefined,
      icon: 'cpu',
      submenu: true,
      items: models.map((m) => ({
        label: m.label,
        subtitle: m.hint,
        checked: model.toLowerCase() === m.value || currentModel.toLowerCase() === m.label.toLowerCase()
          || (!!currentModel && m.value !== 'opus[1m]' && m.label.toLowerCase().startsWith(currentModel.toLowerCase())),
        onPress: () => changeModel(m.value),
      })),
    });
  }
  if (agent?.state === 'working' && !stopping) menu.push([{ label: 'Остановить', icon: 'stop.circle', onPress: stop }]);
  if (agent?.agent === 'codex') menu.push({
    title: 'Качество рассуждения', subtitle: transcript?.effort || 'Не определено', icon: 'brain', submenu: true,
    items: ['low','medium','high','xhigh','max','ultra'].map((effort) => ({
      label: effort[0].toUpperCase() + effort.slice(1), checked: transcript?.effort === effort,
      onPress: () => changeModel(model || CODEX_MODELS[0].value, effort),
    })),
  });
  if (agent) menu.push([{ label: 'Закрыть терминал', icon: 'xmark.circle', destructive: true, onPress: () => confirmCloseAgent(agent) }]);

  // Статус в одном месте — в капсуле с названием: «ждёт · 3 мин» жёлтым или дуга и время работы
  const workFrom = transcript?.lastUser ? transcript.lastUser * 1000 : agent?.since;
  const doneAt = transcript?.last ? transcript.last * 1000 : agent?.since;
  const shortStatus = !agent ? null : stopping ? (
    <T v="caption" color={Colors.textSecondary}>останавливаю…</T>
  ) : agent.compacting ? (
    <T v="caption" color={Colors.textSecondary} numberOfLines={1}>сжатие контекста…</T>
  ) : agent.state === 'waiting' ? (
    <T v="caption" weight="600" color={Colors.done} numberOfLines={1}>
      {doneAt ? `закончил · ${shortAgo(now - doneAt)}` : 'закончил'}
    </T>
  ) : agent.state === 'working' ? (
    <View style={styles.shortStatus}>
      <StatusDot state="working" size={8} />
      <T v="caption" color={Colors.textSecondary} numberOfLines={1}>{workFrom ? shortAgo(now - workFrom) : 'работает'}</T>
    </View>
  ) : agent.state === 'error' ? (
    <T v="caption" weight="600" color={Colors.error} numberOfLines={2}>{agent.error || 'прервался'}</T>
  ) : doneAt ? (
    <T v="caption" color={Colors.textSecondary} numberOfLines={1}>{shortAgo(now - doneAt)} назад</T>
  ) : null;

  const title = (
    <View style={styles.title}>
      {/* the project's ball, alive: it thinks while the agent works */}
      {agent ? <ProjectMascot id={agent.mascotId} size={34} {...stateLook(agent.state)} still={false} />
        : item ? <ProjectIcon iconName={item.iconName} agent={item.agent} size={32} /> : null}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        {/* what it is doing, like in the panel; the project is in the line below */}
        <T v="subhead" weight="700" numberOfLines={1}>{(item && 'title' in item && item.title) || item?.project || (recent ? recent.title : 'Агент')}</T>
        {item ? (
          // Статус первым и целиком («ждёт · 4 мин»), место — после него; на узком экране сокращается место
          <View style={styles.subtitle}>
            {shortStatus ? (
              <Animated.View key={`${agent?.state}:${stopping}`} entering={FadeIn.duration(250)} style={styles.statusPart}>
                {shortStatus}
              </Animated.View>
            ) : null}
            <T v="caption" color={Colors.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>{shortStatus ? '· ' : ''}{item.project}</T>
          </View>
        ) : (
          <T v="caption" color={Colors.textSecondary} numberOfLines={1}>ищу агента…</T>
        )}
      </View>
    </View>
  );

  // Справа отдельная капсула: кольцо остатка недельного лимита и «⋯» (системное меню)
  // the week-limit ring (a number of tokens) is not shown in the header any more
  const ring = null;
  const right = ring || menu.length ? (
    <Glass radius={22} backing style={styles.right}>
      {ring}
      {menu.length ? (
        <MenuTrigger label="Модель и действия" sections={menu} native={false}>
          <View style={styles.more}>
            <SymbolView name="ellipsis" size={18} tintColor={Colors.text} weight="semibold" />
            {transcript?.effort ? <T v="tiny" color={Colors.textSecondary}>{transcript.effort}</T> : null}
          </View>
        </MenuTrigger>
      ) : null}
    </Glass>
  ) : null;

  // План и помощники — у плавающего агентика (тап — подробности); у закрытой сессии план в шапке
  const below = !agent && plan.length ? <PlanCard plan={plan} /> : null;

  const scope = { agentKey: key };
  const loading = !transcript && !!item;

  const left = (
    <Glass radius={22} backing style={styles.menuButton}>
      <Press onPress={() => setSidebar(true)} feedback="tap" style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Панель: агенты и диалоги">
        <SymbolView name="line.3.horizontal" size={19} tintColor={Colors.text} weight="semibold" />
      </Press>
    </Glass>
  );

  return (
    <ChatSidebar
      open={sidebar}
      currentId={currentChatId}
      mode="work"
      limits={limits}
      onOpen={() => setSidebar(true)}
      onClose={() => setSidebar(false)}
      onSelect={openChat}
      onNew={openNewChat}>
    <ChatLayout
      title={title}
      left={left}
      right={right}
      below={below}
      overlay={({ top, bottom }) =>
        agent ? (
          <FloatingAgent agent={agent} transcript={transcript} plan={plan} helpers={helpers} now={now} stopping={stopping} top={top} bottom={bottom} />
        ) : null
      }
      data={rows}
      keyOf={(row) => row.key}
      renderItem={({ item: row }) =>
        row.kind === 'message' ? (
          <TranscriptRow message={row.message} scope={scope} animate={isFresh(row.key)} />
        ) : (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} style={styles.pendingRow}>
            <UserBubble
              text={row.text}
              images={row.images}
              localImages={row.localImages}
              scope={scope}
              pending
              progress={row.total ? row.progress / row.total : 1}
            />
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
              // Карточки не закрывают ленту: не выше ~40% экрана, дальше прокрутка
              <ScrollView
                style={[styles.cards, { maxHeight: Math.max(180, Math.round(screenH * 0.42)) }]}
                contentContainerStyle={styles.cardsInner}
                keyboardShouldPersistTaps="handled">
                {question ? (
                  <QuestionCard
                    question={question}
                    picked={current.picked}
                    onPick={pickOption}
                    onSubmit={() => void submitAnswer()}
                    onReopen={() => patchAnswer({ status: { state: 'idle' }, open: true })}
                    onOwnAnswer={() => inputRef.current?.focus()}
                    status={current.status}
                    open={current.open}
                    onToggle={() => patchAnswer({ open: !current.open })}
                    now={now}
                  />
                ) : null}
                {needs.length && !questionOpen ? (
                  <NeedsCard needs={needs} open={needsOpen} completed={completedNeeds} busy={busyNeeds}
                    onToggle={() => setNeedsOpen((v) => !v)} onReply={() => inputRef.current?.focus()}
                    onComplete={(need) => void completeNeed(need)} />
                ) : null}
              </ScrollView>
            ) : null}
            <Composer
              inputRef={inputRef}
              placeholder={questionOpen ? 'Свой ответ на вопрос…' : agent.state === 'working' ? 'Увидит после шага…' : 'Написать агенту'}
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
    </ChatSidebar>
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
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, paddingLeft: 9, flexShrink: 0 },
  shortStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  statusPart: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  more: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  pendingRow: { paddingHorizontal: 16, paddingVertical: 7 },
  empty: { alignItems: 'center' },
  // Непрозрачная подложка: лента не просвечивает между карточками
  cards: { flexGrow: 0, backgroundColor: Colors.background },
  cardsInner: { paddingHorizontal: 10, paddingTop: 8, gap: 6 },
  closedWrap: { paddingHorizontal: 10, paddingTop: 6 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  closedButton: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center' },
});
