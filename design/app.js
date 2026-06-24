// ---- Arra web (макет на localhost, подключён к реальному серверу) ----
const API = 'https://aura.5.42.122.102.sslip.io';
const TKEY = 'arra_token';
let token = localStorage.getItem(TKEY) || null;
let user = null;
let currentTab = 'finance';

const $screen = document.getElementById('screen');
const $tabbar = document.getElementById('tabbar');

const I = (n) => `<i class="ph ph-${n}"></i>`; // тонкая иконка Phosphor

// Категория -> иконка Phosphor (монохром, Linear-стиль)
const CAT = {
  'Продукты': 'shopping-cart', 'Кафе и рестораны': 'fork-knife', 'Транспорт': 'bus',
  'Такси': 'taxi', 'Жильё': 'house', 'Связь и интернет': 'wifi-high', 'Здоровье': 'heartbeat',
  'Одежда': 't-shirt', 'Развлечения': 'game-controller', 'Подписки': 'repeat',
  'Образование': 'book-open', 'Подарки': 'gift', 'Путешествия': 'airplane-tilt',
  'Дом и быт': 'house-line', 'Дети': 'baby', 'Питомцы': 'paw-print', 'Авто': 'car',
  'Зарплата': 'money', 'Перевод': 'arrows-left-right', 'Прочее': 'wallet',
};
const catIcon = (c) => CAT[c] || CAT['Прочее'];
const ACCENT = '#5E6AD2';
const fmt = (n) => Number(n).toLocaleString('ru-RU');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmtTime = (iso) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const tile = (cat) => `<div class="tile">${I(catIcon(cat))}</div>`;
// Категории для быстрой ленты наверху (всегда видны)
const CHIPS = ['Продукты', 'Кафе и рестораны', 'Такси', 'Транспорт', 'Развлечения', 'Здоровье', 'Одежда', 'Подарки', 'Путешествия', 'Зарплата'];

async function api(path, opts = {}) {
  const headers = {};
  if (opts.auth !== false && token) headers.Authorization = 'Bearer ' + token;
  let body;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(API + path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error(data?.error || ('Ошибка ' + res.status));
  return data;
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.querySelector('.frame').appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function setActiveTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'finance') renderFinance();
  if (tab === 'files') renderFiles();
  if (tab === 'profile') renderProfile();
}
$tabbar.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));

// =================== AUTH ===================
function renderAuth(mode = 'register') {
  $tabbar.classList.add('hidden');
  document.querySelector('.dock')?.remove();
  $screen.className = 'screen';
  $screen.innerHTML = `
    <div class="auth">
      <div class="logo-wrap">
        <div class="logo-badge">А</div>
        <div class="logo-name">Арра</div>
        <div class="muted">Финансы и файлы в одном месте</div>
      </div>
      <div class="card" style="padding:22px; display:flex; flex-direction:column; gap:14px;">
        <div class="seg">
          <button data-m="register" class="${mode==='register'?'active':''}">Создать аккаунт</button>
          <button data-m="login" class="${mode==='login'?'active':''}">Войти</button>
        </div>
        ${mode==='register' ? `<input id="a-name" class="field" placeholder="Имя (необязательно)">` : ''}
        <input id="a-login" class="field" placeholder="Логин" autocapitalize="off" autocomplete="off">
        <input id="a-pass" class="field" type="password" placeholder="Пароль">
        <div id="a-err" class="err" style="display:none"></div>
        <button id="a-submit" class="btn btn-primary">${mode==='login'?'Войти':'Создать аккаунт'}</button>
      </div>
      <div class="muted center-text small">Любой логин и пароль — без почты и ограничений</div>
    </div>`;
  $screen.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.m)));
  $screen.querySelector('#a-submit').addEventListener('click', async () => {
    const loginV = $screen.querySelector('#a-login').value.trim();
    const pass = $screen.querySelector('#a-pass').value;
    const name = $screen.querySelector('#a-name')?.value.trim();
    const err = $screen.querySelector('#a-err');
    if (!loginV || !pass) { err.style.display = 'block'; err.textContent = 'Введи логин и пароль'; return; }
    const btn = $screen.querySelector('#a-submit'); btn.innerHTML = '<span class="spinner"></span>';
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { email: loginV, password: pass } : { email: loginV, password: pass, name };
      const r = await api(path, { auth: false, body: payload });
      token = r.token; user = r.user; localStorage.setItem(TKEY, token);
      setActiveTab('finance');
    } catch (e) {
      err.style.display = 'block'; err.textContent = e.message;
      btn.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
    }
  });
}

