import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** A fenced block with the language «нужно»: what the agent needs from the user. */
export const isNeedBlock = (lang: string) => lang.trim().toLocaleLowerCase() === 'нужно';

/** Points of the block: «1. …», «- …» or plain lines; a line without a mark continues the point above. */
export function needPoints(value: string) {
  const points: string[] = [];
  for (const raw of value.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const mark = /^(?:\d+[.)]|[-*•])\s+/.exec(line);
    if (mark || !points.length) points.push(line.slice(mark ? mark[0].length : 0));
    else points[points.length - 1] += ' ' + line;
  }
  return points;
}

/** «Нужно от тебя»: a soft yellow card at the end of the answer. */
export function NeedCard({ value }: { value: string }) {
  const points = needPoints(value);
  if (!points.length) return null;
  return (
    <View style={styles.card} accessibilityLabel={`Нужно от тебя: ${points.join('; ')}`}>
      <View style={styles.head}>
        <SymbolView name="hand.raised.fill" size={16} tintColor={Colors.waiting} />
        <T v="subhead" weight="700" color={Colors.waiting}>Нужно от тебя</T>
      </View>
      {points.map((point, i) => (
        <View key={i} style={styles.point}>
          {points.length > 1 ? <T color={Colors.waiting} style={styles.number}>{i + 1}.</T> : null}
          <T selectable style={styles.text}>{point}</T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.waitingLine, backgroundColor: Colors.waitingSoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  point: { flexDirection: 'row', gap: 8 },
  number: { minWidth: 18, fontVariant: ['tabular-nums'] },
  text: { flex: 1 },
});
