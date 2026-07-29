// Проекты — витрина рабочих и личных продуктов с быстрым доступом к серверу, базе и папке.

import { $, $$, copyText, esc, state } from "./core.js";

export const PROJECTS = [
  { id: "noda", name: "Noda", category: "Мобильный и ПК-компаньон", group: "personal", icon: "assets/noda.png", description: "Телефон, ноутбук, сервер и компьютер в одном рабочем контуре.", stack: "Electron · Expo · WebSocket", url: "https://github.com/arra123/arra-app/releases/latest", screens: ["assets/screens/noda/01.webp", "assets/screens/noda/02.webp", "assets/screens/noda/03.webp"], connection: { server: "ssh root@5.42.122.102", database: "PostgreSQL · default_db · schema apple", path: "C:\\Claude\\Tima\\07_Appstore · /opt/aura" } },
  { id: "vpn", name: "Arra VPN", category: "Windows-приложение", group: "personal", icon: "assets/projects/arra-vpn-v3.png", description: "Личный VPN с раздельной маршрутизацией программ и доменов.", stack: "Tauri · React · sing-box", url: "https://arratima.ru/vpn/", screens: ["assets/screens/vpn/01.webp", "assets/screens/vpn/02.webp"], connection: { server: "Локальное Windows-приложение", database: "Локальная конфигурация", path: "C:\\Claude\\Tima\\01_ARRA_VPN" } },
  { id: "macropad", name: "Macropad", category: "Веб-пульт", group: "personal", icon: "assets/projects/macropad.png", description: "Быстрый запуск приложений, команд и рабочих сценариев.", stack: "HTML · CSS · JavaScript", url: "https://macropad.5.42.122.102.sslip.io/", screens: ["assets/screens/macropad/01.webp", "assets/screens/macropad/02.webp", "assets/screens/macropad/03.webp"], connection: { server: "https://macropad.5.42.122.102.sslip.io", database: "Без базы данных", path: "C:\\Claude\\Tima\\11_macropad" } },
  { id: "bembox", name: "bembox", category: "Доставка у дома", group: "work", icon: "assets/projects/bembox-official.svg", description: "Соседская доставка кофе, воды и продуктов без звонков.", stack: "Next.js · Drizzle · PostgreSQL", url: "https://bembox.ru", screens: ["assets/screens/bembox/01.webp", "assets/screens/bembox/02.webp", "assets/screens/bembox/03.webp"], phone: true, connection: { server: "ssh root@5.42.102.133", database: "PostgreSQL · schema bemboks", path: "C:\\Claude\\Work\\1_BemApp" } },
  { id: "sklad", name: "GRAсклад", category: "Складская система", group: "work", icon: "assets/generated/sklad-v2.png", description: "Остатки, сканирование, перемещения и производственные задачи.", stack: "React · Express · PostgreSQL", url: "http://147.45.97.155/sklad", screens: ["assets/screens/sklad/01.webp", "assets/screens/sklad/02.webp", "assets/screens/sklad/03.webp"], connection: { server: "ssh root@147.45.97.155 · PM2 c-site · 3017", database: "PostgreSQL · bd2 · 5.42.100.180 · *_s", path: "C:\\Claude\\Work\\08_Sklad · /var/www/bem-dev.ru/sklad" } },
  { id: "staff", name: "Сотрудники", category: "HR-портал", group: "work", icon: "assets/projects/sotrudniki.png", description: "Команда, табель, расчёт выплат, роли и доступы.", stack: "React · Express · PostgreSQL", url: "http://147.45.97.155/sotrudniki/", screens: ["assets/screens/staff/01.webp", "assets/screens/staff/02.webp", "assets/screens/staff/03.webp"], connection: { server: "ssh root@147.45.97.155 · backend 3025", database: "PostgreSQL · bd2 · 5.42.100.180", path: "C:\\Claude\\Work\\09_Sotrudniki · /var/www/bem-dev.ru/sotrudniki" } },
  { id: "knowledge", name: "KnowledgeBase", category: "База знаний", group: "work", icon: "assets/generated/knowledgebase-v2.png", description: "Документы, видео и бизнес-процессы компании.", stack: "React · TipTap · PostgreSQL", url: "http://147.45.97.155/knowledgeBase/", screens: ["assets/screens/knowledge/01.webp", "assets/screens/knowledge/02.webp", "assets/screens/knowledge/03.webp"], connection: { server: "ssh root@147.45.97.155 · PM2 knowledgebase · 3026", database: "PostgreSQL · bd2", path: "C:\\Claude\\Work\\06_KnowledgeBase · /var/www/bem-dev.ru/knowledgeBase" } },
  { id: "pvz", name: "PVZ", category: "Аналитика локаций", group: "work", icon: "assets/projects/pvz.png", description: "Аренда, конкуренты и скоринг локаций на одной карте.", stack: "Node.js · Playwright · Leaflet", url: "https://pvz.5.42.122.102.sslip.io/", screens: ["assets/screens/pvz/01.webp", "assets/screens/pvz/02.webp", "assets/screens/pvz/03.webp"], connection: { server: "План: ssh root@89.23.98.109", database: "PostgreSQL · default_db · 77.233.222.107 · m_*", path: "C:\\Claude\\Work\\07_PVZ" } },
  { id: "cards", name: "Карточки", category: "Контент-инструмент", group: "work", icon: "assets/projects/cards.png", description: "Создание и подготовка товарных карточек для маркетплейсов.", stack: "Node.js · GPT · Sharp", url: "http://5.42.122.102:3033/", screens: ["assets/screens/cards/01.webp"], connection: { server: "ssh root@5.42.122.102 · graflab-cards.service · 3033", database: "PostgreSQL · default_db · 77.233.222.107 · c_*", path: "C:\\Claude\\Work\\03_cards" } },
  { id: "graflab", name: "GRAFLAB", category: "Интернет-магазин", group: "work", icon: "assets/projects/graflab.png", description: "Европейский магазин линейки GRAFLAB Buds.", stack: "SvelteKit · Drizzle · PostgreSQL", url: "https://graflab.5.42.122.102.sslip.io/", screens: ["assets/screens/graflab/01.webp"], connection: { server: "https://graflab.5.42.122.102.sslip.io", database: "PostgreSQL · bd2 · 5.42.100.180 · g_*", path: "C:\\Claude\\Work\\04_graflab-buds-eu" } },
  { id: "grahub", name: "GRAFLAB Hub", category: "Chrome-расширение", group: "work", icon: "assets/projects/graflab.png", description: "Быстрый вход во внутренние сервисы компании.", stack: "Chrome MV3 · Service Worker", url: "https://extension.5.42.122.102.sslip.io/", screens: ["assets/screens/grahub/01.webp"], connection: { server: "https://extension.5.42.122.102.sslip.io", database: "Без базы данных", path: "C:\\Claude\\Work\\05_graflab-extension" } },
  { id: "bembox-locker", name: "bem.box", category: "Сервис локеров", group: "work", icon: "assets/projects/bembox.svg", description: "Локеры в подъездах как точка доступа к бытовым услугам.", stack: "HTML · CSS · JavaScript", url: "https://bem-box.5.42.122.102.sslip.io/", screens: ["assets/screens/bembox-locker/01.webp"], connection: { server: "https://bem-box.5.42.122.102.sslip.io", database: "Безопасные данные не найдены", path: "C:\\Claude\\Work\\02_bem-box" } },
];

