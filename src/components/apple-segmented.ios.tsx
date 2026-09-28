import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  disabled,
  dynamicTypeSize,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';

type Props = {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** SwiftUI segmented Picker with a stable iPhone-sized typography envelope. */
export function AppleSegmented({
  values,
  selectedIndex,
  onChange,
  enabled = true,
  style,
}: Props) {
  return (
    <Host style={[styles.host, style]} modifiers={[dynamicTypeSize({ max: 'large' })]}>
      <Picker
        selection={selectedIndex}
        onSelectionChange={(value) => {
          const next = Number(value);
          if (next === selectedIndex) return;
          haptic.select();
          onChange(next);
        }}
        modifiers={[
          pickerStyle('segmented'),
          frame({ maxWidth: 1000 }),
          disabled(!enabled),
        ]}>
        {values.map((value, index) => (
          <Text key={`${value}-${index}`} modifiers={[tag(index)]}>
            {value}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: 'stretch',
    height: 34,
  },
});
