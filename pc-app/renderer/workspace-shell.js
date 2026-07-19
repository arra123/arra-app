// Codex-like workspace shell. Existing feature pages remain authoritative; this
// layer only unifies navigation, projects, settings and the assistant surface.
const nodaWorkspace = {
  projects: [],
  projectsRoot: '',
  projectsLoaded: false,
  projectsLoading: null,
  projectQuery: '',
  threads: [],
  threadsLoaded: false,
  threadsLoading: null,
  activeProjectKey: localStorage.getItem('noda-active-project') || '',
  threadKey: localStorage.getItem('noda-thread-key') || 'general',
  models: [],
  modelOnline: false,
  modelError: '',
  modelHost: 'http://127.0.0.1:11434',
  modelsLoadedAt: 0,
  selectedModel: localStorage.getItem('noda-chat-model') || 'cloud',
  messages: [],
  messagesKey: '',
  chatLoaded: false,
  chatBusy: false,
  chatImage: '',
  projectListExpanded: localStorage.getItem('noda-projects-expanded') === '1',
  compactSidebar: localStorage.getItem('noda-compact-sidebar') === '1',
  toolsExpanded: false,
  environmentOpen: localStorage.getItem('noda-environment-open') !== '0',
  environment: null,
  environmentProject: '',
  settingsQuery: '',
  terminalMode: localStorage.getItem('noda-terminal-mode') || 'terminal',
  previousSection: 'term',
};
document.body.classList.toggle('workspace-compact-sidebar', nodaWorkspace.compactSidebar);

const WORKSPACE_SECTIONS = new Set(['chat', 'term', 'files', 'sync', 'remote', 'notes', 'fin', 'settings']);
const savedWorkspaceSection = localStorage.getItem('noda-section');
state.section = WORKSPACE_SECTIONS.has(savedWorkspaceSection) ? savedWorkspaceSection : 'term';
const renderGeneralAssistant = renderChat;
const renderClassicTerminal = renderTerminal;

const workspaceIcons = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.1A1.7 1.7 0 0 0 15 4.2a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18.7 7M17.9 16A7 7 0 0 1 5.3 17"/></svg>',
  terminal: NAVICON.term,
  dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  branch: '<svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M18 9c0 5-8 2-10 6"/></svg>',
  panel: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
  monitor: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="m4 14 4-4h8l4 4M9 14a3 3 0 0 0 6 0"/></svg>',
};

function workspaceProjectKind(project) {
  return ({ javascript: 'JS', python: 'PY', rust: 'RS', go: 'GO', dotnet: '.N' })[project.kind] || (project.label || project.name || 'P').slice(0, 2).toUpperCase();
}

function activeWorkspaceProject() {
  return nodaWorkspace.projects.find((project) => project.name === nodaWorkspace.activeProjectKey) || null;
}

function workspaceProjectThreadKey(projectKey) {
  return `project:${encodeURIComponent(String(projectKey || '').trim())}`.slice(0, 180);
}

function newWorkspaceThreadKey(projectKey) {
  const project = encodeURIComponent(String(projectKey || 'general').trim());
  return `project:${project}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`.slice(0, 180);
}

