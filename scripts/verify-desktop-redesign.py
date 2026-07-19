"""Headless visual smoke test for the desktop workspace shell."""

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "pc-app" / "renderer" / "index.html"
OUTPUT = Path(os.environ.get("NODA_SCREENSHOT", Path(os.environ.get("TEMP", ROOT)) / "noda-workspace.png"))
AUTH_OUTPUT = Path(os.environ.get("NODA_AUTH_SCREENSHOT", Path(os.environ.get("TEMP", ROOT)) / "noda-desktop-auth.png"))
SETTINGS_OUTPUT = Path(os.environ.get("NODA_SETTINGS_SCREENSHOT", Path(os.environ.get("TEMP", ROOT)) / "noda-settings.png"))
SECTION_OUTPUTS = {
    name: Path(os.environ.get("TEMP", ROOT)) / f"noda-desktop-{name}.png"
    for name in ("returns", "assistant", "notes", "files", "terminal", "sync", "remote")
}

PROJECTS = [
    {"name": "01_noda", "label": "Noda", "group": "Tima", "path": "C:\\Claude\\Tima\\07_Appstore", "kind": "javascript", "updatedAt": "2026-07-19T10:00:00.000Z"},
    {"name": "02_knowledge", "label": "Knowledge Base", "group": "RTeam", "path": "C:\\Claude\\RTeam\\02_knowledge", "kind": "python", "updatedAt": "2026-07-18T18:00:00.000Z"},
    {"name": "03_warehouse", "label": "Склад", "group": "RTeam", "path": "C:\\Claude\\RTeam\\03_warehouse", "kind": "dotnet", "updatedAt": "2026-07-17T12:00:00.000Z"},
]


INIT_SCRIPT = f"""
(() => {{
  const projects = {json.dumps(PROJECTS, ensure_ascii=False)};
  const callbacks = new Map();
  const status = {{
    paired: true,
    hasAuth: true,
    online: true,
    deviceId: 'test-device',
    deviceName: 'Ноутбук Тима',
    phoneOnline: true,
    deviceProfile: {{ role: 'laptop' }},
  }};
  const api = async (_method, path) => {{
    if (path === '/pc/tokens') return {{ ok: true, data: {{ tokens: [{{ id: 'test-device', name: 'Ноутбук Тима', online: true }}] }} }};
    if (path === '/ai/threads') return {{ ok: true, data: {{ threads: [{{ thread_key: 'project:01_noda', title: 'Продолжить редизайн Noda', project_name: 'Noda' }}, {{ thread_key: 'task:test', title: 'План локальных моделей' }}] }} }};
    if (path === '/ai/messages') return {{ ok: true, data: {{ messages: [] }} }};
    if (path.startsWith('/reimbursements')) return {{ ok: true, data: {{ reimbursements: [
      {{ id: 'r1', amount: 633, purpose: 'Каршеринг', merchant: 'City Drive', company: 'Компания', recipient: 'Тима', status: 'pending', occurred_at: '2026-07-19T07:00:00.000Z' }},
      {{ id: 'r2', amount: 824, purpose: 'Каршеринг', merchant: 'Делимобиль', company: 'Компания', recipient: 'Тима', status: 'pending', occurred_at: '2026-07-15T16:00:00.000Z' }},
      {{ id: 'r3', amount: 1305, purpose: 'API', merchant: 'OpenAI', company: 'Компания', recipient: 'Дани', status: 'reimbursed', occurred_at: '2026-07-08T12:30:00.000Z' }}
    ] }} }};
    if (path.startsWith('/debts')) return {{ ok: true, data: {{ debts: [
      {{ id: 'd1', amount: 2500, counterparty: 'Алексей', direction: 'owes_me', recipient: 'Тима', settled: false, occurred_at: '2026-07-14T18:10:00.000Z', note: 'Билеты' }}
    ] }} }};
    if (path === '/notes') return {{ ok: true, data: {{ notes: [
      {{ id: 'n1', title: 'План Noda', body: 'Довести удалённый доступ и синхронизацию.', structured_body: '1. Удалённый доступ\\n2. Синхронизация', updated_at: '2026-07-19T11:00:00.000Z' }},
      {{ id: 'n2', title: 'Идеи', body: 'Локальные модели для каждого проекта.', updated_at: '2026-07-18T15:00:00.000Z' }}
    ] }} }};
    if (path.startsWith('/stats/summary')) return {{ ok: true, data: {{ summary: {{ income: 0, expense: 0 }}, byCategory: [] }} }};
    if (path.startsWith('/transactions')) return {{ ok: true, data: {{ transactions: [] }} }};
    if (path === '/debts') return {{ ok: true, data: {{ debts: [] }} }};
    return {{ ok: true, data: {{}} }};
  }};
  const implementations = {{
    api,
    getStatus: async () => status,
    getHistory: async () => [],
    appVersion: async () => '1.11.0',
    syncLocalInventory: async () => ({{ root: 'C:\\\\Claude', projects }}),
    getCodeRoot: async () => 'C:\\\\Claude',
    getTermSessions: async () => [],
    workspaceSettings: async () => ({{ codeRoot: 'C:\\\\Claude', downloadFolder: 'C:\\\\Users\\\\tima\\\\Downloads', localAiUrl: 'http://127.0.0.1:11434' }}),
    projectEnvironment: async () => ({{ ok: true, git: true, branch: 'codex/chatgpt-redesign', changes: 4, additions: 284, deletions: 73, ahead: 1, behind: 0, files: [{{ status: 'M', path: 'pc-app/renderer/workspace-shell.js' }}, {{ status: 'M', path: 'pc-app/renderer/workspace-shell.css' }}, {{ status: 'A', path: 'server/migrations/019_chat_message_client_ids.sql' }}] }}),
    localModels: async () => ({{ ok: true, url: 'http://127.0.0.1:11434', models: [{{ name: 'qwen3:8b', family: 'qwen3', parameterSize: '8B', size: 5200000000 }}] }}),
    localChat: async () => ({{ ok: true, message: {{ role: 'assistant', content: 'Локальная модель готова.' }} }}),
    setLocalAiUrl: async () => ({{ ok: true }}),
    chooseCodeRoot: async () => ({{ ok: true }}),
    updateCheck: async () => ({{ ok: true }}),
    openFile: async () => ({{ ok: true }}),
    openLogs: async () => ({{ ok: true }}),
    log: async () => ({{ ok: true }}),
  }};
  window.arra = new Proxy(implementations, {{
    get(target, prop) {{
      if (prop in target) return target[prop];
      if (String(prop).startsWith('on')) return (callback) => callbacks.set(prop, callback);
      return async () => ({{ ok: true }});
    }},
  }});
}})();
"""


