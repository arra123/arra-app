import { Alert } from 'react-native';

import { haptic } from '@/lib/haptics';

import { ara } from './client';
import { AGENT_LABEL, DEVICE_META } from './format';
import { pins } from './pins';
import type { Agent } from './types';

/** Закрыть терминал агента — только после подтверждения. */
export function confirmCloseAgent(agent: Agent, onClosed?: () => void) {
  haptic.press();
  Alert.alert(
    'Закрыть терминал?',
    `${AGENT_LABEL[agent.agent]} · ${agent.project} на устройстве «${DEVICE_META[agent.device].label}». Переписка останется в недавних сессиях.`,
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Закрыть',
        style: 'destructive',
        onPress: async () => {
          try {
            await ara.closeAgent(agent.key);
            pins.unpin(agent.key);
            haptic.success();
            onClosed?.();
          } catch (error: any) {
            haptic.error();
            Alert.alert('Терминал не закрылся', error?.message || 'Попробуй ещё раз');
          }
        },
      },
    ],
  );
}

/** Остановить текущий шаг агента (Esc в терминале). */
export async function stopAgent(agent: Agent) {
  haptic.heavy();
  try {
    await ara.stopAgent(agent.key);
  } catch (error: any) {
    Alert.alert('Не остановился', error?.message || '');
    throw error;
  }
}
