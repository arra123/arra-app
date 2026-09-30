import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ComponentProps } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SplashOverlay, type SplashVariant } from '@/components/splash-overlay';
import { IconButton, Press, T } from '@/components/ui';
import { Colors } from '@/constants/theme';

type Symbol = ComponentProps<typeof SymbolView>['name'];

const SPLASHES: { id: SplashVariant; title: string; sub: string; color: string; icon: Symbol }[] = [
  { id: 'apple', title: 'Как у Apple', sub: 'сейчас основная: тихо, меньше секунды', color: '#8e8e93', icon: 'apple.logo' },
  { id: 'wave', title: 'Машет рукой', sub: '«привет!», искры, буквы по одной', color: '#0a84ff', icon: 'hand.wave' },
  { id: 'roll', title: 'Выкатывается', sub: 'катится сбоку, пружинит, улыбается', color: '#ff9f0a', icon: 'circle.circle' },
];

const WIDGETS: { id: string; title: string; sub: string; color: string; icon: Symbol }[] = [
  { id: 'ring', title: 'Кольцо', sub: 'как Таймер: одно кольцо, общее время', color: '#0a84ff', icon: 'circle.circle' },
  { id: 'track', title: 'Доставка', sub: 'Arra едет по этапам, как курьер', color: '#64d2ff', icon: 'arrow.turn.down.right' },
  { id: 'rings', title: 'Кольца', sub: 'как Активность: кольцо на каждого агента', color: '#30d158', icon: 'chart.pie' },
  { id: 'list', title: 'Список', sub: 'строка на агента, статус справа', color: '#bf5af2', icon: 'rectangle.stack' },
];

/**
 * «Тесты»: variants to look at before one becomes the real thing (splash
 * screens, the lock-screen widget mock-up). Settings → Тесты.
 */
export default function Tests() {
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState<SplashVariant | null>(null);

  const openWidget = (v: string) => {
    if (Platform.OS === 'web') window.location.href = `/mock/live.html?v=${v}`;
    else Alert.alert('Макет виджета', 'Макет открывается в «Arra — телефон» на компьютере.');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: 14 }]}>
        <T v="largeTitle" weight="800">Тесты</T>
        <IconButton icon="xmark" label="Закрыть" onPress={() => router.back()} size={34} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} indicatorStyle="white">
        <T v="caption" weight="600" color={Colors.textSecondary} style={styles.sectionTitle}>Заставка при запуске</T>
        <View style={styles.group}>
          {SPLASHES.map((s, i) => (
            <Press key={s.id} onPress={() => setPlaying(s.id)} style={[styles.row, i > 0 && styles.rowBorder]} accessibilityLabel={`Показать заставку: ${s.title}`}>
              <View style={[styles.tile, { backgroundColor: s.color }]}><SymbolView name={s.icon} size={17} tintColor="#fff" weight="semibold" /></View>
              <View style={{ flex: 1 }}>
                <T v="callout" weight="600">{s.title}</T>
                <T v="caption" color={Colors.textSecondary}>{s.sub}</T>
              </View>
              <SymbolView name="play.circle.fill" size={24} tintColor={Colors.text} />
            </Press>
          ))}
        </View>

        <T v="caption" weight="600" color={Colors.textSecondary} style={styles.sectionTitle}>Виджет на экране блокировки</T>
        <View style={styles.group}>
          {WIDGETS.map((w, i) => (
            <Press key={w.id} onPress={() => openWidget(w.id)} style={[styles.row, i > 0 && styles.rowBorder]} accessibilityLabel={`Виджет: ${w.title}`}>
              <View style={[styles.tile, { backgroundColor: w.color }]}><SymbolView name={w.icon} size={17} tintColor="#fff" weight="semibold" /></View>
              <View style={{ flex: 1 }}>
                <T v="callout" weight="600">{w.title}</T>
                <T v="caption" color={Colors.textSecondary}>{w.sub}</T>
              </View>
              <SymbolView name="chevron.right" size={13} tintColor={Colors.textTertiary} />
            </Press>
          ))}
        </View>
      </ScrollView>
      {playing ? <SplashOverlay key={playing + Date.now()} ready variant={playing} onDone={() => setPlaying(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  sectionTitle: { textTransform: 'uppercase', fontSize: 13, letterSpacing: 0.2, marginTop: 26, marginBottom: 7, paddingHorizontal: 32 },
  group: { marginHorizontal: 16, backgroundColor: '#1c1c1e', borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, minHeight: 56 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(84,84,88,0.6)' },
  tile: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});
