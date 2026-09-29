import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ara } from '@/ara/client';
import { AGENT_LABEL, baseName, DEVICE_META, shortPath } from '@/ara/format';
import { useAra } from '@/ara/hooks';
import type { AgentKind, DeviceId } from '@/ara/types';
import { AgentIcon, Press, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Folder = { path: string; kind: 'active' | 'recent' | 'parent'; agents: number; at: number };

const FOLDER_HINT: Record<Folder['kind'], string> = { active: 'сейчас работает', recent: 'недавно', parent: 'папка проектов' };

/** Родительская папка, если это не корень и не домашняя. */
function parentOf(path: string) {
  const trimmed = path.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  if (i <= 0) return null;
  const parent = trimmed.slice(0, i);
  if (/^(\/home\/[^/]+|\/Users\/[^/]+|~|\/root)$/.test(parent)) return null;
  return parent;
}

export default function NewAgent() {
  const params = useLocalSearchParams<{ agent?: string; device?: string; dir?: string }>();
  const insets = useSafeAreaInsets();
  const state = useAra();
  const [agent, setAgent] = useState<AgentKind>(params.agent === 'codex' ? 'codex' : 'claude');
  const [device, setDevice] = useState<DeviceId>(params.device === 'pc' ? 'pc' : state.devices.laptop.online || !state.devices.pc.online ? 'laptop' : 'pc');
  const [dir, setDir] = useState(params.dir || '');
  const [custom, setCustom] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [task, setTask] = useState('');
  const [phase, setPhase] = useState<'idle' | 'launching' | 'waiting'>('idle');
  const known = useRef<Set<string>>(new Set());

  // Папки этого устройства: где сейчас работают агенты, недавние сессии
  // и папки уровнем выше (там лежат другие проекты). Модель не спрашиваем —
  // агент стартует со своей по умолчанию, сменить можно в его меню «⋯».
  const folders = useMemo(() => {
    const map = new Map<string, Folder>();
    for (const a of state.agents) {
      if (a.device !== device || !a.cwd) continue;
      const f = map.get(a.cwd) || { path: a.cwd, kind: 'active' as const, agents: 0, at: a.since || 0 };
      map.set(a.cwd, { ...f, kind: 'active', agents: f.agents + 1 });
    }
    for (const r of state.recent) {
      if (r.device !== device || !r.cwd || map.has(r.cwd)) continue;
      map.set(r.cwd, { path: r.cwd, kind: 'recent', agents: 0, at: (r.mtime || 0) * 1000 });
    }
    const known = [...map.values()];
    for (const f of known) {
      const parent = parentOf(f.path);
      if (parent && !map.has(parent)) map.set(parent, { path: parent, kind: 'parent', agents: 0, at: 0 });
    }
    const rank = { active: 0, recent: 1, parent: 2 };
    return [...map.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || b.at - a.at);
  }, [state.agents, state.recent, device]);

  useEffect(() => {
    if (!dir && folders.length && !custom) setDir(folders[0].path);
  }, [folders, dir, custom]);

  const q = query.trim().toLowerCase();
  const typedPath = /^[~/]/.test(query.trim()) ? query.trim() : '';
  const found = q ? folders.filter((f) => f.path.toLowerCase().includes(q)) : folders;
  const shown = q || showAll ? found : found.slice(0, 6);

  // Запустили — ждём, когда новый агент появится в снимке, и открываем его
  useEffect(() => {
    if (phase !== 'waiting') return;
    const fresh = state.agents.find((a) => a.device === device && a.agent === agent && !known.current.has(a.key) && (!dir || a.cwd === dir || a.cwd.endsWith(baseName(dir))));
    if (fresh) {
      haptic.success();
      router.dismiss();
      setTimeout(() => router.push({ pathname: '/agent/[key]', params: { key: fresh.key } }), 350);
    }
  }, [state.agents, phase, device, agent, dir]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    const timer = setTimeout(() => router.dismiss(), 20_000);
    return () => clearTimeout(timer);
  }, [phase]);

  const online = state.devices[device].online;
  const canLaunch = online && !!dir.trim() && phase === 'idle';

  async function launch() {
    if (!canLaunch) return;
    known.current = new Set(state.agents.map((a) => a.key));
    setPhase('launching');
    haptic.press();
    try {
      await ara.launch({ device, agent, dir: dir.trim(), task: task.trim() });
      setPhase('waiting');
    } catch (error: any) {
      setPhase('idle');
      haptic.error();
      Alert.alert('Не запустился', error?.message || 'Попробуй ещё раз');
    }
  }

  const deviceAgents = (d: DeviceId) => state.agents.filter((a) => a.device === d).length;

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View entering={FadeIn.duration(250)} style={styles.header}>
          <T v="largeTitle" weight="800">Новый агент</T>
          <T v="footnote" color={Colors.textSecondary}>Откроется терминал на компьютере</T>
        </Animated.View>

        <Label>Где</Label>
        <View style={styles.cards}>
          {(['laptop', 'pc'] as DeviceId[]).map((d, i) => {
            const on = state.devices[d].online;
            const active = device === d;
            const count = deviceAgents(d);
            return (
              <Animated.View key={d} entering={FadeInDown.delay(40 + i * 50).duration(260)} style={{ flex: 1 }}>
                <Press
                  onPress={() => {
                    if (active) return;
                    setDevice(d);
                    setDir('');
                    setCustom(false);
                  }}
                  disabled={!on}
                  feedback="select"
                  scaleTo={0.97}
                  style={[styles.card, styles.deviceCard, active && styles.cardActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled: !on }}
                  accessibilityLabel={`${DEVICE_META[d].label}, ${on ? 'в сети' : 'не в сети'}`}>
                  <View style={styles.cardTop}>
                    <SymbolView name={DEVICE_META[d].icon} size={30} tintColor={active ? Colors.text : Colors.textSecondary} />
                    <Radio active={active} />
                  </View>
                  <T v="headline" weight="700">{DEVICE_META[d].label}</T>
                  <View style={styles.online}>
                    <View style={[styles.onlineDot, { backgroundColor: on ? Colors.success : Colors.old }]} />
                    <T v="caption" color={Colors.textSecondary} numberOfLines={1}>
                      {on ? (count ? `в сети · ${count} ${agentsWord(count)}` : 'в сети') : 'не в сети'}
                    </T>
                  </View>
                </Press>
              </Animated.View>
            );
          })}
        </View>

        <Label>Агент</Label>
        <View style={styles.cards}>
          {(['claude', 'codex'] as AgentKind[]).map((k, i) => {
            const active = agent === k;
            return (
              <Animated.View key={k} entering={FadeInDown.delay(120 + i * 50).duration(260)} style={{ flex: 1 }}>
                <Press
                  onPress={() => setAgent(k)}
                  feedback="select"
                  scaleTo={0.97}
                  style={[styles.card, styles.agentCard, active && styles.cardActive, active && { borderColor: k === 'claude' ? Colors.claude : Colors.codex }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${AGENT_LABEL[k]}, ${k === 'claude' ? 'Anthropic' : 'OpenAI'}`}>
                  <View style={styles.cardTop}>
                    <AgentIcon agent={k} size={44} />
                    <Radio active={active} />
                  </View>
                  <T v="headline" weight="700">{AGENT_LABEL[k]}</T>
                  <T v="caption" color={Colors.textSecondary}>{k === 'claude' ? 'Anthropic · модель по умолчанию' : 'OpenAI · модель по умолчанию'}</T>
                </Press>
              </Animated.View>
            );
          })}
        </View>

        <Label>Папка</Label>
        <View style={styles.search}>
          <SymbolView name="magnifyingglass" size={15} tintColor={Colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти папку или ввести путь"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance="dark"
            clearButtonMode="while-editing"
            returnKeyType="done"
            style={styles.searchInput}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel="Поиск папки"
          />
        </View>
        <Animated.View layout={LinearTransition.duration(200)} style={styles.folders}>
          {typedPath ? (
            <FolderRow
              icon="folder.badge.plus"
              title={`Открыть ${shortPath(typedPath)}`}
              hint="путь как написан"
              active={custom && dir === typedPath}
              onPress={() => {
                setCustom(true);
                setDir(typedPath);
              }}
            />
          ) : null}
          {shown.map((f) => (
            <FolderRow
              key={f.path}
              icon={f.kind === 'parent' ? 'folder' : 'folder.fill'}
              title={baseName(f.path)}
              hint={`${shortPath(f.path)} · ${f.kind === 'active' && f.agents > 1 ? `работают ${f.agents}` : FOLDER_HINT[f.kind]}`}
              active={!custom && dir === f.path}
              onPress={() => {
                setCustom(false);
                setDir(f.path);
              }}
            />
          ))}
          {!q && !showAll && found.length > shown.length ? (
            <Press onPress={() => setShowAll(true)} feedback="select" style={styles.folderMore} accessibilityLabel="Показать все папки">
              <T v="footnote" color={Colors.textSecondary}>Показать все ({found.length})</T>
            </Press>
          ) : null}
          {q && !found.length && !typedPath ? (
            <T v="footnote" color={Colors.textTertiary} style={styles.folderEmpty}>Такой папки среди проектов нет — начни путь с «~/» или «/»</T>
          ) : null}
          <FolderRow
            icon="character.cursor.ibeam"
            title="Другая папка…"
            hint="ввести полный путь"
            active={custom && dir !== typedPath}
            onPress={() => {
              setCustom(true);
              setDir(typedPath || '');
            }}
          />
        </Animated.View>
        {custom && dir !== typedPath ? (
          <Animated.View entering={FadeIn.duration(180)}>
            <TextInput
              value={dir}
              onChangeText={setDir}
              placeholder="~/Claude/проект"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardAppearance="dark"
              style={styles.field}
              accessibilityLabel="Путь к папке"
            />
          </Animated.View>
        ) : null}

        <Label>Задача</Label>
        <TextInput
          value={task}
          onChangeText={setTask}
          placeholder="Что сделать? Можно оставить пустым"
          placeholderTextColor={Colors.textTertiary}
          multiline
          keyboardAppearance="dark"
          style={[styles.field, styles.task]}
        />

        <Press onPress={launch} disabled={!canLaunch} feedback="none" style={styles.launch} accessibilityLabel="Запустить агента">
          {phase === 'idle' ? (
            <View style={styles.launching}>
              <SymbolView name="play.fill" size={14} tintColor={Colors.onAccent} />
              <T v="headline" weight="700" color={Colors.onAccent}>Запустить</T>
            </View>
          ) : (
            <View style={styles.launching}>
              <ActivityIndicator color={Colors.onAccent} />
              <T v="headline" weight="700" color={Colors.onAccent}>{phase === 'launching' ? 'Запускаю…' : 'Открываю терминал…'}</T>
            </View>
          )}
        </Press>
        {!online ? (
          <T v="footnote" color={Colors.error} style={{ textAlign: 'center' }}>{DEVICE_META[device].label} сейчас не в сети</T>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

function FolderRow({ icon, title, hint, active, onPress }: { icon: SFSymbol; title: string; hint: string; active: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      feedback="select"
      scaleTo={0.99}
      style={[styles.folder, active && styles.folderActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${title}, ${hint}`}>
      <SymbolView name={icon} size={18} tintColor={active ? Colors.text : Colors.textSecondary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="callout" weight="600" numberOfLines={1}>{title}</T>
        <T v="caption" color={Colors.textSecondary} numberOfLines={1}>{hint}</T>
      </View>
      {active ? <SymbolView name="checkmark" size={14} tintColor={Colors.text} weight="bold" /> : null}
    </Press>
  );
}

function Radio({ active }: { active: boolean }) {
  return (
    <View style={[styles.radio, active && styles.radioActive]}>
      {active ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

function agentsWord(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return 'агент';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'агента';
  return 'агентов';
}

function Label({ children }: { children: string }) {
  return <T v="caption" weight="600" color={Colors.textSecondary} style={styles.label}>{children}</T>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.card },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 26, gap: 10 },
  header: { gap: 4, paddingHorizontal: 4, marginBottom: 4 },
  label: { marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
  cards: { flexDirection: 'row', gap: 10 },
  card: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardRaised,
    borderWidth: 1.5,
    borderColor: Colors.separator,
  },
  cardActive: { borderColor: Colors.text, backgroundColor: Colors.cardPressed },
  deviceCard: { padding: 14, gap: 6, minHeight: 118 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', height: 36, marginBottom: 4 },
  agentCard: { padding: 14, gap: 4, minHeight: 124 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardRaised,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: Type.callout, height: 40 },
  folders: { borderRadius: Radius.lg, backgroundColor: Colors.cardRaised, overflow: 'hidden' },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.separator },
  folderActive: { backgroundColor: Colors.cardPressed },
  folderMore: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.separator },
  folderEmpty: { paddingHorizontal: 14, paddingVertical: 12 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.text, backgroundColor: Colors.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.onAccent },
  field: {
    backgroundColor: Colors.cardRaised,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: Type.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  task: { minHeight: 96, textAlignVertical: 'top' },
  launch: {
    marginTop: 18,
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launching: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
