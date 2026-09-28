import { Button, Host, Toggle } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  disabled as disabledMod,
  dynamicTypeSize,
  frame,
  labelStyle,
  tint as tintMod,
} from '@expo/ui/swift-ui/modifiers';
import { type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme } from '@/hooks/use-theme';

export type AppleButtonVariant = 'prominent' | 'bordered' | 'plain' | 'glass';

type AppleButtonProps = {
  label: string;
  onPress?: () => void;
  /** Иконка SF Symbol слева от текста (как в системных кнопках iOS) */
  systemImage?: SFSymbol;
  /** Внешний вид: 'prominent' — залитая, 'bordered' — обводка, 'glass' — стекло iOS 26, 'plain' — без фона */
  variant?: AppleButtonVariant;
  role?: 'default' | 'cancel' | 'destructive';
  /** Цвет акцента; по умолчанию из темы */
  tint?: string;
  /** Растянуть на всю ширину родителя */
  full?: boolean;
  disabled?: boolean;
  /** Размер контрола */
  size?: 'small' | 'regular' | 'large';
  style?: StyleProp<ViewStyle>;
};

type AppleIconButtonProps = {
  label: string;
  systemImage: SFSymbol;
  onPress?: () => void;
  variant?: AppleButtonVariant;
  role?: 'default' | 'cancel' | 'destructive';
  tint?: string;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const STYLE_MAP: Record<AppleButtonVariant, Parameters<typeof buttonStyle>[0]> = {
  prominent: 'borderedProminent',
  bordered: 'bordered',
  plain: 'plain',
  glass: 'glassProminent',
};

/**
 * Настоящая нативная кнопка Apple (SwiftUI) — как в Настройках/Медиатеке iOS.
 * Только iOS; фолбэк для web/android — в `apple-button.tsx`.
 */
export function AppleButton({
  label,
  onPress,
  systemImage,
  variant = 'glass',
  role = 'default',
  tint,
  full = false,
  disabled = false,
  size = 'large',
  style,
}: AppleButtonProps) {
  const theme = useTheme();
  const accent = tint ?? theme.accent;

  const modifiers = [
    buttonStyle(STYLE_MAP[variant]),
    controlSize(size),
    dynamicTypeSize({ max: 'large' }),
    tintMod(accent),
    disabledMod(disabled),
  ];
  if (full) modifiers.push(frame({ maxWidth: 100000 }));

  return (
    <Host
      matchContents={full ? { vertical: true, horizontal: false } : true}
      style={[full ? { alignSelf: 'stretch' } : undefined, style]}>
      <Button
        label={label}
        systemImage={systemImage}
        role={role}
        onPress={disabled ? undefined : onPress}
        modifiers={modifiers}
      />
    </Host>
  );
}

/** Круглая системная SwiftUI-кнопка с SF Symbol и Liquid Glass на iOS 26. */
export function AppleIconButton({
  label,
  systemImage,
  onPress,
  variant = 'glass',
  role = 'default',
  tint,
  disabled = false,
  size = 44,
  style,
}: AppleIconButtonProps) {
  const theme = useTheme();
  const accent = role === 'destructive' ? theme.danger : tint ?? theme.accent;
  const nativeStyle = variant === 'glass' ? 'glass' : STYLE_MAP[variant];

  return (
    <Host matchContents style={[{ width: size, height: size }, style]}>
      <Button
        label={label}
        systemImage={systemImage}
        role={role}
        onPress={onPress}
        modifiers={[
          buttonStyle(nativeStyle),
          controlSize(size <= 36 ? 'small' : 'large'),
          dynamicTypeSize({ max: 'large' }),
          labelStyle('iconOnly'),
          frame({ width: size, height: size }),
          tintMod(accent),
          disabledMod(disabled),
        ]}
      />
    </Host>
  );
}

type AppleToggleProps = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label?: string;
  systemImage?: SFSymbol;
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Нативный системный переключатель Apple (SwiftUI Toggle). */
export function AppleToggle({ value, onValueChange, label, systemImage, tint, style }: AppleToggleProps) {
  const theme = useTheme();
  const modifiers = [tintMod(tint ?? theme.success), dynamicTypeSize({ max: 'large' })];
  return (
    <Host matchContents style={style}>
      <Toggle
        isOn={value}
        label={label}
        systemImage={systemImage}
        onIsOnChange={onValueChange}
        modifiers={modifiers}
      />
    </Host>
  );
}
