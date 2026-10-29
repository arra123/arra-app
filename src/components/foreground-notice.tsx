import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onForegroundNotice, type ForegroundNotice } from '@/lib/push';
import { ProjectMascot } from '@/components/project-mascot';
import { Press, T } from '@/components/ui';
import { Colors } from '@/constants/theme';

export function ForegroundNoticeStrip() {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<ForegroundNotice | null>(null);
  useEffect(() => onForegroundNotice(setNotice), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return <View pointerEvents="box-none" style={[styles.position, { top: insets.top + 4 }]}>
    <Press style={styles.strip} accessibilityRole="button" accessibilityLabel={notice.title + '. ' + notice.body}
      onPress={() => {
        if (notice.agentKey) router.push({ pathname: '/agent/[key]', params: { key: notice.agentKey } });
        setNotice(null);
      }}>
      <ProjectMascot id={notice.mascotId || 0} size={28} still={false} />
      <T v="caption" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{notice.title}</T>
    </Press>
  </View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, zIndex: 1000, alignItems: 'center' },
  strip: { minHeight: 44, maxWidth: 360, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 22, backgroundColor: Colors.cardPressed, borderWidth: 1, borderColor: Colors.hairline },
});
