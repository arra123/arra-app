// Noda Liquid pages. Loaded after app.js so these focused screens replace the legacy card dashboards.
const LIQUID_ICON = {
  company: '<svg viewBox="0 0 24 24"><path d="M4 20V7.5L12 3l8 4.5V20"/><path d="M8 20v-5h8v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 20c.4-4.3 2.2-6.5 5.5-6.5s5.1 2.2 5.5 6.5M14 14.2c3.8-.6 6 1.3 6.5 5.8"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h6M9 16h6"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="M12 2c.5 5.7 2.3 7.5 8 8-5.7.5-7.5 2.3-8 8-.5-5.7-2.3-7.5-8-8 5.7-.5 7.5-2.3 8-8zM19 16c.2 2.1.9 2.8 3 3-2.1.2-2.8.9-3 3-.2-2.1-.9-2.8-3-3 2.1-.2 2.8-.9 3-3z"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="m8 12.5 6.9-6.9a3 3 0 1 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.1-8.1"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></svg>',
  receipt: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="m5 16-1-3 2-5h12l2 5-1 3z"/><path d="M6 16v3M18 16v3M4 13h16M7 13h.01M17 13h.01"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.8-7.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 18 18z"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c4 2 5 6 0 9"/></svg>',
};
function liquidIcon(name) { return LIQUID_ICON[name] || LIQUID_ICON.sparkle; }
function liquidCompanyMark(className = '') { return `<img class="liquid-company-mark ${className}" src="assets/company-reimbursement-2d-256.png" alt="" decoding="async"/>`; }
const FINANCE_BRANDS = [
  { test: /belka|белк/i, title: 'BelkaCar', merchant: 'belkacar' },
  { test: /city\s*drive|citydrive|ситидрайв|сити\s*драйв/i, title: 'Ситидрайв', merchant: 'citydrive' },
  { test: /delimobil|делимоб|дели\b/i, title: 'Делимобиль', merchant: 'delimobil' },
  { test: /яндекс[.\s-]*(драйв|drive)|yandex[.\s-]*drive/i, title: 'Яндекс Драйв', merchant: 'яндекс драйв' },
  { test: /chat\s*gpt|open\s*ai|gpt(?:-|\s|\d|$)|codex/i, title: 'OpenAI', merchant: 'openai' },
  { test: /anthropic|claude|клод/i, title: 'Anthropic', merchant: 'anthropic' },
  { test: /proxy\s*api|прокси\s*апи/i, title: 'ProxyAPI', merchant: 'proxyapi' },
];
function financeBrandIcon(brand) {
  return merchantLogo(brand.merchant, 38).replace('class="mlogo"', `class="mlogo finance-brand-icon" title="${esc(brand.title)}"`);
}
function financeServiceIcon(item = {}) {
  const source = [item.purpose, item.merchant, item.company, item.counterparty, item.note].filter(Boolean).join(' ').toLowerCase();
  const brand = FINANCE_BRANDS.find((entry) => entry.test.test(source));
  if (brand) return financeBrandIcon(brand);
  if (typeof domainFor === 'function' && typeof merchantLogo === 'function' && domainFor(source)) return merchantLogo(source, 38);
  if (/каршер|такси|авто|drive/.test(source)) return `<span class="finance-service-icon car">${liquidIcon('car')}</span>`;
  if (/еда|food|ресторан|кафе|напит|ингредиент/.test(source)) return `<span class="finance-service-icon food">${liquidIcon('food')}</span>`;
  if (/cloud|облак|сервер|hosting|хостинг/.test(source)) return `<span class="finance-service-icon cloud">${liquidIcon('cloud')}</span>`;
  return `<span class="finance-service-icon receipt">${liquidIcon('receipt')}</span>`;
}
function liquidDate(value) {
  try { return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch { return ''; }
}
function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file); });
}
function bindLiquidRecorder(button, onText) {
  let recorder = null; let chunks = []; let stream = null; let audioContext = null; let analyser = null; let frame = 0; let started = 0; let cancelled = false; let starting = false;
  const composer = button.closest('.liquid-composer');
  const cleanup = () => {
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => track.stop());
    audioContext?.close().catch(() => {});
    stream = null; audioContext = null; analyser = null;
    composer?.classList.remove('is-recording', 'is-processing');
    composer?.querySelector('.liquid-voice-session')?.remove();
    button.classList.remove('recording', 'working');
    button.disabled = false;
  };
  const finish = (discard = false) => {
    if (recorder?.state !== 'recording') return;
    cancelled = discard;
    recorder.stop();
  };
  const onEscape = (event) => { if (event.key === 'Escape' && recorder?.state === 'recording') finish(true); };
  const renderVoiceSession = () => {
    const bars = Array.from({ length: 28 }, (_, index) => `<i style="--voice-index:${index}"></i>`).join('');
    composer?.insertAdjacentHTML('beforeend', `<div class="liquid-voice-session">
      <button class="liquid-voice-cancel" type="button" title="Отменить">${liquidIcon('close')}</button>
      <div class="liquid-voice-track"><span class="liquid-voice-time">0:00</span><span class="liquid-voice-wave">${bars}</span></div>
      <button class="liquid-voice-finish" type="button" title="Завершить запись">${liquidIcon('stop')}</button>
    </div>`);
    composer?.classList.add('is-recording');
    composer?.querySelector('.liquid-voice-cancel')?.addEventListener('click', () => finish(true));
    composer?.querySelector('.liquid-voice-finish')?.addEventListener('click', () => finish(false));
    document.addEventListener('keydown', onEscape);
  };
  const animateVoice = () => {
    const session = composer?.querySelector('.liquid-voice-session');
    if (!session || recorder?.state !== 'recording') return;
    const seconds = Math.floor((Date.now() - started) / 1000);
    const time = session.querySelector('.liquid-voice-time');
    if (time) time.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const visualBars = session.querySelectorAll('.liquid-voice-wave i');
    if (analyser && visualBars.length) {
      const values = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(values);
      visualBars.forEach((bar, index) => {
        const sample = values[Math.floor(index * values.length / visualBars.length)] || 0;
        bar.style.height = `${Math.max(3, Math.min(24, 3 + sample * .1))}px`;
      });
    }
    frame = requestAnimationFrame(animateVoice);
  };
  button.onclick = async () => {
    if (starting || recorder?.state === 'recording') return;
    starting = true; button.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = []; cancelled = false; recorder = new MediaRecorder(stream); started = Date.now();
      try {
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser(); analyser.fftSize = 64; analyser.smoothingTimeConstant = .76;
        audioContext.createMediaStreamSource(stream).connect(analyser);
      } catch { analyser = null; }
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        document.removeEventListener('keydown', onEscape);
        cancelAnimationFrame(frame);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        stream?.getTracks().forEach((track) => track.stop());
        audioContext?.close().catch(() => {});
        if (cancelled || !blob.size) { cleanup(); return; }
        composer?.classList.remove('is-recording'); composer?.classList.add('is-processing');
        const session = composer?.querySelector('.liquid-voice-session');
        if (session) session.innerHTML = `<div class="liquid-voice-processing"><span></span><b>Распознаю</b></div>`;
        button.classList.add('working');
        try {
          const result = await window.arra.transcribe(await blobToBase64(blob), blob.type);
          if (!result?.ok || !result.text) throw new Error(result?.error || 'Не удалось распознать голос');
          await onText(result.text);
        } catch (error) { toast('Голос', error.message, 'warn'); }
        cleanup();
      };
      recorder.start(); button.classList.add('recording');
      renderVoiceSession(); animateVoice();
    } catch { cleanup(); toast('Микрофон', 'Нет доступа к микрофону', 'warn'); }
    finally { starting = false; if (recorder?.state !== 'recording') button.disabled = false; }
  };
  return finish;
}

