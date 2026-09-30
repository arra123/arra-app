import { Gauge, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, createWidget } from 'expo-widgets';

/**
 * «Кольца» (the variant picked on 01.10): every agent is a ring that fills up
 * with the time it has been working, like the Activity rings. The same data
 * drives the Live Activity (lock screen + Dynamic Island) and the home screen
 * widgets. Props are plain JSON: the extension renders them with SwiftUI.
 */
export type RingAgent = { key: string; title: string; project: string; state: 'work' | 'wait' | 'done'; min: number };
export type RingsProps = { agents: RingAgent[]; working: number; waiting: number; updated: number };

const COLORS = ['#0a84ff', '#bf5af2', '#ff9f0a', '#30d158', '#ff375f', '#64d2ff'];

const RingsActivity = (props: RingsProps) => {
  'widget';
  const list = props.agents.slice(0, 4);
  const colorOf = (i: number, a: RingAgent) => (a.state === 'done' ? '#30d158' : a.state === 'wait' ? '#ffd60a' : COLORS[i % COLORS.length]);
  const summary = props.waiting ? `${props.working} работают · ${props.waiting} ждёт` : `${props.working} работают`;
  const ring = (a: RingAgent, i: number, size: number) => (
    <Gauge
      value={Math.min(1, Math.max(0.04, a.min / 60))}
      modifiers={[gaugeStyle('circularCapacity'), tint(colorOf(i, a)), frame({ width: size, height: size })]}>
      <Image systemName={a.state === 'done' ? 'checkmark' : a.state === 'wait' ? 'hand.raised.fill' : 'bolt.fill'} color={colorOf(i, a)} />
    </Gauge>
  );
  const rings = (
    <HStack spacing={12}>
      {list.map((a, i) => (
        <VStack key={a.key} spacing={4}>
          {ring(a, i, 46)}
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), lineLimit(1), frame({ width: 70 })]}>{a.title}</Text>
          <Text modifiers={[font({ size: 10 }), foregroundStyle('#9a9aa2')]}>{a.state === 'done' ? 'готово' : a.state === 'wait' ? 'ждёт тебя' : `${a.min} мин`}</Text>
        </VStack>
      ))}
    </HStack>
  );
  return {
    banner: (
      <VStack spacing={10} modifiers={[padding({ all: 14 }), activityBackgroundTint('#161618'), widgetURL('arra://')]}>
        <HStack>
          <Image systemName="sparkles" color="#ffffff" />
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>Arra</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13 }), foregroundStyle('#9a9aa2')]}>{summary}</Text>
        </HStack>
        {rings}
      </VStack>
    ),
    compactLeading: <Image systemName="sparkles" color="#ffffff" />,
    compactTrailing: (
      <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(props.waiting ? '#ffd60a' : '#64d2ff')]}>
        {props.waiting ? `${props.working}·${props.waiting}` : `${props.working}`}
      </Text>
    ),
    minimal: list.length ? ring(list[0], 0, 22) : <Image systemName="sparkles" color="#ffffff" />,
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 6 })]}>
        <Image systemName="sparkles" color="#ffffff" />
        <Text modifiers={[font({ size: 15, weight: 'bold' })]}>Arra</Text>
      </HStack>
    ),
    expandedTrailing: <Text modifiers={[font({ size: 13 }), foregroundStyle('#9a9aa2'), padding({ trailing: 6 })]}>{summary}</Text>,
    expandedBottom: <VStack modifiers={[padding({ top: 6 })]}>{rings}</VStack>,
  };
};

const RingsWidget = (props: RingsProps, env: { widgetFamily?: string }) => {
  'widget';
  const list = (props.agents || []).slice(0, env.widgetFamily === 'systemSmall' ? 2 : 4);
  const colorOf = (i: number, a: RingAgent) => (a.state === 'done' ? '#30d158' : a.state === 'wait' ? '#ffd60a' : COLORS[i % COLORS.length]);
  const total = (props.agents || []).length;
  if (env.widgetFamily === 'accessoryCircular') {
    return (
      <Gauge value={total ? (props.working || 0) / total : 0} modifiers={[gaugeStyle('circularCapacity')]}>
        <Text modifiers={[font({ size: 16, weight: 'bold' })]}>{`${props.working || 0}`}</Text>
      </Gauge>
    );
  }
  if (env.widgetFamily === 'accessoryRectangular' || env.widgetFamily === 'accessoryInline') {
    return (
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 13, weight: 'bold' })]}>Arra</Text>
        <Text modifiers={[font({ size: 12 })]}>{`${props.working || 0} работают · ${props.waiting || 0} ждут`}</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={8} modifiers={[widgetURL('arra://')]}>
      <HStack>
        <Image systemName="sparkles" color="#ffffff" />
        <Text modifiers={[font({ size: 14, weight: 'bold' })]}>Arra</Text>
        <Spacer />
        <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundStyle('#64d2ff')]}>{`${props.working || 0}`}</Text>
      </HStack>
      {total ? (
        <HStack spacing={10}>
          {list.map((a, i) => (
            <VStack key={a.key} spacing={3}>
              <Gauge value={Math.min(1, Math.max(0.04, a.min / 60))} modifiers={[gaugeStyle('circularCapacity'), tint(colorOf(i, a)), frame({ width: 40, height: 40 })]}>
                <Image systemName={a.state === 'done' ? 'checkmark' : a.state === 'wait' ? 'hand.raised.fill' : 'bolt.fill'} color={colorOf(i, a)} />
              </Gauge>
              <Text modifiers={[font({ size: 10, weight: 'semibold' }), lineLimit(1), frame({ width: 62 })]}>{a.title}</Text>
            </VStack>
          ))}
        </HStack>
      ) : (
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#9a9aa2')]}>Агенты отдыхают</Text>
      )}
    </VStack>
  );
};

export const ringsActivity = createLiveActivity<RingsProps>('ArraRings', RingsActivity);
export const ringsWidget = createWidget<RingsProps>('ArraAgents', RingsWidget as never);
