import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ara } from '@/ara/client';
import { baseName, DEVICE_META, shortPath } from '@/ara/format';
import { useAra } from '@/ara/hooks';
import type { AgentKind, DeviceId } from '@/ara/types';
import { Segmented } from '@/components/segmented';
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

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View entering={FadeInDown.duration(300)} style={styles.hero}>
          <AgentIcon agent={agent} size={52} />
          <T v="title" weight="800">Новый агент</T>
          <T v="footnote" color={Colors.textSecondary} style={{ textAlign: 'center' }}>
            Откроется настоящий терминал на компьютере, а переписка будет и там, и здесь
          </T>
        </Animated.View>

        <Segmented
          glass={false}
          value={agent}
          onChange={setAgent}
          options={[
            { value: 'claude', label: 'Claude', icon: 'asterisk' },
            { value: 'codex', label: 'Codex', icon: 'chevron.left.forwardslash.chevron.right' },
          ]}
        />

        <Label>Где</Label>
        <Segmented
          glass={false}
          value={device}
          onChange={(d) => {
            setDevice(d);
            setDir('');
            setCustom(false);
          }}
          options={(['laptop', 'pc'] as DeviceId[]).map((d) => ({
            value: d,
            label: state.devices[d].online ? DEVICE_META[d].label : `${DEVICE_META[d].label} · офлайн`,
            icon: DEVICE_META[d].icon,
            disabled: !state.devices[d].online,
          }))}
        />

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
            <T v="footnote" weight="600" color={custom ? Colors.onAccent : Colors.text}>Другая папка…</T>
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
          <T v="caption" color={Colors.textTertiary} numberOfLines={1}>{shortPath(dir)}</T>
        ) : null}

        <Label>Модель</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {MODELS[agent].map((m) => {
            const active = m.value === model;
            return (
              <Press key={m.label} onPress={() => setModel(m.value)} feedback="select" style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }} accessibilityLabel={`Модель ${m.label}`}>
                <SymbolView name="bolt.fill" size={11} tintColor={active ? Colors.onAccent : Colors.textSecondary} />
                <T v="footnote" weight="600" color={active ? Colors.onAccent : Colors.text}>{m.label}</T>
              </Press>
            );
          })}
        </ScrollView>

        <Label>Первая задача</Label>
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
            <T v="headline" weight="700" color={Colors.onAccent}>Запустить</T>
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

function Label({ children }: { children: string }) {
  return <T v="caption" weight="600" color={Colors.textSecondary} style={styles.label}>{children}</T>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.card },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 28, gap: 10 },
  hero: { alignItems: 'center', gap: 8, marginBottom: 12 },
  label: { marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
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
  field: {
    backgroundColor: Colors.cardRaised,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: Type.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  task: { minHeight: 110, textAlignVertical: 'top' },
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
