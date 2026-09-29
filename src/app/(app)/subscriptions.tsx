import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAra } from '@/ara/hooks';
import { LimitsSection } from '@/components/limits';
import { Press, T } from '@/components/ui';
import { Colors } from '@/constants/theme';

export default function Subscriptions() {
  const { limits } = useAra();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: Colors.background, paddingTop: insets.top }}>
    <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <Press onPress={() => router.back()} accessibilityLabel="Назад"><T>Назад</T></Press>
      <T v="title" weight="700">Подписки</T>
    </View>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {limits ? <LimitsSection limits={limits} /> : <T style={{ padding: 24 }}>Лимиты появятся после подключения компьютера</T>}
    </ScrollView>
  </View>;
}
