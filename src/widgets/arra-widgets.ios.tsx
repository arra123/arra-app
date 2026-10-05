import { Text } from '@expo/ui/swift-ui';
import { createLiveActivity, createWidget } from 'expo-widgets';

export type RingAgent = {
  key: string; title: string; project: string; state: 'work' | 'wait' | 'done' | 'error' | 'idle';
  min: number; where?: string; note?: string; mascotId?: number; number?: number;
};
export type RingsProps = { agents: RingAgent[]; working: number; waiting: number; updated: number; layoutVersion?: number };
type ActivityProps = Omit<RingsProps, 'agents'> & { agents: RingAgent[] | unknown[][] };

// Native SwiftUI cards are installed by with-dialog-widgets. Expo still owns
// the app-group snapshot and ActivityKit lifecycle/push tokens. These layouts
// are safe fallbacks, not a second competing renderer or fake JS buttons.
const activity = (_props: ActivityProps) => {
  'widget';
  return { banner: <Text>Arra</Text>, compactLeading: <Text>{''}</Text>, compactTrailing: <Text>{''}</Text>, minimal: <Text>{''}</Text> };
};
const widget = (_props: RingsProps) => {
  'widget';
  return <Text>Новый разговор</Text>;
};
export const ringsActivity = createLiveActivity<ActivityProps>('ArraRings', activity);
export const ringsWidget = createWidget<RingsProps>('ArraAgents', widget);