function projectFromThreadKey(threadKey) {
  const match = String(threadKey || '').match(/^project:([^:]+)/);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

async function loadWorkspaceProjects(force = false) {
  if (!force && nodaWorkspace.projectsLoaded) return nodaWorkspace.projects;
  if (nodaWorkspace.projectsLoading) return nodaWorkspace.projectsLoading;
  nodaWorkspace.projectsLoading = window.arra.syncLocalInventory().then((inventory) => {
    nodaWorkspace.projectsRoot = inventory.root || '';
    nodaWorkspace.projects = (inventory.projects || []).sort((a, b) =>
      Number(b.updatedAt || 0) - Number(a.updatedAt || 0) || String(a.label || a.name).localeCompare(String(b.label || b.name), 'ru'));
    nodaWorkspace.projectsLoaded = true;
    if (nodaWorkspace.activeProjectKey && !activeWorkspaceProject()) nodaWorkspace.activeProjectKey = '';
    return nodaWorkspace.projects;
  }).catch((error) => {
    reportError('workspace.projects', error);
    nodaWorkspace.projects = [];
    nodaWorkspace.projectsLoaded = true;
    return [];
  }).finally(() => { nodaWorkspace.projectsLoading = null; });
  return nodaWorkspace.projectsLoading;
}

async function loadWorkspaceModels(force = false) {
  if (!force && Date.now() - nodaWorkspace.modelsLoadedAt < 15000) return nodaWorkspace.models;
  const result = await window.arra.localModels();
  nodaWorkspace.models = result.models || [];
  nodaWorkspace.modelOnline = !!result.ok;
  nodaWorkspace.modelError = result.error || '';
  nodaWorkspace.modelHost = result.url || nodaWorkspace.modelHost;
  nodaWorkspace.modelsLoadedAt = Date.now();
  if (nodaWorkspace.selectedModel.startsWith('local:') && !nodaWorkspace.models.some((model) => `local:${model.name}` === nodaWorkspace.selectedModel)) {
    nodaWorkspace.selectedModel = 'cloud';
    localStorage.setItem('noda-chat-model', 'cloud');
  }
  return nodaWorkspace.models;
}

async function loadWorkspaceThreads(force = false) {
  if (!force && nodaWorkspace.threadsLoaded) return nodaWorkspace.threads;
  if (nodaWorkspace.threadsLoading) return nodaWorkspace.threadsLoading;
  nodaWorkspace.threadsLoading = api('GET', '/ai/threads').then((result) => {
    nodaWorkspace.threads = Array.isArray(result.threads) ? result.threads : [];
    nodaWorkspace.threadsLoaded = true;
    return nodaWorkspace.threads;
  }).catch((error) => {
    reportError('workspace.threads', error);
    nodaWorkspace.threads = [];
    nodaWorkspace.threadsLoaded = true;
    return [];
  }).finally(() => { nodaWorkspace.threadsLoading = null; });
  return nodaWorkspace.threadsLoading;
}

function navigateWorkspace(section) {
  if (!WORKSPACE_SECTIONS.has(section)) return;
  if (section === 'settings' && state.section !== 'settings') nodaWorkspace.previousSection = state.section;
  state.section = section;
  localStorage.setItem('noda-section', section);
  renderNav();
  route();
}

function selectWorkspaceProject(key) {
  nodaWorkspace.activeProjectKey = key || '';
  const project = activeWorkspaceProject();
  const recent = nodaWorkspace.threads.find((thread) => thread.project_name === project?.name || thread.project_name === project?.label || projectFromThreadKey(thread.thread_key) === key);
  nodaWorkspace.threadKey = recent?.thread_key || newWorkspaceThreadKey(key);
  localStorage.setItem('noda-active-project', nodaWorkspace.activeProjectKey);
  localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
  nodaWorkspace.chatLoaded = false;
  nodaWorkspace.terminalMode = 'nodex';
  localStorage.setItem('noda-terminal-mode', 'nodex');
  navigateWorkspace('term');
}

function openWorkspaceThread(threadKey) {
  const thread = nodaWorkspace.threads.find((item) => item.thread_key === threadKey);
  nodaWorkspace.threadKey = threadKey || 'general';
  const projectKey = projectFromThreadKey(threadKey);
  const matchingProject = nodaWorkspace.projects.find((project) => project.name === projectKey || project.name === thread?.project_name || project.label === thread?.project_name);
  nodaWorkspace.activeProjectKey = matchingProject?.name || '';
  nodaWorkspace.messages = [];
  nodaWorkspace.chatLoaded = false;
  localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
  if (nodaWorkspace.activeProjectKey) localStorage.setItem('noda-active-project', nodaWorkspace.activeProjectKey);
  else localStorage.removeItem('noda-active-project');
  nodaWorkspace.terminalMode = 'nodex';
  localStorage.setItem('noda-terminal-mode', 'nodex');
  navigateWorkspace('term');
}

function openProjectTerminal(project) {
  if (!project) return;
  nodaWorkspace.terminalMode = 'terminal';
  localStorage.setItem('noda-terminal-mode', 'terminal');
  state.section = 'term';
  localStorage.setItem('noda-section', 'term');
  renderNav();
  route();
  setTimeout(() => addTermQuick(project.path || nodaWorkspace.projectsRoot), 30);
}

function workspaceProjectRows() {
  if (!nodaWorkspace.projectsLoaded) return '<div class="workspace-project-skeleton"><i></i><i></i><i></i></div>';
  const query = nodaWorkspace.projectQuery.trim().toLowerCase();
  const rows = nodaWorkspace.projects.filter((project) => !query || `${project.label} ${project.name} ${project.group}`.toLowerCase().includes(query));
  if (!rows.length) return `<div class="workspace-project-empty">${query ? 'Ничего не найдено' : 'Проекты не найдены'}</div>`;
  const limit = query || nodaWorkspace.projectListExpanded ? 80 : 11;
  const visibleRows = rows.slice(0, limit);
  const projectHtml = visibleRows.map((project) => {
    const active = project.name === nodaWorkspace.activeProjectKey;
    const nested = nodaWorkspace.threads.filter((thread) => projectFromThreadKey(thread.thread_key) === project.name || thread.project_name === project.name || thread.project_name === project.label).slice(0, 12);
    const currentDraft = active && projectFromThreadKey(nodaWorkspace.threadKey) === project.name && !nested.some((thread) => thread.thread_key === nodaWorkspace.threadKey)
      ? [{ thread_key: nodaWorkspace.threadKey, title: 'Новая задача' }]
      : [];
    const taskRows = active ? [...currentDraft, ...nested].map((thread) => `<button class="workspace-project-task ${thread.thread_key === nodaWorkspace.threadKey ? 'active' : ''}" data-thread="${esc(thread.thread_key)}" title="${esc(thread.title || 'Задача')}"><span>${esc(thread.title || 'Новая задача')}</span>${thread.thread_key === nodaWorkspace.threadKey ? '<i></i>' : ''}</button>`).join('') : '';
    return `<div class="workspace-project-group"><button class="workspace-project ${active ? 'active' : ''}" data-project="${esc(project.name)}" title="${esc(project.path || project.name)}"><span class="workspace-project-folder">${workspaceIcons.folder}</span><b>${esc(project.label || project.name)}</b><i data-project-terminal="${esc(project.name)}" title="Открыть терминал">${workspaceIcons.dots}</i></button>${taskRows ? `<div class="workspace-project-tasks">${taskRows}</div>` : ''}</div>`;
  }).join('');
  const more = !query && rows.length > 11 ? `<button class="workspace-project-more" id="workspace-project-more">${nodaWorkspace.projectListExpanded ? 'Показать меньше' : `Показать ещё ${rows.length - 11}`}</button>` : '';
  return projectHtml + more;
}

function workspaceRecentRows() {
  if (!nodaWorkspace.threadsLoaded) return '<div class="workspace-recent-skeleton"><i></i><i></i></div>';
  const rows = nodaWorkspace.threads.filter((thread) => !String(thread.thread_key || '').startsWith('project:') && !thread.project_name).slice(0, 6);
  if (!rows.length) return '<div class="workspace-recent-empty">Общие задачи появятся здесь</div>';
  return rows.map((thread) => `<button class="workspace-recent ${thread.thread_key === nodaWorkspace.threadKey ? 'active' : ''}" data-thread="${esc(thread.thread_key)}" title="${esc(thread.title || 'Задача')}"><b>${esc(thread.title || 'Новая задача')}</b></button>`).join('');
}

const baseRenderNav = renderNav;
renderNav = async function renderWorkspaceNav() {
  nav.classList.remove('hidden');
  const status = state.presence.status || {};
  const currentRole = status.deviceProfile?.role;
  const items = [
    ['term', 'Терминал', NAVICON.term],
    ['files', 'Файлы', NAVICON.files],
    ['sync', 'Передача', NAVICON.sync],
    ['remote', 'Удалённый ПК', workspaceIcons.monitor],
    ['chat', 'Помощник', NAVICON.chat],
    ['notes', 'Заметки', NAVICON.notes],
    ['fin', 'Возвраты', NAVICON.fin],
  ];
  nav.innerHTML = `<div class="workspace-sidebar-head"><div class="workspace-brand-row"><button id="workspace-home" class="workspace-brand"><span class="workspace-brand-mark">N</span><span>Noda</span></button></div></div>
    <div class="workspace-side-scroll"><section class="workspace-nav-section"><h3>Рабочее место</h3><div class="workspace-nav-list">${items.map(([key, label, icon]) => `<button data-s="${key}" class="workspace-tool ${state.section === key ? 'active' : ''}">${icon}<span>${label}</span></button>`).join('')}</div></section></div>
    <div class="workspace-sidebar-foot"><button class="workspace-device" id="workspace-account"><span class="workspace-avatar">${esc((status.deviceName || 'N').slice(0, 1).toUpperCase())}</span><span><b>${esc(status.deviceName || (currentRole === 'laptop' ? 'Ноутбук' : 'Этот компьютер'))}</b><small>${status.online ? 'в сети' : 'нет связи'}</small></span><i class="${status.online ? 'online' : ''}"></i></button><button class="workspace-foot-action ${state.section === 'settings' ? 'active' : ''}" data-s="settings" title="Настройки">${workspaceIcons.settings}</button></div>`;

  nav.querySelectorAll('[data-s]').forEach((button) => { button.onclick = () => navigateWorkspace(button.dataset.s); });
  nav.querySelector('#workspace-home').onclick = () => navigateWorkspace('term');
};

function bindWorkspaceProjectRows(root = document) {
  root.querySelectorAll('[data-thread]').forEach((button) => { button.onclick = (event) => { event.stopPropagation(); openWorkspaceThread(button.dataset.thread); }; });
  root.querySelector('#workspace-project-more')?.addEventListener('click', () => {
    nodaWorkspace.projectListExpanded = !nodaWorkspace.projectListExpanded;
    localStorage.setItem('noda-projects-expanded', nodaWorkspace.projectListExpanded ? '1' : '0');
    const list = document.getElementById('workspace-project-list');
    if (list) list.innerHTML = workspaceProjectRows();
    bindWorkspaceProjectRows(root);
  });
  root.querySelectorAll('[data-project]').forEach((button) => {
    button.onclick = (event) => {
      const project = nodaWorkspace.projects.find((item) => item.name === button.dataset.project);
      if (event.target.closest('[data-project-terminal]')) openProjectTerminal(project);
      else selectWorkspaceProject(button.dataset.project);
    };
    button.oncontextmenu = (event) => {
      event.preventDefault();
      const project = nodaWorkspace.projects.find((item) => item.name === button.dataset.project);
      showCtxMenu(event.clientX, event.clientY, [
        { label: 'Открыть чат проекта', action: () => selectWorkspaceProject(project.name) },
        { label: 'Открыть терминал', action: () => openProjectTerminal(project) },
        { label: 'Показать в проводнике', action: () => window.arra.openFile(project.path) },
      ]);
    };
  });
}

function selectedModelLabel() {
  if (nodaWorkspace.selectedModel === 'cloud') return 'Noda Cloud';
  return nodaWorkspace.selectedModel.replace(/^local:/, '');
}

function workspaceEnvironmentHtml(project) {
  if (!project) return '';
  const environment = nodaWorkspace.environmentProject === project.name ? nodaWorkspace.environment : null;
  if (!environment) return '<div class="workspace-environment-loading"><i></i><i></i><i></i></div>';
  if (!environment.ok) return `<div class="workspace-environment-error"><b>Среда недоступна</b><span>${esc(environment.error || 'Не удалось прочитать проект')}</span><button id="workspace-environment-retry">Повторить</button></div>`;
  const status = state.presence.status || {};
  if (!environment.git) return `<div class="workspace-environment-section"><h3>Среда</h3><button class="workspace-environment-row" data-environment-action="folder">${workspaceIcons.folder}<span><b>Локальный</b><small>${esc(status.deviceName || 'Этот компьютер')}</small></span></button><div class="workspace-environment-note">Git не настроен для этого проекта.</div></div>`;
  const files = (environment.files || []).map((file) => `<button class="workspace-source" data-environment-action="folder" title="${esc(file.path)}"><span class="status-${esc(String(file.status || 'M').toLowerCase())}">${esc(file.status || 'M')}</span><b>${esc(file.path)}</b></button>`).join('');
  return `<div class="workspace-environment-section"><header><h3>Среда</h3><button id="workspace-environment-refresh" title="Обновить">${workspaceIcons.refresh}</button></header><button class="workspace-environment-row" data-environment-action="folder">${workspaceIcons.inbox}<span><b>Изменения</b><small>${environment.changes ? `${environment.changes} файлов` : 'Рабочее дерево чистое'}</small></span><em><i class="additions">+${environment.additions || 0}</i><i class="deletions">-${environment.deletions || 0}</i></em></button><button class="workspace-environment-row" data-environment-action="folder">${workspaceIcons.monitor}<span><b>Локальный</b><small>${esc(status.deviceName || 'Этот компьютер')}</small></span>${workspaceIcons.chevron}</button><button class="workspace-environment-row" data-environment-action="terminal">${workspaceIcons.branch}<span><b>${esc(environment.branch || 'HEAD')}</b><small>${environment.ahead || environment.behind ? `впереди ${environment.ahead || 0} · позади ${environment.behind || 0}` : 'Текущая ветка'}</small></span>${workspaceIcons.chevron}</button><button class="workspace-environment-row" data-environment-action="status">${workspaceIcons.sparkle}<span><b>Создать коммит или отправить</b><small>Открыть Git в терминале проекта</small></span>${workspaceIcons.chevron}</button></div>${files ? `<div class="workspace-environment-section workspace-sources"><header><h3>Источники</h3><span>${environment.changes}</span></header>${files}</div>` : ''}`;
}

async function loadWorkspaceEnvironment(project, force = false) {
  if (!project) return null;
  if (!force && nodaWorkspace.environmentProject === project.name && nodaWorkspace.environment) return nodaWorkspace.environment;
  nodaWorkspace.environmentProject = project.name;
  nodaWorkspace.environment = null;
  const result = await window.arra.projectEnvironment(project.path);
  if (nodaWorkspace.environmentProject !== project.name) return result;
  nodaWorkspace.environment = result;
  const panel = document.getElementById('workspace-environment-body');
  if (panel) {
    panel.innerHTML = workspaceEnvironmentHtml(project);
    bindWorkspaceEnvironment(project);
  }
  return result;
}

function workspaceMessageKey() {
  return `${nodaWorkspace.selectedModel}|${nodaWorkspace.threadKey}`;
}

function localMessageStorageKey() {
  return `noda-local-thread:${workspaceMessageKey()}`;
}

function saveLocalMessages() {
  if (!nodaWorkspace.selectedModel.startsWith('local:')) return;
  try { localStorage.setItem(localMessageStorageKey(), JSON.stringify(nodaWorkspace.messages.slice(-40))); } catch {}
}

async function loadWorkspaceMessages(force = false) {
  const key = workspaceMessageKey();
  if (!force && nodaWorkspace.chatLoaded && nodaWorkspace.messagesKey === key) return;
  nodaWorkspace.messagesKey = key;
  if (nodaWorkspace.selectedModel.startsWith('local:')) {
    try {
      const result = await api('GET', `/ai/messages?thread=${encodeURIComponent(nodaWorkspace.threadKey)}`);
      nodaWorkspace.messages = result.messages || [];
      if (!nodaWorkspace.messages.length) nodaWorkspace.messages = JSON.parse(localStorage.getItem(localMessageStorageKey()) || '[]');
    } catch {
      try { nodaWorkspace.messages = JSON.parse(localStorage.getItem(localMessageStorageKey()) || '[]'); } catch { nodaWorkspace.messages = []; }
    }
  } else {
    const result = await api('GET', `/ai/messages?thread=${encodeURIComponent(nodaWorkspace.threadKey)}`);
    nodaWorkspace.messages = result.messages || [];
  }
  nodaWorkspace.chatLoaded = true;
}

function workspaceMessagesHtml() {
  if (!nodaWorkspace.messages.length) {
    const project = activeWorkspaceProject();
    return `<div class="workspace-chat-empty"><h1>${project ? `Что делаем в ${esc(project.label || project.name)}?` : 'С чего начнём?'}</h1><p>${project ? 'Опиши задачу — Noda сохранит диалог внутри проекта.' : 'Создай задачу или выбери проект слева.'}</p><div class="workspace-suggestions">${project ? `<button data-chat-action="codex">Запустить Codex</button><button data-chat-action="terminal">Открыть терминал</button>` : ''}<button data-chat-action="models">Выбрать модель</button></div></div>`;
  }
  return nodaWorkspace.messages.map((message) => `<article class="workspace-message ${message.role === 'user' ? 'user' : 'assistant'}"><div class="workspace-message-role">${message.role === 'user' ? 'Вы' : (nodaWorkspace.selectedModel === 'cloud' ? 'Noda' : esc(selectedModelLabel()))}</div><div class="workspace-message-body">${esc(message.content || '')}</div></article>`).join('');
}

function modelOptionsHtml() {
  const local = nodaWorkspace.models.map((model) => `<option value="local:${esc(model.name)}" ${nodaWorkspace.selectedModel === `local:${model.name}` ? 'selected' : ''}>${esc(model.name)} · локально</option>`).join('');
  return `<option value="cloud" ${nodaWorkspace.selectedModel === 'cloud' ? 'selected' : ''}>Noda Cloud</option>${local}`;
}

function renderNodexWorkspace() {
  const project = activeWorkspaceProject();
  const currentThread = nodaWorkspace.threads.find((thread) => thread.thread_key === nodaWorkspace.threadKey);
  document.body.classList.add('workspace-chat-mode');
  app.innerHTML = `<div class="nodex-shell"><aside class="nodex-sidebar"><header><div><b>Nodex</b><small>${esc(nodaWorkspace.projectsRoot || 'Локальные проекты')}</small></div><button id="nodex-project-refresh" title="Обновить проекты">${workspaceIcons.refresh}</button></header><button class="nodex-new-task" id="nodex-new-task">${workspaceIcons.plus}<span>Новая задача</span></button><label class="nodex-search">${workspaceIcons.search}<input id="nodex-project-search" placeholder="Найти проект или задачу" value="${esc(nodaWorkspace.projectQuery)}"/></label><div class="nodex-project-scroll"><div id="workspace-project-list">${workspaceProjectRows()}</div></div></aside><div class="workspace-chat"><header class="workspace-chat-head"><div class="workspace-chat-context">${workspaceIcons.folder}<b>${esc(currentThread?.title || project?.label || project?.name || 'Выберите проект')}</b><button title="Действия">${workspaceIcons.dots}</button></div><div class="workspace-chat-actions">${project ? `<button id="workspace-open-in" class="workspace-open-in">${workspaceIcons.folder}<span>Открыть в</span>${workspaceIcons.chevron}</button><button id="workspace-toggle-environment" class="${nodaWorkspace.environmentOpen ? 'active' : ''}" title="Среда проекта">${workspaceIcons.panel}</button>` : ''}</div></header>
    <div class="workspace-chat-layout ${project && nodaWorkspace.environmentOpen ? 'with-environment' : ''}"><div class="workspace-thread-column"><section class="workspace-chat-feed" id="workspace-chat-feed">${nodaWorkspace.chatLoaded && nodaWorkspace.messagesKey === workspaceMessageKey() ? workspaceMessagesHtml() : '<div class="workspace-chat-loading"><i></i><i></i><i></i></div>'}</section>
      <footer class="workspace-composer-wrap">${project ? `<div class="workspace-goal-chip">${workspaceIcons.sparkle}<span><b>Проект</b> ${esc(project.label || project.name)}</span><small>${esc(selectedModelLabel())}</small></div>` : ''}<div class="workspace-composer"><textarea id="workspace-chat-input" rows="1" placeholder="${project ? 'Опишите задачу' : 'Сначала выберите проект'}" ${project ? '' : 'disabled'}></textarea><div class="workspace-composer-actions"><button id="workspace-chat-attach" title="Добавить файл" ${project ? '' : 'disabled'}>${workspaceIcons.plus}</button><input id="workspace-chat-photo" type="file" accept="image/*" hidden/><button id="workspace-chat-settings" title="Настройки модели">${workspaceIcons.settings}</button><span id="workspace-chat-context-label">${project ? 'Задача проекта' : 'Проект не выбран'}</span><label class="workspace-model-inline"><i class="${nodaWorkspace.selectedModel === 'cloud' ? 'cloud' : 'local'}"></i><select id="workspace-model">${modelOptionsHtml()}</select></label><button id="workspace-chat-mic" title="Голосовой ввод" ${project ? '' : 'disabled'}>${typeof liquidIcon === 'function' ? liquidIcon('mic') : workspaceIcons.sparkle}</button><button id="workspace-chat-send" class="workspace-send" title="Отправить" ${project ? '' : 'disabled'}>${workspaceIcons.send}</button></div></div></footer></div>${project ? `<aside class="workspace-environment" id="workspace-environment"><div id="workspace-environment-body">${workspaceEnvironmentHtml(project)}</div></aside>` : ''}</div></div></div>`;

  bindNodexSidebar();

  const feed = document.getElementById('workspace-chat-feed');
  const input = document.getElementById('workspace-chat-input');
  const send = document.getElementById('workspace-chat-send');
  const rerenderMessages = () => { if (!feed) return; feed.innerHTML = workspaceMessagesHtml(); feed.scrollTop = feed.scrollHeight; bindWorkspaceChatActions(); };
  loadWorkspaceMessages().then(rerenderMessages).catch((error) => { feed.innerHTML = `<div class="workspace-chat-error">${esc(error.message)}</div>`; });
  loadWorkspaceModels().then(() => {
    const select = document.getElementById('workspace-model');
    if (select) select.innerHTML = modelOptionsHtml();
  }).catch(() => {});
  if (project) loadWorkspaceEnvironment(project).catch(() => {});
  input.oninput = () => { input.style.height = 'auto'; input.style.height = `${Math.min(190, input.scrollHeight)}px`; };
  const sendMessage = async () => {
    const text = input.value.trim();
    if ((!text && !nodaWorkspace.chatImage) || nodaWorkspace.chatBusy) return;
    input.value = ''; input.style.height = 'auto'; nodaWorkspace.chatBusy = true;
    const userMessage = { id: `local-user-${Date.now()}`, role: 'user', content: text || 'Фото' };
    nodaWorkspace.messages.push(userMessage);
    rerenderMessages(); send.disabled = true;
    try {
      if (nodaWorkspace.selectedModel.startsWith('local:')) {
        const system = project ? [{ role: 'system', content: `Ты работаешь в Noda над проектом ${project.label || project.name}. Локальный путь проекта: ${project.path}. Не утверждай, что прочитал файлы, если их содержимое не прислали в диалог.` }] : [];
        const result = await window.arra.localChat(
          nodaWorkspace.selectedModel.replace(/^local:/, ''),
          [...system, ...nodaWorkspace.messages],
          project ? { name: project.label || project.name, path: project.path } : null,
        );
        if (!result.ok) throw new Error(result.error || 'Локальная модель недоступна');
        const assistantMessage = { ...result.message, id: `local-assistant-${Date.now()}` };
        nodaWorkspace.messages.push(assistantMessage);
        saveLocalMessages();
        await api('POST', '/ai/messages/sync', {
          threadKey: nodaWorkspace.threadKey,
          project: project ? { name: project.label || project.name, path: project.path, device: state.presence.status?.deviceName || '' } : null,
          messages: [userMessage, assistantMessage],
        }).catch(() => {});
      } else {
        await api('POST', '/ai/assistant', { text, image: nodaWorkspace.chatImage, threadKey: nodaWorkspace.threadKey, project: project ? { name: project.label || project.name, path: project.path, device: state.presence.status?.deviceName || '' } : null });
        nodaWorkspace.chatImage = '';
        await loadWorkspaceMessages(true);
      }
      loadWorkspaceThreads(true).then(refreshNodexProjectList).catch(() => {});
    } catch (error) {
      nodaWorkspace.messages.push({ role: 'assistant', content: `Не удалось ответить: ${error.message}` });
    } finally {
      nodaWorkspace.chatBusy = false; send.disabled = false; rerenderMessages(); input.focus();
    }
  };
  send.onclick = sendMessage;
  input.onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } };
  const photo = document.getElementById('workspace-chat-photo');
  document.getElementById('workspace-chat-attach').onclick = () => photo.click();
  photo.onchange = async () => { if (photo.files?.[0]) { nodaWorkspace.chatImage = await dataUrlFromFile(photo.files[0]); document.getElementById('workspace-chat-context-label').textContent = 'Фото добавлено'; } };
  if (typeof bindLiquidRecorder === 'function') bindLiquidRecorder(document.getElementById('workspace-chat-mic'), (text) => { input.value = text; input.dispatchEvent(new Event('input')); input.focus(); });
  document.getElementById('workspace-model').onchange = (event) => {
    nodaWorkspace.selectedModel = event.target.value;
    localStorage.setItem('noda-chat-model', nodaWorkspace.selectedModel);
    nodaWorkspace.chatLoaded = false; nodaWorkspace.messages = []; renderNodexWorkspace();
  };
  document.getElementById('workspace-chat-settings')?.addEventListener('click', () => navigateWorkspace('settings'));
  document.getElementById('workspace-open-in')?.addEventListener('click', (event) => {
    showCtxMenu(event.clientX, event.clientY, [
      { label: 'Показать в проводнике', action: () => window.arra.openFile(project.path) },
      { label: 'Открыть терминал', action: () => openProjectTerminal(project) },
      { label: 'Запустить Codex', action: () => { openProjectTerminal(project); setTimeout(() => launchTerminalPreset('codex --yolo'), 250); } },
    ]);
  });
  document.getElementById('workspace-toggle-environment')?.addEventListener('click', () => {
    nodaWorkspace.environmentOpen = !nodaWorkspace.environmentOpen;
    localStorage.setItem('noda-environment-open', nodaWorkspace.environmentOpen ? '1' : '0');
    document.querySelector('.workspace-chat-layout')?.classList.toggle('with-environment', nodaWorkspace.environmentOpen);
    document.getElementById('workspace-toggle-environment')?.classList.toggle('active', nodaWorkspace.environmentOpen);
  });
  bindWorkspaceEnvironment(project);
  bindWorkspaceChatActions();
}

