import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmCloseAgent, stopAgent } from '@/ara/actions';
import { ara } from '@/ara/client';
import { AGENT_LABEL, ago, DEVICE_META, STATE_META } from '@/ara/format';
import { useAra, useNow } from '@/ara/hooks';
import { pins, usePins } from '@/ara/pins';
import type { Agent, DeviceId, RecentSession } from '@/ara/types';
import { chats, useCurrentChatId } from '@/ara/chats';
import { openChat, openNewChat } from '@/components/chat-list';
import { ChatSidebar } from '@/components/chat-sidebar';
import { ProjectMascot } from '@/components/project-mascot';
import { GlassMenu, type MenuAnchor, type MenuSection } from '@/components/glass-menu';
import { IconButton, Press, StatusDot, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const DEVICES: DeviceId[] = ['laptop', 'pc'];
/** Затемнение сверху: от почти сплошного к прозрачному */
const FADE = [0.96, 0.94, 0.9, 0.85, 0.78, 0.7, 0.6, 0.48, 0.36, 0.24, 0.13, 0.05];
const layout = LinearTransition.duration(240).easing(Easing.out(Easing.cubic));

function openAgent(key: string) {
  router.push({ pathname: '/agent/[key]', params: { key } });
}

/** The old «Работа» list page (agents are in the left panel now). */
export function WorkList() {
  const insets = useSafeAreaInsets();
  const state = useAra();
  const pinned = usePins();
  const now = useNow(30_000);
  const [sidebar, setSidebar] = useState(false);
  const currentChatId = useCurrentChatId() || '';
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

  return (
    <ChatSidebar
      open={sidebar}
      currentId={currentChatId}
      mode="work"
      limits={state.limits}
      onOpen={() => setSidebar(true)}
      onClose={() => setSidebar(false)}
      onSelect={openChat}
      onNew={openNewChat}
      onWork={() => setSidebar(false)}
      onTalk={() => openChat(chats.ensureCurrent())}>
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          indicatorStyle="white"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} progressViewOffset={insets.top + 56} />}>
          {!state.connected ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.banner}>
              <SymbolView name="wifi.exclamationmark" size={14} tintColor={Colors.waiting} />
              <T v="footnote" color={Colors.textSecondary}>Нет связи с сервером — переподключаюсь…</T>
            </Animated.View>
          ) : null}

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
                  agents={sortPinned(agents.filter((a) => a.device === device), pinned)}
                  pinned={pinned}
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
        </ScrollView>
        {/* Как в ChatGPT: без серой полосы, список мягко уходит под шапку */}
        <View pointerEvents="none" style={[styles.fade, { height: insets.top + 84 }]}>
          {FADE.map((opacity, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: Colors.background, opacity }} />
          ))}
        </View>
        <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <IconButton icon="line.3.horizontal" label="Меню" onPress={() => setSidebar(true)} />
          <View style={styles.topTitle} pointerEvents="none">
            <T v="headline" weight="700">Работа</T>
          </View>
          <IconButton icon="square.and.pencil" label="Новый агент" onPress={() => router.push('/new')} />
        </View>
      </View>
    </ChatSidebar>
  );
}

