import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleSegmented } from '@/components/apple-segmented';
import { FilesPanel } from '@/components/files-panel';
import { SyncPanel } from '@/components/sync-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<'files' | 'sync'>('files');

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText type="title" style={styles.title}>Передача</ThemedText>
        <AppleSegmented
          values={['Файлы', 'Синхронизация']}
          selectedIndex={section === 'files' ? 0 : 1}
          onChange={(index) => setSection(index === 0 ? 'files' : 'sync')}
        />
      </View>
      {section === 'files' ? <FilesPanel embedded /> : <SyncPanel />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
});
