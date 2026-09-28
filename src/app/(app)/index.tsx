import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chats, useChats, type Chat } from '@/ara/chats';
import { ara } from '@/ara/client';
import { AGENT_LABEL, ago, DEVICE_META, STATE_META } from '@/ara/format';
import { useAra, useNow } from '@/ara/hooks';
import type { Agent, DeviceId, RecentSession } from '@/ara/types';
import { MenuTrigger } from '@/components/glass-menu';
import { Segmented } from '@/components/segmented';
import { AgentIcon, Chip, Glass, IconButton, Press, StatusDot, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Tab = 'work' | 'talk';
const DEVICES: DeviceId[] = ['laptop', 'pc'];
const layout = LinearTransition.springify().damping(22).stiffness(200);

function openAgent(key: string) {
  router.push({ pathname: '/agent/[key]', params: { key } });
}

function newChat() {
  const id = chats.create();
  router.push({ pathname: '/chat/[id]', params: { id } });
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const state = useAra();
  const list = useChats();
  const now = useNow(30_000);
  const [tab, setTab] = useState<Tab>('work');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);

  const q = query.trim().toLowerCase();
  const match = (...parts: (string | undefined)[]) => !q || parts.some((p) => p?.toLowerCase().includes(q));
  const agents = state.agents.filter((a) => match(a.project, a.task, a.title, a.cwd));
  const recent = state.recent.filter((r) => match(r.project, r.title, r.cwd));
  const anyOnline = state.devices.laptop.online || state.devices.pc.online;

  const refresh = () => {
    setRefreshing(true);
    ara.refresh();
    setTimeout(() => setRefreshing(false), 700);
  };

  const plusMenu = [
    [
      { label: 'Новый Claude', icon: 'asterisk' as const, onPress: () => router.push({ pathname: '/new', params: { agent: 'claude' } }) },
      { label: 'Новый Codex', icon: 'chevron.left.forwardslash.chevron.right' as const, onPress: () => router.push({ pathname: '/new', params: { agent: 'codex' } }) },
    ],
    [{ label: 'Новый чат с Арой', icon: 'bubble.left.and.bubble.right' as const, onPress: newChat }],
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        indicatorStyle="white"
        refreshControl={tab === 'work' ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} progressViewOffset={insets.top + 56} /> : undefined}>
        {!state.connected ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.banner}>
            <SymbolView name="wifi.exclamationmark" size={14} tintColor={Colors.waiting} />
            <T v="footnote" color={Colors.textSecondary}>Нет связи с сервером — переподключаюсь…</T>
          </Animated.View>
        ) : null}

        {tab === 'work' ? (
          <Animated.View key="work" entering={FadeIn.duration(220)}>
            <View style={styles.search}>
              <SymbolView name="magnifyingglass" size={15} tintColor={Colors.textTertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Поиск"
                placeholderTextColor={Colors.textTertiary}
                style={styles.searchInput}
                keyboardAppearance="dark"
                clearButtonMode="while-editing"
                returnKeyType="search"
                maxFontSizeMultiplier={1.4}
              />
            </View>

            {state.loaded && !anyOnline && !state.agents.length ? (
              <NoComputers />
            ) : (
              DEVICES.map((device) => (
                <DeviceSection
                  key={device}
                  device={device}
                  online={state.devices[device].online}
                  agents={agents.filter((a) => a.device === device)}
                  loaded={state.loaded}
                  filtered={!!q}
                  now={now}
                />
              ))
            )}

            {recent.length ? (
              <View style={styles.section}>
                <SectionTitle title="Недавние сессии" />
                <Animated.View layout={layout} style={styles.group}>
                  {(showAllRecent || q ? recent : recent.slice(0, 12)).map((item, i) => (
                    <RecentRow key={item.key} item={item} first={i === 0} now={now} />
                  ))}
                </Animated.View>
                {!showAllRecent && !q && recent.length > 12 ? (
                  <Press onPress={() => setShowAllRecent(true)} style={styles.more} accessibilityLabel="Показать все сессии">
                    <T v="footnote" color={Colors.textSecondary}>Показать ещё {recent.length - 12}</T>
                  </Press>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View key="talk" entering={FadeIn.duration(220)}>
            <ChatList chats={list} now={now} />
          </Animated.View>
        )}
      </ScrollView>

      {/* Шапка: настройки · Работа/Разговор · новый */}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton icon="gearshape" label="Настройки" onPress={() => router.push('/settings')} />
        <Segmented
          style={styles.segmented}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'work', label: 'Работа', icon: 'terminal' },
            { value: 'talk', label: 'Разговор', icon: 'bubble.left' },
          ]}
        />
        <MenuTrigger label="Создать" sections={plusMenu}>
          <Glass radius={20} interactive style={styles.plus}>
            <SymbolView name="square.and.pencil" size={18} tintColor={Colors.text} weight="semibold" />
          </Glass>
        </MenuTrigger>
      </View>
    </View>
  );
}

