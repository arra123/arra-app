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
};

const WORKSPACE_SECTIONS = new Set(['chat', 'term', 'files', 'sync', 'remote', 'notes', 'fin', 'settings']);
const savedWorkspaceSection = localStorage.getItem('noda-section');
state.section = WORKSPACE_SECTIONS.has(savedWorkspaceSection) ? savedWorkspaceSection : 'chat';

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
};

function workspaceProjectKind(project) {
  return ({ javascript: 'JS', python: 'PY', rust: 'RS', go: 'GO', dotnet: '.N' })[project.kind] || (project.label || project.name || 'P').slice(0, 2).toUpperCase();
}

function activeWorkspaceProject() {
  return nodaWorkspace.projects.find((project) => project.name === nodaWorkspace.activeProjectKey) || null;
}

function workspaceProjectThreadKey(projectKey) {
  return `project:${String(projectKey || '').trim()}`.slice(0, 180);
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
    if (nodaWorkspace.activeProjectKey) {
      nodaWorkspace.threadKey = workspaceProjectThreadKey(nodaWorkspace.activeProjectKey);
      localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
    }
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
  state.section = section;
  localStorage.setItem('noda-section', section);
  renderNav();
  route();
}

function selectWorkspaceProject(key) {
  nodaWorkspace.activeProjectKey = key || '';
  nodaWorkspace.threadKey = key ? workspaceProjectThreadKey(key) : nodaWorkspace.threadKey;
  localStorage.setItem('noda-active-project', nodaWorkspace.activeProjectKey);
  localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
  nodaWorkspace.chatLoaded = false;
  navigateWorkspace('chat');
}

function openWorkspaceThread(threadKey) {
  const thread = nodaWorkspace.threads.find((item) => item.thread_key === threadKey);
  nodaWorkspace.threadKey = threadKey || 'general';
  const projectKey = threadKey.startsWith('project:') ? threadKey.slice('project:'.length) : '';
  const matchingProject = nodaWorkspace.projects.find((project) => project.name === projectKey || project.label === thread?.project_name);
  nodaWorkspace.activeProjectKey = matchingProject?.name || '';
  nodaWorkspace.messages = [];
  nodaWorkspace.chatLoaded = false;
  localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
  if (nodaWorkspace.activeProjectKey) localStorage.setItem('noda-active-project', nodaWorkspace.activeProjectKey);
  else localStorage.removeItem('noda-active-project');
  navigateWorkspace('chat');
}

function openProjectTerminal(project) {
  if (!project) return;
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
  return rows.slice(0, query ? 80 : 32).map((project) => `<button class="workspace-project ${project.name === nodaWorkspace.activeProjectKey ? 'active' : ''}" data-project="${esc(project.name)}" title="${esc(project.path || project.name)}"><span class="workspace-project-mark kind-${esc(project.kind || 'folder')}">${esc(workspaceProjectKind(project))}</span><span><b>${esc(project.label || project.name)}</b>${project.group ? `<small>${esc(project.group)}</small>` : ''}</span><i data-project-terminal="${esc(project.name)}" title="Открыть терминал">${workspaceIcons.chevron}</i></button>`).join('');
}

function workspaceRecentRows() {
  if (!nodaWorkspace.threadsLoaded) return '<div class="workspace-recent-skeleton"><i></i><i></i></div>';
  if (!nodaWorkspace.threads.length) return '<div class="workspace-recent-empty">История появится после первого сообщения</div>';
  return nodaWorkspace.threads.slice(0, 8).map((thread) => `<button class="workspace-recent ${thread.thread_key === nodaWorkspace.threadKey ? 'active' : ''}" data-thread="${esc(thread.thread_key)}" title="${esc(thread.title || thread.project_name || 'Задача')}"><span>${thread.project_name ? workspaceIcons.folder : workspaceIcons.sparkle}</span><b>${esc(thread.title || thread.project_name || 'Новая задача')}</b></button>`).join('');
}

