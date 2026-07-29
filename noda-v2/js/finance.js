// Финансы — траты, которые нужно вернуть. Листается по неделям и месяцам, как выписка в банке.

import {
  $, $$, api, confirmAction, dayTitle, esc, money, openModal, startOfDay, startOfMonth, startOfWeek,
  state, timeOf, toast,
} from "./core.js";
import { brandSuggestions, entryCategory, entryIcon } from "./merchants.js";
import { dictate } from "./voice.js";

const PEOPLE = ["Тима", "Даня", "Женя"];

const personOf = (debt) => String(debt.note || "").match(/\[(Тима|Даня|Женя)\]/)?.[1] || "Тима";
const purposeOf = (debt) => String(debt.note || "").replace(/\[(Тима|Даня|Женя)\]/, "").trim();
const dateOf = (debt) => new Date(debt.occurred_at || debt.created_at || Date.now());
// «Компания» — служебное слово, для иконки оно бесполезно
const searchText = (debt) => `${/компан/i.test(debt.counterparty || "") ? "" : debt.counterparty || ""} ${purposeOf(debt)}`.trim();

/* ---------- период ---------- */

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

function isCurrentPeriod() {
  const { from, to } = periodRange();
  const now = Date.now();
  return now >= from.getTime() && now < to.getTime();
}

function shiftPeriod(direction) {
  const anchor = new Date(state.financeAnchor);
  if (state.financeMode === "month") anchor.setMonth(anchor.getMonth() + direction);
  else anchor.setDate(anchor.getDate() + direction * 7);
  state.financeAnchor = anchor;
  render();
}

/* ---------- загрузка ---------- */

export async function openFinance() {
  $("#workPanel").innerHTML = '<div class="view-loading">Загружаю…</div>';
  await reload(true);
}

async function reload(initial = false) {
  try {
    const data = await api("/debts?all=true");
    state.debts = (data.debts || []).filter((debt) => debt.direction !== "i_owe");
    render();
  } catch (error) {
    if (initial) $("#workPanel").innerHTML = `<div class="view-error">${esc(error.message)}</div>`;
    else toast(error.message, "warn");
  }
}

/* ---------- отрисовка ---------- */

function render() {
  const { from, to } = periodRange();
  const inPeriod = state.debts
    .filter((debt) => { const date = dateOf(debt); return date >= from && date < to; })
    .sort((a, b) => dateOf(b) - dateOf(a));
  const waiting = inPeriod.filter((debt) => !debt.settled);
  const returned = inPeriod.filter((debt) => debt.settled);
  const sum = (list) => list.reduce((total, debt) => total + Number(debt.amount || 0), 0);

  const days = new Map();
  for (const debt of inPeriod) {
    const key = startOfDay(dateOf(debt)).getTime();
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(debt);
  }

  $("#workPanel").innerHTML = `
    <div class="view">
      <div class="bar fin-bar">
        <div class="period">
          <button class="key square" data-shift="-1" aria-label="Раньше">‹</button>
          <strong>${esc(periodTitle())}</strong>
          <button class="key square" data-shift="1" aria-label="Позже">›</button>
        </div>
        <div class="seg">
          <button data-mode="week" class="${state.financeMode === "week" ? "active" : ""}">Неделя</button>
          <button data-mode="month" class="${state.financeMode === "month" ? "active" : ""}">Месяц</button>
        </div>
        ${isCurrentPeriod() ? "" : '<button class="key sm" data-today>Сегодня</button>'}
        <div class="fin-total">
          <b>${money(sum(waiting))}</b>
          <span>${waiting.length} шт${returned.length ? ` · вернули ${money(sum(returned))}` : ""}</span>
        </div>
        <div class="bar-spacer"></div>
        <button class="key" data-car>Каршеринг</button>
        <button class="key" data-add>＋ Запись</button>
        <button class="key mic-key" data-voice title="Продиктовать" aria-label="Продиктовать">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>
      </div>
      <div class="scroll">
        <div class="content">
          ${days.size ? groupBlocks(days) : empty()}
        </div>
      </div>
    </div>`;

  $$("[data-shift]").forEach((button) => button.addEventListener("click", () => shiftPeriod(Number(button.dataset.shift))));
  $("[data-today]")?.addEventListener("click", () => { state.financeAnchor = new Date(); render(); });
  $$("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    state.financeMode = button.dataset.mode;
    localStorage.setItem("noda_fin_mode", state.financeMode);
    render();
  }));
  $("[data-add]").addEventListener("click", () => openEntry(null));
  $("[data-car]").addEventListener("click", quickCarsharing);
  $("[data-voice]").addEventListener("click", voiceEntry);
  $$("[data-entry]").forEach((row) => row.addEventListener("click", () => {
    const debt = state.debts.find((item) => String(item.id) === String(row.dataset.entry));
    if (debt) openEntry(debt);
  }));
  $$("[data-settle]").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const debt = state.debts.find((item) => String(item.id) === String(button.dataset.settle));
    if (!debt) return;
    try {
      await api(`/debts/${debt.id}`, { method: "PATCH", body: JSON.stringify({ settled: !debt.settled }) });
      await reload();
    } catch (error) {
      toast(error.message, "warn");
    }
  }));
}