function refreshNodexProjectList() {
  const list = document.getElementById('workspace-project-list');
  if (!list) return;
  list.innerHTML = workspaceProjectRows();
  bindWorkspaceProjectRows(app);
}

function bindNodexSidebar() {
  bindWorkspaceProjectRows(app);
  const search = document.getElementById('nodex-project-search');
  if (search) search.oninput = () => { nodaWorkspace.projectQuery = search.value; refreshNodexProjectList(); };
  document.getElementById('nodex-new-task')?.addEventListener('click', () => {
    const project = activeWorkspaceProject() || nodaWorkspace.projects[0];
    if (!project) return toast('Nodex', 'Сначала добавьте папку с проектами в настройках', 'warn');
    nodaWorkspace.activeProjectKey = project.name;
    nodaWorkspace.threadKey = newWorkspaceThreadKey(project.name);
    nodaWorkspace.messages = [];
    nodaWorkspace.chatLoaded = true;
    nodaWorkspace.messagesKey = workspaceMessageKey();
    localStorage.setItem('noda-active-project', project.name);
    localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
    renderNodexWorkspace();
  });
  document.getElementById('nodex-project-refresh')?.addEventListener('click', async () => {
    nodaWorkspace.projectsLoaded = false;
    refreshNodexProjectList();
    await Promise.all([loadWorkspaceProjects(true), loadWorkspaceThreads(true)]);
    refreshNodexProjectList();
  });
  if (!nodaWorkspace.projectsLoaded) loadWorkspaceProjects().then(refreshNodexProjectList);
  if (!nodaWorkspace.threadsLoaded) loadWorkspaceThreads().then(refreshNodexProjectList);
}

