import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilesPanel } from '@/components/files-panel';
import { SyncPanel } from '@/components/sync-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [section, setSection] = useState<'files' | 'sync'>('files');

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText type="title" style={styles.title}>Передача</ThemedText>
        <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
          <Pressable onPress={() => setSection('files')} style={[styles.segmentButton, section === 'files' && { backgroundColor: theme.tint }]}>
            <ThemedText type="smallBold" style={section === 'files' ? styles.activeText : undefined}>Файлы</ThemedText>
          </Pressable>
          <Pressable onPress={() => setSection('sync')} style={[styles.segmentButton, section === 'sync' && { backgroundColor: theme.tint }]}>
            <ThemedText type="smallBold" style={section === 'sync' ? styles.activeText : undefined}>Синхронизация</ThemedText>
          </Pressable>
        </View>
      </View>
      {section === 'files' ? <FilesPanel embedded /> : <SyncPanel />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  title: { fontSize: 34, lineHeight: 40 },
  segment: { flexDirection: 'row', gap: Spacing.one, padding: Spacing.one, borderRadius: Radius.md },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm },
  activeText: { color: '#fff' },
});