/** В режиме месяца дни собираются в недели с заметной шапкой — иначе стена одинаковых строк. */
function groupBlocks(days) {
  const entries = [...days.entries()];
  if (state.financeMode === "week") return entries.map(([key, items]) => dayBlock(key, items)).join("");

  const weeks = new Map();
  for (const [key, items] of entries) {
    const start = startOfWeek(Number(key)).getTime();
    if (!weeks.has(start)) weeks.set(start, []);
    weeks.get(start).push([key, items]);
  }
  return [...weeks.entries()].map(([start, days]) => {
    const all = days.flatMap(([, items]) => items);
    const open = all.filter((debt) => !debt.settled).reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
    return `
      <section class="week-block">
        <div class="week-head">
          <span class="week-mark"></span>
          <strong>${esc(weekTitle(start))}</strong>
          <span class="week-count">${all.length} шт</span>
          <b>${open ? money(open) : "всё закрыто"}</b>
        </div>
        ${days.map(([key, items]) => dayBlock(key, items)).join("")}
      </section>`;
  }).join("");
}

function weekTitle(start) {
  const from = new Date(start);
  const to = new Date(start);
  to.setDate(from.getDate() + 6);
  const sameMonth = from.getMonth() === to.getMonth();
  const left = new Intl.DateTimeFormat("ru-RU", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" }).format(from);
  const right = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(to);
  return `${left} — ${right}`;
}

function dayBlock(key, items) {
  const daySum = items.filter((debt) => !debt.settled).reduce((total, debt) => total + Number(debt.amount || 0), 0);
  return `
    <section class="day-block">
      <div class="day-head"><span>${esc(dayTitle(Number(key)))}</span><b>${daySum ? money(daySum) : "закрыто"}</b></div>
      <div class="rows">${items.map(entryRow).join("")}</div>
    </section>`;
}

function entryRow(debt) {
  const purpose = purposeOf(debt);
  const named = debt.counterparty && debt.counterparty !== "Компания";
  const title = named ? debt.counterparty : (purpose || "Без названия");
  const subtitle = named ? (purpose || entryCategory(searchText(debt))) : entryCategory(searchText(debt));
  const person = personOf(debt);
  return `
    <div class="row${debt.settled ? " settled" : ""}" data-entry="${debt.id}" role="button" tabindex="0">
      ${entryIcon(searchText(debt), 40)}
      <div class="row-main"><strong>${esc(title)}</strong><small>${esc(subtitle || "—")}</small></div>
      ${person !== "Тима" ? `<span class="row-who">${esc(person)}</span>` : ""}
      <span class="row-time">${timeOf(dateOf(debt))}</span>
      <strong class="row-sum">${money(debt.amount)}</strong>
      <button class="row-check${debt.settled ? " on" : ""}" data-settle="${debt.id}" aria-label="Вернули">
        <svg viewBox="0 0 24 24"><path d="m5 13 4 4 10-10"/></svg>
      </button>
    </div>`;
}

function empty() {
  return '<div class="empty-block">За этот период записей нет<span>Пролистай стрелками или добавь новую</span></div>';
}

/* ---------- быстрый каршеринг ---------- */

const CARS = [
  { name: "Ситидрайв", icon: "citydrive" },
  { name: "Делимобиль", icon: "delimobil" },
  { name: "БелкаКар", icon: "belkacar" },
  { name: "Яндекс Драйв", icon: "yandexdrive" },
];

/** 90 % записей — каршеринг: выбрал сервис, вписал сумму, всё остальное подставится само. */
function quickCarsharing() {
  const last = localStorage.getItem("noda_last_car") || CARS[0].name;
  openModal(`
    <h2>Каршеринг</h2>
    <div class="car-grid">
      ${CARS.map((car) => `
        <button type="button" class="car-tile${car.name === last ? " active" : ""}" data-car-name="${esc(car.name)}">
          <span class="ic ic-brand" style="--ic:38px"><img src="assets/merchants/${car.icon.includes(".") ? car.icon : `${car.icon}.png`}" alt=""></span>
          <b>${esc(car.name)}</b>
        </button>`).join("")}
    </div>
    <form class="form" id="carForm" style="margin-top:14px">
      <label class="field"><span>Сумма, ₽</span><input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="480" autofocus required></label>
      <div class="modal-actions">
        <button class="key" type="button" data-close>Отмена</button>
        <button class="key light" type="submit">Записать</button>
      </div>
    </form>`, {
    width: 430,
    onMount(layer, close) {
      let picked = last;
      $$("[data-car-name]", layer).forEach((tile) => tile.addEventListener("click", () => {
        picked = tile.dataset.carName;
        $$("[data-car-name]", layer).forEach((item) => item.classList.toggle("active", item === tile));
        $('input[name="amount"]', layer).focus();
      }));
      $("#carForm", layer).addEventListener("submit", async (event) => {
        event.preventDefault();
        const amount = Number($('input[name="amount"]', layer).value);
        if (!amount) { toast("Впиши сумму", "warn"); return; }
        localStorage.setItem("noda_last_car", picked);
        try {
          await api("/debts", {
            method: "POST",
            body: JSON.stringify({
              counterparty: picked,
              note: "[Тима] Каршеринг",
              amount,
              direction: "owes_me",
              occurred_at: new Date().toISOString(),
            }),
          });
          close();
          toast(`${picked} · ${money(amount)}`);
          state.financeAnchor = new Date();
          await reload();
        } catch (error) { toast(error.message, "warn"); }
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
  } catch (error) {
    toast(error.message, "warn");
  }
  openEntry(null, {
    heard: text,
    draft: {
      counterparty: parsed?.merchant || parsed?.counterparty || parsed?.title || "",
      purpose: parsed?.merchant && parsed?.title ? parsed.title : (parsed?.category || parsed?.note || text),
      amount: parsed?.amount || "",
      occurred_at: parsed?.occurred_at || new Date().toISOString(),
    },
  });
}

/* ---------- карточка записи ---------- */

function localInputValue(iso) {
  const date = new Date(iso || Date.now());
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** Открыть карточку записи снаружи (например из помощника). */
export function editEntry(debt, onSaved) {
  openEntry(debt, { onSaved });
}

function openEntry(debt, { heard = "", draft = null, onSaved = null } = {}) {
  const values = debt
    ? { counterparty: debt.counterparty || "", purpose: purposeOf(debt), amount: debt.amount, occurred_at: dateOf(debt).toISOString(), person: personOf(debt) }
    : { counterparty: draft?.counterparty || "", purpose: draft?.purpose || "", amount: draft?.amount || "", occurred_at: draft?.occurred_at || new Date().toISOString(), person: "Тима" };

  openModal(`
    <h2>${debt ? "Запись" : "Новая запись"}</h2>
    ${heard ? `<p class="heard">Услышал: «${esc(heard)}»</p>` : ""}
    <div class="preview" id="entryPreview"></div>
    <form id="entryForm" class="form">
      <label class="field"><span>Кто</span>
        <input name="counterparty" value="${esc(values.counterparty)}" autocomplete="off" placeholder="Ситидрайв, Озон, компания…">
        <div class="suggest" id="brandSuggest" hidden></div>
      </label>
      <label class="field"><span>За что</span>
        <span class="field-row">
          <input name="purpose" value="${esc(values.purpose)}" placeholder="Каршеринг до офиса">
          <button class="key square" type="button" data-dictate title="Продиктовать"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
        </span>
      </label>
      <div class="form-row">
        <label class="field"><span>Сумма, ₽</span><input name="amount" type="number" min="1" step="1" value="${esc(values.amount)}" required></label>
        <label class="field"><span>Когда</span><input name="occurred_at" type="datetime-local" value="${localInputValue(values.occurred_at)}" required></label>
      </div>
      <label class="field"><span>Кто платил</span>
        <span class="seg" id="personRow">${PEOPLE.map((name) => `<button type="button" data-person="${name}" class="${values.person === name ? "active" : ""}">${name}</button>`).join("")}</span>
      </label>
      <div class="modal-actions">
        ${debt ? '<button class="key" type="button" data-delete>Удалить</button>' : '<button class="key" type="button" data-close>Отмена</button>'}
        <button class="key light" type="submit">Сохранить</button>
      </div>
    </form>`, {
    width: 500,
    onMount(layer, close) {
      const form = $("#entryForm", layer);
      let person = values.person;

      const preview = () => {
        const text = `${form.counterparty.value} ${form.purpose.value}`;
        $("#entryPreview", layer).innerHTML = `${entryIcon(text, 44)}<div><strong>${esc(form.counterparty.value || form.purpose.value || "Новая запись")}</strong><small>${esc(entryCategory(text) || form.purpose.value || "—")}</small></div><b>${money(form.amount.value)}</b>`;
      };
      preview();
      form.addEventListener("input", preview);

      const suggest = $("#brandSuggest", layer);
      form.counterparty.addEventListener("input", () => {
        const items = brandSuggestions(form.counterparty.value);
        if (!items.length) { suggest.hidden = true; return; }
        suggest.hidden = false;
        suggest.innerHTML = items.map((item) => `<button type="button" data-pick="${esc(item.label)}">${entryIcon(item.file, 22)}<span>${esc(item.label)}</span><small>${esc(item.category)}</small></button>`).join("");
        $$("[data-pick]", suggest).forEach((button) => button.addEventListener("click", () => {
          form.counterparty.value = button.dataset.pick;
          suggest.hidden = true;
          preview();
        }));
      });
      form.counterparty.addEventListener("blur", () => setTimeout(() => { suggest.hidden = true; }, 150));

      $("[data-dictate]", layer).addEventListener("click", async () => {
        const text = await dictate({ hint: "Скажи, за что была трата" });
        if (text) { form.purpose.value = text; preview(); }
      });

      $$("[data-person]", layer).forEach((button) => button.addEventListener("click", () => {
        person = button.dataset.person;
        $$("[data-person]", layer).forEach((item) => item.classList.toggle("active", item === button));
      }));

      $("[data-delete]", layer)?.addEventListener("click", async () => {
        const ok = await confirmAction({
          title: "Удалить запись?",
          text: `«${esc(debt.counterparty || purposeOf(debt))}» на ${money(debt.amount)} исчезнет во всех приложениях.`,
          confirmLabel: "Удалить",
          danger: true,
        });
        if (!ok) return;
        try {
          await api(`/debts/${debt.id}`, { method: "DELETE" });
          close();
          if (state.section === "finance") await reload();
        } catch (error) { toast(error.message, "warn"); }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = {
          counterparty: form.counterparty.value.trim() || "Компания",
          note: `[${person}] ${form.purpose.value.trim()}`.trim(),
          amount: Number(form.amount.value),
          direction: "owes_me",
          occurred_at: new Date(form.occurred_at.value).toISOString(),
        };
        if (!body.amount) { toast("Укажи сумму", "warn"); return; }
        try {
          const saved = await api(debt ? `/debts/${debt.id}` : "/debts", { method: debt ? "PATCH" : "POST", body: JSON.stringify(body) });
          close();
          state.financeAnchor = new Date(body.occurred_at);
          if (onSaved) onSaved(saved.debt);
          if (state.section === "finance") await reload();
        } catch (error) { toast(error.message, "warn"); }
      });
    },
  });
}

/* ---------- клавиши ---------- */

export function financeKeys(event) {
  if (state.section !== "finance") return;
  if (document.querySelector(".modal-layer, .voice-panel")) return;
  if (event.target.matches("input, textarea, [contenteditable]")) return;
  if (event.key === "ArrowLeft") shiftPeriod(-1);
  if (event.key === "ArrowRight") shiftPeriod(1);
}