state.selected = state.selected || PROJECTS[0];

export function openProjects() {
  render();
}

function visible() {
  const query = state.query.trim().toLocaleLowerCase("ru");
  return PROJECTS.filter((project) => (state.filter === "all" || project.group === state.filter)
    && (!query || `${project.name} ${project.category}`.toLocaleLowerCase("ru").includes(query)));
}

function render() {
  const project = state.selected;
  const list = visible();
  $("#workPanel").innerHTML = `
    <div class="view view-case">
      <section class="hero screen">
        <div class="hero-info">
          <div class="hero-head"><img src="${project.icon}" alt="" loading="lazy"><div><p>${esc(project.category)}</p><h1>${esc(project.name)}</h1></div></div>
          <p class="hero-text">${esc(project.description)}</p>
          <div class="hero-stack">${esc(project.stack)}</div>
          <div class="hero-actions">
            <button class="key" data-copy="server">Сервер</button>
            <button class="key" data-copy="database">База данных</button>
            <button class="key" data-copy="path">Папка</button>
            <a class="key light" href="${project.url}" target="_blank" rel="noreferrer">Открыть ↗</a>
          </div>
        </div>
        <div class="hero-screens${project.phone ? " phone" : ""}">
          ${project.screens.slice(0, project.phone ? 3 : 2).map((src, index) => `<figure data-screen="${index}"><img src="${src}" alt="" loading="lazy" decoding="async"></figure>`).join("")}
        </div>
      </section>
      <div class="case">
        <div class="case-rail"><i></i><span>ПРОЕКТЫ</span><i></i></div>
        <div class="tiles">
          ${list.length ? list.map((item) => `
            <button class="tile${item.id === project.id ? " active" : ""}" data-project="${item.id}">
              <img src="${item.icon}" alt="" loading="lazy" decoding="async">
              <span><strong>${esc(item.name)}</strong><small>${esc(item.category)}</small></span>
            </button>`).join("") : '<div class="empty-block">Ничего не найдено</div>'}
        </div>
      </div>
    </div>`;

  $$("[data-project]").forEach((button) => button.addEventListener("click", () => {
    state.selected = PROJECTS.find((item) => item.id === button.dataset.project) || state.selected;
    render();
  }));
  $$("[data-copy]").forEach((button) => button.addEventListener("click", () => {
    copyText(state.selected.connection[button.dataset.copy], `${button.textContent} — скопировано`);
  }));
  $$("[data-screen]").forEach((figure) => figure.addEventListener("click", () => openLightbox(project.screens, Number(figure.dataset.screen))));
}

export function refreshProjectGrid() {
  if (state.section === "projects") render();
}

/* ---------- просмотр скриншотов ---------- */

let lightboxScreens = [];
let lightboxIndex = 0;

function openLightbox(screens, index) {
  lightboxScreens = screens;
  lightboxIndex = index;
  const dialog = $("#lightbox");
  showImage();
  dialog.showModal();
}

function showImage() {
  $("#lightboxImage").src = lightboxScreens[lightboxIndex];
  $("#lightboxCount").textContent = `${lightboxIndex + 1} / ${lightboxScreens.length}`;
}

export function wireLightbox() {
  const dialog = $("#lightbox");
  $(".lightbox-close").addEventListener("click", () => dialog.close());
  $(".lightbox-prev").addEventListener("click", () => { lightboxIndex = (lightboxIndex - 1 + lightboxScreens.length) % lightboxScreens.length; showImage(); });
  $(".lightbox-next").addEventListener("click", () => { lightboxIndex = (lightboxIndex + 1) % lightboxScreens.length; showImage(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open) return;
    if (event.key === "ArrowLeft") { lightboxIndex = (lightboxIndex - 1 + lightboxScreens.length) % lightboxScreens.length; showImage(); }
    if (event.key === "ArrowRight") { lightboxIndex = (lightboxIndex + 1) % lightboxScreens.length; showImage(); }
  });
}
