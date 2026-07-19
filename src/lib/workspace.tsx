import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { API_URL, api, getToken } from '@/lib/api';

const WS_URL = API_URL.replace(/^http/, 'ws') + '/client';

export type WorkspaceDevice = {
  id: string;
  name?: string;
  hostname?: string;
  role?: 'pc' | 'laptop' | string;
  online?: boolean;
};

export type WorkspaceProject = {
  name: string;
  label?: string;
  group?: string;
  path?: string;
  kind?: string;
  updatedAt?: string | null;
  deviceId?: string;
  deviceName?: string;
};

export type WorkspaceModel = {
  name: string;
  family?: string;
  parameterSize?: string;
  size?: number;
};

export type WorkspaceThread = {
  thread_key: string;
  title?: string;
  project_name?: string;
  project_path?: string;
  device_name?: string;
  updated_at?: string;
};

type ChatMessage = { role: 'system' | 'assistant' | 'user'; content: string };

type WorkspaceContextValue = {
  connected: boolean;
  loading: boolean;
  devices: WorkspaceDevice[];
  activeDeviceId: string | null;
  setActiveDeviceId: (id: string | null) => void;
  projects: WorkspaceProject[];
  threads: WorkspaceThread[];
  openThread: (thread: WorkspaceThread) => void;
  activeProject: WorkspaceProject | null;
  setActiveProject: (project: WorkspaceProject | null) => void;
  models: WorkspaceModel[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  threadKey: string;
  newTask: () => void;
  refresh: () => void;
  refreshThreads: () => void;
  localChat: (messages: ChatMessage[]) => Promise<{ role: 'assistant'; content: string }>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const requestId = () => `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DEVICE_KEY = 'noda-workspace-device';
const MODEL_KEY = 'noda-workspace-model';
const PROJECT_KEY = 'noda-workspace-project';
const projectThreadKey = (projectName: string) => `project:${projectName.trim()}`.slice(0, 180);

const workspaceStorage = {
  async get(key: string) {
    if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); return; }
    await SecureStore.deleteItemAsync(key);
  },
};

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const pendingRef = useRef(new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const preferredProjectRef = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<WorkspaceDevice[]>([]);
  const [activeDeviceId, setActiveDeviceIdState] = useState<string | null>(null);
  const activeDeviceIdRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [threads, setThreads] = useState<WorkspaceThread[]>([]);
  const [activeProject, setActiveProjectState] = useState<WorkspaceProject | null>(null);
  const [models, setModels] = useState<WorkspaceModel[]>([]);
  const [selectedModel, setSelectedModelState] = useState('cloud');
  const [threadKey, setThreadKey] = useState('general');

  const setActiveDeviceId = useCallback((id: string | null) => {
    activeDeviceIdRef.current = id;
    setActiveDeviceIdState(id);
    setActiveProjectState(null);
    if (id) workspaceStorage.set(DEVICE_KEY, id).catch(() => {});
    else workspaceStorage.remove(DEVICE_KEY).catch(() => {});
  }, []);

  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(model);
    workspaceStorage.set(MODEL_KEY, model).catch(() => {});
  }, []);

  const sendRequest = useCallback(<T,>(type: string, payload: Record<string, unknown> = {}, timeout = 12_000) => new Promise<T>((resolve, reject) => {
    const socket = socketRef.current;
    const deviceId = activeDeviceIdRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new Error('Компьютер не подключён'));
    if (!deviceId) return reject(new Error('Выбери компьютер'));
    const reqId = requestId();
    const timer = setTimeout(() => {
      pendingRef.current.delete(reqId);
      reject(new Error('Компьютер не ответил'));
    }, timeout);
    pendingRef.current.set(reqId, { resolve, reject, timer });
    socket.send(JSON.stringify({ to: 'pc', deviceId, type, reqId, ...payload }));
  }), []);

  const loadThreads = useCallback(async () => {
    try {
      const result = await api<{ threads: WorkspaceThread[] }>('/ai/threads');
      setThreads(Array.isArray(result.threads) ? result.threads : []);
    } catch {
      setThreads([]);
    }
  }, []);

  const refresh = useCallback(() => {
    loadThreads();
    if (!activeDeviceIdRef.current || socketRef.current?.readyState !== WebSocket.OPEN) return;
    setLoading(true);
    Promise.allSettled([
      sendRequest<any>('workspace_projects').then((response) => {
        if (response?.error) throw new Error(response.error);
        const rows = (response?.inventory?.projects || []).map((project: WorkspaceProject) => ({
          ...project,
          deviceId: activeDeviceIdRef.current || undefined,
          deviceName: response.deviceName || undefined,
        }));
        setProjects(rows);
        const preferred = preferredProjectRef.current;
        if (preferred) {
          const restored = rows.find((project: WorkspaceProject) => project.name === preferred);
          if (restored) {
            setActiveProjectState(restored);
            setThreadKey(projectThreadKey(restored.name));
          }
        }
      }),
      sendRequest<any>('workspace_models').then((response) => {
        if (!response?.ok) {
          setModels([]);
          return;
        }
        setModels(response.models || []);
      }),
    ]).finally(() => setLoading(false));
  }, [loadThreads, sendRequest]);

  useEffect(() => {
    Promise.all([
      workspaceStorage.get(DEVICE_KEY),
      workspaceStorage.get(MODEL_KEY),
      workspaceStorage.get(PROJECT_KEY),
    ]).then(([device, model, project]) => {
      if (device) {
        activeDeviceIdRef.current = device;
        setActiveDeviceIdState(device);
      }
      if (model) setSelectedModelState(model);
      preferredProjectRef.current = project || null;
    }).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) loadThreads();
  }, [hydrated, loadThreads]);

  useEffect(() => {
    if (!hydrated) return;
    aliveRef.current = true;
    const pendingRequests = pendingRef.current;
    const connect = async () => {
      const token = await getToken();
      if (!token || !aliveRef.current) return setLoading(false);
      const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        socket.send(JSON.stringify({ type: 'list_devices' }));
      };
      socket.onmessage = (event) => {
        let message: any;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.reqId && pendingRef.current.has(message.reqId)) {
          const pending = pendingRef.current.get(message.reqId)!;
          clearTimeout(pending.timer);
          pendingRef.current.delete(message.reqId);
          pending.resolve(message);
          return;
        }
        if (message.type === 'devices') {
          const rows: WorkspaceDevice[] = message.devices || [];
          setDevices(rows);
          const current = activeDeviceIdRef.current;
          if (!current || !rows.some((device) => device.id === current && device.online)) {
            const next = rows.find((device) => device.online)?.id || rows[0]?.id || null;
            activeDeviceIdRef.current = next;
            setActiveDeviceIdState(next);
          }
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        setConnected(false);
        if (aliveRef.current) reconnectRef.current = setTimeout(connect, 2600);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => {
      aliveRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try { socketRef.current?.close(); } catch {}
      for (const pending of pendingRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Соединение закрыто'));
      }
      pendingRequests.clear();
    };
  }, [hydrated]);

  useEffect(() => {
    if (connected && activeDeviceId) refresh();
  }, [activeDeviceId, connected, refresh]);

  const setActiveProject = useCallback((project: WorkspaceProject | null) => {
    setActiveProjectState(project);
    preferredProjectRef.current = project?.name || null;
    if (project) {
      setThreadKey(projectThreadKey(project.name));
      workspaceStorage.set(PROJECT_KEY, project.name).catch(() => {});
    } else {
      workspaceStorage.remove(PROJECT_KEY).catch(() => {});
    }
  }, []);

  const openThread = useCallback((thread: WorkspaceThread) => {
    const projectName = thread.thread_key.startsWith('project:') ? thread.thread_key.slice('project:'.length) : '';
    const project = projects.find((item) => item.name === projectName || item.label === thread.project_name) || null;
    setThreadKey(thread.thread_key || 'general');
    setActiveProjectState(project);
    preferredProjectRef.current = project?.name || null;
    if (project) workspaceStorage.set(PROJECT_KEY, project.name).catch(() => {});
    else workspaceStorage.remove(PROJECT_KEY).catch(() => {});
  }, [projects]);

  const newTask = useCallback(() => {
    setActiveProjectState(null);
    preferredProjectRef.current = null;
    workspaceStorage.remove(PROJECT_KEY).catch(() => {});
    setThreadKey(`task:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
  }, []);

  const localChat = useCallback(async (messages: ChatMessage[]) => {
    if (!selectedModel.startsWith('local:')) throw new Error('Локальная модель не выбрана');
    const response = await sendRequest<any>('workspace_chat', {
      model: selectedModel.slice('local:'.length),
      messages: messages.slice(-40),
      project: activeProject ? { name: activeProject.label || activeProject.name, path: activeProject.path } : null,
    }, 190_000);
    if (!response?.ok) throw new Error(response?.error || 'Локальная модель недоступна');
    return response.message as { role: 'assistant'; content: string };
  }, [activeProject, selectedModel, sendRequest]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    connected,
    loading,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    projects,
    threads,
    openThread,
    activeProject,
    setActiveProject,
    models,
    selectedModel,
    setSelectedModel,
    threadKey,
    newTask,
    refresh,
    refreshThreads: loadThreads,
    localChat,
  }), [connected, loading, devices, activeDeviceId, setActiveDeviceId, projects, threads, openThread, activeProject, setActiveProject, models, selectedModel, setSelectedModel, threadKey, newTask, refresh, loadThreads, localChat]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
