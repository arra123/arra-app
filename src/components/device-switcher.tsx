import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

export type DeviceRole = 'laptop' | 'pc' | 'server' | null;

export type DeviceChoice = {
  id: string;
  name: string;
  role?: DeviceRole;
  hostname?: string | null;
  online: boolean;
};

type Props = {
  devices: DeviceChoice[];
  value: string | null;
  onChange: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function deviceRole(device?: DeviceChoice | null): Exclude<DeviceRole, null> {
  if (device?.role === 'laptop' || device?.role === 'pc' || device?.role === 'server') return device.role;
  const name = `${device?.name || ''} ${device?.hostname || ''}`;
  if (/сервер|server|rack|host/i.test(name)) return 'server';
  if (/ноут|laptop|notebook|macbook|book/i.test(name)) return 'laptop';
  return 'pc';
}

export function deviceLabel(device?: DeviceChoice | null) {
  if (!device) return 'Компьютер';
  if (deviceRole(device) === 'laptop') return 'Ноутбук';
  if (deviceRole(device) === 'server') return 'Сервер';
  return 'ПК';
}

function deviceIcon(role: Exclude<DeviceRole, null>) {
  if (role === 'laptop') return 'laptopcomputer';
  if (role === 'server') return 'server.rack';
  return 'desktopcomputer';
}

/** Компактный иконный переключатель физических устройств без длинных подписей. */
export function DeviceSwitcher({ devices, value, onChange, style, compact = false }: Props) {
  const theme = useTheme();
  if (!devices.length) return null;

  const size = compact ? 42 : 46;
  const order = { laptop: 0, pc: 1, server: 2 } as const;
  const sortedDevices = [...devices].sort((left, right) => (
    order[deviceRole(left)] - order[deviceRole(right)]
    || String(left.name || '').localeCompare(String(right.name || ''), 'ru')
  ));

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.root, { backgroundColor: theme.disabled, borderColor: theme.separator }, style]}>
      {sortedDevices.map((device) => {
        const selected = device.id === value;
        const label = device.name || deviceLabel(device);
        return (
          <Pressable
            key={device.id}
            accessibilityRole="tab"
            accessibilityLabel={`${deviceLabel(device)}: ${label}`}
            accessibilityHint={device.online ? 'Устройство в сети' : 'Устройство не в сети'}
            accessibilityState={{ selected }}
            hitSlop={4}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(device.id);
            }}
            style={({ pressed }) => [
              styles.item,
              { width: size, height: 40 },
              selected && { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <SymbolView
              name={deviceIcon(deviceRole(device)) as never}
              tintColor={selected ? '#FFFFFF' : theme.text}
              size={compact ? 19 : 21}
            />
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: device.online ? theme.success : theme.disabledText,
                  borderColor: selected ? theme.accent : theme.disabled,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm + 1,
  },
  pressed: { opacity: 0.62 },
  dot: {
    position: 'absolute',
    right: 6,
    top: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});