function bindWorkspaceEnvironment(project) {
  if (!project) return;
  document.getElementById('workspace-environment-refresh')?.addEventListener('click', () => loadWorkspaceEnvironment(project, true));
  document.getElementById('workspace-environment-retry')?.addEventListener('click', () => loadWorkspaceEnvironment(project, true));
  document.querySelectorAll('[data-environment-action]').forEach((button) => {
    button.onclick = () => {
      if (button.dataset.environmentAction === 'folder') window.arra.openFile(project.path);
      else if (button.dataset.environmentAction === 'terminal') openProjectTerminal(project);
      else if (button.dataset.environmentAction === 'status') { openProjectTerminal(project); setTimeout(() => addTermQuick(project.path || nodaWorkspace.projectsRoot), 30); }
    };
  });
}

function bindWorkspaceChatActions() {
  document.querySelectorAll('[data-chat-action]').forEach((button) => { button.onclick = () => {
    const project = activeWorkspaceProject();
    if (button.dataset.chatAction === 'terminal') openProjectTerminal(project);
    else if (button.dataset.chatAction === 'codex') { openProjectTerminal(project); setTimeout(() => launchTerminalPreset('codex --yolo'), 250); }
    else if (button.dataset.chatAction === 'models') navigateWorkspace('settings');
    else if (button.dataset.chatAction === 'sync') navigateWorkspace('sync');
  }; });
}

