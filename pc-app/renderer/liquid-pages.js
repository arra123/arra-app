// Noda Liquid pages. Loaded after app.js so these focused screens replace the legacy card dashboards.
const LIQUID_ICON = {
  company: '<svg viewBox="0 0 24 24"><path d="M4 20V7.5L12 3l8 4.5V20"/><path d="M8 20v-5h8v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 20c.4-4.3 2.2-6.5 5.5-6.5s5.1 2.2 5.5 6.5M14 14.2c3.8-.6 6 1.3 6.5 5.8"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h6M9 16h6"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="M12 2c.5 5.7 2.3 7.5 8 8-5.7.5-7.5 2.3-8 8-.5-5.7-2.3-7.5-8-8 5.7-.5 7.5-2.3 8-8zM19 16c.2 2.1.9 2.8 3 3-2.1.2-2.8.9-3 3-.2-2.1-.9-2.8-3-3 2.1-.2 2.8-.9 3-3z"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="m8 12.5 6.9-6.9a3 3 0 1 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.1-8.1"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></svg>',
};
function liquidIcon(name) { return LIQUID_ICON[name] || LIQUID_ICON.sparkle; }
function liquidDate(value) {
  try { return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch { return ''; }
}
function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file); });
}
function bindLiquidRecorder(button, onText) {
  let recorder = null; let chunks = []; let timer = null; let started = 0;
  const finish = () => { if (recorder?.state === 'recording') recorder.stop(); };
  button.onclick = async () => {
    if (recorder?.state === 'recording') return finish();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = []; recorder = new MediaRecorder(stream); started = Date.now();
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearInterval(timer); button.classList.remove('recording'); button.innerHTML = liquidIcon('mic');
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) return;
        button.classList.add('working');
        try {
          const result = await window.arra.transcribe(await blobToBase64(blob), blob.type);
          if (!result?.ok || !result.text) throw new Error(result?.error || 'Не удалось распознать голос');
          await onText(result.text);
        } catch (error) { toast('Голос', error.message, 'warn'); }
        button.classList.remove('working');
      };
      recorder.start(); button.classList.add('recording');
      timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        button.innerHTML = `<span class="voice-bars"><i></i><i></i><i></i><i></i></span><b>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</b>`;
      }, 180);
    } catch { toast('Микрофон', 'Нет доступа к микрофону', 'warn'); }
  };
  return finish;
}

