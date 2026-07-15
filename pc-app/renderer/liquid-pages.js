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
  edit: '<svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="m5 16-1-3 2-5h12l2 5-1 3z"/><path d="M6 16v3M18 16v3M4 13h16M7 13h.01M17 13h.01"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.8-7.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 18 18z"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c4 2 5 6 0 9"/></svg>',
};
function liquidIcon(name) { return LIQUID_ICON[name] || LIQUID_ICON.sparkle; }
function liquidCompanyMark(className = '') {
  return `<span class="liquid-company-mark ${className}" aria-hidden="true">${liquidIcon('company')}</span>`;
}
const FINANCE_BRANDS = [
  { test: /belka|белк/i, title: 'BelkaCar', merchant: 'belkacar', logo: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/00/f3/3c/00f33c50-919e-25b2-58a4-2316eca1a104/ReleaseBelkacarAppIcon-0-0-1x_U007ephone-0-1-0-85-220.png/100x100bb.jpg' },
  { test: /city\s*drive|citydrive|ситидрайв|сити\s*драйв/i, title: 'City Drive', merchant: 'citydrive' },
  { test: /delimobil|делимоб|дели\b/i, title: 'Делимобиль', merchant: 'delimobil' },
  { test: /яндекс[.\s-]*(драйв|drive)|yandex[.\s-]*drive/i, title: 'Яндекс Драйв', merchant: 'яндекс драйв' },
  { test: /chat\s*gpt|open\s*ai|gpt(?:-|\s|\d|$)|codex/i, title: 'OpenAI', merchant: 'openai' },
  { test: /anthropic|claude|клод/i, title: 'Anthropic', merchant: 'anthropic' },
  { test: /proxy\s*api|прокси\s*апи/i, title: 'ProxyAPI', merchant: 'proxyapi' },
];
function financeBrandIcon(brand) {
  if (brand.logo) return `<span class="finance-brand-icon bundled" title="${esc(brand.title)}"><img src="${brand.logo}" alt="" decoding="async"/></span>`;
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
  try {
    const date = new Date(value);
    const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time}`;
  } catch { return ''; }
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
  tab: 'add', target: 'reimbursement', raw: '', userRaw: '', parsed: null, parsing: false, saved: null,
  recipient: localStorage.getItem('noda-finance-recipient') === 'Дани' ? 'Дани' : 'Тима',
  month: localStorage.getItem('noda-finance-month') || '',
  dateSort: localStorage.getItem('noda-finance-date-sort') === 'asc' ? 'asc' : 'desc',
  groupMode: localStorage.getItem('noda-finance-group-mode') === 'service' ? 'service' : 'week',
  expandedServices: new Set(),
  loaded: false, loadedAt: 0, loading: null, reimbursements: [], debts: [],
};
function financeRecipientButtons(selected = liquidFinance.recipient) {
  return `<div class="finance-recipient-switch" role="tablist" data-recipient="${esc(selected)}">
    <i aria-hidden="true"></i>
    <button type="button" data-fin-recipient="Тима" class="${selected === 'Тима' ? 'active' : ''}">Тима</button>
    <button type="button" data-fin-recipient="Дани" class="${selected === 'Дани' ? 'active' : ''}">Дани</button>
  </div>`;
}
function selectFinanceRecipient(value) {
  liquidFinance.recipient = value === 'Дани' ? 'Дани' : 'Тима';
  localStorage.setItem('noda-finance-recipient', liquidFinance.recipient);
  document.querySelectorAll('.finance-recipient-switch').forEach((switcher) => {
    switcher.dataset.recipient = liquidFinance.recipient;
    switcher.querySelector('.active')?.classList.remove('active');
    switcher.querySelector(`[data-fin-recipient="${liquidFinance.recipient}"]`)?.classList.add('active');
  });
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
           <div class="liquid-form-grid"><input id="f-merchant" value="${esc(parsed.merchant || '')}" placeholder="Где"/><input id="f-company" value="${esc(parsed.company || 'Компания')}" placeholder="Компания"/></div>
           ${financeRecipientButtons(parsed.recipient || liquidFinance.recipient)}`}
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
function financeReason(type, item) {
  const generic = /^(компания|компенсация|личный долг|долг|без названия)$/i;
  const candidates = type === 'reimbursement'
    ? [item.merchant, item.purpose, item.note]
    : [item.note, item.purpose, item.merchant];
  return candidates.map((value) => String(value || '').trim()).find((value) => value && !generic.test(value)) || 'Без описания';
}
function financeRecordDate(item) {
  const date = new Date(item?.occurred_at || item?.created_at || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function financeMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function financeMonthLabel(key, long = false) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return '';
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: long ? 'long' : 'short', year: 'numeric' }).replace(' г.', '');
}
function financeMoveMonth(offset) {
  const [year, month] = liquidFinance.month.split('-').map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || new Date().getMonth() + 1) - 1 + offset, 1);
  liquidFinance.month = financeMonthKey(date);
  localStorage.setItem('noda-finance-month', liquidFinance.month);
}
function ensureFinanceMonth() {
  if (/^\d{4}-\d{2}$/.test(liquidFinance.month)) return;
  const dates = [...liquidFinance.reimbursements, ...liquidFinance.debts].map(financeRecordDate).sort((a, b) => b - a);
  liquidFinance.month = financeMonthKey(dates[0] || new Date());
}
function financeRecords() {
  return [
    ...liquidFinance.reimbursements.map((item) => ({ type: 'reimbursement', item })),
    ...liquidFinance.debts.map((item) => ({ type: 'debt', item })),
  ].map((record) => {
    const { type, item } = record; const reimbursement = type === 'reimbursement'; const company = reimbursement || financeIsCompanyDebt(item);
    const date = financeRecordDate(item);
    let source = 'Компания'; let recipient = item.recipient || 'Тима';
    if (!company && item.direction === 'i_owe') { source = 'Тима'; recipient = item.counterparty || '—'; }
    else if (!company) { source = item.counterparty || '—'; recipient = item.recipient || 'Тима'; }
    return { ...record, date, dateMs: date.getTime(), month: financeMonthKey(date), reimbursement, company,
      closed: financeIsClosed(type, item), source, recipient, reason: financeReason(type, item), amount: Number(item.amount || 0) };
  });
}
function financeMonthRecords() {
  ensureFinanceMonth();
  return financeRecords().filter((record) => record.month === liquidFinance.month);
}
function financeWeekStart(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
function financeWeekLabel(start) {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const monthName = (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, '');
  const startMonth = monthName(start); const endMonth = monthName(end);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} — ${end.getDate()} ${endMonth}`;
}
function financeWeekGroups(records = financeMonthRecords()) {
  const groups = new Map();
  records.forEach((record) => {
    const start = financeWeekStart(record.date); const key = start.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, { key, start, records: [] });
    groups.get(key).records.push(record);
  });
  const direction = liquidFinance.dateSort === 'asc' ? 1 : -1;
  return [...groups.values()].sort((a, b) => (a.start - b.start) * direction).map((group) => ({
    ...group,
    records: group.records.sort((a, b) => (a.dateMs - b.dateMs) * direction),
    total: group.records.reduce((sum, record) => sum + record.amount, 0),
  }));
}
function financeServiceMeta(record) {
  const item = record.item || {};
  const source = [item.merchant, item.purpose, item.note, item.counterparty, item.company].filter(Boolean).join(' ').toLowerCase();
  const brand = FINANCE_BRANDS.find((entry) => entry.test.test(source));
  if (brand) return { key: `brand:${brand.title.toLowerCase()}`, label: brand.title, icon: financeBrandIcon(brand) };
  const generic = /^(компания|компенсация|личный долг|долг|без описания)$/i;
  const label = [item.merchant, record.reason, item.counterparty].map((value) => String(value || '').trim()).find((value) => value && !generic.test(value)) || 'Прочее';
  return { key: `service:${label.toLowerCase()}`, label, icon: financeServiceIcon(item) };
}
function financeServiceGroups(records = financeMonthRecords()) {
  const groups = new Map();
  records.forEach((record) => {
    const meta = financeServiceMeta(record);
    if (!groups.has(meta.key)) groups.set(meta.key, { ...meta, records: [], total: 0 });
    const group = groups.get(meta.key); group.records.push(record); group.total += record.amount;
  });
  const direction = liquidFinance.dateSort === 'asc' ? 1 : -1;
  return [...groups.values()].map((group) => ({
    ...group,
    records: group.records.sort((a, b) => (a.dateMs - b.dateMs) * direction),
  })).sort((a, b) => ((a.records[0]?.dateMs || 0) - (b.records[0]?.dateMs || 0)) * direction || a.label.localeCompare(b.label, 'ru'));
}
function financeMonthOptions() {
  const dates = financeRecords().map((record) => new Date(record.date.getFullYear(), record.date.getMonth(), 1));
  dates.push(new Date());
  let min = new Date(Math.min(...dates.map((date) => date.getTime()))); let max = new Date(Math.max(...dates.map((date) => date.getTime())));
  const options = [];
  while (max >= min && options.length < 60) { options.push(financeMonthKey(max)); max = new Date(max.getFullYear(), max.getMonth() - 1, 1); }
  if (!options.includes(liquidFinance.month)) options.push(liquidFinance.month);
  return [...new Set(options)].sort().reverse();
}
function financePeriodHtml(records, withGrouping = false) {
  const total = records.reduce((sum, record) => sum + record.amount, 0);
  return `<div class="finance-list-toolbar">
    <div class="finance-month-picker">
      <button type="button" data-fin-month-step="-1" title="Предыдущий месяц">${liquidIcon('left')}</button>
      <label><small>Период</small><select id="finance-month-select">${financeMonthOptions().map((key) => `<option value="${key}" ${key === liquidFinance.month ? 'selected' : ''}>${financeMonthLabel(key, true)}</option>`).join('')}</select></label>
      <button type="button" data-fin-month-step="1" title="Следующий месяц">${liquidIcon('right')}</button>
    </div>
    ${withGrouping ? `<nav class="finance-view-switch" aria-label="Группировка"><button type="button" data-fin-group="week" class="${liquidFinance.groupMode === 'week' ? 'active' : ''}">По неделям</button><button type="button" data-fin-group="service" class="${liquidFinance.groupMode === 'service' ? 'active' : ''}">По сервисам</button></nav>` : ''}
    <div class="finance-period-total"><small>За ${financeMonthLabel(liquidFinance.month)}</small><strong>${fmt(total)} ₽</strong><span>${records.length} ${records.length === 1 ? 'запись' : records.length > 1 && records.length < 5 ? 'записи' : 'записей'}</span></div>
  </div>`;
}
function financeRecordRow(record) {
  const { type, item, closed } = record;
  const subtitle = record.reimbursement && item.merchant && item.merchant.toLowerCase() !== record.reason.toLowerCase() ? item.merchant : '';
  return `<tr class="finance-record ${closed ? 'closed' : ''}" data-type="${type}" data-id="${esc(item.id)}" data-fin-edit-row="1" title="Нажмите, чтобы изменить">
    <td><div class="finance-source">${record.company ? liquidCompanyMark('row') : `<span class="finance-person-icon">${liquidIcon('people')}</span>`}<b>${esc(record.source)}</b></div></td>
    <td><div class="finance-purpose">${financeServiceIcon(item)}<div><b>${esc(record.reason)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div></div></td>
    <td><span class="finance-recipient-badge ${record.recipient === 'Дани' ? 'dani' : 'tima'}">${esc(record.recipient)}</span></td>
    <td><time datetime="${record.date.toISOString()}">${liquidDate(record.date)}</time></td>
    <td class="money"><strong>${fmt(record.amount)} ₽</strong></td>
    <td><div class="finance-row-actions"><button class="finance-row-edit" type="button" data-fin-edit="1" title="Изменить">${liquidIcon('edit')}</button><button class="liquid-row-check ${closed ? 'checked' : ''}" type="button" data-close="1" title="${closed ? 'Вернуть' : 'Отметить возвращённым'}">${liquidIcon('check')}</button></div></td>
  </tr>`;
}
function financeTableHtml() {
  const groups = liquidFinance.groupMode === 'service' ? financeServiceGroups() : financeWeekGroups();
  if (!groups.length) return `<div class="liquid-empty finance-empty">За ${financeMonthLabel(liquidFinance.month, true)} записей нет</div>`;
  return `<div class="liquid-money-table-shell"><table class="liquid-money-table finance-week-table">
    <thead><tr><th>Кто</th><th>За что</th><th>Кому</th><th><button class="finance-date-sort" type="button" title="Изменить порядок">Когда <span>${liquidFinance.dateSort === 'desc' ? '↓' : '↑'}</span></button></th><th class="money">Сумма</th><th aria-label="Действия"></th></tr></thead>
    ${liquidFinance.groupMode === 'service'
      ? groups.map((group) => { const expanded = liquidFinance.expandedServices.has(group.key); return `<tbody class="finance-service-group ${expanded ? 'expanded' : ''}"><tr class="finance-service-row" data-fin-service-toggle="${esc(group.key)}" tabindex="0" role="button" aria-expanded="${expanded}"><td colspan="4"><div>${group.icon}<b>${esc(group.label)}</b><small>${group.records.length}</small></div></td><td class="money"><strong>${fmt(group.total)} ₽</strong></td><td><span class="finance-service-chevron">${liquidIcon('right')}</span></td></tr>${expanded ? group.records.map(financeRecordRow).join('') : ''}</tbody>`; }).join('')
      : groups.map((group) => `<tbody class="finance-week-group"><tr class="finance-week-row"><td colspan="4"><div><span>${liquidIcon('calendar')}</span><b>${financeWeekLabel(group.start)}</b><small>${group.records.length}</small></div></td><td class="money"><strong>${fmt(group.total)} ₽</strong></td><td></td></tr>${group.records.map(financeRecordRow).join('')}</tbody>`).join('')}
    </table></div>`;
}
function financeLocalDateTime(value) {
  const date = financeRecordDate({ occurred_at: value });
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function closeFinanceEditor() { document.querySelector('.finance-editor-backdrop')?.remove(); }
function openFinanceEditor(type, id) {
  const collection = type === 'reimbursement' ? liquidFinance.reimbursements : liquidFinance.debts;
  const item = collection.find((record) => String(record.id) === String(id)); if (!item) return;
  const reimbursement = type === 'reimbursement';
  closeFinanceEditor();
  document.body.insertAdjacentHTML('beforeend', `<div class="finance-editor-backdrop"><section class="finance-editor" role="dialog" aria-modal="true" aria-labelledby="finance-editor-title">
    <header><div><small>Запись</small><h2 id="finance-editor-title">Изменить</h2></div><button type="button" data-fin-edit-close title="Закрыть">${liquidIcon('close')}</button></header>
    <form id="finance-edit-form">
      <div class="finance-edit-grid">
        ${reimbursement ? `<label class="wide"><span>За что</span><input name="purpose" value="${esc(item.purpose || '')}" required/></label>
          <label><span>Сервис или магазин</span><input name="merchant" value="${esc(item.merchant || '')}"/></label>
          <label><span>Кому</span><select name="recipient"><option ${item.recipient !== 'Дани' ? 'selected' : ''}>Тима</option><option ${item.recipient === 'Дани' ? 'selected' : ''}>Дани</option></select></label>`
          : `<label class="wide"><span>Кто или кому</span><input name="counterparty" value="${esc(item.counterparty || '')}" required/></label>
          <label><span>Направление</span><select name="direction"><option value="owes_me" ${item.direction !== 'i_owe' ? 'selected' : ''}>Мне должны</option><option value="i_owe" ${item.direction === 'i_owe' ? 'selected' : ''}>Я должен</option></select></label>
          <label><span>Кому внутри команды</span><select name="recipient"><option ${item.recipient !== 'Дани' ? 'selected' : ''}>Тима</option><option ${item.recipient === 'Дани' ? 'selected' : ''}>Дани</option></select></label>`}
        <label><span>Когда</span><input name="occurred_at" type="datetime-local" value="${financeLocalDateTime(item.occurred_at || item.created_at)}" required/></label>
        <label><span>Сумма</span><div class="finance-edit-money"><input name="amount" type="number" min="0.01" step="0.01" value="${esc(item.amount)}" required/><i>₽</i></div></label>
        <label class="wide"><span>Комментарий</span><input name="note" value="${esc(item.note || '')}"/></label>
      </div>
      <footer><button type="button" data-fin-edit-close>Отмена</button><button class="liquid-primary" type="submit">${liquidIcon('check')}<span>Сохранить</span></button></footer>
    </form>
  </section></div>`);
  const backdrop = document.querySelector('.finance-editor-backdrop');
  backdrop.querySelectorAll('[data-fin-edit-close]').forEach((button) => button.onclick = closeFinanceEditor);
  backdrop.onclick = (event) => { if (event.target === backdrop) closeFinanceEditor(); };
  const onEscape = (event) => { if (event.key === 'Escape') { closeFinanceEditor(); document.removeEventListener('keydown', onEscape); } };
  document.addEventListener('keydown', onEscape);
  backdrop.querySelector('#finance-edit-form').onsubmit = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    const localDate = new Date(String(form.get('occurred_at') || ''));
    const payload = reimbursement
      ? { purpose: String(form.get('purpose') || '').trim(), merchant: String(form.get('merchant') || '').trim(), recipient: form.get('recipient'), amount: Number(form.get('amount')), occurred_at: localDate.toISOString(), note: String(form.get('note') || '').trim() }
      : { counterparty: String(form.get('counterparty') || '').trim(), direction: form.get('direction'), recipient: form.get('recipient'), amount: Number(form.get('amount')), occurred_at: localDate.toISOString(), note: String(form.get('note') || '').trim() };
    try {
      const result = await api('PATCH', `/${reimbursement ? 'reimbursements' : 'debts'}/${item.id}`, payload);
      const updated = result[reimbursement ? 'reimbursement' : 'debt']; Object.assign(item, updated);
      closeFinanceEditor(); ensureFinanceMonth(); renderFinanceList(); toast('Сохранено', 'Запись обновлена', 'ok');
    } catch (error) { toast('Не сохранилось', error.message, 'warn'); submit.disabled = false; }
  };
  backdrop.querySelector('input')?.focus();
}
async function toggleFinanceClosed(row, button) {
  const closed = row.classList.contains('closed'); button.disabled = true;
  try {
    if (row.dataset.type === 'reimbursement') {
      const result = await api('PATCH', `/reimbursements/${row.dataset.id}`, { status: closed ? 'pending' : 'reimbursed' });
      const item = liquidFinance.reimbursements.find((record) => String(record.id) === row.dataset.id); if (item) Object.assign(item, result.reimbursement);
    } else {
      const result = await api('PATCH', `/debts/${row.dataset.id}`, { settled: !closed });
      const item = liquidFinance.debts.find((record) => String(record.id) === row.dataset.id); if (item) Object.assign(item, result.debt);
    }
    renderFinanceList();
  } catch (error) { toast('Возвраты', error.message, 'warn'); button.disabled = false; }
}
function bindFinancePeriod(onChange) {
  document.querySelectorAll('[data-fin-month-step]').forEach((button) => button.onclick = () => { financeMoveMonth(Number(button.dataset.finMonthStep)); onChange(); });
  const select = document.getElementById('finance-month-select'); if (select) select.onchange = () => { liquidFinance.month = select.value; localStorage.setItem('noda-finance-month', liquidFinance.month); onChange(); };
}
function bindFinanceTableActions() {
  const host = document.getElementById('finance-table-host'); if (!host) return;
  host.querySelector('.finance-date-sort')?.addEventListener('click', () => {
    liquidFinance.dateSort = liquidFinance.dateSort === 'desc' ? 'asc' : 'desc'; localStorage.setItem('noda-finance-date-sort', liquidFinance.dateSort); renderFinanceList();
  });
  const toggleService = (row) => {
    const key = row.dataset.finServiceToggle;
    if (liquidFinance.expandedServices.has(key)) liquidFinance.expandedServices.delete(key); else liquidFinance.expandedServices.add(key);
    renderFinanceList();
  };
  host.querySelectorAll('[data-fin-service-toggle]').forEach((row) => {
    row.onclick = () => toggleService(row);
    row.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleService(row); } };
  });
  host.querySelectorAll('[data-fin-edit-row]').forEach((row) => row.onclick = (event) => { if (!event.target.closest('button')) openFinanceEditor(row.dataset.type, row.dataset.id); });
  host.querySelectorAll('[data-fin-edit]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const row = button.closest('[data-id]'); openFinanceEditor(row.dataset.type, row.dataset.id); });
  host.querySelectorAll('[data-close]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); toggleFinanceClosed(button.closest('[data-id]'), button); });
}
function renderFinanceList() {
  const body = document.getElementById('finance-body'); if (!body) return;
  const records = financeMonthRecords();
  body.innerHTML = `${financePeriodHtml(records, true)}<div id="finance-table-host">${financeTableHtml()}</div>`;
  body.querySelectorAll('[data-fin-group]').forEach((button) => button.onclick = () => {
    liquidFinance.groupMode = button.dataset.finGroup === 'service' ? 'service' : 'week';
    localStorage.setItem('noda-finance-group-mode', liquidFinance.groupMode);
    if (liquidFinance.groupMode === 'service') liquidFinance.expandedServices.clear();
    renderFinanceList();
  });
  bindFinancePeriod(renderFinanceList); bindFinanceTableActions();
}
function financeCategory(record) {
  const text = `${record.reason} ${record.item.merchant || ''}`.toLowerCase();
  if (/каршер|belka|ситидрайв|делимоб|drive/.test(text)) return 'Каршеринг';
  if (/api|gpt|openai|claude|codex|прокси|подпис/.test(text)) return 'Сервисы и подписки';
  if (/водител|зарплат|оплата/.test(text)) return 'Работа';
  if (/еда|кафе|ресторан|напит|ингредиент/.test(text)) return 'Еда';
  return record.company ? 'Прочее для компании' : 'Личные долги';
}
function renderFinanceAnalytics() {
  const body = document.getElementById('finance-body'); if (!body) return;
  const records = financeMonthRecords(); const total = records.reduce((sum, record) => sum + record.amount, 0); const max = Math.max(1, ...financeWeekGroups(records).map((group) => group.total));
  const weeks = financeWeekGroups(records).sort((a, b) => a.start - b.start);
  const categoryMap = new Map(); records.forEach((record) => categoryMap.set(financeCategory(record), (categoryMap.get(financeCategory(record)) || 0) + record.amount));
  const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);
  const recipients = ['Тима', 'Дани'].map((name) => ({ name, total: records.filter((record) => record.recipient === name).reduce((sum, record) => sum + record.amount, 0) })).filter((item) => item.total);
  body.innerHTML = `${financePeriodHtml(records)}<div class="finance-analytics">
    <section class="finance-analytics-panel"><header><span>${liquidIcon('calendar')}</span><div><b>По неделям</b><small>Динамика расходов</small></div></header><div class="finance-week-bars">${weeks.length ? weeks.map((group) => `<div><label><span>${financeWeekLabel(group.start)}</span><strong>${fmt(group.total)} ₽</strong></label><i><b style="width:${Math.max(3, group.total / max * 100)}%"></b></i></div>`).join('') : '<p>Нет данных</p>'}</div></section>
    <section class="finance-analytics-panel"><header><span>${liquidIcon('chart')}</span><div><b>За что</b><small>Основные направления</small></div></header><div class="finance-category-list">${categories.length ? categories.map(([name, amount]) => `<div><span>${esc(name)}</span><b>${fmt(amount)} ₽</b><small>${total ? Math.round(amount / total * 100) : 0}%</small></div>`).join('') : '<p>Нет данных</p>'}</div></section>
    <section class="finance-recipient-summary"><b>Кому</b>${recipients.length ? recipients.map((item) => `<span><i class="${item.name === 'Дани' ? 'dani' : 'tima'}"></i>${item.name}<strong>${fmt(item.total)} ₽</strong></span>`).join('') : '<small>Нет данных</small>'}</section>
  </div>`;
  bindFinancePeriod(renderFinanceAnalytics);
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
      <div class="finance-recipient-context" ${liquidFinance.target === 'reimbursement' ? '' : 'hidden'}>${financeRecipientButtons()}</div>
      <div class="liquid-composer"><button id="finance-attach" title="Фото">${liquidIcon('clip')}</button><input id="finance-photo" type="file" accept="image/*" hidden/><textarea id="finance-input" rows="1" placeholder="Сообщение"></textarea><button id="finance-send" class="liquid-send" hidden>${liquidIcon('send')}</button><button id="finance-mic" class="liquid-mic">${liquidIcon('mic')}</button></div></div></div>`;
  document.querySelectorAll('[data-fin-target]').forEach((button) => button.onclick = () => {
    if (liquidFinance.target === button.dataset.finTarget) return;
    liquidFinance.target = button.dataset.finTarget; liquidFinance.parsed = null;
    document.querySelector('[data-fin-target].active')?.classList.remove('active'); button.classList.add('active');
    const recipientContext = document.querySelector('.finance-recipient-context'); if (recipientContext) recipientContext.hidden = liquidFinance.target !== 'reimbursement';
  });
  document.querySelectorAll('[data-fin-recipient]').forEach((button) => button.onclick = () => selectFinanceRecipient(button.dataset.finRecipient));
  const input = document.getElementById('finance-input'); const send = document.getElementById('finance-send'); const mic = document.getElementById('finance-mic');
  const updateSend = () => { send.hidden = !input.value.trim(); mic.hidden = !!input.value.trim(); };
  input.oninput = updateSend;
  const parseEntry = async (text, image) => {
    const cleaned = String(text || '').trim(); if (!cleaned && !image) return;
    liquidFinance.userRaw = cleaned || 'Фото'; liquidFinance.parsing = true; liquidFinance.parsed = null; liquidFinance.saved = null; renderFinanceAdd();
    try {
      const result = await api('POST', '/reimbursements/parse', { text: cleaned, image, preferredKind: liquidFinance.target === 'reimbursement' ? 'reimbursement' : 'debt', preferredRecipient: liquidFinance.recipient });
      liquidFinance.parsed = result.parsed || {};
      if (liquidFinance.target === 'reimbursement') {
        // The selected context is authoritative: "Компания" can never be
        // accidentally reclassified by the parser as a personal debt.
        liquidFinance.parsed.kind = 'reimbursement'; liquidFinance.parsed.company = liquidFinance.parsed.company || 'Компания'; delete liquidFinance.parsed.direction;
        selectFinanceRecipient(liquidFinance.parsed.recipient || liquidFinance.recipient);
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
        const result = await api('POST', '/debts', { amount, counterparty, direction: parsed.direction || liquidFinance.target, recipient: liquidFinance.recipient, note: document.getElementById('f-note').value.trim(), occurred_at: parsed.occurred_at || null });
        liquidFinance.saved = { title: result.debt.counterparty, amount: result.debt.amount }; liquidFinance.debts.unshift(result.debt);
      } else {
        const result = await api('POST', '/reimbursements', { amount, purpose: document.getElementById('f-purpose').value.trim(), merchant: document.getElementById('f-merchant').value.trim(), company: document.getElementById('f-company').value.trim() || 'Компания', recipient: liquidFinance.recipient, note: document.getElementById('f-note').value.trim(), occurred_at: parsed.occurred_at || null, source: 'assistant', raw_input: liquidFinance.userRaw });
        liquidFinance.saved = { title: result.reimbursement.purpose, amount: result.reimbursement.amount }; liquidFinance.reimbursements.unshift(result.reimbursement);
      }
      liquidFinance.parsed = null; liquidFinance.userRaw = ''; renderFinanceAdd();
    } catch (error) { toast('Не сохранилось', error.message, 'warn'); }
  };
}
function renderFinanceBody() {
  if (liquidFinance.tab === 'list') renderFinanceList();
  else if (liquidFinance.tab === 'analytics') renderFinanceAnalytics();
  else renderFinanceAdd();
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
    <nav class="liquid-tabs finance-main-tabs" data-active="${liquidFinance.tab}"><button data-fin-tab="add" class="${liquidFinance.tab === 'add' ? 'active' : ''}">Записать</button><button data-fin-tab="list" class="${liquidFinance.tab === 'list' ? 'active' : ''}">Список</button><button data-fin-tab="analytics" class="${liquidFinance.tab === 'analytics' ? 'active' : ''}">Аналитика</button></nav></header>
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
