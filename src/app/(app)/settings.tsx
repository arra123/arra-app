import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chats } from '@/ara/chats';
import { DEVICE_META } from '@/ara/format';
import { useAra } from '@/ara/hooks';
import type { DeviceId } from '@/ara/types';
import { IconButton, Press, T } from '@/components/ui';
import { APP_BUILD, Colors, Fonts, Radius, ScreenPadding } from '@/constants/theme';
import { api, API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { registerForPush } from '@/lib/push';

type TokenRow = { id: string; name: string; role: string | null; online: boolean; last_seen: string | null };
type Issued = { device: DeviceId; token: string };

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const state = useAra();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [issuing, setIssuing] = useState<DeviceId | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [push, setPush] = useState<'granted' | 'denied' | 'undetermined' | null>(null);

  const load = useCallback(() => {
    api<{ tokens: TokenRow[] }>('/pc/tokens').then((r) => setTokens(r.tokens)).catch(() => setTokens([]));
    Notifications.getPermissionsAsync().then((p) => setPush(p.status as typeof push)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function issue(device: DeviceId, rotate = false) {
    setIssuing(device);
    try {
      const res = await api<{ pcToken: { token: string } }>('/pc/token', {
        body: { name: DEVICE_META[device].label, role: device, deviceKey: `ara-link-${device}`, rotate },
      });
      setIssued({ device, token: res.pcToken.token });
      haptic.success();
      load();
    } catch (error: any) {
      Alert.alert('Ключ не выдан', error?.message || '');
    } finally {
      setIssuing(null);
    }
  }

  function rotate(device: DeviceId) {
    Alert.alert('Выдать новый ключ?', `Старый ключ ${DEVICE_META[device].label.toLowerCase()} перестанет работать — ara-link придётся перенастроить.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выдать новый', style: 'destructive', onPress: () => issue(device, true) },
    ]);
  }

  function remove(row: TokenRow) {
    Alert.alert('Отключить компьютер?', `${row.name} больше не сможет подключаться с этим ключом.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отключить',
        style: 'destructive',
        onPress: () => api(`/pc/tokens/${row.id}`, { method: 'DELETE' }).then(load).catch(() => {}),
      },
    ]);
  }

  async function enablePush() {
    if (push === 'denied') {
      Linking.openSettings();
      return;
    }
    await registerForPush();
    load();
  }

  const copy = (text: string) => Clipboard.setStringAsync(text).then(() => haptic.success());
  const version = `${Constants.expoConfig?.version || '?'} · JS ${APP_BUILD}`;

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: 14 }]}>
        <T v="title" weight="800">Настройки</T>
        <IconButton icon="xmark" label="Закрыть" onPress={() => router.back()} size={34} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} indicatorStyle="white">
        <Section title="Компьютеры">
          {(['laptop', 'pc'] as DeviceId[]).map((device, i) => {
            const row = tokens?.find((t) => t.role === device);
            const online = state.devices[device].online;
            const via = state.devices[device].via;
            return (
              <View key={device} style={[styles.row, i > 0 && styles.rowBorder]}>
                <SymbolView name={DEVICE_META[device].icon} size={22} tintColor={Colors.text} style={{ width: 30 }} />
                <View style={{ flex: 1 }}>
                  <T v="callout" weight="600">{DEVICE_META[device].label}</T>
                  <T v="caption" color={online ? Colors.working : Colors.textSecondary}>
                    {online ? (via && via !== device ? `на связи через ${DEVICE_META[via].label.toLowerCase()}` : 'на связи') : row ? 'не в сети' : 'не подключён'}
                  </T>
                </View>
                {issuing === device ? (
                  <ActivityIndicator color={Colors.textSecondary} />
                ) : row ? (
                  <View style={styles.rowActions}>
                    <Press onPress={() => issue(device)} style={styles.smallButton} accessibilityLabel={`Показать ключ: ${DEVICE_META[device].label}`}>
                      <T v="footnote" weight="600">Ключ</T>
                    </Press>
                    <Press onPress={() => rotate(device)} hitSlop={8} accessibilityLabel="Выдать новый ключ">
                      <SymbolView name="arrow.triangle.2.circlepath" size={16} tintColor={Colors.textSecondary} />
                    </Press>
                    <Press onPress={() => remove(row)} hitSlop={8} accessibilityLabel="Отключить компьютер">
                      <SymbolView name="trash" size={16} tintColor={Colors.error} />
                    </Press>
                  </View>
                ) : (
                  <Press onPress={() => issue(device)} style={[styles.smallButton, styles.primaryButton]} feedback="press" accessibilityLabel={`Подключить: ${DEVICE_META[device].label}`}>
                    <T v="footnote" weight="700" color={Colors.onAccent}>Подключить</T>
                  </Press>
                )}
              </View>
            );
          })}
        </Section>

        {issued ? (
          <Animated.View entering={FadeInDown.duration(260)} style={styles.keyCard}>
            <T v="subhead" weight="700">Ключ: {DEVICE_META[issued.device].label}</T>
            <T v="footnote" color={Colors.textSecondary}>
              На {issued.device === 'pc' ? 'ПК' : 'ноутбуке'} в папке репозитория выполни команду — она поставит ara-link и включит его автозапуск:
            </T>
            <Press onPress={() => copy(`cd ara-link && ./install.sh ${issued.token} ${issued.device}`)} style={styles.code} accessibilityLabel="Скопировать команду установки">
              <T v="caption" style={styles.mono} selectable>{`cd ara-link && ./install.sh ${issued.token} ${issued.device}`}</T>
              <SymbolView name="doc.on.doc" size={14} tintColor={Colors.textSecondary} />
            </Press>
            <T v="footnote" color={Colors.textSecondary}>или положи в ~/.config/ara-link/config.json:</T>
            <Press
              onPress={() => copy(JSON.stringify({ apiUrl: API_URL, token: issued.token, device: issued.device }, null, 2))}
              style={styles.code}
              accessibilityLabel="Скопировать конфиг">
              <T v="caption" style={styles.mono} selectable>{JSON.stringify({ apiUrl: API_URL, token: issued.token, device: issued.device }, null, 2)}</T>
              <SymbolView name="doc.on.doc" size={14} tintColor={Colors.textSecondary} />
            </Press>
            <T v="caption" color={Colors.textTertiary}>
              Достаточно ноутбука: агенты ПК видны через него. ara-link на ПК нужен, только если хочешь связь с ПК без ноутбука.
            </T>
          </Animated.View>
        ) : null}

        <Section title="Уведомления">
          <View style={styles.row}>
            <SymbolView name="bell.badge" size={20} tintColor={Colors.text} style={{ width: 30 }} />
            <View style={{ flex: 1 }}>
              <T v="callout" weight="600">Агент закончил</T>
              <T v="caption" color={Colors.textSecondary}>Баннер, пока приложение открыто; когда закрыто — сообщение в Telegram</T>
            </View>
            {push === 'granted' ? (
              <SymbolView name="checkmark.circle.fill" size={20} tintColor={Colors.working} />
            ) : (
              <Press onPress={enablePush} style={styles.smallButton} accessibilityLabel="Включить уведомления">
                <T v="footnote" weight="600">{push === 'denied' ? 'Настройки' : 'Включить'}</T>
              </Press>
            )}
          </View>
        </Section>

        <Section title="Аккаунт">
          <View style={styles.row}>
            <SymbolView name="person.crop.circle" size={22} tintColor={Colors.text} style={{ width: 30 }} />
            <T v="callout" style={{ flex: 1 }} numberOfLines={1}>{user?.name || user?.email}</T>
          </View>
          <Press
            onPress={() =>
              Alert.alert('Выйти из аккаунта?', 'Чаты с Арой на этом телефоне удалятся.', [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Выйти',
                  style: 'destructive',
                  onPress: () => {
                    chats.clearAll();
                    logout();
                  },
                },
              ])
            }
            style={[styles.row, styles.rowBorder]}
            accessibilityLabel="Выйти">
            <SymbolView name="rectangle.portrait.and.arrow.right" size={18} tintColor={Colors.error} style={{ width: 30 }} />
            <T v="callout" color={Colors.error}>Выйти</T>
          </Press>
        </Section>

        <Animated.View entering={FadeIn.delay(200)}>
          <T v="caption" color={Colors.textTertiary} style={styles.version}>
            Ара {version}{Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}
          </T>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <T v="caption" weight="600" color={Colors.textSecondary} style={styles.sectionTitle}>{title}</T>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ScreenPadding, paddingBottom: 8 },
  section: { marginTop: 22, paddingHorizontal: ScreenPadding },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  group: { backgroundColor: Colors.card, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.separator },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  smallButton: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: Colors.cardRaised, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: Colors.text },
  keyCard: { marginTop: 12, marginHorizontal: ScreenPadding, padding: 14, gap: 10, borderRadius: Radius.lg, backgroundColor: Colors.card },
  code: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.codeBackground,
  },
  mono: { flex: 1, fontFamily: Fonts.mono },
  version: { textAlign: 'center', marginTop: 28 },
});