const liquidFinance = { tab: 'add', target: 'reimbursement', raw: '', userRaw: '', parsed: null, parsing: false, saved: null, listMode: 'active' };
function financeStatusLabel(status) {
  return ({ pending: 'Новая', submitted: 'Передана', reimbursed: 'Возвращено', rejected: 'Отклонено' })[status] || status;
}
function financeDraftHtml(parsed) {
  if (!parsed) return '';
  const debt = parsed.kind === 'debt' || liquidFinance.target !== 'reimbursement';
  const direction = parsed.direction || (liquidFinance.target === 'i_owe' ? 'i_owe' : 'owes_me');
  return `<div class="liquid-ai-row"><span class="liquid-ai-mark">${liquidIcon(debt ? 'people' : 'company')}</span>
    <form class="liquid-form" id="finance-form">
      <header><b>${debt ? (direction === 'i_owe' ? 'Я должен' : 'Мне должны') : 'Компания'}</b><button type="button" id="finance-clear">×</button></header>
      <div class="liquid-form-amount"><input id="f-amount" type="number" step="0.01" value="${esc(parsed.amount || '')}" placeholder="0"/><span>₽</span></div>
      ${debt ? `<input id="f-party" value="${esc(parsed.counterparty || '')}" placeholder="Кто"/>`
        : `<input id="f-purpose" value="${esc(parsed.purpose || '')}" placeholder="На что потрачено"/>
           <div class="liquid-form-grid"><input id="f-merchant" value="${esc(parsed.merchant || '')}" placeholder="Где"/><input id="f-company" value="${esc(parsed.company || 'Компания')}" placeholder="Компания"/></div>`}
      <input id="f-note" value="${esc(parsed.note || '')}" placeholder="Комментарий"/>
      <button class="liquid-primary" type="submit">${liquidIcon('check')}<span>Сохранить</span></button>
    </form></div>`;
}
function financeListHtml(reimbursements, debts) {
  const active = liquidFinance.listMode === 'active';
  const rows = [];
  reimbursements.filter((item) => active ? !['reimbursed', 'rejected'].includes(item.status) : ['reimbursed', 'rejected'].includes(item.status)).forEach((item) => rows.push({ type: 'reimbursement', item }));
  debts.filter((item) => active ? !item.settled : item.settled).forEach((item) => rows.push({ type: 'debt', item }));
  if (!rows.length) return `<div class="liquid-empty">${active ? 'Список пуст' : 'Закрытых записей нет'}</div>`;
  return `<div class="liquid-money-list">${rows.map(({ type, item }) => {
    const company = type === 'reimbursement';
    const title = company ? item.purpose : item.counterparty;
    const subtitle = company ? [item.company, item.merchant, liquidDate(item.occurred_at)].filter(Boolean).join(' · ') : [item.direction === 'i_owe' ? 'Я должен' : 'Мне должны', liquidDate(item.occurred_at || item.created_at)].filter(Boolean).join(' · ');
    const closed = company ? ['reimbursed', 'rejected'].includes(item.status) : item.settled;
    return `<article class="liquid-money-row ${closed ? 'closed' : ''}" data-type="${type}" data-id="${esc(item.id)}">
      <span class="liquid-record-icon">${liquidIcon(company ? 'company' : 'people')}</span><div><b>${esc(title || 'Без названия')}</b><small>${esc(subtitle)}</small></div>
      <strong>${fmt(item.amount)} ₽</strong><button class="liquid-row-check" data-close="1" title="${closed ? 'Вернуть в активные' : 'Закрыть'}">${liquidIcon('check')}</button>
    </article>`;
  }).join('')}</div>`;
}
renderFin = async function renderLiquidFinance() {
  app.innerHTML = `<div class="liquid-page finance-liquid"><header class="liquid-head"><h1>Возвраты</h1>
    <nav class="liquid-tabs"><button data-fin-tab="add" class="${liquidFinance.tab === 'add' ? 'active' : ''}">Записать</button><button data-fin-tab="list" class="${liquidFinance.tab === 'list' ? 'active' : ''}">Список</button></nav></header>
    <section id="finance-body" class="liquid-body"><div class="liquid-loading"></div></section></div>`;
  app.querySelectorAll('[data-fin-tab]').forEach((button) => button.onclick = () => { liquidFinance.tab = button.dataset.finTab; renderFin(); });
  let reimbursements = []; let debts = [];
  try {
    const [r, d] = await Promise.all([api('GET', '/reimbursements?includeClosed=1'), api('GET', '/debts?all=true')]);
    reimbursements = r.reimbursements || []; debts = d.debts || [];
  } catch (error) { document.getElementById('finance-body').innerHTML = `<div class="liquid-empty error">${esc(error.message)}</div>`; return; }
  const body = document.getElementById('finance-body'); if (!body) return;
  if (liquidFinance.tab === 'list') {
    const pending = reimbursements.filter((item) => !['reimbursed', 'rejected'].includes(item.status)).reduce((sum, item) => sum + Number(item.amount), 0);
    const debtCount = debts.filter((item) => !item.settled).length;
    body.innerHTML = `<div class="liquid-money-summary"><div><span>Компания</span><b>${fmt(pending)} ₽</b></div><div><span>Долги</span><b>${debtCount}</b></div>
      <nav><button data-list="active" class="${liquidFinance.listMode === 'active' ? 'active' : ''}">Активные</button><button data-list="closed" class="${liquidFinance.listMode === 'closed' ? 'active' : ''}">Закрытые</button></nav></div>
      ${financeListHtml(reimbursements, debts)}`;
    body.querySelectorAll('[data-list]').forEach((button) => button.onclick = () => { liquidFinance.listMode = button.dataset.list; renderFin(); });
    body.querySelectorAll('.liquid-row-check').forEach((button) => button.onclick = async () => {
      const row = button.closest('[data-id]'); const closed = row.classList.contains('closed'); button.disabled = true;
      try {
        if (row.dataset.type === 'reimbursement') await api('PATCH', `/reimbursements/${row.dataset.id}`, { status: closed ? 'pending' : 'reimbursed' });
        else await api('PATCH', `/debts/${row.dataset.id}`, { settled: !closed });
        renderFin();
      } catch (error) { toast('Возвраты', error.message, 'warn'); button.disabled = false; }
    });
    return;
  }
  body.innerHTML = `<div class="liquid-conversation"><div class="liquid-feed" id="finance-feed">
      ${liquidFinance.saved ? `<div class="liquid-ai-row"><span class="liquid-ai-mark ok">${liquidIcon('check')}</span><div class="liquid-saved"><b>${esc(liquidFinance.saved.title)}</b><strong>${fmt(liquidFinance.saved.amount)} ₽</strong></div></div>` : ''}
      ${liquidFinance.userRaw ? `<div class="liquid-user-row"><div>${esc(liquidFinance.userRaw)}</div></div>` : ''}
      ${liquidFinance.parsing ? `<div class="liquid-ai-row"><span class="liquid-ai-mark">${liquidIcon('sparkle')}</span><div class="liquid-typing"><i></i><i></i><i></i></div></div>` : financeDraftHtml(liquidFinance.parsed)}
    </div><div class="liquid-composer-wrap"><select id="finance-target" class="liquid-target" aria-label="Куда записать"><option value="reimbursement">Компания</option><option value="owes_me">Мне должны</option><option value="i_owe">Я должен</option></select>
      <div class="liquid-composer"><button id="finance-attach" title="Фото">${liquidIcon('clip')}</button><input id="finance-photo" type="file" accept="image/*" hidden/><textarea id="finance-input" rows="1" placeholder="Сообщение"></textarea><button id="finance-send" class="liquid-send" hidden>${liquidIcon('send')}</button><button id="finance-mic" class="liquid-mic">${liquidIcon('mic')}</button></div></div></div>`;
  const target = document.getElementById('finance-target'); target.value = liquidFinance.target;
  target.onchange = () => { liquidFinance.target = target.value; liquidFinance.parsed = null; };
  const input = document.getElementById('finance-input'); const send = document.getElementById('finance-send'); const mic = document.getElementById('finance-mic');
  const updateSend = () => { send.hidden = !input.value.trim(); mic.hidden = !!input.value.trim(); };
  input.oninput = updateSend;
  const parseEntry = async (text, image) => {
    const cleaned = String(text || '').trim(); if (!cleaned && !image) return;
    liquidFinance.userRaw = cleaned || 'Фото'; liquidFinance.parsing = true; liquidFinance.parsed = null; liquidFinance.saved = null; renderFin();
    try {
      const result = await api('POST', '/reimbursements/parse', { text: cleaned, image, preferredKind: liquidFinance.target === 'reimbursement' ? 'reimbursement' : 'debt' });
      liquidFinance.parsed = result.parsed || {}; if (liquidFinance.target !== 'reimbursement') { liquidFinance.parsed.kind = 'debt'; liquidFinance.parsed.direction = liquidFinance.target; }
    } catch (error) { toast('Возвраты', error.message, 'warn'); }
    liquidFinance.parsing = false; renderFin();
  };
  send.onclick = () => parseEntry(input.value);
  input.onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); parseEntry(input.value); } };
  bindLiquidRecorder(mic, (text) => parseEntry(text));
  const photo = document.getElementById('finance-photo'); document.getElementById('finance-attach').onclick = () => photo.click();
  photo.onchange = async () => { if (photo.files?.[0]) parseEntry('', await dataUrlFromFile(photo.files[0])); };
  const form = document.getElementById('finance-form');
  document.getElementById('finance-clear')?.addEventListener('click', () => { liquidFinance.parsed = null; liquidFinance.userRaw = ''; renderFin(); });
  if (form) form.onsubmit = async (event) => {
    event.preventDefault(); const parsed = liquidFinance.parsed || {}; const amount = Number(document.getElementById('f-amount').value);
    try {
      if (parsed.kind === 'debt' || liquidFinance.target !== 'reimbursement') {
        const counterparty = document.getElementById('f-party').value.trim();
        const result = await api('POST', '/debts', { amount, counterparty, direction: parsed.direction || liquidFinance.target, note: document.getElementById('f-note').value.trim(), occurred_at: parsed.occurred_at || null });
        liquidFinance.saved = { title: result.debt.counterparty, amount: result.debt.amount };
      } else {
        const result = await api('POST', '/reimbursements', { amount, purpose: document.getElementById('f-purpose').value.trim(), merchant: document.getElementById('f-merchant').value.trim(), company: document.getElementById('f-company').value.trim() || 'Компания', note: document.getElementById('f-note').value.trim(), occurred_at: parsed.occurred_at || null, source: 'assistant', raw_input: liquidFinance.userRaw });
        liquidFinance.saved = { title: result.reimbursement.purpose, amount: result.reimbursement.amount };
      }
      liquidFinance.parsed = null; liquidFinance.userRaw = ''; renderFin();
    } catch (error) { toast('Не сохранилось', error.message, 'warn'); }
  };
};

