import { StyleSheet, View } from 'react-native';

import { AraMascot } from '@/components/ara-mascot';
import { Colors } from '@/constants/theme';

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <AraMascot size={110} mood="thinking" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
});
