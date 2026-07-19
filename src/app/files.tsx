import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FilesPanel } from '@/components/files-panel';
import { SlidingSegment } from '@/components/sliding-segment';
import { SyncPanel } from '@/components/sync-panel';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function FilesScreen() {
  const [section, setSection] = useState<'files' | 'sync'>('files');

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: Spacing.two }]}>
        <SlidingSegment
          value={section}
          onChange={setSection}
          options={[
            { value: 'files', label: 'Файлы' },
            { value: 'sync', label: 'Синхронизация' },
          ]}
        />
      </View>
      {section === 'files' ? <FilesPanel embedded /> : <SyncPanel />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, gap: Spacing.three },
});