renderChat = async function renderLiquidChat() {
  app.innerHTML = `<div class="liquid-page assistant-liquid"><header class="liquid-head"><h1>Noda</h1><span class="liquid-online"></span></header>
    <section class="liquid-chat-feed" id="liquid-chat-feed"><div class="liquid-loading"></div></section>
    <footer class="liquid-chat-dock"><div class="liquid-composer"><button id="chat-attach">${liquidIcon('clip')}</button><input id="chat-photo" type="file" accept="image/*" hidden/><textarea id="chat-input" rows="1" placeholder="Сообщение"></textarea><button id="chat-send" class="liquid-send" hidden>${liquidIcon('send')}</button><button id="chat-mic" class="liquid-mic">${liquidIcon('mic')}</button></div></footer></div>`;
  const feed = document.getElementById('liquid-chat-feed'); const input = document.getElementById('chat-input'); const send = document.getElementById('chat-send'); const mic = document.getElementById('chat-mic'); let image = '';
  const refresh = async () => {
    try {
      const result = await api('GET', '/ai/messages');
      feed.innerHTML = result.messages?.length ? result.messages.map((message) => `<div class="liquid-message-row ${message.role === 'user' ? 'user' : 'assistant'}"><div>${esc(message.content)}</div></div>`).join('') : `<div class="liquid-chat-empty">${liquidIcon('sparkle')}</div>`;
      feed.scrollTop = feed.scrollHeight;
    } catch (error) { feed.innerHTML = `<div class="liquid-empty error">${esc(error.message)}</div>`; }
  };
  const update = () => { const has = !!input.value.trim() || !!image; send.hidden = !has; mic.hidden = has; };
  input.oninput = update;
  const sendMessage = async () => {
    const text = input.value.trim(); if (!text && !image) return; input.value = ''; send.hidden = true; mic.hidden = false;
    feed.innerHTML += `<div class="liquid-message-row user"><div>${esc(text || 'Фото')}</div></div><div class="liquid-message-row assistant pending"><div class="liquid-typing"><i></i><i></i><i></i></div></div>`; feed.scrollTop = feed.scrollHeight;
    try { await api('POST', '/ai/assistant', { text, image }); image = ''; await refresh(); } catch (error) { toast('Noda', error.message, 'warn'); await refresh(); }
  };
  send.onclick = sendMessage; input.onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } };
  bindLiquidRecorder(mic, async (text) => { input.value = text; update(); await sendMessage(); });
  const photo = document.getElementById('chat-photo'); document.getElementById('chat-attach').onclick = () => photo.click();
  photo.onchange = async () => { if (photo.files?.[0]) { image = await dataUrlFromFile(photo.files[0]); update(); } };
  await refresh();
};