const liquidFinance = {
  tab: 'add', target: 'reimbursement', raw: '', userRaw: '', parsed: null, parsing: false, saved: null, listMode: 'active',
  loaded: false, loadedAt: 0, loading: null, reimbursements: [], debts: [],
};
function financeStatusLabel(status) {
  return ({ pending: 'Новая', submitted: 'Передана', reimbursed: 'Возвращено', rejected: 'Отклонено' })[status] || status;
}
function financeDraftHtml(parsed) {
  if (!parsed) return '';
  const debt = parsed.kind === 'debt' || liquidFinance.target !== 'reimbursement';
  const direction = parsed.direction || (liquidFinance.target === 'i_owe' ? 'i_owe' : 'owes_me');
  return `<div class="liquid-ai-row"><span class="liquid-ai-mark ${debt ? '' : 'company'}">${debt ? liquidIcon('people') : liquidCompanyMark()}</span>
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
function financeIsClosed(type, item) {
  return type === 'reimbursement' ? ['reimbursed', 'rejected'].includes(item.status) : !!item.settled;
}
function financeIsCompanyDebt(item) {
  return item?.direction !== 'i_owe' && /^(компания|company)$/i.test(String(item?.counterparty || '').trim());
}
function financeGroups() {
  const active = liquidFinance.listMode === 'active';
  const visible = (type, item) => active ? !financeIsClosed(type, item) : financeIsClosed(type, item);
  return [
    { key: 'company', label: 'Компания', icon: liquidCompanyMark('small'), items: [
      ...liquidFinance.reimbursements.filter((item) => visible('reimbursement', item)).map((item) => ({ type: 'reimbursement', item })),
      ...liquidFinance.debts.filter((item) => financeIsCompanyDebt(item) && visible('debt', item)).map((item) => ({ type: 'debt', item })),
    ] },
    { key: 'owed', label: 'Мне должны', icon: liquidIcon('people'), items: liquidFinance.debts.filter((item) => item.direction !== 'i_owe' && !financeIsCompanyDebt(item) && visible('debt', item)).map((item) => ({ type: 'debt', item })) },
    { key: 'owe', label: 'Я должен', icon: liquidIcon('people'), items: liquidFinance.debts.filter((item) => item.direction === 'i_owe' && visible('debt', item)).map((item) => ({ type: 'debt', item })) },
  ];
}
function financeReason(type, item) {
  const generic = /^(компания|компенсация|личный долг|долг|без названия)$/i;
  const candidates = type === 'reimbursement'
    ? [item.merchant, item.purpose, item.note]
    : [item.note, item.purpose, item.merchant];
  return candidates.map((value) => String(value || '').trim()).find((value) => value && !generic.test(value)) || 'Без описания';
}
function financeTableHtml() {
  const groups = financeGroups().filter((group) => group.items.length);
  if (!groups.length) return `<div class="liquid-empty finance-empty">${liquidFinance.listMode === 'active' ? 'Активных записей нет' : 'Закрытых записей нет'}</div>`;
  return `<div class="liquid-money-table-shell"><table class="liquid-money-table">
    <thead><tr><th>Источник</th><th>За что</th><th>Когда</th><th>Статус</th><th class="money">Сумма</th><th aria-label="Действие"></th></tr></thead>
    ${groups.map((group) => {
      const total = group.items.reduce((sum, record) => sum + Number(record.item.amount || 0), 0);
      return `<tbody class="finance-group ${group.key}"><tr class="finance-group-row"><td colspan="4"><span class="finance-group-icon">${group.icon}</span><b>${group.label}</b><small>${group.items.length}</small></td><td class="money"><strong>${fmt(total)} ₽</strong></td><td></td></tr>
        ${group.items.map(({ type, item }) => {
          const reimbursement = type === 'reimbursement'; const company = reimbursement || financeIsCompanyDebt(item); const closed = financeIsClosed(type, item);
          const source = company ? 'Компания' : (item.counterparty || (item.direction === 'i_owe' ? 'Кому должен' : 'Кто должен'));
          const reason = financeReason(type, item);
          const status = reimbursement ? financeStatusLabel(item.status) : (closed ? 'Закрыт' : 'Открыт');
          const statusClass = reimbursement ? `status-${item.status || 'pending'}` : (closed ? 'status-reimbursed' : 'status-pending');
          return `<tr class="finance-record ${closed ? 'closed' : ''}" data-type="${type}" data-id="${esc(item.id)}">
            <td><div class="finance-source">${company ? liquidCompanyMark('row') : `<span class="finance-person-icon">${liquidIcon('people')}</span>`}<b>${esc(source)}</b></div></td>
            <td><div class="finance-purpose">${financeServiceIcon(item)}<div><b>${esc(reason)}</b>${item.company && !/^компания$/i.test(item.company) ? `<small>${esc(item.company)}</small>` : ''}</div></div></td>
            <td><time>${liquidDate(item.occurred_at || item.created_at)}</time></td>
            <td><span class="finance-status ${statusClass}"><i></i>${esc(status)}</span></td>
            <td class="money"><strong>${fmt(item.amount)} ₽</strong></td><td><button class="liquid-row-check" data-close="1" title="${closed ? 'Вернуть в активные' : 'Закрыть'}">${closed ? '↺' : liquidIcon('check')}</button></td>
          </tr>`;
        }).join('')}</tbody>`;
    }).join('')}</table></div>`;
}
function bindFinanceTableActions() {
  document.querySelectorAll('#finance-table-host .liquid-row-check').forEach((button) => button.onclick = async () => {
    const row = button.closest('[data-id]'); const closed = row.classList.contains('closed'); button.disabled = true;
    try {
      if (row.dataset.type === 'reimbursement') {
        await api('PATCH', `/reimbursements/${row.dataset.id}`, { status: closed ? 'pending' : 'reimbursed' });
        const item = liquidFinance.reimbursements.find((record) => String(record.id) === row.dataset.id); if (item) item.status = closed ? 'pending' : 'reimbursed';
      } else {
        await api('PATCH', `/debts/${row.dataset.id}`, { settled: !closed });
        const item = liquidFinance.debts.find((record) => String(record.id) === row.dataset.id); if (item) item.settled = !closed;
      }
      renderFinanceTable();
    } catch (error) { toast('Возвраты', error.message, 'warn'); button.disabled = false; }
  });
}
function renderFinanceTable() {
  const host = document.getElementById('finance-table-host'); if (!host) return;
  host.innerHTML = financeTableHtml(); bindFinanceTableActions();
}
function renderFinanceList() {
  const body = document.getElementById('finance-body'); if (!body) return;
  const companyTotal = liquidFinance.reimbursements.filter((item) => !financeIsClosed('reimbursement', item)).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    + liquidFinance.debts.filter((item) => !item.settled && financeIsCompanyDebt(item)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const owedTotal = liquidFinance.debts.filter((item) => !item.settled && item.direction !== 'i_owe' && !financeIsCompanyDebt(item)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const oweTotal = liquidFinance.debts.filter((item) => !item.settled && item.direction === 'i_owe').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  body.innerHTML = `<div class="liquid-finance-overview">
    <div class="finance-total company"><span>${liquidCompanyMark()}</span><div><small>Компания</small><strong>${fmt(companyTotal)} ₽</strong></div></div>
    <div class="finance-total owed"><i></i><div><small>Мне должны</small><strong>${fmt(owedTotal)} ₽</strong></div></div>
    <div class="finance-total owe"><i></i><div><small>Я должен</small><strong>${fmt(oweTotal)} ₽</strong></div></div>
    <nav class="liquid-subtabs" data-active="${liquidFinance.listMode}"><button data-list="active" class="${liquidFinance.listMode === 'active' ? 'active' : ''}">Активные</button><button data-list="closed" class="${liquidFinance.listMode === 'closed' ? 'active' : ''}">Закрытые</button></nav>
  </div><div id="finance-table-host"></div>`;
  const switcher = body.querySelector('.liquid-subtabs');
  switcher.querySelectorAll('[data-list]').forEach((button) => button.onclick = () => {
    liquidFinance.listMode = button.dataset.list; switcher.dataset.active = liquidFinance.listMode;
    switcher.querySelector('.active')?.classList.remove('active'); button.classList.add('active'); renderFinanceTable();
  });
  renderFinanceTable();
}
function renderFinanceAdd() {
  const body = document.getElementById('finance-body'); if (!body) return;
  body.innerHTML = `<div class="liquid-conversation"><div class="liquid-feed" id="finance-feed">
      ${liquidFinance.saved ? `<div class="liquid-ai-row"><span class="liquid-ai-mark ok">${liquidIcon('check')}</span><div class="liquid-saved"><b>${esc(liquidFinance.saved.title)}</b><strong>${fmt(liquidFinance.saved.amount)} ₽</strong></div></div>` : ''}
      ${liquidFinance.userRaw ? `<div class="liquid-user-row"><div>${esc(liquidFinance.userRaw)}</div></div>` : ''}
      ${liquidFinance.parsing ? `<div class="liquid-ai-row"><span class="liquid-ai-mark">${liquidIcon('sparkle')}</span><div class="liquid-typing"><i></i><i></i><i></i></div></div>` : financeDraftHtml(liquidFinance.parsed)}
    </div><div class="liquid-composer-wrap"><div class="liquid-finance-context" role="group" aria-label="К кому относится запись">
      <button type="button" data-fin-target="reimbursement" class="${liquidFinance.target === 'reimbursement' ? 'active' : ''}">${liquidCompanyMark('context')}<span>Компания</span></button>
      <button type="button" data-fin-target="owes_me" class="${liquidFinance.target === 'owes_me' ? 'active' : ''}">${liquidIcon('people')}<span>Мне должны</span></button>
      <button type="button" data-fin-target="i_owe" class="${liquidFinance.target === 'i_owe' ? 'active' : ''}">${liquidIcon('people')}<span>Я должен</span></button>
    </div>
      <div class="liquid-composer"><button id="finance-attach" title="Фото">${liquidIcon('clip')}</button><input id="finance-photo" type="file" accept="image/*" hidden/><textarea id="finance-input" rows="1" placeholder="Сообщение"></textarea><button id="finance-send" class="liquid-send" hidden>${liquidIcon('send')}</button><button id="finance-mic" class="liquid-mic">${liquidIcon('mic')}</button></div></div></div>`;
  document.querySelectorAll('[data-fin-target]').forEach((button) => button.onclick = () => {
    if (liquidFinance.target === button.dataset.finTarget) return;
    liquidFinance.target = button.dataset.finTarget; liquidFinance.parsed = null;
    document.querySelector('[data-fin-target].active')?.classList.remove('active'); button.classList.add('active');
  });
  const input = document.getElementById('finance-input'); const send = document.getElementById('finance-send'); const mic = document.getElementById('finance-mic');
  const updateSend = () => { send.hidden = !input.value.trim(); mic.hidden = !!input.value.trim(); };
  input.oninput = updateSend;
  const parseEntry = async (text, image) => {
    const cleaned = String(text || '').trim(); if (!cleaned && !image) return;
    liquidFinance.userRaw = cleaned || 'Фото'; liquidFinance.parsing = true; liquidFinance.parsed = null; liquidFinance.saved = null; renderFinanceAdd();
    try {
      const result = await api('POST', '/reimbursements/parse', { text: cleaned, image, preferredKind: liquidFinance.target === 'reimbursement' ? 'reimbursement' : 'debt' });
      liquidFinance.parsed = result.parsed || {};
      if (liquidFinance.target === 'reimbursement') {
        // The selected context is authoritative: "Компания" can never be
        // accidentally reclassified by the parser as a personal debt.
        liquidFinance.parsed.kind = 'reimbursement'; liquidFinance.parsed.company = 'Компания'; delete liquidFinance.parsed.direction;
      } else { liquidFinance.parsed.kind = 'debt'; liquidFinance.parsed.direction = liquidFinance.target; }
    } catch (error) { toast('Возвраты', error.message, 'warn'); }
    liquidFinance.parsing = false; renderFinanceAdd();
  };
  send.onclick = () => parseEntry(input.value);
  input.onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); parseEntry(input.value); } };
  bindLiquidRecorder(mic, (text) => parseEntry(text));
  const photo = document.getElementById('finance-photo'); document.getElementById('finance-attach').onclick = () => photo.click();
  photo.onchange = async () => { if (photo.files?.[0]) parseEntry('', await dataUrlFromFile(photo.files[0])); };
  const form = document.getElementById('finance-form');
  document.getElementById('finance-clear')?.addEventListener('click', () => { liquidFinance.parsed = null; liquidFinance.userRaw = ''; renderFinanceAdd(); });
  if (form) form.onsubmit = async (event) => {
    event.preventDefault(); const parsed = liquidFinance.parsed || {}; const amount = Number(document.getElementById('f-amount').value);
    try {
      if (parsed.kind === 'debt' || liquidFinance.target !== 'reimbursement') {
        const counterparty = document.getElementById('f-party').value.trim();
        const result = await api('POST', '/debts', { amount, counterparty, direction: parsed.direction || liquidFinance.target, note: document.getElementById('f-note').value.trim(), occurred_at: parsed.occurred_at || null });
        liquidFinance.saved = { title: result.debt.counterparty, amount: result.debt.amount }; liquidFinance.debts.unshift(result.debt);
      } else {
        const result = await api('POST', '/reimbursements', { amount, purpose: document.getElementById('f-purpose').value.trim(), merchant: document.getElementById('f-merchant').value.trim(), company: document.getElementById('f-company').value.trim() || 'Компания', note: document.getElementById('f-note').value.trim(), occurred_at: parsed.occurred_at || null, source: 'assistant', raw_input: liquidFinance.userRaw });
        liquidFinance.saved = { title: result.reimbursement.purpose, amount: result.reimbursement.amount }; liquidFinance.reimbursements.unshift(result.reimbursement);
      }
      liquidFinance.parsed = null; liquidFinance.userRaw = ''; renderFinanceAdd();
    } catch (error) { toast('Не сохранилось', error.message, 'warn'); }
  };
}
function renderFinanceBody() {
  if (liquidFinance.tab === 'list') renderFinanceList(); else renderFinanceAdd();
}
async function loadFinanceData(force = false) {
  if (!force && liquidFinance.loaded && Date.now() - liquidFinance.loadedAt < 60_000) return;
  if (liquidFinance.loading) return liquidFinance.loading;
  liquidFinance.loading = Promise.all([api('GET', '/reimbursements?includeClosed=1'), api('GET', '/debts?all=true')])
    .then(([r, d]) => {
      liquidFinance.reimbursements = r.reimbursements || []; liquidFinance.debts = d.debts || [];
      liquidFinance.loaded = true; liquidFinance.loadedAt = Date.now();
      if (state.section === 'fin') renderFinanceBody();
    })
    .finally(() => { liquidFinance.loading = null; });
  return liquidFinance.loading;
}
renderFin = async function renderLiquidFinance() {
  app.innerHTML = `<div class="liquid-page finance-liquid"><header class="liquid-head"><h1>Возвраты</h1>
    <nav class="liquid-tabs" data-active="${liquidFinance.tab}"><button data-fin-tab="add" class="${liquidFinance.tab === 'add' ? 'active' : ''}">Записать</button><button data-fin-tab="list" class="${liquidFinance.tab === 'list' ? 'active' : ''}">Список</button></nav></header>
    <section id="finance-body" class="liquid-body">${liquidFinance.loaded ? '' : '<div class="liquid-loading"></div>'}</section></div>`;
  const tabs = app.querySelector('.liquid-tabs');
  tabs.querySelectorAll('[data-fin-tab]').forEach((button) => button.onclick = () => {
    if (liquidFinance.tab === button.dataset.finTab) return;
    liquidFinance.tab = button.dataset.finTab; tabs.dataset.active = liquidFinance.tab;
    tabs.querySelector('.active')?.classList.remove('active'); button.classList.add('active'); renderFinanceBody();
  });
  if (liquidFinance.loaded) renderFinanceBody();
  loadFinanceData().catch((error) => {
    const body = document.getElementById('finance-body');
    if (body && !liquidFinance.loaded) body.innerHTML = `<div class="liquid-empty error">${esc(error.message)}</div>`;
  });
};

const liquidChat = { messages: [], loaded: false, loadedAt: 0, loading: null };
function chatMessagesHtml() {
  return liquidChat.messages.length
    ? liquidChat.messages.map((message) => `<div class="liquid-message-row ${message.role === 'user' ? 'user' : 'assistant'}"><div>${esc(message.content)}</div></div>`).join('')
    : `<div class="liquid-chat-empty">${liquidIcon('sparkle')}</div>`;
}
async function loadChatMessages(force = false) {
  if (!force && liquidChat.loaded && Date.now() - liquidChat.loadedAt < 30_000) return;
  if (liquidChat.loading) return liquidChat.loading;
  liquidChat.loading = api('GET', '/ai/messages').then((result) => {
    liquidChat.messages = result.messages || []; liquidChat.loaded = true; liquidChat.loadedAt = Date.now();
    const feed = document.getElementById('liquid-chat-feed');
    if (feed && state.section === 'chat') { feed.innerHTML = chatMessagesHtml(); feed.scrollTop = feed.scrollHeight; }
  }).finally(() => { liquidChat.loading = null; });
  return liquidChat.loading;
}
renderChat = function renderLiquidChat() {
  app.innerHTML = `<div class="liquid-page assistant-liquid"><header class="liquid-head"><h1>Noda</h1><span class="liquid-online"></span></header>
    <section class="liquid-chat-feed" id="liquid-chat-feed">${liquidChat.loaded ? chatMessagesHtml() : '<div class="liquid-loading"></div>'}</section>
    <footer class="liquid-chat-dock"><div class="liquid-composer"><button id="chat-attach">${liquidIcon('clip')}</button><input id="chat-photo" type="file" accept="image/*" hidden/><textarea id="chat-input" rows="1" placeholder="Сообщение"></textarea><button id="chat-send" class="liquid-send" hidden>${liquidIcon('send')}</button><button id="chat-mic" class="liquid-mic">${liquidIcon('mic')}</button></div></footer></div>`;
  const feed = document.getElementById('liquid-chat-feed'); const input = document.getElementById('chat-input'); const send = document.getElementById('chat-send'); const mic = document.getElementById('chat-mic'); let image = '';
  if (liquidChat.loaded) feed.scrollTop = feed.scrollHeight;
  const update = () => { const has = !!input.value.trim() || !!image; send.hidden = !has; mic.hidden = has; };
  input.oninput = update;
  const sendMessage = async () => {
    const text = input.value.trim(); if (!text && !image) return; input.value = ''; send.hidden = true; mic.hidden = false;
    feed.innerHTML += `<div class="liquid-message-row user"><div>${esc(text || 'Фото')}</div></div><div class="liquid-message-row assistant pending"><div class="liquid-typing"><i></i><i></i><i></i></div></div>`; feed.scrollTop = feed.scrollHeight;
    try { await api('POST', '/ai/assistant', { text, image }); image = ''; await loadChatMessages(true); }
    catch (error) { toast('Noda', error.message, 'warn'); await loadChatMessages(true).catch(() => {}); }
  };
  send.onclick = sendMessage; input.onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } };
  bindLiquidRecorder(mic, (text) => {
    // Voice is a draft, not an action. Let the user review/correct the
    // transcript and explicitly press Send.
    input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  });
  const photo = document.getElementById('chat-photo'); document.getElementById('chat-attach').onclick = () => photo.click();
  photo.onchange = async () => { if (photo.files?.[0]) { image = await dataUrlFromFile(photo.files[0]); update(); } };
  loadChatMessages().catch((error) => { if (!liquidChat.loaded && feed.isConnected) feed.innerHTML = `<div class="liquid-empty error">${esc(error.message)}</div>`; });
};

const liquidNotes = { notes: [], selectedId: null, query: '', mode: 'original', loaded: false, loadedAt: 0, loading: null, saveTimers: new Map() };
function noteListHtml() {
  const query = liquidNotes.query.toLowerCase();
  const rows = liquidNotes.notes.filter((note) => !query || `${note.title || ''} ${note.body || ''}`.toLowerCase().includes(query));
  return rows.map((note) => `<button class="liquid-note-row ${note.id === liquidNotes.selectedId ? 'active' : ''}" data-note="${esc(note.id)}" aria-selected="${note.id === liquidNotes.selectedId}"><span></span><div><b>${esc(note.title || 'Без названия')}</b><small>${esc((note.body || '').replace(/\s+/g, ' ').slice(0, 90) || 'Пустая заметка')}</small></div><time>${liquidDate(note.updated_at)}</time></button>`).join('') || '<div class="liquid-empty">Заметок нет</div>';
}
function syncNoteDraftFromEditor() {
  const note = liquidNotes.notes.find((item) => item.id === liquidNotes.selectedId);
  const title = document.getElementById('note-title'); const body = document.getElementById('note-body');
  if (!note || !title || !body) return note;
  note.title = title.value;
  if (liquidNotes.mode === 'structured') note.structured_body = body.value; else note.body = body.value;
  return note;
}
function updateNoteRow(note) {
  const row = document.querySelector(`[data-note="${CSS.escape(String(note.id))}"]`); if (!row) return;
  row.querySelector('b').textContent = note.title || 'Без названия';
  row.querySelector('small').textContent = (note.body || '').replace(/\s+/g, ' ').slice(0, 90) || 'Пустая заметка';
  row.querySelector('time').textContent = liquidDate(note.updated_at || new Date());
}
async function persistNote(note, silent = false) {
  if (!note) return;
  const payload = { title: note.title?.trim() || '', body: note.body || '', structured_body: note.structured_body || null };
  try {
    const result = await api('PUT', `/notes/${note.id}`, payload); Object.assign(note, result.note); updateNoteRow(note);
    if (!silent) toast('Заметка', 'Сохранено', 'ok', 1500);
  } catch (error) { if (!silent) toast('Заметка', error.message, 'warn'); }
}
function scheduleNoteSave(note) {
  if (!note) return;
  clearTimeout(liquidNotes.saveTimers.get(note.id));
  liquidNotes.saveTimers.set(note.id, setTimeout(() => { liquidNotes.saveTimers.delete(note.id); persistNote(note, true); }, 700));
}
function placeNoteGlider() {
  const list = document.getElementById('liquid-note-list'); const active = list?.querySelector('.liquid-note-row.active'); if (!list || !active) return;
  list.style.setProperty('--note-active-y', `${active.offsetTop}px`); list.style.setProperty('--note-active-h', `${active.offsetHeight}px`);
}
function selectNote(id) {
  if (String(liquidNotes.selectedId) === String(id)) return;
  syncNoteDraftFromEditor(); liquidNotes.selectedId = id; liquidNotes.mode = 'original';
  const list = document.getElementById('liquid-note-list');
  list?.querySelector('.liquid-note-row.active')?.classList.remove('active');
  list?.querySelectorAll('.liquid-note-row').forEach((row) => row.setAttribute('aria-selected', String(row.dataset.note === String(id))));
  const next = list?.querySelector(`[data-note="${CSS.escape(String(id))}"]`); next?.classList.add('active'); placeNoteGlider(); renderNoteEditor();
}
function bindNoteList() {
  document.querySelectorAll('#liquid-note-list [data-note]').forEach((button) => button.onclick = () => selectNote(button.dataset.note));
  requestAnimationFrame(placeNoteGlider);
}
function renderNoteList() {
  const list = document.getElementById('liquid-note-list'); if (!list) return;
  const scrollTop = list.scrollTop; list.innerHTML = noteListHtml(); list.scrollTop = scrollTop; bindNoteList();
}
function renderNoteEditor() {
  const host = document.getElementById('liquid-note-editor'); if (!host) return;
  const note = liquidNotes.notes.find((item) => item.id === liquidNotes.selectedId);
  if (!note) { host.innerHTML = `<div class="liquid-note-empty">${liquidIcon('note')}</div>`; return; }
  const structured = !!note.structured_body;
  const text = liquidNotes.mode === 'structured' && structured ? note.structured_body : note.body;
  host.innerHTML = `<div class="liquid-note-toolbar"><nav class="liquid-subtabs note-version" data-active="${liquidNotes.mode}"><button data-note-mode="original" class="${liquidNotes.mode === 'original' ? 'active' : ''}">Оригинал</button><button data-note-mode="structured" class="${liquidNotes.mode === 'structured' ? 'active' : ''}" ${structured ? '' : 'disabled'}>ИИ-версия</button></nav><div><button id="note-structure" title="Структурировать">${liquidIcon('sparkle')}</button><button id="note-delete" title="Удалить">${liquidIcon('trash')}</button><button id="note-save" class="liquid-primary compact">Сохранить</button></div></div>
    <input id="note-title" class="liquid-note-title" value="${esc(note.title || '')}" placeholder="Без названия"/><textarea id="note-body" class="liquid-note-body" placeholder="Начните писать…">${esc(text || '')}</textarea>`;
  host.querySelectorAll('[data-note-mode]').forEach((button) => button.onclick = () => {
    if (liquidNotes.mode === button.dataset.noteMode || button.disabled) return;
    syncNoteDraftFromEditor(); liquidNotes.mode = button.dataset.noteMode; renderNoteEditor();
  });
  const title = document.getElementById('note-title'); const body = document.getElementById('note-body');
  const changed = () => { const current = syncNoteDraftFromEditor(); updateNoteRow(current); scheduleNoteSave(current); };
  title.oninput = changed; body.oninput = changed;
  document.getElementById('note-save').onclick = async () => {
    syncNoteDraftFromEditor(); clearTimeout(liquidNotes.saveTimers.get(note.id)); liquidNotes.saveTimers.delete(note.id); await persistNote(note);
  };
  document.getElementById('note-structure').onclick = async () => {
    const body = liquidNotes.mode === 'original' ? document.getElementById('note-body').value : note.body;
    if (!body.trim()) return; const button = document.getElementById('note-structure'); button.disabled = true;
    try { const result = await api('POST', '/notes/structure', { text: body }); const saved = await api('PUT', `/notes/${note.id}`, { title: document.getElementById('note-title').value.trim(), body, structured_body: result.structuredBody }); Object.assign(note, saved.note); liquidNotes.mode = 'structured'; updateNoteRow(note); renderNoteEditor(); } catch (error) { toast('ИИ-версия', error.message, 'warn'); button.disabled = false; }
  };
  document.getElementById('note-delete').onclick = async () => {
    if (!confirm('Удалить заметку?')) return; await api('DELETE', `/notes/${note.id}`);
    liquidNotes.notes = liquidNotes.notes.filter((item) => item.id !== note.id); liquidNotes.selectedId = liquidNotes.notes[0]?.id || null; liquidNotes.mode = 'original'; renderNoteList(); renderNoteEditor();
  };
}
function bindNotesShell() {
  const search = document.getElementById('liquid-note-search');
  if (search) search.oninput = () => { liquidNotes.query = search.value; renderNoteList(); };
  const add = document.getElementById('liquid-new-note');
  if (add) add.onclick = async () => {
    syncNoteDraftFromEditor(); const result = await api('POST', '/notes', { title: '', body: '', color: '#7C86F0' });
    liquidNotes.notes.unshift(result.note); liquidNotes.selectedId = result.note.id; liquidNotes.mode = 'original'; liquidNotes.loadedAt = Date.now();
    renderNoteList(); renderNoteEditor(); document.getElementById('note-title')?.focus();
  };
}
async function loadNotesData(force = false) {
  if (!force && liquidNotes.loaded && Date.now() - liquidNotes.loadedAt < 60_000) return;
  if (liquidNotes.loading) return liquidNotes.loading;
  liquidNotes.loading = api('GET', '/notes').then((result) => {
    liquidNotes.notes = result.notes || []; liquidNotes.loaded = true; liquidNotes.loadedAt = Date.now();
    if (!liquidNotes.notes.some((note) => note.id === liquidNotes.selectedId)) liquidNotes.selectedId = liquidNotes.notes[0]?.id || null;
    if (state.section === 'notes') { renderNoteList(); renderNoteEditor(); }
  }).finally(() => { liquidNotes.loading = null; });
  return liquidNotes.loading;
}
renderNotes = function renderLiquidNotes() {
  app.innerHTML = `<div class="liquid-page notes-liquid"><aside class="liquid-notes-list"><header><h1>Заметки</h1><button id="liquid-new-note" title="Новая заметка">${liquidIcon('plus')}</button></header><label class="liquid-search">${liquidIcon('search')}<input id="liquid-note-search" placeholder="Поиск" value="${esc(liquidNotes.query)}"/></label><div id="liquid-note-list">${liquidNotes.loaded ? noteListHtml() : '<div class="liquid-loading"></div>'}</div></aside><section id="liquid-note-editor" class="liquid-note-editor"></section></div>`;
  bindNotesShell();
  if (liquidNotes.loaded) { bindNoteList(); renderNoteEditor(); }
  loadNotesData().catch((error) => {
    const list = document.getElementById('liquid-note-list');
    if (list && !liquidNotes.loaded) list.innerHTML = `<div class="liquid-empty error">${esc(error.message)}</div>`;
  });
};

// If one of these pages was active while the override loaded, repaint it immediately.
if (state.section === 'fin') renderFin();