/** Закреплённые — первыми, остальные в прежнем порядке. */
function sortPinned(list: Agent[], pinned: string[]) {
  return [...list].sort((a, b) => Number(pinned.includes(b.key)) - Number(pinned.includes(a.key)));
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

function DeviceSection({ device, online, agents, pinned, loaded, filtered, now }: {
  device: DeviceId;
  online: boolean;
  agents: Agent[];
  pinned: string[];
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
          agents.map((agent, i) => <AgentRow key={agent.key} agent={agent} pinned={pinned.includes(agent.key)} first={i === 0} now={now} />)
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

function AgentRow({ agent, pinned, first, now }: { agent: Agent; pinned: boolean; first: boolean; now: number }) {
  const meta = STATE_META[agent.state];
  // big: what the agent is doing (the session's name); small: its state and
  // the project; right corner: when it last did something
  const doing = agent.title || agent.task || agent.project;
  const since = agent.since ? ago(agent.since, now) : '';
  const ref = useRef<View>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);

  const openMenu = () => {
    haptic.press();
    ref.current?.measureInWindow((x, y, width, height) => setMenu({ x, y, width, height }));
  };

  const sections: MenuSection[] = [
    [
      { label: pinned ? 'Открепить' : 'Закрепить сверху', icon: pinned ? 'pin.slash' : 'pin', onPress: () => pins.toggle(agent.key) },
      { label: 'Скопировать путь', icon: 'doc.on.doc', onPress: () => Clipboard.setStringAsync(agent.cwd).then(() => haptic.success()) },
      ...(agent.state === 'working' ? [{ label: 'Остановить', icon: 'stop.circle' as const, onPress: () => stopAgent(agent).catch(() => {}) }] : []),
    ],
    [{ label: 'Закрыть терминал', icon: 'xmark.circle', destructive: true, onPress: () => confirmCloseAgent(agent) }],
  ];

  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOut.duration(160)} layout={layout} style={!first && styles.rowBorder}>
      <ReanimatedSwipeable
        friction={1.6}
        rightThreshold={44}
        overshootRight={false}
        renderRightActions={(_progress, _translation, methods: SwipeableMethods) => (
          <Press
            onPress={() => {
              methods.close();
              confirmCloseAgent(agent);
            }}
            feedback="press"
            scaleTo={1}
            style={styles.swipeClose}
            accessibilityLabel="Закрыть терминал">
            <SymbolView name="xmark" size={16} tintColor={Colors.text} weight="bold" />
            <T v="caption" weight="700">Закрыть</T>
          </Press>
        )}>
        <Press
          ref={ref}
          onPress={() => openAgent(agent.key)}
          onLongPress={openMenu}
          delayLongPress={350}
          scaleTo={0.985}
          style={styles.row}
          accessibilityLabel={`${AGENT_LABEL[agent.agent]} ${agent.project}, ${meta.label}${pinned ? ', закреплён' : ''}`}
          accessibilityHint="Долгое нажатие — действия, свайп влево — закрыть">
          <ProjectMascot id={agent.mascotId} size={34} still />
          <View style={styles.rowText}>
            <View style={styles.rowTitle}>
              {pinned ? <SymbolView name="pin.fill" size={10} tintColor={Colors.textTertiary} /> : null}
              <T v="callout" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{doing}</T>
            </View>
            <T v="footnote" color={Colors.textSecondary} numberOfLines={1}>{agent.project}</T>
          </View>
          <View style={styles.rowRight}>
            {since ? <T v="caption" color={Colors.textTertiary}>{since}</T> : null}
            <StatusDot state={agent.state} />
          </View>
        </Press>
      </ReanimatedSwipeable>
      <GlassMenu anchor={menu} sections={sections} onClose={() => setMenu(null)} />
    </Animated.View>
  );
}

function RecentRow({ item, first, now }: { item: RecentSession; first: boolean; now: number }) {
  return (
    <Press onPress={() => openAgent(item.key)} scaleTo={0.985} style={[styles.row, !first && styles.rowBorder]} accessibilityLabel={item.title || item.project}>
      <ProjectMascot id={item.mascotId} size={28} still />
      <View style={styles.rowText}>
        <T v="subhead" numberOfLines={1}>{item.title || 'Без названия'}</T>
        <T v="caption" color={Colors.textSecondary} numberOfLines={1}>{item.project}</T>
      </View>
      {item.mtime ? <T v="caption" color={Colors.textTertiary}>{ago(item.mtime * 1000, now)}</T> : null}
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
  },
  topTitle: { flex: 1, alignItems: 'center' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  edgeSwipe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 4 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 58, backgroundColor: Colors.card },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swipeClose: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: Colors.danger },
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
});

/** Start with project agents. A conversation opens only by an explicit choice. */
export default function Home() {
  return <WorkList />;
}