function SectionTitle({ title, icon, right }: { title: string; icon?: 'laptopcomputer' | 'desktopcomputer'; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      {icon ? <SymbolView name={icon} size={13} tintColor={Colors.textSecondary} /> : null}
      <T v="caption" weight="600" color={Colors.textSecondary} style={styles.caps}>{title}</T>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

function DeviceSection({ device, online, agents, loaded, filtered, now }: {
  device: DeviceId;
  online: boolean;
  agents: Agent[];
  loaded: boolean;
  filtered: boolean;
  now: number;
}) {
  const meta = DEVICE_META[device];
  if (filtered && !agents.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle
        title={meta.label}
        icon={meta.icon as 'laptopcomputer' | 'desktopcomputer'}
        right={loaded ? (
          <T v="caption" color={online ? Colors.textTertiary : Colors.error}>{online ? `${agents.length || 'нет'} ${agentsWord(agents.length)}` : 'не в сети'}</T>
        ) : null}
      />
      <Animated.View layout={layout} style={styles.group}>
        {agents.length ? (
          agents.map((agent, i) => <AgentRow key={agent.key} agent={agent} first={i === 0} now={now} />)
        ) : (
          <View style={styles.emptyRow}>
            <T v="footnote" color={Colors.textTertiary}>
              {!loaded ? 'Загружаю…' : online ? 'Агентов нет — нажми ✎, чтобы запустить' : `${meta.label} не подключён или выключен`}
            </T>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function agentsWord(n: number) {
  if (!n) return 'агентов';
  if (n % 10 === 1 && n % 100 !== 11) return 'агент';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'агента';
  return 'агентов';
}

function AgentRow({ agent, first, now }: { agent: Agent; first: boolean; now: number }) {
  const meta = STATE_META[agent.state];
  const doing = agent.task || agent.title;
  const since = agent.since ? ` · ${ago(agent.since, now)}` : '';
  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOut.duration(160)} layout={layout}>
      <Press
        onPress={() => openAgent(agent.key)}
        scaleTo={0.985}
        style={[styles.row, !first && styles.rowBorder]}
        accessibilityLabel={`${AGENT_LABEL[agent.agent]} ${agent.project}, ${meta.label}`}>
        <AgentIcon agent={agent.agent} size={34} />
        <View style={styles.rowText}>
          <T v="callout" weight="600" numberOfLines={1}>{agent.project}</T>
          <T v="footnote" color={Colors.textSecondary} numberOfLines={1}>
            <T v="footnote" color={meta.color}>{meta.label}</T>
            {since}{doing ? ` · ${doing}` : ''}
          </T>
        </View>
        <View style={styles.rowRight}>
          <StatusDot state={agent.state} />
          {agent.ws != null ? <Chip>{`стол ${agent.ws}`}</Chip> : null}
        </View>
      </Press>
    </Animated.View>
  );
}

function RecentRow({ item, first, now }: { item: RecentSession; first: boolean; now: number }) {
  return (
    <Press onPress={() => openAgent(item.key)} scaleTo={0.985} style={[styles.row, !first && styles.rowBorder]} accessibilityLabel={item.title || item.project}>
      <AgentIcon agent={item.agent} size={28} />
      <View style={styles.rowText}>
        <T v="subhead" numberOfLines={1}>{item.title || 'Без названия'}</T>
        <T v="caption" color={Colors.textSecondary} numberOfLines={1}>
          {item.project}{item.device === 'pc' ? ' · ПК' : ''}{item.mtime ? ` · ${ago(item.mtime * 1000, now)}` : ''}
        </T>
      </View>
      <SymbolView name="chevron.right" size={12} tintColor={Colors.textTertiary} />
    </Press>
  );
}

function NoComputers() {
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.noComputers}>
      <SymbolView name="laptopcomputer.and.iphone" size={40} tintColor={Colors.textSecondary} />
      <T v="headline" weight="700" style={{ textAlign: 'center' }}>Компьютеры не на связи</T>
      <T v="subhead" color={Colors.textSecondary} style={{ textAlign: 'center' }}>
        Выдай ключ в настройках и запусти ara-link на ноутбуке — агенты появятся здесь.
      </T>
      <Press onPress={() => router.push('/settings')} style={styles.primary} feedback="press" accessibilityLabel="Подключить компьютер">
        <T v="callout" weight="700" color={Colors.onAccent}>Подключить компьютер</T>
      </Press>
    </Animated.View>
  );
}

function ChatList({ chats: list, now }: { chats: Chat[]; now: number }) {
  const sorted = useMemo(() => [...list].sort((a, b) => b.updatedAt - a.updatedAt), [list]);
  return (
    <View style={styles.section}>
      <SectionTitle title="Чаты с Арой" />
      <Press onPress={newChat} style={styles.newChat} feedback="press" accessibilityLabel="Новый чат с Арой">
        <AgentIcon agent="ara" size={34} />
        <View style={styles.rowText}>
          <T v="callout" weight="600">Новый чат</T>
          <T v="footnote" color={Colors.textSecondary}>Быстрые ответы и задачи агентам</T>
        </View>
        <SymbolView name="plus" size={16} tintColor={Colors.textSecondary} weight="semibold" />
      </Press>
      {sorted.length ? (
        <Animated.View layout={layout} style={[styles.group, { marginTop: 12 }]}>
          {sorted.map((chat, i) => {
            const last = chat.messages[chat.messages.length - 1];
            return (
              <Animated.View key={chat.id} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} layout={layout}>
                <Press
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id } })}
                  onLongPress={() => {
                    haptic.press();
                    Alert.alert('Удалить чат?', chat.title, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Удалить', style: 'destructive', onPress: () => chats.remove(chat.id) },
                    ]);
                  }}
                  scaleTo={0.985}
                  style={[styles.row, i > 0 && styles.rowBorder]}
                  accessibilityLabel={chat.title}
                  accessibilityHint="Долгое нажатие — удалить">
                  <SymbolView name="bubble.left" size={17} tintColor={Colors.textSecondary} style={{ width: 28 }} />
                  <View style={styles.rowText}>
                    <T v="subhead" numberOfLines={1}>{chat.title}</T>
                    <T v="caption" color={Colors.textSecondary} numberOfLines={1}>
                      {ago(chat.updatedAt, now)}{last?.text ? ` · ${last.text.replace(/\s+/g, ' ')}` : ''}
                    </T>
                  </View>
                </Press>
              </Animated.View>
            );
          })}
        </Animated.View>
      ) : (
        <T v="footnote" color={Colors.textTertiary} style={{ marginTop: 16, textAlign: 'center' }}>
          Чатов пока нет
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(10,10,12,0.72)',
  },
  segmented: { flex: 1 },
  plus: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: ScreenPadding,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(245,197,66,0.08)',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: ScreenPadding,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: Type.callout, height: 38 },
  section: { marginTop: 22, paddingHorizontal: ScreenPadding },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6 },
  group: { backgroundColor: Colors.card, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 58 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  emptyRow: { paddingHorizontal: 14, paddingVertical: 16 },
  more: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  noComputers: {
    marginTop: 40,
    marginHorizontal: ScreenPadding,
    padding: 24,
    borderRadius: Radius.xl,
    backgroundColor: Colors.card,
    alignItems: 'center',
    gap: 10,
  },
  primary: {
    marginTop: 8,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.card,
  },
});
