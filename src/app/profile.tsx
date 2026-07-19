import { SymbolView } from 'expo-symbols';
import * as Updates from 'expo-updates';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChangelogModal } from '@/components/changelog-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { APP_BUILD, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

type SettingRowProps = {
  icon: string;
  title: string;
  value?: string;
  danger?: boolean;
  loading?: boolean;
  onPress?: () => void;
  last?: boolean;
  accessory?: ReactNode;
};

export default function ProfileScreen({ embedded = false }: { embedded?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const workspace = useWorkspace();
  const [updating, setUpdating] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [pcCount, setPcCount] = useState(0);
  const initial = (user?.name || user?.email || 'N').trim()[0]?.toUpperCase() || 'N';
  const activeDevice = workspace.devices.find((device) => device.id === workspace.activeDeviceId);

  useEffect(() => {
    api<{ tokens: unknown[] }>('/pc/tokens').then((result) => setPcCount(result.tokens?.length || 0)).catch(() => {});
  }, []);

  async function openTestFlight() {
    try {
      await Linking.openURL(Platform.OS === 'ios' ? 'itms-beta://' : 'https://apps.apple.com/app/testflight/id899247664');
    } catch {
      try { await Linking.openURL('https://apps.apple.com/app/testflight/id899247664'); }
      catch { Alert.alert('Не удалось открыть TestFlight'); }
    }
  }

  async function checkUpdate() {
    if (updating) return;
    setUpdating(true);
    try {
      if (Updates.isEnabled && !__DEV__) {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
        Alert.alert('Noda обновлена', 'Установлена актуальная версия.');
        return;
      }
      await openTestFlight();
    } catch {
      await openTestFlight();
    } finally {
      setUpdating(false);
    }
  }

  function clearChat() {
    Alert.alert('Очистить текущую задачу?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить',
        style: 'destructive',
        onPress: () => api(`/ai/messages?thread=${encodeURIComponent(workspace.threadKey)}`, { method: 'DELETE' }).catch(() => {}),
      },
    ]);
  }

  function confirmLogout() {
    Alert.alert('Выйти из Noda?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: embedded ? Spacing.two : insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.five }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.account}>
          <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={styles.avatarText}>{initial}</ThemedText>
          </View>
          <View style={styles.accountCopy}>
            <ThemedText style={styles.accountName}>{user?.name || 'Аккаунт'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{user?.email}</ThemedText>
          </View>
        </View>

        <SettingsSection label="Рабочее пространство">
          <SettingRow
            icon="desktopcomputer"
            title="Компьютер"
            value={activeDevice?.name || activeDevice?.hostname || (pcCount ? `${pcCount} устройств` : 'Не подключён')}
            accessory={<View style={[styles.onlineDot, activeDevice?.online && styles.onlineDotOn]} />}
          />
          <SettingRow icon="folder" title="Проект" value={workspace.activeProject?.label || workspace.activeProject?.name || 'Не выбран'} />
          <SettingRow icon="cpu" title="Локальная модель" value={workspace.selectedModel || (workspace.models.length ? 'Выберите в чате' : 'Сервер не найден')} last />
        </SettingsSection>

        <SettingsSection label="Приложение">
          <SettingRow icon="moon.fill" title="Оформление" value="Тёмное" />
          <SettingRow icon="arrow.triangle.2.circlepath" title="Проверить обновление" value={`Версия ${APP_BUILD}`} loading={updating} onPress={checkUpdate} />
          <SettingRow icon="clock.arrow.circlepath" title="Что нового" onPress={() => setShowChangelog(true)} last />
        </SettingsSection>

        <SettingsSection label="Данные">
          <SettingRow icon="trash" title="Очистить текущую задачу" danger onPress={clearChat} last />
        </SettingsSection>

        <SettingsSection>
          <SettingRow icon="rectangle.portrait.and.arrow.right" title="Выйти" danger onPress={confirmLogout} last />
        </SettingsSection>

        <ThemedText style={styles.version}>Noda · {APP_BUILD}</ThemedText>
      </ScrollView>
      <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />
    </ThemedView>
  );
}

function SettingsSection({ label, children }: { label?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionWrap}>
      {!!label && <ThemedText style={styles.sectionLabel}>{label}</ThemedText>}
      <View style={[styles.section, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>{children}</View>
    </View>
  );
}

function SettingRow({ icon, title, value, danger, loading, onPress, last, accessory }: SettingRowProps) {
  const theme = useTheme();
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }]}>
      <SymbolView name={icon as any} tintColor={danger ? theme.danger : theme.textSecondary} size={17} />
      <ThemedText type="smallBold" style={[styles.rowTitle, danger && { color: theme.danger }]}>{title}</ThemedText>
      {!!value && <ThemedText style={styles.rowValue} numberOfLines={1}>{value}</ThemedText>}
      {loading ? <ActivityIndicator size="small" color={theme.textSecondary} /> : accessory}
      {!!onPress && !loading && <SymbolView name="chevron.right" tintColor="#6f6f6f" size={13} />}
    </View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.66} onPress={onPress}>{content}</TouchableOpacity> : content;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, gap: Spacing.four },
  account: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 4 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: '700' },
  accountCopy: { flex: 1, gap: 1 },
  accountName: { fontSize: 18, lineHeight: 23, fontWeight: '700' },
  sectionWrap: { gap: 8 },
  sectionLabel: { color: '#777', fontSize: 12, lineHeight: 16, paddingHorizontal: 4 },
  section: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 50, marginLeft: 14, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowTitle: { flex: 1 },
  rowValue: { maxWidth: '43%', color: '#8d8d8d', fontSize: 12, lineHeight: 17, textAlign: 'right' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#666' },
  onlineDotOn: { backgroundColor: '#2fbf71' },
  version: { color: '#5f5f5f', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
