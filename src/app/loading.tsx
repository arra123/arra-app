import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
});
