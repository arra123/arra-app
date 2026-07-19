import { Drawer } from 'expo-router/drawer';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { WorkspaceProvider, WorkspaceProject, useWorkspace } from '@/lib/workspace';

const colors = Colors.dark;

const ROUTES = [
  { name: 'chat', label: 'Чат', icon: 'bubble.left.and.bubble.right' },
  { name: 'pc', label: 'Компьютер', icon: 'desktopcomputer' },
  { name: 'files', label: 'Файлы', icon: 'paperplane' },
  { name: 'notes', label: 'Заметки', icon: 'note.text' },
  { name: 'index', label: 'Возвраты', icon: 'creditcard' },
] as const;

const projectMark = (project: WorkspaceProject) => {
  const kind = String(project.kind || '').toLowerCase();
  if (kind === 'javascript') return 'JS';
  if (kind === 'python') return 'PY';
  if (kind === 'dotnet') return '.N';
  if (kind === 'rust') return 'RS';
  if (kind === 'go') return 'GO';
  return project.label?.slice(0, 1).toUpperCase() || '•';
};

function WorkspaceDrawerContent({ navigation, state }: any) {
  const insets = useSafeAreaInsets();
  const workspace = useWorkspace();
  const [query, setQuery] = useState('');
  const activeRoute = state.routeNames[state.index];
  const activeDevice = workspace.devices.find((device) => device.id === workspace.activeDeviceId);
  const projects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workspace.projects;
    return workspace.projects.filter((project) => `${project.label} ${project.name} ${project.group}`.toLowerCase().includes(needle));
  }, [query, workspace.projects]);

  const openRoute = (name: string) => {
    navigation.navigate(name);
    navigation.closeDrawer();
  };
  const openProject = (project: WorkspaceProject) => {
    workspace.setActiveProject(project);
    openRoute('chat');
  };
  const openThread = (thread: (typeof workspace.threads)[number]) => {
    workspace.openThread(thread);
    openRoute('chat');
  };

  return (
    <View style={[styles.drawer, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.brandRow}>
        <Image source={require('../../assets/images/noda-mark.png')} style={styles.brandMark} />
        <ThemedText style={styles.brandName}>Noda</ThemedText>
      </View>

      <Pressable
        onPress={() => { workspace.newTask(); openRoute('chat'); }}
        style={({ pressed }) => [styles.newTask, pressed && styles.pressed]}>
        <SymbolView name="square.and.pencil" tintColor={colors.text} size={18} />
        <ThemedText type="smallBold" style={styles.newTaskText}>Новая задача</ThemedText>
      </Pressable>

      <View style={styles.search}>
        <SymbolView name="magnifyingglass" tintColor={colors.textSecondary} size={15} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск проектов"
          placeholderTextColor={colors.textSecondary}
          style={styles.searchInput}
        />
      </View>

      <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.routeList}>
          {ROUTES.map((route) => (
            <Pressable
              key={route.name}
              onPress={() => openRoute(route.name)}
              style={({ pressed }) => [styles.drawerRow, activeRoute === route.name && styles.drawerRowActive, pressed && styles.pressed]}>
              <SymbolView name={route.icon as any} tintColor={activeRoute === route.name ? colors.text : colors.textSecondary} size={18} />
              <ThemedText type="smallBold" style={activeRoute === route.name ? undefined : styles.mutedText}>{route.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {!!workspace.threads.length && (
          <>
            <View style={styles.sectionHead}>
              <ThemedText type="small" style={styles.sectionLabel}>Недавние</ThemedText>
            </View>
            {workspace.threads.slice(0, 6).map((thread) => (
              <Pressable
                key={thread.thread_key}
                onPress={() => openThread(thread)}
                style={({ pressed }) => [styles.threadRow, workspace.threadKey === thread.thread_key && styles.drawerRowActive, pressed && styles.pressed]}>
                <SymbolView name={thread.project_name ? 'folder' : 'sparkles'} tintColor={colors.textSecondary} size={15} />
                <ThemedText type="small" numberOfLines={1} style={styles.threadTitle}>{thread.title || thread.project_name || 'Новая задача'}</ThemedText>
              </Pressable>
            ))}
          </>
        )}

        <View style={styles.sectionHead}>
          <ThemedText type="small" style={styles.sectionLabel}>Проекты</ThemedText>
          <Pressable hitSlop={10} onPress={workspace.refresh}>
            <SymbolView name="arrow.clockwise" tintColor={colors.textSecondary} size={14} />
          </Pressable>
        </View>

        {workspace.loading && !projects.length ? (
          <View style={styles.loadingRows}><View /><View /><View /></View>
        ) : projects.length ? projects.map((project) => (
          <Pressable
            key={`${project.deviceId || ''}:${project.name}`}
            onPress={() => openProject(project)}
            style={({ pressed }) => [styles.projectRow, workspace.activeProject?.name === project.name && styles.drawerRowActive, pressed && styles.pressed]}>
            <View style={styles.projectMark}><ThemedText style={styles.projectMarkText}>{projectMark(project)}</ThemedText></View>
            <View style={styles.projectCopy}>
              <ThemedText type="smallBold" numberOfLines={1}>{project.label || project.name}</ThemedText>
              {!!project.group && <ThemedText style={styles.projectGroup} numberOfLines={1}>{project.group}</ThemedText>}
            </View>
          </Pressable>
        )) : (
          <ThemedText style={styles.emptyProjects}>{workspace.connected ? 'Проекты не найдены' : 'Компьютер не в сети'}</ThemedText>
        )}
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

function WorkspaceHeaderRight() {
  const workspace = useWorkspace();
  return (
    <Pressable onPress={workspace.newTask} hitSlop={10} style={styles.headerAction}>
      <SymbolView name="square.and.pencil" tintColor={colors.text} size={18} />
    </Pressable>
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
        headerRight: () => <WorkspaceHeaderRight />,
        drawerStyle: { width: 310, backgroundColor: '#171717' },
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
  drawer: { flex: 1, backgroundColor: '#171717', paddingHorizontal: 10 },
  brandRow: { height: 46, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 23, height: 23, borderRadius: 6 },
  brandName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  newTask: { minHeight: 42, marginTop: 3, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  newTaskText: { flex: 1 },
  search: { height: 38, marginTop: 4, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#212121' },
  searchInput: { flex: 1, height: 38, color: colors.text, fontSize: 13, paddingVertical: 0 },
  drawerScroll: { flex: 1, marginTop: 8 },
  drawerScrollContent: { paddingBottom: 14 },
  routeList: { gap: 2 },
  drawerRow: { minHeight: 40, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  drawerRowActive: { backgroundColor: '#292929' },
  pressed: { opacity: 0.68 },
  mutedText: { color: '#b3b3b3' },
  sectionHead: { height: 38, marginTop: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: '#777777', fontSize: 12 },
  projectRow: { minHeight: 46, paddingHorizontal: 7, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  projectMark: { width: 28, height: 28, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: '#3b3b3b', backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  projectMarkText: { color: '#c6c6c6', fontSize: 9, fontWeight: '800' },
  projectCopy: { flex: 1, gap: 1 },
  projectGroup: { color: '#707070', fontSize: 10 },
  threadRow: { minHeight: 36, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  threadTitle: { flex: 1, color: '#aaa' },
  emptyProjects: { color: '#686868', fontSize: 12, paddingHorizontal: 11, paddingVertical: 14 },
  loadingRows: { gap: 7, paddingHorizontal: 5 },
  drawerBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2c2c2c', paddingTop: 7 },
  deviceSingle: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  deviceDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#666' },
  deviceDotOnline: { backgroundColor: '#2fbf71' },
  deviceState: { color: '#6e6e6e', fontSize: 10 },
  devicePills: { gap: 6, paddingVertical: 6 },
  devicePill: { maxWidth: 145, height: 31, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#222' },
  devicePillActive: { backgroundColor: '#303030' },
  devicePillText: { flexShrink: 1, color: '#adadad', fontSize: 10 },
  headerAction: { width: 40, height: 40, marginRight: 7, alignItems: 'center', justifyContent: 'center' },
});
