import { Drawer } from 'expo-router/drawer';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace';

const colors = Colors.dark;

const PRIMARY_ROUTES = [
  { name: 'chat', label: 'Помощник', icon: 'bubble.left' },
  { name: 'pc', label: 'Компьютер', icon: 'desktopcomputer' },
  { name: 'files', label: 'Файлы', icon: 'paperplane' },
  { name: 'notes', label: 'Заметки', icon: 'note.text' },
  { name: 'index', label: 'Возвраты', icon: 'creditcard' },
] as const;

function WorkspaceDrawerContent({ navigation, state }: any) {
  const insets = useSafeAreaInsets();
  const workspace = useWorkspace();
  const activeRoute = state.routeNames[state.index];
  const activeDevice = workspace.devices.find((device) => device.id === workspace.activeDeviceId);

  const openRoute = (name: string) => {
    navigation.navigate(name);
    navigation.closeDrawer();
  };

  return (
    <View style={[styles.drawer, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.brandRow}>
        <Image source={require('../../assets/images/noda-mark.png')} style={styles.brandMark} />
        <ThemedText style={styles.brandName}>Noda</ThemedText>
      </View>

      <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" style={styles.sectionLabel}>Рабочее место</ThemedText>
        <View style={styles.routeList}>
          {PRIMARY_ROUTES.map((route) => (
            <Pressable
              key={route.name}
              onPress={() => openRoute(route.name)}
              style={({ pressed }) => [styles.drawerRow, activeRoute === route.name && styles.drawerRowActive, pressed && styles.pressed]}>
              <SymbolView name={route.icon as any} tintColor={activeRoute === route.name ? colors.text : colors.textSecondary} size={18} />
              <ThemedText type="smallBold" style={activeRoute === route.name ? undefined : styles.mutedText}>{route.label}</ThemedText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.drawerBottom}>
        {workspace.devices.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.devicePills}>
            {workspace.devices.map((device) => (
              <Pressable key={device.id} onPress={() => workspace.setActiveDeviceId(device.id)} style={[styles.devicePill, device.id === workspace.activeDeviceId && styles.devicePillActive]}>
                <View style={[styles.deviceDot, device.online && styles.deviceDotOnline]} />
                <ThemedText style={styles.devicePillText} numberOfLines={1}>{device.name || device.hostname || 'ПК'}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.deviceSingle}>
            <View style={[styles.deviceDot, activeDevice?.online && styles.deviceDotOnline]} />
            <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>{activeDevice?.name || activeDevice?.hostname || 'Компьютер'}</ThemedText>
            <ThemedText style={styles.deviceState}>{activeDevice?.online ? 'в сети' : 'не в сети'}</ThemedText>
          </View>
        )}
        <Pressable onPress={() => openRoute('profile')} style={({ pressed }) => [styles.drawerRow, pressed && styles.pressed]}>
          <SymbolView name="gearshape" tintColor={colors.textSecondary} size={18} />
          <ThemedText type="smallBold" style={styles.mutedText}>Настройки</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function WorkspaceDrawer() {
  return (
    <Drawer
      initialRouteName="chat"
      drawerContent={(props) => <WorkspaceDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerTitleStyle: { fontSize: 15, fontWeight: '600' },
        headerRight: () => null,
        drawerStyle: { width: 292, backgroundColor: '#1B2129' },
        overlayColor: 'rgba(0,0,0,0.58)',
        sceneStyle: { backgroundColor: colors.background },
        swipeEdgeWidth: 72,
      }}>
      <Drawer.Screen name="chat" options={{ title: 'Noda' }} />
      <Drawer.Screen name="pc" options={{ title: 'Компьютер' }} />
      <Drawer.Screen name="files" options={{ title: 'Файлы и синхронизация' }} />
      <Drawer.Screen name="notes" options={{ title: 'Заметки' }} />
      <Drawer.Screen name="index" options={{ title: 'Возвраты' }} />
      <Drawer.Screen name="profile" options={{ title: 'Настройки' }} />
    </Drawer>
  );
}

export default function AppTabs() {
  return (
    <WorkspaceProvider>
      <WorkspaceDrawer />
    </WorkspaceProvider>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: '#1B2129', paddingHorizontal: 9 },
  brandRow: { height: 46, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 23, height: 23, borderRadius: 6 },
  brandName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  newTask: { minHeight: 42, marginTop: 3, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  newTaskText: { flex: 1 },
  search: { height: 38, marginTop: 4, paddingHorizontal: 11, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: '#34404d', flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#18202a' },
  searchInput: { flex: 1, height: 38, color: colors.text, fontSize: 13, paddingVertical: 0 },
  drawerScroll: { flex: 1, marginTop: 8 },
  drawerScrollContent: { paddingBottom: 14 },
  routeList: { gap: 2 },
  toolsMore: { gap: 2, paddingLeft: 12 },
  drawerRow: { minHeight: 38, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  drawerRowActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  pressed: { opacity: 0.68 },
  mutedText: { color: '#b3b3b3' },
  sectionHead: { height: 38, marginTop: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: '#777777', fontSize: 12 },
  projectRow: { minHeight: 38, paddingHorizontal: 9, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  projectTitle: { flex: 1 },
  projectThreads: { marginLeft: 28, gap: 2, paddingVertical: 2 },
  projectThreadRow: { minHeight: 34, paddingLeft: 10, paddingRight: 11, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeTaskDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: '#9aa7b4' },
  threadRow: { minHeight: 36, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  threadTitle: { flex: 1, color: '#aaa' },
  emptyProjects: { color: '#686868', fontSize: 12, paddingHorizontal: 11, paddingVertical: 14 },
  loadingRows: { gap: 7, paddingHorizontal: 5 },
  drawerBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2c2c2c', paddingTop: 7 },
  deviceSingle: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  deviceDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#666' },
  deviceDotOnline: { backgroundColor: '#A8ADB3' },
  deviceState: { color: '#6e6e6e', fontSize: 10 },
  devicePills: { gap: 6, paddingVertical: 6 },
  devicePill: { maxWidth: 145, height: 31, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#222' },
  devicePillActive: { backgroundColor: '#303030' },
  devicePillText: { flexShrink: 1, color: '#adadad', fontSize: 10 },
  headerAction: { width: 40, height: 40, marginRight: 7, alignItems: 'center', justifyContent: 'center' },
});