// =================== ФИНАНСЫ ===================
async function renderFinance() {
  $tabbar.classList.remove('hidden');
  $screen.className = 'screen with-dock';
  $screen.innerHTML = `<h1>Финансы</h1><div class="loading-full" style="height:200px"><span class="spinner"></span></div>`;
  renderDock();
  try {
    const [s, t, d] = await Promise.all([api('/stats/summary'), api('/transactions?limit=50'), api('/debts')]);
    const sum = s.summary || { income: 0, expense: 0 };
    const cats = s.byCategory || [];
    const maxc = Math.max(1, ...cats.map((c) => c.total));
    let html = `<h1>Финансы</h1>
      <div class="card ops" id="ops-card">
        <div class="ops-top">
          <div><div class="eyebrow">Все операции</div>
          <div class="ops-value">−${fmt(sum.expense)} ₽</div>
          <div class="muted small" style="margin-top:5px">Трат в этом месяце</div></div>
          <div class="ops-arrow">${I('caret-right')}</div>
        </div>
        <div class="stack">${cats.length ? cats.map((c, i) => `<i style="flex:${c.total};background:rgba(94,106,210,${(1 - i * 0.13).toFixed(2)})"></i>`).join('') : '<i style="flex:1;background:rgba(255,255,255,0.1)"></i>'}</div>
        <div class="pills">
          <div class="pill g">${I('arrow-down-left')} ${fmt(sum.income)} ₽</div>
          <div class="pill r">${I('arrow-up-right')} ${fmt(sum.expense)} ₽</div>
        </div>
      </div>
      <div class="quick">
        <button class="qa" id="qa-voice"><div class="qi">${I('microphone')}</div><span>Голосом</span></button>
        <button class="qa" id="qa-photo"><div class="qi">${I('camera')}</div><span>Сфоткать</span></button>
        <button class="qa" id="qa-stats"><div class="qi">${I('chart-bar')}</div><span>Аналитика</span></button>
      </div>`;
    if (cats.length) {
      html += `<div class="h2" id="cats-h">По категориям</div><div class="card">` + cats.slice(0, 6).map((c) => {
        return `<div class="row">${tile(c.category)}
          <div class="cat-main"><div class="cat-row"><span>${esc(c.category)}</span><span>${fmt(c.total)} ₽</span></div>
          <div class="track"><i style="width:${Math.max(6,(c.total/maxc)*100)}%;background:${ACCENT}"></i></div></div></div>`;
      }).join('') + `</div>`;
    }
    html += `<div class="h2">Последние</div>`;
    if (!t.transactions.length) {
      html += `<div class="card empty"><div class="big">${I('receipt')}</div><div>Пусто. Напиши трату снизу — например «кофе 250»</div></div>`;
    } else {
      html += `<div class="card">` + t.transactions.map((x) => {
        const amt = (x.type === 'income' ? '+' : '−') + fmt(x.amount) + ' ₽';
        return `<div class="row">${tile(x.type === 'income' ? 'Зарплата' : x.category)}
          <div class="row-main"><div class="row-title">${esc(x.title || x.category)}</div>
          <div class="row-sub">${esc(x.category)} · ${fmtTime(x.occurred_at)}</div></div>
          <div class="row-amt ${x.type==='income'?'g':''}">${amt}</div></div>`;
      }).join('') + `</div>`;
    }
    if (d.debts.length) {
      html += `<div class="h2">Долги</div><div class="card">` + d.debts.map((x) => {
        const owes = x.direction === 'owes_me';
        return `<div class="row"><div class="ava" style="background:${owes?'#1FB85C':'#FF9500'}">${esc((x.counterparty[0]||'?').toUpperCase())}</div>
          <div class="row-main"><div class="row-title">${esc(x.counterparty)}</div>
          <div class="row-sub">${owes?'должен вам':'вы должны'}</div></div>
          <div class="row-amt ${owes?'g':'o'}">${owes?'+':'−'}${fmt(x.amount)} ₽</div></div>`;
      }).join('') + `</div>`;
    }
    $screen.innerHTML = html;
    $screen.querySelector('#qa-voice')?.addEventListener('click', toggleVoice);
    $screen.querySelector('#qa-photo')?.addEventListener('click', () => document.querySelector('#f-img')?.click());
    $screen.querySelector('#qa-stats')?.addEventListener('click', () => document.querySelector('#cats-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $screen.querySelectorAll('.chip').forEach((ch) => ch.addEventListener('click', () => {
      const inp = document.querySelector('#f-input');
      if (inp) { inp.value = ch.dataset.cat + ' '; inp.focus(); document.querySelector('#f-send').disabled = false; }
    }));
  } catch (e) {
    $screen.innerHTML = `<h1>Финансы</h1><div class="card empty"><div class="ph">${I('warning-circle')}</div><div>${esc(e.message)}</div></div>`;
  }
}

