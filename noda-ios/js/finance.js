// Финансы — экран в стиле «Кошелька»: крупная сумма, листание периодов, группы по дням.

import { $, $$, api, dayTitle, esc, money, startOfDay, startOfMonth, startOfWeek, state, timeOf, toast } from "./core.js";
import { entryCategory, entryIcon } from "./merchants.js";
import { chevron, confirmSheet, group, setNav, sheet } from "./ui.js";
import { dictate } from "./voice.js";

const PEOPLE = ["Тима", "Даня", "Женя"];
const CARS = [
  { name: "Ситидрайв", icon: "citydrive" },
  { name: "Делимобиль", icon: "delimobil" },
  { name: "БелкаКар", icon: "belkacar" },
  { name: "Яндекс Драйв", icon: "yandexdrive" },
];

const personOf = (debt) => String(debt.note || "").match(/\[(Тима|Даня|Женя)\]/)?.[1] || "Тима";
const purposeOf = (debt) => String(debt.note || "").replace(/\[(Тима|Даня|Женя)\]/, "").trim();
const dateOf = (debt) => new Date(debt.occurred_at || debt.created_at || Date.now());
const searchText = (debt) => `${/компан/i.test(debt.counterparty || "") ? "" : debt.counterparty || ""} ${purposeOf(debt)}`.trim();

function periodRange() {
  const anchor = state.financeAnchor;
  if (state.financeMode === "month") {
    const from = startOfMonth(anchor);
    return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) };
  }
  const from = startOfWeek(anchor);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  return { from, to };
}

