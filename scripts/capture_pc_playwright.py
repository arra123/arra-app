import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "pc-app" / "renderer" / "index.html"
OUT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / ".audit-pc-playwright").resolve()
SECTIONS = sys.argv[2:] or ["fin", "sync", "notes", "chat", "remote"]

STUB = """
(() => {
  const noop = () => {};
  const ok = async (value = {}) => ({ ok: true, ...value });
  const debts = [
    { id: 'd1', counterparty: 'Компания', amount: 11619, direction: 'owes_me', note: '[Тима] Каршеринг · City Drive + Делимобиль + BelkaCar', occurred_at: new Date().toISOString(), settled: false },
    { id: 'd2', counterparty: 'Компания', amount: 20582, direction: 'owes_me', note: '[Тима] OpenAI', occurred_at: new Date().toISOString(), settled: false },
  ];
  const notes = [
    { id: 'n1', title: 'Идеи для Noda', body: 'Упростить передачу между ноутбуком и ПК.', updated_at: new Date().toISOString() },
    { id: 'n2', title: 'На этой неделе', body: 'Проверить обновление ПК.', updated_at: new Date().toISOString() },
  ];
  const messages = [
    { id: 'm1', role: 'user', content: 'Запиши компенсацию 824 рубля за BelkaCar' },
    { id: 'm2', role: 'assistant', content: 'Записал: BelkaCar · 824 ₽ · компания должна Тиме.' },
  ];
  let syncListener = () => {};
  const syncStatus = {
    type: 'status', localFiles: 36722, remoteFiles: 36647,
    upload: 150, download: 1, conflicts: 0, blocked: 0, elapsed: 4,
    projects: [
      { name: '@codex-sessions', label: 'Codex · продолжение сессий', scope: 'codex-sessions', upload: 5, download: 0, conflicts: 0, uploadBytes: 100768154, downloadBytes: 0, localFiles: 78, remoteFiles: 77, folders: [] },
      { name: 'Work/03_cards', label: '03_cards', scope: 'projects', upload: 73, download: 0, conflicts: 0, uploadBytes: 18979225, downloadBytes: 0, localFiles: 7659, remoteFiles: 7582, folders: [{ name: 'output', files: 73, bytes: 18979225, blocked: 0 }] },
      { name: 'Tima/07_Appstore', label: '07_Appstore', scope: 'projects', upload: 15, download: 0, conflicts: 0, uploadBytes: 1258291, downloadBytes: 0, localFiles: 2010, remoteFiles: 1995, folders: [{ name: 'pc-app', files: 15, bytes: 1258291, blocked: 0 }] },
      { name: '@codex-config', label: 'Codex · настройки и навыки', scope: 'codex-config', upload: 57, download: 1, conflicts: 0, uploadBytes: 1048576, downloadBytes: 3610, localFiles: 101, remoteFiles: 102, folders: [] },
    ],
    scopes: [
      { id: 'projects', label: 'Проекты', localFiles: 35174, remoteFiles: 34940, upload: 88, download: 0, conflicts: 0 },
      { id: 'codex-sessions', label: 'Codex · активные сессии', localFiles: 78, remoteFiles: 77, upload: 5, download: 0, conflicts: 0 },
      { id: 'codex-config', label: 'Codex · настройки и навыки', localFiles: 101, remoteFiles: 102, upload: 57, download: 1, conflicts: 0 },
    ],
    serverState: {
      lastPush: { at: '2026-07-27T15:47:38Z', device: 'Ноутбук · arra', role: 'laptop', files: 776, bytes: 1166258603 },
      lastPull: { at: '2026-07-27T16:12:22Z', device: 'Компьютер · Tima', role: 'pc', files: 780, bytes: 1542263558 },
      devices: {},
    },
  };
  const api = async (_method, endpoint) => {
    if (endpoint.startsWith('/pc/tokens')) return { ok: true, data: { tokens: [
      { id: 'laptop-1', name: 'Ноутбук', online: true, role: 'laptop' },
      { id: 'pc-1', name: 'Компьютер', online: true, role: 'pc' },
    ] } };
    if (endpoint.startsWith('/debts')) return { ok: true, data: { debts } };
    if (endpoint.startsWith('/notes')) return { ok: true, data: { notes } };
    if (endpoint.startsWith('/ai/messages')) return { ok: true, data: { messages } };
    if (endpoint.startsWith('/files')) return { ok: true, data: { files: [] } };
    return { ok: true, data: {} };
  };
  window.arra = new Proxy({
    api,
    getStatus: async () => ({
      paired: true, hasAuth: true, online: true, folder: 'C:\\\\Claude',
      mode: 'path', deviceId: 'pc-1', deviceName: 'Компьютер',
      deviceProfile: { role: 'pc' },
    }),
    appVersion: async () => '1.17.3',
    getHistory: async () => [],
    getCodeRoot: async () => 'C:\\\\Claude',
    transcribe: async () => ({ ok: true, text: 'Тестовая расшифровка' }),
    remoteScreenSend: ok, remoteSync: ok, sync: ok, syncScan: ok,
    onSyncEvent: (listener) => { syncListener = listener; },
    syncRun: async () => {
      setTimeout(() => syncListener({ type: 'scan', side: 'local', scope: 'Проекты', files: 21420, dirs: 4011, msg: 'Сканирую этот компьютер · Проекты' }), 80);
      setTimeout(() => syncListener(syncStatus), 420);
      return true;
    },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (String(prop).startsWith('on')) return noop;
      return async () => ({ ok: true });
    }
  });
})();
"""


OUT_DIR.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
    page.add_init_script(STUB)
    page.goto(RENDERER.as_uri(), wait_until="networkidle")

    # Имитируем старую сохранённую тёмную тему и убеждаемся, что новая версия
    # всё равно открывается в основном светлом дизайне.
    page.evaluate("localStorage.setItem('arra-theme', 'dark')")
    page.reload(wait_until="networkidle")
    page.wait_for_selector("[data-s='fin']")
    assert page.locator("body").get_attribute("data-theme") != "dark"

    saved = []
    for section in SECTIONS:
        page.locator(f"[data-s='{section}']").click()
        page.wait_for_timeout(1200 if section == "sync" else 500)
        output = OUT_DIR / f"pc-{section}.png"
        page.screenshot(path=str(output), full_page=False)
        saved.append(str(output))

    if "sync" in SECTIONS:
        page.locator("[data-s='sync']").click()
        page.wait_for_selector(".sync-codex-policy")
        policy = page.locator(".sync-codex-policy").inner_text()
        assert "активные диалоги переносятся" in policy
        assert "Архивные диалоги остаются" in policy

    print(json.dumps({"theme": "light", "screenshots": saved}, ensure_ascii=False))
    browser.close()