// Поле ввода снизу
let mediaRec = null, recChunks = [];
function renderDock() {
  document.querySelector('.dock')?.remove();
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.innerHTML = `<div class="inputbar">
      <input id="f-input" placeholder="Трата, доход или долг…" />
      <button class="ibtn" id="f-mic">${I('microphone')}</button>
      <button class="ibtn" id="f-cam">${I('camera')}</button>
      <button class="send" id="f-send" disabled>${I('arrow-up')}</button>
      <input type="file" id="f-img" accept="image/*" style="display:none" />
    </div>`;
  document.querySelector('.frame').insertBefore(dock, $tabbar);
  const inp = dock.querySelector('#f-input'), send = dock.querySelector('#f-send');
  inp.addEventListener('input', () => { send.disabled = !inp.value.trim(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitText(); });
  send.addEventListener('click', submitText);
  dock.querySelector('#f-cam').addEventListener('click', () => dock.querySelector('#f-img').click());
  dock.querySelector('#f-img').addEventListener('change', onImage);
  dock.querySelector('#f-mic').addEventListener('click', toggleVoice);
}
async function submitText() {
  const inp = document.querySelector('#f-input'), send = document.querySelector('#f-send');
  const text = inp.value.trim(); if (!text) return;
  send.innerHTML = '<span class="spinner"></span>'; send.disabled = true;
  try { await api('/ai/text', { body: { text } }); inp.value = ''; toast('Добавлено'); await renderFinance(); }
  catch (e) { toast(e.message); send.innerHTML = I('arrow-up'); }
}
async function onImage(ev) {
  const file = ev.target.files[0]; if (!file) return;
  toast('Распознаю скриншот…');
  const reader = new FileReader();
  reader.onload = async () => {
    try { await api('/ai/image', { body: { image: reader.result } }); toast('Добавлено со скриншота'); await renderFinance(); }
    catch (e) { toast(e.message); }
  };
  reader.readAsDataURL(file);
}
async function toggleVoice() {
  const mic = document.querySelector('#f-mic');
  const qa = document.querySelector('#qa-voice');
  if (mediaRec && mediaRec.state === 'recording') { mediaRec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRec = new MediaRecorder(stream); recChunks = [];
    mediaRec.ondataavailable = (e) => recChunks.push(e.data);
    mediaRec.onstop = async () => {
      mic && (mic.classList.remove('rec'), mic.innerHTML = I('microphone'));
      qa?.classList.remove('rec');
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recChunks, { type: 'audio/webm' });
      const form = new FormData(); form.append('file', blob, 'voice.webm');
      toast('Распознаю голос…');
      try { await api('/ai/voice', { form }); toast('Добавлено голосом'); await renderFinance(); }
      catch (e) { toast(e.message); }
    };
    mediaRec.start();
    mic && (mic.classList.add('rec'), mic.innerHTML = I('stop-circle'));
    qa?.classList.add('rec');
    toast('Говори… нажми ещё раз, чтобы остановить');
  } catch { toast('Нет доступа к микрофону'); }
}