const baseRenderNav = renderNav;
renderNav = async function renderWorkspaceNav() {
  nav.classList.remove('hidden');
  const status = state.presence.status || {};
  const currentRole = status.deviceProfile?.role;
  const toolItems = [
    ['chat', 'Чат', NAVICON.chat],
    ['term', 'Терминал', NAVICON.term],
    ['files', 'Файлы', NAVICON.files],
    ['sync', 'Передача', NAVICON.sync],
    ['remote', 'Удалённый ПК', NAVICON.remote],
  ];
  nav.innerHTML = `<div class="workspace-sidebar-head"><button class="workspace-new-task" id="workspace-new-task">${workspaceIcons.plus}<span>Новая задача</span><kbd>Ctrl N</kbd></button><label class="workspace-search">${workspaceIcons.search}<input id="workspace-project-search" placeholder="Поиск проектов" value="${esc(nodaWorkspace.projectQuery)}"/></label></div>
    <div class="workspace-side-scroll"><section class="workspace-tools">${toolItems.map(([key, label, icon]) => `<button data-s="${key}" class="workspace-tool ${state.section === key ? 'active' : ''}">${icon}<span>${label}</span></button>`).join('')}</section>
      <section class="workspace-recents"><header><span>Недавние</span></header><div id="workspace-recent-list">${workspaceRecentRows()}</div></section>
      <section class="workspace-projects"><header><span>Проекты</span><button id="workspace-project-refresh" title="Обновить">${workspaceIcons.refresh}</button></header><div id="workspace-project-list">${workspaceProjectRows()}</div></section>
    </div>
    <div class="workspace-sidebar-foot"><div class="workspace-device"><i class="${status.online ? 'online' : ''}"></i><span><b>${esc(status.deviceName || (currentRole === 'laptop' ? 'Ноутбук' : 'Этот компьютер'))}</b><small>${status.online ? 'в сети' : 'нет связи'}</small></span></div><button class="workspace-foot-action ${state.section === 'notes' ? 'active' : ''}" data-s="notes">${NAVICON.notes}<span>Заметки</span></button><button class="workspace-foot-action ${state.section === 'fin' ? 'active' : ''}" data-s="fin">${NAVICON.fin}<span>Возвраты</span></button><button class="workspace-foot-action ${state.section === 'settings' ? 'active' : ''}" data-s="settings">${workspaceIcons.settings}<span>Настройки</span></button></div>`;

  nav.querySelectorAll('[data-s]').forEach((button) => { button.onclick = () => navigateWorkspace(button.dataset.s); });
  nav.querySelector('#workspace-new-task').onclick = () => {
    nodaWorkspace.activeProjectKey = '';
    nodaWorkspace.threadKey = `task:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    nodaWorkspace.messages = [];
    nodaWorkspace.chatLoaded = true;
    localStorage.removeItem('noda-active-project');
    localStorage.setItem('noda-thread-key', nodaWorkspace.threadKey);
    navigateWorkspace('chat');
  };
  const search = nav.querySelector('#workspace-project-search');
  search.oninput = () => {
    nodaWorkspace.projectQuery = search.value;
    const list = document.getElementById('workspace-project-list');
    if (list) list.innerHTML = workspaceProjectRows();
    bindWorkspaceProjectRows();
  };
  nav.querySelector('#workspace-project-refresh').onclick = async () => {
    nodaWorkspace.projectsLoaded = false;
    document.getElementById('workspace-project-list').innerHTML = '<div class="workspace-project-skeleton"><i></i><i></i><i></i></div>';
    await loadWorkspaceProjects(true);
    renderNav();
  };
  nav.querySelectorAll('[data-thread]').forEach((button) => { button.onclick = () => openWorkspaceThread(button.dataset.thread); });
  bindWorkspaceProjectRows();
  if (!nodaWorkspace.projectsLoaded) loadWorkspaceProjects().then(() => { if (nav.isConnected) renderNav(); });
  if (!nodaWorkspace.threadsLoaded) loadWorkspaceThreads().then(() => { if (nav.isConnected) renderNav(); });
};

function bindWorkspaceProjectRows() {
  nav.querySelectorAll('[data-project]').forEach((button) => {
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
    return `<div class="workspace-chat-empty"><div class="workspace-empty-mark">${workspaceIcons.sparkle}</div><h1>${project ? esc(project.label || project.name) : 'С чего начнём?'}</h1><p>${project ? 'Контекст проекта выбран. Можно обсудить задачу или сразу открыть терминал.' : 'Выбери проект слева или начни общую задачу.'}</p><div class="workspace-suggestions">${project ? `<button data-chat-action="terminal">Открыть терминал</button><button data-chat-action="codex">Запустить Codex</button>` : ''}<button data-chat-action="models">Локальные модели</button><button data-chat-action="sync">Проверить проекты</button></div></div>`;
  }
  return nodaWorkspace.messages.map((message) => `<article class="workspace-message ${message.role === 'user' ? 'user' : 'assistant'}"><div class="workspace-message-role">${message.role === 'user' ? 'Вы' : (nodaWorkspace.selectedModel === 'cloud' ? 'Noda' : esc(selectedModelLabel()))}</div><div class="workspace-message-body">${esc(message.content || '')}</div></article>`).join('');
}

function modelOptionsHtml() {
  const local = nodaWorkspace.models.map((model) => `<option value="local:${esc(model.name)}" ${nodaWorkspace.selectedModel === `local:${model.name}` ? 'selected' : ''}>${esc(model.name)} · локально</option>`).join('');
  return `<option value="cloud" ${nodaWorkspace.selectedModel === 'cloud' ? 'selected' : ''}>Noda Cloud</option>${local}`;
}

renderChat = function renderWorkspaceChat() {
  const project = activeWorkspaceProject();
  document.body.classList.add('workspace-chat-mode');
  app.innerHTML = `<div class="workspace-chat"><header class="workspace-chat-head"><div class="workspace-chat-context">${project ? `<span class="workspace-project-mark kind-${esc(project.kind || 'folder')}">${esc(workspaceProjectKind(project))}</span><span><b>${esc(project.label || project.name)}</b><small>${esc(project.path || nodaWorkspace.projectsRoot)}</small></span>` : `<span><b>Новая задача</b><small>Общий контекст</small></span>`}</div><div class="workspace-chat-actions">${project ? `<button id="workspace-open-folder" title="Открыть папку">${workspaceIcons.folder}</button><button id="workspace-open-terminal" title="Терминал">${workspaceIcons.terminal}</button>` : ''}<label class="workspace-model-select"><i class="${nodaWorkspace.selectedModel === 'cloud' ? 'cloud' : 'local'}"></i><select id="workspace-model">${modelOptionsHtml()}</select></label></div></header>
    <section class="workspace-chat-feed" id="workspace-chat-feed">${nodaWorkspace.chatLoaded && nodaWorkspace.messagesKey === workspaceMessageKey() ? workspaceMessagesHtml() : '<div class="workspace-chat-loading"><i></i><i></i><i></i></div>'}</section>
    <footer class="workspace-composer-wrap"><div class="workspace-composer"><textarea id="workspace-chat-input" rows="1" placeholder="Спросить Noda"></textarea><div class="workspace-composer-actions"><button id="workspace-chat-attach" title="Добавить файл">${workspaceIcons.clip}</button><input id="workspace-chat-photo" type="file" accept="image/*" hidden/><span id="workspace-chat-context-label">${project ? esc(project.label || project.name) : 'Без проекта'}</span><button id="workspace-chat-mic" title="Голосовой ввод">${typeof liquidIcon === 'function' ? liquidIcon('mic') : workspaceIcons.sparkle}</button><button id="workspace-chat-send" class="workspace-send" title="Отправить">${workspaceIcons.send}</button></div></div><p>Ответ может содержать ошибки. Важные изменения проверяй перед запуском.</p></footer></div>`;

  const feed = document.getElementById('workspace-chat-feed');
  const input = document.getElementById('workspace-chat-input');
  const send = document.getElementById('workspace-chat-send');
  const rerenderMessages = () => { if (!feed) return; feed.innerHTML = workspaceMessagesHtml(); feed.scrollTop = feed.scrollHeight; bindWorkspaceChatActions(); };
  loadWorkspaceMessages().then(rerenderMessages).catch((error) => { feed.innerHTML = `<div class="workspace-chat-error">${esc(error.message)}</div>`; });
  loadWorkspaceModels().then(() => {
    const select = document.getElementById('workspace-model');
    if (select) select.innerHTML = modelOptionsHtml();
  }).catch(() => {});
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
      loadWorkspaceThreads(true).then(() => renderNav()).catch(() => {});
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
    nodaWorkspace.chatLoaded = false; nodaWorkspace.messages = []; renderChat();
  };
  document.getElementById('workspace-open-folder')?.addEventListener('click', () => window.arra.openFile(project.path));
  document.getElementById('workspace-open-terminal')?.addEventListener('click', () => openProjectTerminal(project));
  bindWorkspaceChatActions();
};

function bindWorkspaceChatActions() {
  document.querySelectorAll('[data-chat-action]').forEach((button) => { button.onclick = () => {
    const project = activeWorkspaceProject();
    if (button.dataset.chatAction === 'terminal') openProjectTerminal(project);
    else if (button.dataset.chatAction === 'codex') { openProjectTerminal(project); setTimeout(() => launchTerminalPreset('codex --yolo'), 250); }
    else if (button.dataset.chatAction === 'models') navigateWorkspace('settings');
    else if (button.dataset.chatAction === 'sync') navigateWorkspace('sync');
  }; });
}

async function renderWorkspaceSettings() {
  document.body.classList.add('workspace-settings-mode');
  app.innerHTML = '<div class="workspace-settings-loading"><i></i><i></i><i></i></div>';
  const [settings] = await Promise.all([window.arra.workspaceSettings(), loadWorkspaceModels(true).catch(() => [])]);
  const devices = state.presence.devices || [];
  app.innerHTML = `<div class="workspace-settings"><header><div><h1>Настройки</h1><p>Рабочая среда Noda на этом компьютере</p></div></header><div class="workspace-settings-layout"><nav><button class="active">Основные</button><button data-settings-anchor="models">Модели</button><button data-settings-anchor="devices">Устройства</button><button data-settings-anchor="updates">Обновления</button></nav><main>
    <section class="workspace-settings-section"><h2>Рабочая область</h2><div class="workspace-setting-row"><span><b>Папка проектов</b><small>Проекты внутри появляются в боковой панели автоматически</small></span><code>${esc(settings.codeRoot)}</code><button id="workspace-choose-root">Изменить</button></div><div class="workspace-setting-row"><span><b>Полученные файлы</b><small>Фото и документы с телефона</small></span><code>${esc(settings.downloadFolder)}</code></div></section>
    <section class="workspace-settings-section" id="settings-models"><h2>Локальные модели</h2><div class="workspace-setting-row column"><span><b>Ollama, LM Studio или совместимый сервер</b><small>Вычисление выполняется на выбранном компьютере; поддерживаются Ollama API и OpenAI-compatible API</small></span><div class="workspace-setting-input"><input id="workspace-model-host" value="${esc(settings.localAiUrl || nodaWorkspace.modelHost)}"/><button id="workspace-save-model-host">Сохранить</button><button id="workspace-refresh-models">Проверить</button></div><div id="workspace-model-state" class="workspace-model-state ${nodaWorkspace.modelOnline ? 'online' : 'offline'}"><i></i><span>${nodaWorkspace.modelOnline ? `${nodaWorkspace.models.length} моделей доступно` : esc(nodaWorkspace.modelError || 'Локальный AI не запущен')}</span></div>${nodaWorkspace.models.length ? `<div class="workspace-model-list">${nodaWorkspace.models.map((model) => `<div><span><b>${esc(model.name)}</b><small>${esc([model.family, model.parameterSize].filter(Boolean).join(' · ') || 'локальная модель')}</small></span><em>${model.size ? `${Math.round(model.size / 1024 / 1024 / 1024 * 10) / 10} ГБ` : ''}</em></div>`).join('')}</div>` : ''}</div></section>
    <section class="workspace-settings-section" id="settings-devices"><h2>Устройства</h2><div class="workspace-device-list">${devices.map((device) => `<div><i class="${device.online ? 'online' : ''}"></i><span><b>${esc(device.name || device.hostname || 'Компьютер')}</b><small>${device.id === state.presence.currentId ? 'это устройство' : (device.online ? 'в сети' : 'не в сети')}</small></span><em>${esc(device.role === 'laptop' ? 'Ноутбук' : 'ПК')}</em></div>`).join('') || '<p>Других устройств пока нет</p>'}</div></section>
    <section class="workspace-settings-section" id="settings-updates"><h2>Обновления и диагностика</h2><div class="workspace-setting-row"><span><b>Версия приложения</b><small>Проверка и установка новой версии Noda</small></span><button id="workspace-update-check">Проверить обновление</button></div><div class="workspace-setting-row"><span><b>Журнал ошибок</b><small>Логи синхронизации, удалённого экрана и моделей</small></span><button id="workspace-open-logs">Открыть логи</button></div></section>
    </main></div></div>`;
  document.getElementById('workspace-choose-root').onclick = async () => { await window.arra.chooseCodeRoot(); nodaWorkspace.projectsLoaded = false; await loadWorkspaceProjects(true); renderNav(); renderWorkspaceSettings(); };
  document.getElementById('workspace-save-model-host').onclick = async () => {
    const result = await window.arra.setLocalAiUrl(document.getElementById('workspace-model-host').value);
    if (!result.ok) return toast('Локальные модели', result.error, 'warn');
    nodaWorkspace.modelsLoadedAt = 0; await loadWorkspaceModels(true); renderWorkspaceSettings();
  };
  document.getElementById('workspace-refresh-models').onclick = async () => { nodaWorkspace.modelsLoadedAt = 0; await loadWorkspaceModels(true); renderWorkspaceSettings(); };
  document.getElementById('workspace-update-check').onclick = triggerUpdateCheck;
  document.getElementById('workspace-open-logs').onclick = () => window.arra.openLogs();
  app.querySelectorAll('[data-settings-anchor]').forEach((button) => { button.onclick = () => document.getElementById(`settings-${button.dataset.settingsAnchor}`)?.scrollIntoView({ behavior: 'smooth' }); });
}

const baseRoute = route;
route = function routeWorkspace() {
  document.body.classList.remove('workspace-login-mode', 'workspace-chat-mode', 'workspace-settings-mode');
  if (state.section === 'settings') renderWorkspaceSettings().catch((error) => { app.innerHTML = `<div class="workspace-chat-error">${esc(error.message)}</div>`; });
  else baseRoute();
};

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); document.getElementById('workspace-new-task')?.click(); }
  if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('workspace-project-search')?.focus(); }
});

window.arra.getStatus().then((status) => {
  if (!status?.paired || !status?.hasAuth) return;
  return Promise.all([loadWorkspaceProjects(), loadWorkspaceThreads()]).finally(() => { renderNav(); route(); });
}).catch((error) => reportError('workspace.boot', error));
