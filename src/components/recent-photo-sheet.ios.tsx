import {
  BottomSheet,
  Button,
  Group,
  Host,
  Picker,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  dynamicTypeSize,
  font,
  frame,
  padding,
  pickerStyle,
  presentationDetents,
  presentationDragIndicator,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

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

/**
 * Нативный SwiftUI sheet с системным wheel picker.
 * Числа больше не раскладываются вручную процентами и не «плывут» на разных iPhone.
 */
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
    <Host style={styles.portal}>
      <BottomSheet isPresented={visible} onIsPresentedChange={(next) => !next && onClose()}>
        <Group
          modifiers={[
            presentationDetents([{ height: 360 }]),
            presentationDragIndicator('visible'),
            dynamicTypeSize({ max: 'large' }),
          ]}>
          <VStack spacing={10} modifiers={[padding({ horizontal: 20, top: 22, bottom: 16 })]}>
            <Text modifiers={[font({ textStyle: 'title2', weight: 'bold' })]}>{title}</Text>
            <Text modifiers={[font({ textStyle: 'subheadline' })]}>{detail}</Text>
            <Picker
              label="Количество"
              selection={count}
              onSelectionChange={(value) => onCountChange(Number(value))}
              modifiers={[pickerStyle('wheel'), frame({ height: 128 })]}>
              {COUNTS.map((value) => (
                <Text key={value} modifiers={[tag(value)]}>
                  {value === 1 ? '1 фото' : value < 5 ? `${value} фото` : `${value} фотографий`}
                </Text>
              ))}
            </Picker>
            <Button
              label={`Отправить ${count}`}
              systemImage="paperplane.fill"
              onPress={() => onSend(count)}
              modifiers={[
                buttonStyle('glassProminent'),
                controlSize('large'),
                frame({ maxWidth: 1000 }),
                tint('#007AFF'),
              ]}
            />
            <Button
              label="Отмена"
              role="cancel"
              onPress={onClose}
              modifiers={[buttonStyle('plain'), controlSize('regular')]}
            />
          </VStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  portal: {
    position: 'absolute',
    width: 1,
    height: 1,
    right: 0,
    bottom: 0,
  },
});
