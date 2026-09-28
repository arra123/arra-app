import { Tabs } from 'expo-router';
import { Image, StyleSheet } from 'react-native';

const icon = (source: number) => <Image source={source} style={styles.icon} />;

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D1D1F',
        tabBarInactiveTintColor: '#85858D',
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: styles.dock,
        sceneStyle: styles.scene,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Финансы',
          tabBarIcon: () => icon(require('../../../noda-ios/assets/tabs/finance.png')),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Помощник',
          tabBarIcon: () => icon(require('../../../noda-ios/assets/tabs/assistant.png')),
        }}
      />
      <Tabs.Screen
        name="pc"
        options={{
          title: 'ПК',
          tabBarIcon: () => icon(require('../../../noda-ios/assets/tabs/remote.png')),
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: 'Передача',
          tabBarIcon: () => icon(require('../../../noda-ios/assets/tabs/transfer.png')),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Заметки',
          tabBarIcon: () => icon(require('../../../noda-ios/assets/tabs/notes.png')),
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: {
    paddingBottom: 76,
  },
  dock: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 68,
    maxWidth: 620,
    marginHorizontal: 'auto',
    paddingTop: 6,
    paddingBottom: 7,
    borderTopWidth: 0,
    borderRadius: 24,
    backgroundColor: 'rgba(250, 251, 253, 0.94)',
    boxShadow: '0 12px 36px rgba(37, 46, 66, 0.20)',
  },
  item: {
    borderRadius: 18,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
  },
});
