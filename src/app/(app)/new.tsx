import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
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

const MODELS: Record<AgentKind, { value: string; label: string }[]> = {
  claude: [
    { value: 'opus', label: 'Opus' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'haiku', label: 'Haiku' },
  ],
  codex: [{ value: '', label: 'По умолчанию' }],
};

export default function NewAgent() {
  const params = useLocalSearchParams<{ agent?: string; device?: string; dir?: string }>();
  const insets = useSafeAreaInsets();
  const state = useAra();
  const [agent, setAgent] = useState<AgentKind>(params.agent === 'codex' ? 'codex' : 'claude');
  const [device, setDevice] = useState<DeviceId>(params.device === 'pc' ? 'pc' : state.devices.laptop.online || !state.devices.pc.online ? 'laptop' : 'pc');
  const [dir, setDir] = useState(params.dir || '');
  const [custom, setCustom] = useState(false);
  const [model, setModel] = useState(MODELS[agent][0].value);
  const [task, setTask] = useState('');
  const [phase, setPhase] = useState<'idle' | 'launching' | 'waiting'>('idle');
  const known = useRef<Set<string>>(new Set());

  // Папки проектов: где уже работают агенты и недавние сессии этого устройства
  const folders = useMemo(() => {
    const out: string[] = [];
    for (const item of [...state.agents, ...state.recent]) {
      if (item.device === device && item.cwd && !out.includes(item.cwd)) out.push(item.cwd);
    }
    return out.slice(0, 14);
  }, [state.agents, state.recent, device]);

  useEffect(() => {
    if (!dir && folders.length && !custom) setDir(folders[0]);
  }, [folders, dir, custom]);

  useEffect(() => {
    setModel(MODELS[agent][0].value);
  }, [agent]);

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
      await ara.launch({ device, agent, dir: dir.trim(), task: task.trim(), model: model || undefined });
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
                    <View style={[styles.onlineDot, { backgroundColor: on ? Colors.working : Colors.old }]} />
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
                  style={[styles.card, styles.agentCard, active && styles.cardActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={AGENT_LABEL[k]}>
                  <AgentIcon agent={k} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T v="callout" weight="700">{AGENT_LABEL[k]}</T>
                    <T v="caption" color={Colors.textSecondary}>{k === 'claude' ? 'Anthropic' : 'OpenAI'}</T>
                  </View>
                  <Radio active={active} />
                </Press>
              </Animated.View>
            );
          })}
        </View>

        <Label>Папка</Label>
        <Animated.View layout={LinearTransition.duration(200)} style={styles.chips}>
          {folders.map((folder) => {
            const active = !custom && dir === folder;
            return (
              <Press
                key={folder}
                onPress={() => {
                  setCustom(false);
                  setDir(folder);
                }}
                feedback="select"
                style={[styles.chip, active && styles.chipActive]}
                accessibilityLabel={`Папка ${baseName(folder)}`}
                accessibilityState={{ selected: active }}>
                <SymbolView name="folder" size={12} tintColor={active ? Colors.onAccent : Colors.textSecondary} />
                <T v="footnote" weight="600" color={active ? Colors.onAccent : Colors.text} numberOfLines={1}>{baseName(folder)}</T>
              </Press>
            );
          })}
          <Press
            onPress={() => {
              setCustom(true);
              setDir('');
            }}
            feedback="select"
            style={[styles.chip, custom && styles.chipActive]}
            accessibilityLabel="Другая папка">
            <SymbolView name="folder.badge.plus" size={12} tintColor={custom ? Colors.onAccent : Colors.textSecondary} />
            <T v="footnote" weight="600" color={custom ? Colors.onAccent : Colors.text}>Другая…</T>
          </Press>
        </Animated.View>
        {custom ? (
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
            />
          </Animated.View>
        ) : dir ? (
          <T v="caption" color={Colors.textTertiary} numberOfLines={1} style={styles.path}>{shortPath(dir)}</T>
        ) : null}

        {MODELS[agent].length > 1 ? (
          <>
            <Label>Модель</Label>
            <View style={styles.models}>
              {MODELS[agent].map((m) => {
                const active = m.value === model;
                return (
                  <Press
                    key={m.label}
                    onPress={() => setModel(m.value)}
                    feedback="select"
                    style={[styles.model, active && styles.modelActive]}
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Модель ${m.label}`}>
                    <T v="footnote" weight="600" color={active ? Colors.onAccent : Colors.text}>{m.label}</T>
                  </Press>
                );
              })}
            </View>
          </>
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
  agentCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: Colors.cardRaised,
    maxWidth: 220,
  },
  chipActive: { backgroundColor: Colors.text },
  path: { paddingHorizontal: 4 },
  models: { flexDirection: 'row', padding: 3, borderRadius: Radius.pill, backgroundColor: Colors.cardRaised },
  model: { flex: 1, height: 32, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  modelActive: { backgroundColor: Colors.text },
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
