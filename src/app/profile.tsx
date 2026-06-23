import { GlassView } from 'expo-glass-effect';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { APP_BUILD, BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default function ProfileScreen({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const initial = (user?.name || user?.email || 'A').trim()[0]?.toUpperCase() || 'A';
  const [sum, setSum] = useState<{ income: number; expense: number }>({ income: 0, expense: 0 });
  const [pc, setPc] = useState<{ online: boolean; count: number }>({ online: false, count: 0 });

  useEffect(() => {
    api<{ summary: { income: number; expense: number } }>('/stats/summary')
      .then((r) => setSum(r.summary))
      .catch(() => {});
    api<{ tokens: { online?: boolean }[]; online: boolean }>('/pc/tokens')
      .then((r) => setPc({ online: r.online, count: r.tokens.length }))
      .catch(() => {});
  }, []);

  const [checking, setChecking] = useState(false);
  async function checkUpdate() {
    if (checking) return;
    setChecking(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert('Обновление готово', 'Сейчас приложение перезапустится с новой версией.', [
          { text: 'Перезапустить', onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        Alert.alert('Уже последняя версия', `У тебя установлена v${APP_BUILD}.`);
      }
    } catch (e: any) {
      Alert.alert('Не получилось проверить', e?.message || 'Проверь интернет и попробуй ещё раз.');
    } finally {
      setChecking(false);
    }
  }

  function clearChat() {
    Alert.alert('Очистить диалог?', 'История переписки с помощником будет удалена.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: () => api('/ai/messages', { method: 'DELETE' }).catch(() => {}) },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.safe}
        contentContainerStyle={[styles.content, { paddingTop: embedded ? Spacing.two : insets.top + Spacing.two }]}
        showsVerticalScrollIndicator={false}>
        {!embedded && (
          <ThemedText type="title" style={styles.h1}>
            Профиль
          </ThemedText>
        )}

          <GlassCard radius={Radius.xl} style={styles.userCard}>
            <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
              <ThemedText style={styles.avatarText}>{initial}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={{ fontSize: 22, lineHeight: 26 }}>
                {user?.name || 'Аккаунт'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user?.email}
              </ThemedText>
            </View>
          </GlassCard>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>За этот месяц</ThemedText>
          <View style={styles.statRow}>
            <GlassCard radius={Radius.lg} style={styles.statCard}>
              <SymbolView name="arrow.down.left" tintColor={theme.success} size={18} />
              <ThemedText style={[styles.statVal, { color: theme.success }]}>{fmt(sum.income)} ₽</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">доход</ThemedText>
            </GlassCard>
            <GlassCard radius={Radius.lg} style={styles.statCard}>
              <SymbolView name="arrow.up.right" tintColor={theme.danger} size={18} />
              <ThemedText style={[styles.statVal, { color: theme.danger }]}>{fmt(sum.expense)} ₽</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">расход</ThemedText>
            </GlassCard>
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>Связь с компьютером</ThemedText>
          <GlassCard radius={Radius.lg} style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <View style={[styles.statusDot, { backgroundColor: pc.online ? theme.success : theme.textSecondary }]} />
                <ThemedText type="smallBold">{pc.online ? 'Компьютер на связи' : 'Компьютер офлайн'}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{pc.count} устр.</ThemedText>
            </View>
          </GlassCard>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>Заметки</ThemedText>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/notes')}>
            <GlassCard radius={Radius.lg} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <ThemedText type="smallBold">Мои заметки</ThemedText>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
              </View>
            </GlassCard>
          </TouchableOpacity>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>Помощник</ThemedText>
          <TouchableOpacity activeOpacity={0.8} onPress={clearChat}>
            <GlassCard radius={Radius.lg} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <ThemedText type="smallBold">Очистить диалог</ThemedText>
                <SymbolView name="trash" tintColor={theme.textSecondary} size={18} />
              </View>
            </GlassCard>
          </TouchableOpacity>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>Обновление</ThemedText>
          <TouchableOpacity activeOpacity={0.8} onPress={checkUpdate} disabled={checking}>
            <GlassCard radius={Radius.lg} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View>
                  <ThemedText type="smallBold">Проверить обновление</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">установлена v{APP_BUILD}</ThemedText>
                </View>
                {checking
                  ? <ActivityIndicator color={theme.textSecondary} />
                  : <SymbolView name="arrow.triangle.2.circlepath" tintColor={theme.accent} size={20} />}
              </View>
            </GlassCard>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={logout}>
            <GlassView isInteractive tintColor={theme.danger} style={[styles.logout, { borderRadius: Radius.pill }]}>
              <ThemedText style={{ color: theme.danger, fontWeight: '600', fontSize: 16 }}>Выйти</ThemedText>
            </GlassView>
          </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
  h1: { fontSize: 34, lineHeight: 40, marginTop: Spacing.two },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 24 },
  infoCard: { padding: Spacing.three },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { marginTop: Spacing.two, marginLeft: 4 },
  statRow: { flexDirection: 'row', gap: Spacing.three },
  statCard: { flex: 1, padding: Spacing.three, gap: 4, alignItems: 'flex-start' },
  statVal: { fontSize: 22, fontWeight: '800' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  listCard: { paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowEmoji: { fontSize: 22 },
  logout: { height: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: Spacing.two },
  version: { textAlign: 'center', marginTop: Spacing.three },
});
