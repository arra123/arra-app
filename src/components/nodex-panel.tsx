import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Assistant } from '@/components/assistant';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { WorkspaceProject, useWorkspace } from '@/lib/workspace';

const colors = Colors.dark;

function projectFromThreadKey(threadKey: string) {
  const match = String(threadKey || '').match(/^project:([^:]+)/);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

export function NodexPanel() {
  const workspace = useWorkspace();
  const [query, setQuery] = useState('');
  const [chatOpen, setChatOpen] = useState(!!workspace.activeProject);
  const projects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.projects.filter((project) => !needle || `${project.label} ${project.name} ${project.group}`.toLowerCase().includes(needle));
  }, [query, workspace.projects]);

  const threadsFor = (project: WorkspaceProject) => workspace.threads.filter((thread) => (
    thread.project_name === project.name
    || thread.project_name === project.label
    || projectFromThreadKey(thread.thread_key) === project.name
  )).slice(0, 8);

  const openProject = (project: WorkspaceProject) => {
    workspace.setActiveProject(project);
    setChatOpen(true);
  };

  const createTask = (project: WorkspaceProject) => {
    workspace.newProjectTask(project);
    setChatOpen(true);
  };

  if (chatOpen && workspace.activeProject) {
    return (
      <View style={styles.container}>
        <View style={styles.chatHeader}>
          <Pressable onPress={() => setChatOpen(false)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <SymbolView name="chevron.left" tintColor={colors.textSecondary} size={18} />
          </Pressable>
          <View style={styles.chatTitle}>
            <ThemedText type="smallBold" numberOfLines={1}>Nodex</ThemedText>
            <ThemedText style={styles.caption} numberOfLines={1}>{workspace.activeProject.label || workspace.activeProject.name}</ThemedText>
          </View>
          <Pressable onPress={() => workspace.newProjectTask()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <SymbolView name="square.and.pencil" tintColor={colors.text} size={18} />
          </Pressable>
        </View>
        <Assistant embedded />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.title}>Nodex</ThemedText>
          <ThemedText style={styles.caption}>{workspace.connected ? 'Проекты выбранного компьютера' : 'Компьютер не в сети'}</ThemedText>
        </View>
        <Pressable onPress={workspace.refresh} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <SymbolView name="arrow.clockwise" tintColor={colors.textSecondary} size={17} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <SymbolView name="magnifyingglass" tintColor={colors.textSecondary} size={15} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Найти проект" placeholderTextColor={colors.textSecondary} style={styles.searchInput} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {projects.map((project) => {
          const threads = threadsFor(project);
          const active = workspace.activeProject?.name === project.name;
          return (
            <View key={`${project.deviceId || ''}:${project.name}`} style={styles.project}>
              <Pressable onPress={() => openProject(project)} style={({ pressed }) => [styles.projectRow, active && styles.projectRowActive, pressed && styles.pressed]}>
                <View style={styles.folder}><SymbolView name="folder" tintColor={active ? colors.text : colors.textSecondary} size={18} /></View>
                <View style={styles.projectCopy}>
                  <ThemedText type="smallBold" numberOfLines={1}>{project.label || project.name}</ThemedText>
                  <ThemedText style={styles.caption} numberOfLines={1}>{project.group || project.path || 'Локальный проект'}</ThemedText>
                </View>
                <SymbolView name="chevron.right" tintColor={colors.textSecondary} size={14} />
              </Pressable>
              {!!threads.length && (
                <View style={styles.tasks}>
                  {threads.map((thread) => (
                    <Pressable key={thread.thread_key} onPress={() => { workspace.openThread(thread); setChatOpen(true); }} style={({ pressed }) => [styles.taskRow, workspace.threadKey === thread.thread_key && styles.taskRowActive, pressed && styles.pressed]}>
                      <View style={styles.taskDot} />
                      <ThemedText style={styles.taskTitle} numberOfLines={1}>{thread.title || 'Новая задача'}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable onPress={() => createTask(project)} style={({ pressed }) => [styles.newTask, pressed && styles.pressed]}>
                <SymbolView name="plus" tintColor={colors.textSecondary} size={14} />
                <ThemedText style={styles.newTaskText}>Новая задача</ThemedText>
              </Pressable>
            </View>
          );
        })}
        {!workspace.loading && !projects.length && <ThemedText style={styles.empty}>{workspace.connected ? 'Проекты не найдены' : 'Подключите компьютер'}</ThemedText>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#101010' },
  header: { minHeight: 64, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
  caption: { marginTop: 2, color: '#777', fontSize: 10 },
  iconButton: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.62 },
  search: { height: 39, marginHorizontal: 13, marginTop: 11, paddingHorizontal: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: '#303030', borderRadius: 9, backgroundColor: '#181818', flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, height: 39, paddingVertical: 0, color: colors.text, fontSize: 13 },
  list: { flex: 1 },
  listContent: { padding: 13, paddingBottom: 38, gap: 9 },
  project: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2e2e2e', borderRadius: 12, backgroundColor: '#171717' },
  projectRow: { minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  projectRowActive: { backgroundColor: '#20252b' },
  folder: { width: 31, height: 31, borderRadius: 8, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  projectCopy: { flex: 1, minWidth: 0 },
  tasks: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#292929', paddingVertical: 5 },
  taskRow: { minHeight: 38, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskRowActive: { backgroundColor: '#242424' },
  taskDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: '#858585' },
  taskTitle: { flex: 1, color: '#b7b7b7', fontSize: 12 },
  newTask: { minHeight: 38, paddingHorizontal: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#292929', flexDirection: 'row', alignItems: 'center', gap: 9 },
  newTaskText: { color: '#8b8b8b', fontSize: 12 },
  empty: { paddingVertical: 70, color: '#777', textAlign: 'center', fontSize: 12 },
  chatHeader: { minHeight: 48, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#292929', flexDirection: 'row', alignItems: 'center' },
  chatTitle: { flex: 1, minWidth: 0 },
});