def main() -> int:
    errors: list[str] = []
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--allow-file-access-from-files"])

        auth_page = browser.new_page(viewport={"width": 1180, "height": 760}, device_scale_factor=1)
        auth_page.add_init_script(INIT_SCRIPT.replace("paired: true", "paired: false").replace("hasAuth: true", "hasAuth: false"))
        auth_page.on("pageerror", lambda error: errors.append(f"auth pageerror: {error}"))
        auth_page.on("console", lambda message: errors.append(f"auth console: {message.text}") if message.type == "error" else None)
        auth_page.goto(ENTRY.as_uri(), wait_until="domcontentloaded")
        auth_page.wait_for_timeout(1_000)
        auth_page.screenshot(path=str(AUTH_OUTPUT), full_page=True)
        auth_page.wait_for_selector(".workspace-login-card", timeout=15_000)
        assert auth_page.locator(".workspace-login-card").is_visible()
        assert auth_page.locator(".workspace-chat").count() == 0
        auth_page.close()

        page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page.add_init_script(INIT_SCRIPT)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
        page.goto(ENTRY.as_uri(), wait_until="domcontentloaded")
        page.wait_for_selector(".noda-terminal-modebar", timeout=15_000)
        assert page.locator('.workspace-nav-list [data-s]').count() == 7
        assert page.locator('.workspace-nav-list [data-s="term"]').is_visible()
        assert page.locator('.workspace-nav-list [data-s="chat"]').is_visible()
        assert page.locator('.sidebar >> text=Проекты').count() == 0
        assert page.locator('[data-terminal-mode="terminal"]').get_attribute("aria-selected") == "true"
        assert page.locator(".workspace-project").count() == 0

        page.locator('[data-terminal-mode="nodex"]').click()
        page.wait_for_selector(".nodex-shell", timeout=15_000)
        page.wait_for_selector(".workspace-project", timeout=15_000)
        assert page.locator(".workspace-project").count() == len(PROJECTS)
        assert page.locator(".nodex-new-task").is_visible()
        assert page.locator(".workspace-composer").is_visible()

        page.locator(".workspace-project", has_text="Noda").click()
        page.wait_for_function("document.querySelector('.workspace-chat-context b')?.textContent === 'Продолжить редизайн Noda'")
        page.wait_for_selector(".workspace-project-task")
        page.wait_for_selector(".workspace-environment-row")
        assert "codex/chatgpt-redesign" in page.locator(".workspace-environment").inner_text()
        page.screenshot(path=str(OUTPUT), full_page=True)
        first_thread = page.evaluate("nodaWorkspace.threadKey")
        page.locator("#nodex-new-task").click()
        second_thread = page.evaluate("nodaWorkspace.threadKey")
        page.locator("#nodex-new-task").click()
        third_thread = page.evaluate("nodaWorkspace.threadKey")
        assert first_thread != second_thread != third_thread
        assert second_thread.startswith("project:01_noda:") and third_thread.startswith("project:01_noda:")

        metrics = page.evaluate("""() => ({
          sidebar: document.querySelector('.sidebar')?.getBoundingClientRect().width,
          nodex: document.querySelector('.nodex-sidebar')?.getBoundingClientRect().width,
          composer: document.querySelector('.workspace-composer')?.getBoundingClientRect().width || 0,
          bodyOverflow: getComputedStyle(document.body).overflow,
        })""")
        assert 240 <= metrics["sidebar"] <= 320, metrics
        assert 220 <= metrics["nodex"] <= 290, metrics
        assert metrics["composer"] > 0, metrics
        assert metrics["bodyOverflow"] == "hidden", metrics

        page.locator('[data-s="settings"]').click()
        page.wait_for_selector(".workspace-settings")
        assert page.locator(".workspace-settings-nav").is_visible()
        page.locator('[data-settings-anchor="models"]').click()
        assert "qwen3:8b" in page.locator(".workspace-settings").inner_text()
        settings_metrics = page.evaluate("""() => {
          const main = document.querySelector('.workspace-settings-main').getBoundingClientRect();
          const content = document.querySelector('.workspace-settings-content').getBoundingClientRect();
          return { leftGap: content.left - main.left, rightGap: main.right - content.right };
        }""")
        assert abs(settings_metrics["leftGap"] - settings_metrics["rightGap"]) < 2, settings_metrics
        page.screenshot(path=str(SETTINGS_OUTPUT), full_page=True)

        for section, output_name in (
            ("fin", "returns"),
            ("chat", "assistant"),
            ("notes", "notes"),
            ("files", "files"),
            ("term", "terminal"),
            ("sync", "sync"),
            ("remote", "remote"),
        ):
            page.evaluate("section => navigateWorkspace(section)", section)
            page.wait_for_timeout(650)
            if section == "fin":
                page.locator('[data-fin-tab="list"]').click()
                page.wait_for_timeout(250)
                assert "".join(filter(str.isdigit, page.locator(".finance-period-total strong").inner_text())) == "3957"
                returned_text = page.locator(".finance-period-total span").inner_text()
                assert "возвращено" in returned_text and "1305" in "".join(filter(str.isdigit, returned_text))
                assert page.locator('img[src*="assets/brands/citydrive.jpg"]').count() == 1
                page.locator('[data-id="r1"]').click()
                page.wait_for_selector(".finance-editor")
                page.locator("[data-fin-edit-close]").first.click()
            elif section == "chat":
                assert page.locator(".assistant-liquid").is_visible()
                assert page.locator(".nodex-sidebar").count() == 0
            elif section == "notes":
                assert page.locator(".liquid-note-row").count() == 2
                assert page.locator("#note-body").input_value().startswith("Довести")
            elif section == "files":
                assert page.locator(".files-liquid").is_visible()
                assert page.locator(".liquid-file-mode").is_visible()
            elif section == "term":
                page.locator('[data-terminal-mode="terminal"]').click()
                page.wait_for_timeout(150)
                active_tab = page.locator(".ttab.on")
                assert active_tab.is_visible()
                assert active_tab.locator(".tname").inner_text().strip()
                assert page.evaluate("el => getComputedStyle(el).backgroundColor !== 'rgb(255, 255, 255)'", active_tab.element_handle())
            elif section == "sync":
                transfer = page.locator(".sync-transfer-choice").first
                assert transfer.is_visible()
                assert transfer.inner_text().strip()
            page.screenshot(path=str(SECTION_OUTPUTS[output_name]), full_page=True)

        browser.close()

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "auth": str(AUTH_OUTPUT), "screenshot": str(OUTPUT), "settings": str(SETTINGS_OUTPUT), "sections": {key: str(value) for key, value in SECTION_OUTPUTS.items()}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