function periodTitle() {
  const { from, to } = periodRange();
  if (state.financeMode === "month") {
    const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(from);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const last = new Date(to.getTime() - 86400000);
  const sameMonth = from.getMonth() === last.getMonth();
  const left = new Intl.DateTimeFormat("ru-RU", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" }).format(from);
  const right = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(last);
  return `${left} — ${right}`;
}

export async function openFinance() {
  setNav({
    title: "Финансы",
    right: `<button class="btn" data-car>Каршеринг</button>
            <button class="btn" data-add><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Запись</button>
            <button class="btn mic" data-voice aria-label="Продиктовать"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>`,
  });
  $("#screen").innerHTML = '<div class="loading">Загружаю…</div>';
  wireNav();
  await reload();
}

function wireNav() {
  $("[data-add]")?.addEventListener("click", () => entrySheet(null));
  $("[data-voice]")?.addEventListener("click", voiceEntry);
  $("[data-car]")?.addEventListener("click", carSheet);
}

async function reload() {
  try {
    const data = await api("/debts?all=true");
    const all = data.debts || [];
    state.debts = all.filter((debt) => debt.direction !== "i_owe");
    state.myDebts = all.filter((debt) => debt.direction === "i_owe" && !debt.settled);
    render();
  } catch (error) {
    $("#screen").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}

const sum = (list) => list.reduce((acc, debt) => acc + Number(debt.amount || 0), 0);

function render() {
  const { from, to } = periodRange();
  const inPeriod = state.debts
    .filter((debt) => { const date = dateOf(debt); return date >= from && date < to; })
    .sort((a, b) => dateOf(b) - dateOf(a));
  const waiting = inPeriod.filter((debt) => !debt.settled);
  const returned = inPeriod.filter((debt) => debt.settled);
  const unpaid = state.debts.filter((debt) => !debt.settled);
  const total = sum(unpaid);
  const people = state.financeView === "people";

  const days = new Map();
  for (const debt of inPeriod) {
    const key = startOfDay(dateOf(debt)).getTime();
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(debt);
  }

  const oldest = unpaid.length ? new Date(Math.min(...unpaid.map((debt) => dateOf(debt)))) : null;

  $("#screen").innerHTML = `
    <div class="screen-inner enter">
      <div class="summary">
        <div>
          <b>${money(people ? total : sum(waiting))}</b>
          <span>${people
            ? `не вернули · ${unpaid.length} ${plural(unpaid.length, "запись", "записи", "записей")}${oldest ? ` · самая давняя от ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(oldest)}` : ""}`
            : sum(waiting) === total ? "ждёт возврата" : `за период · всего висит ${money(total)}`}</span>
        </div>
        <div class="right">
          ${people ? "" : `
          <div class="pager">
            <button data-shift="-1" aria-label="Раньше">‹</button>
            <strong>${esc(periodTitle())}</strong>
            <button data-shift="1" aria-label="Позже">›</button>
          </div>
          <div class="segmented">
            <button data-mode="week" class="${state.financeMode === "week" ? "active" : ""}">Неделя</button>
            <button data-mode="month" class="${state.financeMode === "month" ? "active" : ""}">Месяц</button>
          </div>`}
          <div class="segmented">
            <button data-view="period" class="${people ? "" : "active"}">По датам</button>
            <button data-view="people" class="${people ? "active" : ""}">Кто должен</button>
          </div>
        </div>
      </div>

      ${people ? peopleList(unpaid) : `
        ${days.size ? [...days.entries()].map(([key, items]) => dayGroup(key, items)).join("")
          : '<div class="empty">За этот период записей нет<span>Пролистай стрелками или добавь новую</span></div>'}
        ${returned.length ? `<div class="group-note" style="padding-top:14px">За период вернули ${money(sum(returned))}</div>` : ""}`}
    </div>`;

  $$("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.financeView = button.dataset.view;
    localStorage.setItem("noda_fin_view", state.financeView);
    render();
  }));
  $$("[data-person-toggle]").forEach((button) => button.addEventListener("click", (event) => {
    if (event.target.closest("[data-settle]") || event.target.closest("[data-entry]")) return;
    button.closest(".person").classList.toggle("open");
  }));

  $$("[data-shift]").forEach((button) => button.addEventListener("click", () => {
    const anchor = new Date(state.financeAnchor);
    const step = Number(button.dataset.shift);
    if (state.financeMode === "month") anchor.setMonth(anchor.getMonth() + step);
    else anchor.setDate(anchor.getDate() + step * 7);
    state.financeAnchor = anchor;
    render();
  }));
  $$("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    state.financeMode = button.dataset.mode;
    localStorage.setItem("noda_fin_mode", state.financeMode);
    render();
  }));
    $$("[data-entry]").forEach((cell) => cell.addEventListener("click", (event) => {
    if (event.target.closest("[data-settle]")) return;
    const debt = state.debts.find((item) => String(item.id) === String(cell.dataset.entry));
    if (debt) entrySheet(debt);
  }));
  $$("[data-settle]").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const debt = state.debts.find((item) => String(item.id) === String(button.dataset.settle));
    if (!debt) return;
    button.classList.toggle("on");
    try {
      await api(`/debts/${debt.id}`, { method: "PATCH", body: JSON.stringify({ settled: !debt.settled }) });
      await reload();
    } catch (error) { toast(error.message); }
  }));
}

/* ---------- кто должен ---------- */

const plural = (count, one, few, many) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

/** Группируем невозвращённое по тому, кто должен: компания, сервис, человек. */
function peopleList(unpaid) {
  const mine = state.myDebts || [];
  const owed = groupByCounterparty(unpaid);
  if (!unpaid.length && !mine.length) return '<div class="empty">Все долги закрыты<span>Никто ничего не должен</span></div>';
  return `
    ${owed}
    ${mine.length ? `<div class="group-title" style="padding:18px 4px 8px">Я должен · ${money(sum(mine))}</div>${groupByCounterparty(mine)}` : ""}`;
}

