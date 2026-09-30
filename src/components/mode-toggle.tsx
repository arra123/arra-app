import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { Segmented } from '@/components/segmented';

export type Mode = 'chat' | 'work';

const OPTIONS = [
  { value: 'chat' as const, label: 'Чат' },
  { value: 'work' as const, label: 'Работа' },
];

/**
 * «Чат | Работа» в шапке, как в ChatGPT: капсула сначала доезжает до другой
 * половины, и только потом меняется экран (раньше экран дёргался сразу).
 */
export function ModeToggle({ value, onSwitch }: { value: Mode; onSwitch: (mode: Mode) => void }) {
  const [shown, setShown] = useState<Mode>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // вернулись на экран: капсула снова на своём месте
  useFocusEffect(useCallback(() => {
    setShown(value);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]));

  return (
    <Segmented
      options={OPTIONS}
      value={shown}
      size="small"
      style={{ width: 168 }}
      onChange={(mode) => {
        setShown(mode);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onSwitch(mode), 170);
      }}
    />
  );
}
