import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STK } from './assets';
import { ArchiveScreen } from './screens/archive';
import { PingPongScreen } from './screens/pingpong';
import { TearsScreen } from './screens/tears';
import { U, UG, UR, US } from './theme';
import { Gradient, Sticker, T, tap } from './ui';

type Tab = 'tears' | 'ping' | 'archive';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'tears', label: 'Слёзы', icon: STK.sob },
  { key: 'ping', label: 'Пинг', icon: STK.pingpong },
  { key: 'archive', label: 'Архив', icon: STK.chart },
];

export default function UlyanaApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('tears');

  return (
    <View style={[styles.root, { experimental_backgroundImage: UG.app } as any]}>
      <StatusBar style="light" />

      <View style={{ flex: 1 }}>
        {tab === 'tears' && <TearsScreen />}
        {tab === 'ping' && <PingPongScreen />}
        {tab === 'archive' && <ArchiveScreen />}
      </View>

      {/* Плавающий таб-бар */}
      <View style={[styles.tabBarWrap, { paddingBottom: insets.bottom || US.md }]}>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => { tap(); setTab(t.key); }}
                style={({ pressed }) => [styles.tabItem, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
                {active ? (
                  <Gradient g={UG.candy} radius={UR.pill} style={styles.tabActive}>
                    <Sticker src={t.icon} size={22} />
                    <T kind="label" color="#fff">{t.label}</T>
                  </Gradient>
                ) : (
                  <View style={styles.tabInactive}>
                    <Sticker src={t.icon} size={24} style={{ opacity: 0.6 }} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: U.bg },
  tabBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: US.md, alignItems: 'center' },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(36,22,64,0.92)',
    borderColor: U.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: UR.pill,
    padding: 8,
  },
  tabItem: { },
  tabActive: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11 },
  tabInactive: { paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
});