function groupByCounterparty(unpaid) {
  if (!unpaid.length) return "";
  const groups = new Map();
  for (const debt of unpaid) {
    const key = (debt.counterparty || "Без имени").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(debt);
  }
  const rows = [...groups.entries()]
    .map(([name, items]) => ({ name, items: items.sort((a, b) => dateOf(b) - dateOf(a)), total: sum(items) }))
    .sort((a, b) => b.total - a.total);

  return `<div class="people">${rows.map((row) => {
    const last = dateOf(row.items[0]);
    return `
      <div class="person">
        <button class="person-head" data-person-toggle="${esc(row.name)}">
          ${entryIcon(`${row.name} ${purposeOf(row.items[0])}`, 40)}
          <span><strong>${esc(row.name)}</strong><small>${row.items.length} ${plural(row.items.length, "запись", "записи", "записей")} · последняя ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(last)}</small></span>
          <span class="sum">${money(row.total)}</span>
          <span class="caret">${chevron}</span>
        </button>
        <div class="person-body"><div>${row.items.map(cell).join("")}</div></div>
      </div>`;
  }).join("")}</div>`;
}

function dayGroup(key, items) {
  const daySum = items.filter((debt) => !debt.settled).reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
  return group(`${dayTitle(Number(key))} · ${daySum ? money(daySum) : "закрыто"}`, items.map(cell).join(""));
}

function cell(debt) {
  const purpose = purposeOf(debt);
  const named = debt.counterparty && !/компан/i.test(debt.counterparty);
  const title = named ? debt.counterparty : (purpose || "Без названия");
  const subtitle = named ? (purpose || entryCategory(searchText(debt))) : entryCategory(searchText(debt));
  const person = personOf(debt);
  return `
    <div class="cell${debt.settled ? " settled" : ""}" data-entry="${debt.id}" role="button" tabindex="0">
      ${entryIcon(searchText(debt), 38)}
      <span class="cell-main"><strong>${esc(title)}</strong><small>${esc(`должен ${debt.counterparty || "Компания"}`)}${subtitle ? ` · ${esc(subtitle)}` : ""}${person !== "Тима" ? ` · платил ${esc(person)}` : ""} · ${timeOf(dateOf(debt))}</small></span>
      <span style="display:flex;align-items:center;gap:10px">
        <span class="cell-value strong">${money(debt.amount)}</span>
        <button class="check${debt.settled ? " on" : ""}" data-settle="${debt.id}" aria-label="Вернули"><svg viewBox="0 0 24 24"><path d="m5 13 4 4 10-10"/></svg></button>
      </span>
    </div>`;
}

/* ---------- быстрый каршеринг ---------- */

function carSheet() {
  const last = localStorage.getItem("noda_last_car") || CARS[0].name;
  sheet({
    title: "Каршеринг",
    body: `
      <div class="picker">
        ${CARS.map((car) => `<button class="pick${car.name === last ? " active" : ""}" data-car-name="${esc(car.name)}">
          <span class="ic ic-brand" style="--ic:34px"><img src="assets/merchants/${car.icon}.png" alt=""></span>${esc(car.name)}</button>`).join("")}
      </div>
      <label class="field"><span>Сумма</span><input id="carAmount" type="number" inputmode="numeric" min="1" placeholder="480" autofocus></label>
      <div class="sheet-actions"><button class="btn primary big" id="carSave">Записать</button></div>`,
    onMount(layer, close) {
      let picked = last;
      $$("[data-car-name]", layer).forEach((tile) => tile.addEventListener("click", () => {
        picked = tile.dataset.carName;
        $$("[data-car-name]", layer).forEach((item) => item.classList.toggle("active", item === tile));
        $("#carAmount", layer).focus();
      }));
      $("#carSave", layer).addEventListener("click", async () => {
        const amount = Number($("#carAmount", layer).value);
        if (!amount) { toast("Впиши сумму"); return; }
        localStorage.setItem("noda_last_car", picked);
        try {
          await api("/debts", {
            method: "POST",
            body: JSON.stringify({ counterparty: picked, note: "[Тима] Каршеринг", amount, direction: "owes_me", occurred_at: new Date().toISOString() }),
          });
          close();
          toast(`${picked} · ${money(amount)}`);
          state.financeAnchor = new Date();
          await reload();
        } catch (error) { toast(error.message); }
      });
    },
  });
}

/* ---------- голосом ---------- */

