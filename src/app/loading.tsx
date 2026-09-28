import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color="#007AFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECECF1',
  },
});