// =================== ФАЙЛЫ ===================
async function renderFiles() {
  $tabbar.classList.remove('hidden');
  document.querySelector('.dock')?.remove();
  $screen.className = 'screen with-tabs';
  $screen.innerHTML = `<h1>Файлы</h1><div class="loading-full" style="height:160px"><span class="spinner"></span></div>`;
  try {
    const r = await api('/files');
    const on = r.agentOnline;
    let html = `<h1>Файлы</h1>
      <div class="card status" id="pc-status">
        <div class="dot ${on?'on':'off'}"></div>
        <div style="flex:1"><div class="row-title">${on?'ПК на связи':'ПК офлайн'}</div>
        <div class="row-sub">${on?'Файлы летят в папку, путь — в буфер':'Нажми, чтобы настроить связь с ПК'}</div></div>
        ${I('caret-right')}
      </div>
      <div class="big-actions" style="margin-top:14px">
        <button class="big-action" id="b-cam"><div class="bi" style="background:#2F6BFF">${I('camera')}</div>Снять фото</button>
        <button class="big-action" id="b-gal"><div class="bi" style="background:#34AADC">${I('images')}</div>Из галереи</button>
      </div>
      <input type="file" id="file-input" style="display:none" />
      <div class="h2">Недавние</div>`;
    if (!r.files.length) html += `<div class="card empty"><div class="big">${I('folder-open')}</div><div>Пусто. Загрузи файл кнопками выше.</div></div>`;
    else html += `<div class="card">` + r.files.map((f) => {
      const isVid = (f.mime || '').startsWith('video');
      const ic = isVid ? 'film-strip' : (f.mime || '').startsWith('image') ? 'image' : 'file';
      return `<div class="row"><div class="tile" style="background:#8A8E99">${I(ic)}</div>
        <div class="row-main"><div class="row-title">${esc(f.original_name)}</div>
        <div class="row-sub" style="color:${f.status==='delivered'?'var(--green)':'var(--muted)'}">${f.status==='delivered'?'На ПК · путь скопирован':'Загружен · ждёт ПК'}</div></div></div>`;
    }).join('') + `</div>`;
    $screen.innerHTML = html;
    const fileInput = $screen.querySelector('#file-input');
    $screen.querySelector('#b-cam').addEventListener('click', () => { fileInput.accept = 'image/*'; fileInput.setAttribute('capture', 'environment'); fileInput.click(); });
    $screen.querySelector('#b-gal').addEventListener('click', () => { fileInput.accept = '*/*'; fileInput.removeAttribute('capture'); fileInput.click(); });
    fileInput.addEventListener('change', uploadFile);
    $screen.querySelector('#pc-status').addEventListener('click', setupPc);
  } catch (e) {
    $screen.innerHTML = `<h1>Файлы</h1><div class="card empty"><div class="big">${I('warning-circle')}</div><div>${esc(e.message)}</div></div>`;
  }
}
async function uploadFile(ev) {
  const file = ev.target.files[0]; if (!file) return;
  toast('Отправляю на сервер…');
  const form = new FormData(); form.append('file', file, file.name);
  try { const r = await api('/files', { form }); toast(r.agentOnline ? 'Отправлено на ПК' : 'Загружено (ПК офлайн)'); await renderFiles(); }
  catch (e) { toast(e.message); }
}
async function setupPc() {
  try { const r = await api('/pc/token', { body: { name: 'Мой ПК' } });
    prompt('Ключ для агента на ПК (вставь в config.json агента):', r.pcToken.token);
  } catch (e) { toast(e.message); }
}

// =================== ПРОФИЛЬ ===================
function renderProfile() {
  $tabbar.classList.remove('hidden');
  document.querySelector('.dock')?.remove();
  $screen.className = 'screen with-tabs';
  const initial = (user?.name || user?.email || 'A').trim()[0].toUpperCase();
  const item = (ic, col, label) => `<div class="row"><div class="tile" style="background:${col}">${I(ic)}</div><div class="row-main"><div class="row-title">${label}</div></div>${I('caret-right')}</div>`;
  $screen.innerHTML = `<h1>Профиль</h1>
    <div class="card" style="display:flex; align-items:center; gap:15px; padding:20px">
      <div class="logo-badge" style="width:60px;height:60px;border-radius:19px;font-size:26px">${esc(initial)}</div>
      <div><div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">${esc(user?.name || 'Аккаунт')}</div>
      <div class="muted small">${esc(user?.email || '')}</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      ${item('robot', '#5856D6', 'ИИ-агент и модели')}
      ${item('desktop-tower', '#1FB85C', 'Связь с компьютером')}
      ${item('tag', '#FF9500', 'Категории трат')}
    </div>
    <button class="btn btn-ghost" id="logout" style="margin-top:16px">Выйти</button>
    <div class="muted center-text small" style="margin-top:16px">Арра · веб-макет</div>`;
  $screen.querySelector('#logout').addEventListener('click', () => {
    token = null; user = null; localStorage.removeItem(TKEY); renderAuth();
  });
}

// =================== СТАРТ ===================
(async function init() {
  $screen.innerHTML = `<div class="loading-full"><span class="spinner"></span></div>`;
  if (token) {
    try { const r = await api('/me'); user = r.user; setActiveTab('finance'); return; }
    catch { token = null; localStorage.removeItem(TKEY); }
  }
  renderAuth();
})();
