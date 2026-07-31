import { Image, StyleSheet, Text, View } from 'react-native';

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../../noda-ios/assets/noda.png')} style={styles.logo} />
      <Text style={styles.title}>Noda</Text>
      <Text style={styles.caption}>Открываю рабочий контур</Text>
      <View style={styles.progress}>
        <View style={styles.progressFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F3F7',
  },
  logo: { width: 78, height: 78, marginBottom: 14 },
  title: { color: '#1D1D1F', fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5 },
  caption: { color: '#666A73', fontSize: 13, lineHeight: 18, marginTop: 3 },
  progress: { width: 92, height: 3, marginTop: 20, borderRadius: 2, overflow: 'hidden', backgroundColor: '#DDE0E7' },
  progressFill: { width: '58%', height: '100%', borderRadius: 2, backgroundColor: '#007AFF' },
});
