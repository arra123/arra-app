export type DeviceId = 'laptop' | 'pc';
export type AgentKind = 'claude' | 'codex';
export type AgentState = 'working' | 'waiting' | 'error' | 'old';

export type Agent = {
  key: string;
  device: DeviceId;
  agent: AgentKind;
  project: string;
  cwd: string;
  ws: number | null;
  term: number;
  title: string;
  busy: boolean;
  state: AgentState;
  task: string;
  transcript: string;
  model: string;
  /** мс: с какого момента агент в текущем состоянии */
  since: number | null;
};

export type RecentSession = {
  key: string;
  device: DeviceId;
  agent: AgentKind;
  project: string;
  cwd: string;
  id: string;
  title: string;
  /** секунды unix */
  mtime: number | null;
  transcript: string;
};

export type DevicesState = Record<DeviceId, { online: boolean; via: DeviceId | null }>;

export type AraState = {
  connected: boolean;
  /** Пришёл ли хоть один ara.state с сервера */
  loaded: boolean;
  agents: Agent[];
  recent: RecentSession[];
  devices: DevicesState;
};

export type StepItem = { icon?: string; text: string };

export type TranscriptMessage =
  /** ts — секунды unix */
  | { role: 'user'; text: string; images?: string[]; ts?: number }
  /** took — сколько секунд агент думал над ответом */
  | { role: 'assistant'; text: string; images?: string[]; videos?: string[]; sites?: string[]; ts?: number; took?: number }
  | { role: 'steps'; items: StepItem[]; more?: number; ts?: number };

export type PlanItem = { text: string; status: 'completed' | 'in_progress' | 'pending' };

/** Помощник (подагент), которого запустил агент. */
export type SubAgent = {
  id: string;
  file: string;
  description: string;
  type: string;
  /** секунды unix: последняя запись в его журнале */
  mtime: number;
  active: boolean;
};

export type QuestionOption = { label: string; description: string };

/** Неотвеченный вопрос с вариантами (AskUserQuestion). */
export type AgentQuestion = {
  id: string;
  questions: { question: string; header: string; multi: boolean; options: QuestionOption[] }[];
};

export type Transcript = {
  messages: TranscriptMessage[];
  model?: string;
  /** секунды unix: последнее сообщение пользователя / последняя запись */
  lastUser?: number;
  last?: number;
  plan?: PlanItem[];
  /** Что агент просит у пользователя: пароль, доступ, решение */
  needs?: string[];
  agents?: SubAgent[];
  question?: AgentQuestion | null;
};

export type RemoteFile = { url: string; mime: string; name: string; size?: number };

/** Откуда файл: переписка агента или чат с Арой (компьютер проверяет, что путь там упомянут). */
export type FileScope = { agentKey: string } | { chatId: string };
