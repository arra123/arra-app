import { Image, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, aspectRatio, resizable, font, foregroundStyle, frame, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
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
export type RingAgent = { key: string; title: string; project: string; state: 'work' | 'wait' | 'done'; min: number; where?: string; note?: string; mascotId?: number };
export type RingsProps = { agents: RingAgent[]; working: number; waiting: number; updated: number };

const RingsActivity = (props: RingsProps) => {
  'widget';
  const all = props.agents || [];
  const waiting = all.filter((a) => a.state !== 'work');
  const working = all.filter((a) => a.state === 'work');
  // one or two agents get a second line each (project, machine, the task);
  // three fit only as single lines: the block is at most 160 pt tall
  const detailed = all.length <= 2;
  const list = waiting.concat(working).slice(0, detailed ? 2 : 3);
  const more = all.length - list.length;
  const n = waiting.length;
  const w = props.working || working.length;
  const head = n === 1 ? 'Агент ждёт тебя' : n > 1 ? `${n} агента ждут тебя` : w === 1 ? 'Агент работает' : `${w} агента работают`;
  const headColor = n ? '#ffd60a' : '#ffffff';
  const ago = (m: number) => (m < 1 ? 'только что' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч`);
  const under = (a: RingAgent) => [a.project !== a.title ? a.project : '', a.where || '', a.note || ''].filter((x) => x).join(' · ');
  const row = (a: RingAgent) => (
    <HStack key={a.key} spacing={8}>
      <Image assetName={`mascot-${a.mascotId || 0}`} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 28, height: 28 })]} />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle('#ffffff'), lineLimit(1)]}>{a.title}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93'), lineLimit(1)]}>{detailed ? under(a) : ''}</Text>
      </VStack>
      <Spacer />
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#a1a1aa')]}>{a.state === 'work' ? (a.min < 1 ? 'работает' : `работает ${ago(a.min)}`) : ago(a.min)}</Text>
    </HStack>
  );
  const line = (a: RingAgent) => (
    <HStack key={a.key} spacing={8}>
      <Text modifiers={[font({ size: 9 }), foregroundStyle(a.state === 'work' ? '#64d2ff' : '#ffd60a')]}>●</Text>
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle('#ffffff'), lineLimit(1)]}>{a.title}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#a1a1aa')]}>{a.state === 'work' ? (a.min < 1 ? 'работает' : `работает ${ago(a.min)}`) : ago(a.min)}</Text>
    </HStack>
  );
  const tail = more > 0 ? ` · и ещё ${more}` : '';
  return {
    banner: (
      <VStack alignment="leading" spacing={9} modifiers={[padding({ all: 14 }), activityBackgroundTint('#111114'), widgetURL(props.agents[0] ? `arra://agent/${encodeURIComponent(props.agents[0].key)}` : 'arra://')]}>
        {/* our mascot (a white block with two eyes) and the headline next to it */}
        <HStack spacing={10}>
          <Image assetName={`mascot-${list[0]?.mascotId || 0}`} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 40, height: 40 })]} />
          <VStack alignment="leading" spacing={1}>
            <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(headColor)]}>{head}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93')]}>{(n && w ? `ещё ${w} работают` : n ? 'ответь, и он продолжит' : 'Arra следит за ними') + tail}</Text>
          </VStack>
          <Spacer />
        </HStack>
        {/* the rows in a stack of their own: a list next to other children was not drawn at all */}
        <VStack alignment="leading" spacing={9}>
          {list.map(detailed ? row : line)}
        </VStack>
      </VStack>
    ),
    // the Dynamic Island says something only when someone waits for you; while
    // agents just work it stays empty (nothing glows on top all day)
    compactLeading: <Image assetName={`mascot-${list[0]?.mascotId || 0}`} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 22, height: 22 })]} />,
    compactTrailing: <Text>{''}</Text>,
    minimal: <Image assetName={`mascot-${list[0]?.mascotId || 0}`} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 22, height: 22 })]} />,
    expandedLeading: <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(headColor), padding({ leading: 8 })]}>{head}</Text>,
    expandedTrailing: <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93'), padding({ trailing: 8 })]}>{n && w ? `${w} работают` : ''}</Text>,
    expandedBottom: <VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 8, top: 4 })]}>{list.map(line)}</VStack>,
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
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(waiting ? '#ffd60a' : '#64d2ff')]}>{waiting ? `${waiting} ждут` : `${working} в работе`}</Text>
      </HStack>
      <VStack alignment="leading" spacing={7}>
      {list.length ? list.map((a) => (
        <HStack key={a.key} spacing={7}>
          <Text modifiers={[font({ size: 8 }), foregroundStyle(a.state === 'work' ? '#64d2ff' : '#ffd60a')]}>●</Text>
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#ffffff'), lineLimit(1)]}>{a.title}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12 }), foregroundStyle('#8e8e93')]}>{small ? '' : a.state === 'work' ? ago(a.min) : 'ждёт'}</Text>
        </HStack>
      )) : [<Text key="none" modifiers={[font({ size: 13 }), foregroundStyle('#8e8e93')]}>Агенты отдыхают</Text>]}
      </VStack>
      <Spacer />
    </VStack>
  );
};

export const ringsActivity = createLiveActivity<RingsProps>('ArraRings', RingsActivity);
export const ringsWidget = createWidget<RingsProps>('ArraAgents', RingsWidget as never);
