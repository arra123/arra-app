import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleButton } from '@/components/apple-button';
import { ChangelogModal } from '@/components/changelog-modal';
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

  const [openingTestFlight, setOpeningTestFlight] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  async function openTestFlight() {
    if (openingTestFlight) return;
    setOpeningTestFlight(true);
    try {
      if (Platform.OS === 'ios') await Linking.openURL('itms-beta://');
      else await Linking.openURL('https://apps.apple.com/app/testflight/id899247664');
    } catch {
      try {
        await Linking.openURL('https://apps.apple.com/app/testflight/id899247664');
      } catch {
        Alert.alert('Не удалось открыть TestFlight', 'Открой TestFlight вручную и нажми «Обновить» у Noda.');
      }
    } finally {
      setOpeningTestFlight(false);
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
          <TouchableOpacity activeOpacity={0.8} onPress={openTestFlight} disabled={openingTestFlight}>
            <GlassCard radius={Radius.lg} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={{ flex: 1, paddingRight: Spacing.two }}>
                  <ThemedText type="smallBold">Открыть TestFlight</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Noda v{APP_BUILD} · обновления только через TestFlight</ThemedText>
                </View>
                {openingTestFlight
                  ? <ActivityIndicator color={theme.textSecondary} />
                  : <SymbolView name="arrow.up.forward.app.fill" tintColor={theme.accent} size={20} />}
              </View>
            </GlassCard>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.8} onPress={() => setShowChangelog(true)}>
            <GlassCard radius={Radius.lg} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <SymbolView name="clock.badge.checkmark" tintColor={theme.accent} size={18} />
                  <ThemedText type="smallBold">Последние изменения</ThemedText>
                </View>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
              </View>
            </GlassCard>
          </TouchableOpacity>

          <AppleButton
            label="Выйти"
            onPress={logout}
            variant="glass"
            role="destructive"
            tint={theme.danger}
            full
            style={{ marginTop: Spacing.two }}
          />
      </ScrollView>
      <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />
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
