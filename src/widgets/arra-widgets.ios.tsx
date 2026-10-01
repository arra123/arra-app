import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, font, foregroundStyle, frame, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, createWidget } from 'expo-widgets';

/**
 * The lock screen block and the Dynamic Island appear only when an agent
 * needs you: it finished or it asks something. While agents just work there
 * is nothing on the screen (it used to glow all day). The block is a short
 * list: who waits and for how long. The home screen widget lists every agent.
 *
 * Everything a widget function uses must be declared inside it: the function
 * is sent to the extension as text.
 */
export type RingAgent = { key: string; title: string; project: string; state: 'work' | 'wait' | 'done'; min: number };
export type RingsProps = { agents: RingAgent[]; working: number; waiting: number; updated: number };

const RingsActivity = (props: RingsProps) => {
  'widget';
  const all = props.agents || [];
  const waiting = all.filter((a) => a.state !== 'work');
  const list = (waiting.length ? waiting : all).slice(0, 3);
  const more = (waiting.length ? waiting.length : all.length) - list.length;
  const n = props.waiting || waiting.length;
  const head = n === 1 ? 'Агент ждёт тебя' : `${n} агента ждут тебя`;
  const ago = (m: number) => (m < 1 ? 'только что' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч`);
  const row = (a: RingAgent) => (
    <HStack key={a.key} spacing={8}>
      <Text modifiers={[font({ size: 9 }), foregroundStyle(a.state === 'work' ? '#64d2ff' : '#ffd60a')]}>●</Text>
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle('#ffffff'), lineLimit(1)]}>{a.title}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#a1a1aa')]}>{ago(a.min)}</Text>
    </HStack>
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={9} modifiers={[padding({ all: 16 }), activityBackgroundTint('#111114'), widgetURL('arra://')]}>
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#ffd60a')]}>{head}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93')]}>{props.working ? `ещё ${props.working} работают` : 'Arra'}</Text>
        </HStack>
        {list.map(row)}
        {more > 0 ? <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93')]}>{`и ещё ${more}`}</Text> : null}
      </VStack>
    ),
    compactLeading: <Text modifiers={[font({ size: 12 }), foregroundStyle('#ffd60a')]}>●</Text>,
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle('#ffd60a')]}>{`${n}`}</Text>,
    minimal: <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#ffd60a')]}>{`${n}`}</Text>,
    expandedLeading: <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle('#ffd60a'), padding({ leading: 8 })]}>{head}</Text>,
    expandedTrailing: <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93'), padding({ trailing: 8 })]}>{props.working ? `${props.working} работают` : ''}</Text>,
    expandedBottom: <VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 8, top: 4 })]}>{list.map(row)}</VStack>,
  };
};

const RingsWidget = (props: RingsProps, env: { widgetFamily?: string }) => {
  'widget';
  const all = props.agents || [];
  const working = props.working || 0;
  const waiting = props.waiting || 0;
  if (env.widgetFamily === 'accessoryCircular') {
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 20, weight: 'bold' })]}>{`${waiting || working}`}</Text>
        <Text modifiers={[font({ size: 9 })]}>{waiting ? 'ждут' : 'в работе'}</Text>
      </VStack>
    );
  }
  if (env.widgetFamily === 'accessoryRectangular' || env.widgetFamily === 'accessoryInline') {
    return (
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 13, weight: 'bold' })]}>Arra</Text>
        <Text modifiers={[font({ size: 12 })]}>{waiting ? `${waiting} ждут тебя · ${working} работают` : `${working} работают`}</Text>
      </VStack>
    );
  }
  const small = env.widgetFamily === 'systemSmall';
  // the ones that wait for you first
  const sorted = all.filter((a) => a.state !== 'work').concat(all.filter((a) => a.state === 'work'));
  const list = sorted.slice(0, small ? 3 : 4);
  const ago = (m: number) => (m < 1 ? 'сейчас' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч`);
  return (
    <VStack alignment="leading" spacing={7} modifiers={[widgetURL('arra://')]}>
      <HStack spacing={6}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle('#ffffff')]}>Arra</Text>
        <Spacer />
        {waiting ? <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#ffd60a')]}>{`${waiting} ждут`}</Text> : null}
        {!small || !waiting ? <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#64d2ff')]}>{`${working} в работе`}</Text> : null}
      </HStack>
      {list.length ? list.map((a) => (
        <HStack key={a.key} spacing={7}>
          <Text modifiers={[font({ size: 8 }), foregroundStyle(a.state === 'work' ? '#64d2ff' : '#ffd60a')]}>●</Text>
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#ffffff'), lineLimit(1)]}>{a.title}</Text>
          <Spacer />
          {small ? null : <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93'), frame({ width: 56 })]}>{a.state === 'work' ? ago(a.min) : 'ждёт'}</Text>}
        </HStack>
      )) : <Text modifiers={[font({ size: 13 }), foregroundStyle('#8e8e93')]}>Агенты отдыхают</Text>}
      <Spacer />
    </VStack>
  );
};

export const ringsActivity = createLiveActivity<RingsProps>('ArraRings', RingsActivity);
export const ringsWidget = createWidget<RingsProps>('ArraAgents', RingsWidget as never);