renderChat = renderGeneralAssistant;
renderTerminal = async function renderNodaTerminal() {
  document.body.classList.add('noda-terminal-page');
  if (nodaWorkspace.terminalMode === 'nodex') renderNodexWorkspace();
  else await renderClassicTerminal();
  app.insertAdjacentHTML('afterbegin', `<header class="noda-terminal-modebar"><div class="noda-mode-switch" role="tablist" aria-label="Режим терминала"><button class="${nodaWorkspace.terminalMode === 'terminal' ? 'active' : ''}" data-terminal-mode="terminal" role="tab" aria-selected="${nodaWorkspace.terminalMode === 'terminal'}">${NAVICON.term}<span>Терминал</span></button><button class="${nodaWorkspace.terminalMode === 'nodex' ? 'active' : ''}" data-terminal-mode="nodex" role="tab" aria-selected="${nodaWorkspace.terminalMode === 'nodex'}">${workspaceIcons.sparkle}<span>Nodex</span></button><i></i></div><div class="noda-mode-context">${nodaWorkspace.terminalMode === 'nodex' ? 'Проекты и задачи' : 'Локальная консоль'}</div></header>`);
  app.querySelectorAll('[data-terminal-mode]').forEach((button) => { button.onclick = () => {
    nodaWorkspace.terminalMode = button.dataset.terminalMode;
    localStorage.setItem('noda-terminal-mode', nodaWorkspace.terminalMode);
    renderTerminal();
  }; });
};