async function voiceEntry() {
  const text = await dictate({ hint: "Например: «Ситидрайв 1200 за каршеринг вчера»" });
  if (!text) return;
  let parsed = null;
  try {
    const data = await api("/ai/text", { method: "POST", body: JSON.stringify({ text, save: false }) });
    parsed = data.parsed || null;
  } catch (error) { toast(error.message); }
  entrySheet(null, {
    heard: text,
    draft: {
      counterparty: parsed?.merchant || parsed?.counterparty || "",
      purpose: parsed?.merchant && parsed?.title ? parsed.title : (parsed?.category || text),
      amount: parsed?.amount || "",
      occurred_at: parsed?.occurred_at || new Date().toISOString(),
    },
  });
}

/* ---------- карточка записи ---------- */

function localValue(iso) {
  const date = new Date(iso || Date.now());
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function entrySheet(debt, { heard = "", draft = null, onSaved = null } = {}) {
  const values = debt
    ? { counterparty: debt.counterparty || "", purpose: purposeOf(debt), amount: debt.amount, occurred_at: dateOf(debt).toISOString(), person: personOf(debt) }
    : { counterparty: draft?.counterparty || "", purpose: draft?.purpose || "", amount: draft?.amount || "", occurred_at: draft?.occurred_at || new Date().toISOString(), person: "Тима" };

  sheet({
    title: debt ? "Запись" : "Новая запись",
    body: `
      ${heard ? `<p style="margin:4px 0 2px;color:var(--label-2);font-size:14px">Услышал: «${esc(heard)}»</p>` : ""}
      <label class="field"><span>Кто</span><input name="counterparty" value="${esc(values.counterparty)}" placeholder="Ситидрайв, Озон…"></label>
      <label class="field"><span>За что</span><input name="purpose" value="${esc(values.purpose)}" placeholder="Каршеринг до офиса"></label>
      <label class="field"><span>Сумма</span><input name="amount" type="number" inputmode="numeric" min="1" value="${esc(values.amount)}"></label>
      <label class="field"><span>Когда</span><input name="occurred_at" type="datetime-local" value="${localValue(values.occurred_at)}"></label>
      <label class="field"><span>Кто платил</span>
        <span class="segmented">${PEOPLE.map((name) => `<button type="button" data-person="${name}" class="${values.person === name ? "active" : ""}">${name}</button>`).join("")}</span>
      </label>
      <div class="sheet-actions">
        <button class="btn primary big" data-save>Сохранить</button>
        ${debt ? '<button class="btn big danger" data-delete>Удалить</button>' : ""}
      </div>`,
    onMount(layer, close) {
      let person = values.person;
      const field = (name) => $(`[name="${name}"]`, layer);
      $$("[data-person]", layer).forEach((button) => button.addEventListener("click", () => {
        person = button.dataset.person;
        $$("[data-person]", layer).forEach((item) => item.classList.toggle("active", item === button));
      }));

      $("[data-save]", layer).addEventListener("click", async () => {
        const amount = Number(field("amount").value);
        if (!amount) { toast("Укажи сумму"); return; }
        const body = {
          counterparty: field("counterparty").value.trim() || "Компания",
          note: `[${person}] ${field("purpose").value.trim()}`.trim(),
          amount,
          direction: "owes_me",
          occurred_at: new Date(field("occurred_at").value).toISOString(),
        };
        try {
          const saved = await api(debt ? `/debts/${debt.id}` : "/debts", { method: debt ? "PATCH" : "POST", body: JSON.stringify(body) });
          close();
          state.financeAnchor = new Date(body.occurred_at);
          onSaved?.(saved.debt);
          if (state.section === "finance") await reload();
        } catch (error) { toast(error.message); }
      });

      $("[data-delete]", layer)?.addEventListener("click", async () => {
        const ok = await confirmSheet({ title: "Удалить запись?", text: `«${esc(debt.counterparty || purposeOf(debt))}» на ${money(debt.amount)} исчезнет во всех приложениях.`, confirmLabel: "Удалить", danger: true });
        if (!ok) return;
        try {
          await api(`/debts/${debt.id}`, { method: "DELETE" });
          close();
          if (state.section === "finance") await reload();
        } catch (error) { toast(error.message); }
      });
    },
  });
}