const liquidNotes = { notes: [], selectedId: null, query: '', mode: 'original' };
function noteListHtml() {
  const query = liquidNotes.query.toLowerCase();
  const rows = liquidNotes.notes.filter((note) => !query || `${note.title || ''} ${note.body || ''}`.toLowerCase().includes(query));
  return rows.map((note) => `<button class="liquid-note-row ${note.id === liquidNotes.selectedId ? 'active' : ''}" data-note="${esc(note.id)}"><span></span><div><b>${esc(note.title || 'Без названия')}</b><small>${esc((note.body || '').replace(/\s+/g, ' ').slice(0, 90) || 'Пустая заметка')}</small></div><time>${liquidDate(note.updated_at)}</time></button>`).join('') || '<div class="liquid-empty">Заметок нет</div>';
}
function renderNoteEditor() {
  const host = document.getElementById('liquid-note-editor'); if (!host) return;
  const note = liquidNotes.notes.find((item) => item.id === liquidNotes.selectedId);
  if (!note) { host.innerHTML = `<div class="liquid-note-empty">${liquidIcon('note')}</div>`; return; }
  const structured = !!note.structured_body;
  const text = liquidNotes.mode === 'structured' && structured ? note.structured_body : note.body;
  host.innerHTML = `<div class="liquid-note-toolbar"><nav><button data-note-mode="original" class="${liquidNotes.mode === 'original' ? 'active' : ''}">Оригинал</button><button data-note-mode="structured" class="${liquidNotes.mode === 'structured' ? 'active' : ''}" ${structured ? '' : 'disabled'}>ИИ-версия</button></nav><div><button id="note-structure">${liquidIcon('sparkle')}</button><button id="note-delete">${liquidIcon('trash')}</button><button id="note-save" class="liquid-primary compact">Сохранить</button></div></div>
    <input id="note-title" class="liquid-note-title" value="${esc(note.title || '')}" placeholder="Без названия"/><textarea id="note-body" class="liquid-note-body" placeholder="Начните писать…">${esc(text || '')}</textarea>`;
  host.querySelectorAll('[data-note-mode]').forEach((button) => button.onclick = () => { liquidNotes.mode = button.dataset.noteMode; renderNoteEditor(); });
  document.getElementById('note-save').onclick = async () => {
    const payload = { title: document.getElementById('note-title').value.trim(), body: note.body || '' };
    if (liquidNotes.mode === 'structured') payload.structured_body = document.getElementById('note-body').value;
    else payload.body = document.getElementById('note-body').value;
    try { const result = await api('PUT', `/notes/${note.id}`, payload); Object.assign(note, result.note); toast('Заметка', 'Сохранено', 'ok', 1800); renderNotes(); } catch (error) { toast('Заметка', error.message, 'warn'); }
  };
  document.getElementById('note-structure').onclick = async () => {
    const body = liquidNotes.mode === 'original' ? document.getElementById('note-body').value : note.body;
    if (!body.trim()) return; const button = document.getElementById('note-structure'); button.disabled = true;
    try { const result = await api('POST', '/notes/structure', { text: body }); const saved = await api('PUT', `/notes/${note.id}`, { title: document.getElementById('note-title').value.trim(), body, structured_body: result.structuredBody }); Object.assign(note, saved.note); liquidNotes.mode = 'structured'; renderNoteEditor(); } catch (error) { toast('ИИ-версия', error.message, 'warn'); button.disabled = false; }
  };
  document.getElementById('note-delete').onclick = async () => { if (!confirm('Удалить заметку?')) return; await api('DELETE', `/notes/${note.id}`); liquidNotes.selectedId = null; renderNotes(); };
}
renderNotes = async function renderLiquidNotes() {
  app.innerHTML = `<div class="liquid-page notes-liquid"><aside class="liquid-notes-list"><header><h1>Заметки</h1><button id="liquid-new-note">${liquidIcon('plus')}</button></header><label class="liquid-search">${liquidIcon('search')}<input id="liquid-note-search" placeholder="Поиск" value="${esc(liquidNotes.query)}"/></label><div id="liquid-note-list"><div class="liquid-loading"></div></div></aside><section id="liquid-note-editor" class="liquid-note-editor"></section></div>`;
  try { const result = await api('GET', '/notes'); liquidNotes.notes = result.notes || []; if (!liquidNotes.selectedId && liquidNotes.notes[0]) liquidNotes.selectedId = liquidNotes.notes[0].id; }
  catch (error) { document.getElementById('liquid-note-list').innerHTML = `<div class="liquid-empty error">${esc(error.message)}</div>`; return; }
  const list = document.getElementById('liquid-note-list'); list.innerHTML = noteListHtml();
  list.querySelectorAll('[data-note]').forEach((button) => button.onclick = () => { liquidNotes.selectedId = button.dataset.note; liquidNotes.mode = 'original'; renderNotes(); });
  const search = document.getElementById('liquid-note-search'); search.oninput = () => { liquidNotes.query = search.value; list.innerHTML = noteListHtml(); list.querySelectorAll('[data-note]').forEach((button) => button.onclick = () => { liquidNotes.selectedId = button.dataset.note; liquidNotes.mode = 'original'; renderNotes(); }); };
  document.getElementById('liquid-new-note').onclick = async () => { const result = await api('POST', '/notes', { title: '', body: '', color: '#7C86F0' }); liquidNotes.selectedId = result.note.id; liquidNotes.mode = 'original'; renderNotes(); };
  renderNoteEditor();
};

// If one of these pages was active while the override loaded, repaint it immediately.
if (state.section === 'fin') renderFin();
