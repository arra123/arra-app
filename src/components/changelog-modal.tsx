import { SymbolView } from 'expo-symbols';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CHANGELOG } from '@/constants/changelog';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// «Последние изменения» — что нового в приложении. Открывается из профиля.
export function ChangelogModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View style={[styles.head, { paddingTop: insets.top + Spacing.two, borderBottomColor: theme.separator }]}>
          <SymbolView name="clock.badge.checkmark" tintColor={theme.accent} size={24} />
          <View style={{ flex: 1 }}>
            <ThemedText type="subtitle" style={{ fontSize: 20, lineHeight: 24 }}>Последние изменения</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">что нового в приложении</ThemedText>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name="xmark" tintColor={theme.textSecondary} size={16} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {CHANGELOG.map((group) => (
            <View key={group.date} style={{ marginBottom: Spacing.four }}>
              <ThemedText type="smallBold" style={{ color: theme.accent, marginBottom: Spacing.two }}>{group.date}</ThemedText>
              {group.items.map((item, i) => (
                <View key={i} style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                  <ThemedText style={{ flex: 1, lineHeight: 22 }}>{item}</ThemedText>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { width: 32, height: 32, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.five },
  row: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two, alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
});