async function renderWorkspaceSettings() {
  document.body.classList.add('workspace-settings-mode');
  app.innerHTML = '<div class="workspace-settings-loading"><i></i><i></i><i></i></div>';
  const [settings] = await Promise.all([window.arra.workspaceSettings(), loadWorkspaceModels(true).catch(() => [])]);
  const devices = state.presence.devices || [];
  const settingNav = [
    ['general', 'Основные', workspaceIcons.settings], ['appearance', 'Внешний вид', workspaceIcons.sparkle], ['models', 'Модели', NAVICON.chat],
    ['projects', 'Nodex', workspaceIcons.folder], ['devices', 'Устройства', workspaceIcons.monitor], ['terminal', 'Терминал', NAVICON.term],
    ['updates', 'Обновления', workspaceIcons.refresh], ['diagnostics', 'Диагностика', workspaceIcons.inbox],
  ];
  app.innerHTML = `<div class="workspace-settings"><aside class="workspace-settings-nav"><button id="workspace-settings-back" class="workspace-settings-back">${workspaceIcons.back}<span>Вернуться в приложение</span></button><label class="workspace-settings-search">${workspaceIcons.search}<input id="workspace-settings-search" placeholder="Поиск настроек" value="${esc(nodaWorkspace.settingsQuery)}"/></label><div class="workspace-settings-nav-scroll"><h3>Настройки Noda</h3>${settingNav.slice(0, 3).map(([key, label, icon], index) => `<button class="${index === 0 ? 'active' : ''}" data-settings-anchor="${key}" data-settings-label="${label.toLowerCase()}">${icon}<span>${label}</span></button>`).join('')}<h3>Рабочая область</h3>${settingNav.slice(3, 6).map(([key, label, icon]) => `<button data-settings-anchor="${key}" data-settings-label="${label.toLowerCase()}">${icon}<span>${label}</span></button>`).join('')}<h3>Система</h3>${settingNav.slice(6).map(([key, label, icon]) => `<button data-settings-anchor="${key}" data-settings-label="${label.toLowerCase()}">${icon}<span>${label}</span></button>`).join('')}</div></aside><main class="workspace-settings-main"><div class="workspace-settings-content">
    <section class="workspace-settings-section active-section" id="settings-general"><h1>Основные</h1><h2>Поведение</h2><div class="workspace-setting-group"><div class="workspace-setting-row"><span><b>Среда проекта</b><small>Показывать Git, ветку и изменённые файлы справа от задачи</small></span><button class="workspace-switch ${nodaWorkspace.environmentOpen ? 'active' : ''}" id="workspace-setting-environment" role="switch" aria-checked="${nodaWorkspace.environmentOpen}"><i></i></button></div><div class="workspace-setting-row"><span><b>Новая задача</b><small>Открывать чистую задачу без выбранного проекта</small></span><em>Ctrl N</em></div></div></section>
    <section class="workspace-settings-section" id="settings-appearance"><h1>Внешний вид</h1><h2>Интерфейс</h2><div class="workspace-setting-group"><div class="workspace-setting-row"><span><b>Тема</b><small>Единая тёмная тема Noda</small></span><em>Тёмная</em></div><div class="workspace-setting-row"><span><b>Компактная боковая панель</b><small>Уменьшить ширину основной навигации приложения</small></span><button class="workspace-switch ${nodaWorkspace.compactSidebar ? 'active' : ''}" id="workspace-setting-compact" role="switch" aria-checked="${nodaWorkspace.compactSidebar}"><i></i></button></div></div></section>
    <section class="workspace-settings-section" id="settings-models"><h1>Модели</h1><h2>Локальный запуск</h2><div class="workspace-setting-group"><div class="workspace-setting-row column"><span><b>Ollama или LM Studio</b><small>Диалог обрабатывается на выбранном компьютере и не отправляется во внешний API</small></span><div class="workspace-setting-input"><input id="workspace-model-host" value="${esc(settings.localAiUrl || nodaWorkspace.modelHost)}"/><button id="workspace-save-model-host">Сохранить</button><button id="workspace-refresh-models">Проверить</button></div><div id="workspace-model-state" class="workspace-model-state ${nodaWorkspace.modelOnline ? 'online' : 'offline'}"><i></i><span>${nodaWorkspace.modelOnline ? `${nodaWorkspace.models.length} моделей доступно` : esc(nodaWorkspace.modelError || 'Локальная модель не запущена')}</span></div>${nodaWorkspace.models.length ? `<div class="workspace-model-list">${nodaWorkspace.models.map((model) => `<div><span><b>${esc(model.name)}</b><small>${esc([model.family, model.parameterSize].filter(Boolean).join(' · ') || 'локальная модель')}</small></span><em>${model.size ? `${Math.round(model.size / 1024 / 1024 / 1024 * 10) / 10} ГБ` : ''}</em></div>`).join('')}</div>` : ''}</div></div></section>
    <section class="workspace-settings-section" id="settings-projects"><h1>Nodex</h1><h2>Проекты терминала</h2><div class="workspace-setting-group"><div class="workspace-setting-row"><span><b>Папка проектов</b><small>Вложенные проекты автоматически появляются только в режиме Nodex внутри терминала</small></span><code>${esc(settings.codeRoot)}</code><button id="workspace-choose-root">Изменить</button></div><div class="workspace-setting-row"><span><b>Полученные файлы</b><small>Фото и документы с телефона</small></span><code>${esc(settings.downloadFolder)}</code></div></div></section>
    <section class="workspace-settings-section" id="settings-devices"><h1>Устройства</h1><h2>Компьютеры Noda</h2><div class="workspace-device-list">${devices.map((device) => `<div><i class="${device.online ? 'online' : ''}"></i><span><b>${esc(device.name || device.hostname || 'Компьютер')}</b><small>${device.id === state.presence.currentId ? 'это устройство' : (device.online ? 'в сети' : 'не в сети')}</small></span><em>${esc(device.role === 'laptop' ? 'Ноутбук' : 'ПК')}</em></div>`).join('') || '<p>Других устройств пока нет</p>'}</div></section>
    <section class="workspace-settings-section" id="settings-terminal"><h1>Терминал</h1><h2>Оболочка</h2><div class="workspace-setting-group"><div class="workspace-setting-row"><span><b>Оболочка по умолчанию</b><small>Встроенный терминал проекта</small></span><em>PowerShell</em></div><div class="workspace-setting-row"><span><b>Codex</b><small>Быстрый запуск в папке выбранного проекта</small></span><code>codex --yolo</code></div></div></section>
    <section class="workspace-settings-section" id="settings-updates"><h1>Обновления</h1><h2>Приложение</h2><div class="workspace-setting-group"><div class="workspace-setting-row"><span><b>Обновить Noda</b><small>Одна кнопка проверяет версию, скачивает, проверяет и устанавливает обновление</small></span><button id="workspace-update-check" class="${esc(updateUiState)}">${esc(updateUiLabel)}</button></div></div></section>
    <section class="workspace-settings-section" id="settings-diagnostics"><h1>Диагностика</h1><h2>Журналы</h2><div class="workspace-setting-group"><div class="workspace-setting-row"><span><b>Журнал ошибок</b><small>Синхронизация, удалённый экран, терминал и локальные модели</small></span><button id="workspace-open-logs">Открыть логи</button></div></div></section>
    </div></main></div>`;
  document.getElementById('workspace-settings-back').onclick = () => navigateWorkspace(nodaWorkspace.previousSection || 'term');
  document.getElementById('workspace-choose-root').onclick = async () => { await window.arra.chooseCodeRoot(); nodaWorkspace.projectsLoaded = false; await loadWorkspaceProjects(true); renderNav(); renderWorkspaceSettings(); };
  document.getElementById('workspace-save-model-host').onclick = async () => {
    const result = await window.arra.setLocalAiUrl(document.getElementById('workspace-model-host').value);
    if (!result.ok) return toast('Локальные модели', result.error, 'warn');
    nodaWorkspace.modelsLoadedAt = 0; await loadWorkspaceModels(true); renderWorkspaceSettings();
  };
  document.getElementById('workspace-refresh-models').onclick = async () => { nodaWorkspace.modelsLoadedAt = 0; await loadWorkspaceModels(true); renderWorkspaceSettings(); };
  document.getElementById('workspace-update-check').onclick = triggerUpdateCheck;
  document.getElementById('workspace-open-logs').onclick = () => window.arra.openLogs();
  document.getElementById('workspace-setting-environment').onclick = (event) => {
    nodaWorkspace.environmentOpen = !nodaWorkspace.environmentOpen;
    localStorage.setItem('noda-environment-open', nodaWorkspace.environmentOpen ? '1' : '0');
    event.currentTarget.classList.toggle('active', nodaWorkspace.environmentOpen);
    event.currentTarget.setAttribute('aria-checked', String(nodaWorkspace.environmentOpen));
  };
  document.getElementById('workspace-setting-compact').onclick = (event) => {
    nodaWorkspace.compactSidebar = !nodaWorkspace.compactSidebar;
    localStorage.setItem('noda-compact-sidebar', nodaWorkspace.compactSidebar ? '1' : '0');
    document.body.classList.toggle('workspace-compact-sidebar', nodaWorkspace.compactSidebar);
    event.currentTarget.classList.toggle('active', nodaWorkspace.compactSidebar);
    event.currentTarget.setAttribute('aria-checked', String(nodaWorkspace.compactSidebar));
  };
  const settingsMain = app.querySelector('.workspace-settings-main');
  app.querySelectorAll('[data-settings-anchor]').forEach((button) => { button.onclick = () => {
    app.querySelectorAll('[data-settings-anchor]').forEach((item) => item.classList.toggle('active', item === button));
    app.querySelectorAll('.workspace-settings-section').forEach((section) => section.classList.toggle('active-section', section.id === `settings-${button.dataset.settingsAnchor}`));
    settingsMain.scrollTop = 0;
  }; });
  document.getElementById('workspace-settings-search').oninput = (event) => {
    nodaWorkspace.settingsQuery = event.target.value;
    const query = nodaWorkspace.settingsQuery.trim().toLowerCase();
    app.querySelectorAll('[data-settings-label]').forEach((button) => { button.hidden = !!query && !button.dataset.settingsLabel.includes(query); });
  };
}

const baseRoute = route;
route = function routeWorkspace() {
  document.body.classList.remove('workspace-login-mode', 'workspace-chat-mode', 'workspace-settings-mode', 'noda-terminal-page');
  if (state.section === 'settings') renderWorkspaceSettings().catch((error) => { app.innerHTML = `<div class="workspace-chat-error">${esc(error.message)}</div>`; });
  else baseRoute();
};

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'n' && state.section === 'term' && nodaWorkspace.terminalMode === 'nodex') { event.preventDefault(); document.getElementById('nodex-new-task')?.click(); }
  if (event.ctrlKey && event.key.toLowerCase() === 'k' && state.section === 'term' && nodaWorkspace.terminalMode === 'nodex') { event.preventDefault(); document.getElementById('nodex-project-search')?.focus(); }
});

window.arra.getStatus().then((status) => {
  if (!status?.paired || !status?.hasAuth) return;
  return Promise.all([loadWorkspaceProjects(), loadWorkspaceThreads()]).finally(() => { renderNav(); route(); });
}).catch((error) => reportError('workspace.boot', error));
