import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppleButton } from '@/components/apple-button';
import { AppleSegmented } from '@/components/apple-segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title?: string;
  detail?: string;
  onClose: () => void;
  onSend: (count: number) => void;
  count: number;
  onCountChange: (count: number) => void;
};

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function RecentPhotoSheet({
  visible,
  title = 'Последние фото',
  detail = 'Фото отправятся по порядку — от самого нового.',
  onClose,
  onSend,
  count,
  onCountChange,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <ThemedText type="smallBold" themeColor="textSecondary">Отмена</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{title}</ThemedText>
          <View style={{ width: 56 }} />
        </View>
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">{detail}</ThemedText>
          <AppleSegmented
            values={COUNTS.map(String)}
            selectedIndex={count - 1}
            onChange={(index) => onCountChange(index + 1)}
          />
          <AppleButton
            label={`Отправить ${count}`}
            systemImage="paperplane.fill"
            onPress={() => onSend(count)}
            variant="prominent"
            full
          />
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  content: { padding: Spacing.three, gap: Spacing.four },
});
