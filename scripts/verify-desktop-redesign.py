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
    workspaceSettings: async () => ({{ codeRoot: 'C:\\\\Claude', downloadFolder: 'C:\\\\Users\\\\tima\\\\Downloads', localAiUrl: 'http://127.0.0.1:11434' }}),
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
        page.wait_for_selector(".workspace-chat", timeout=15_000)
        page.wait_for_selector(".workspace-project", timeout=15_000)

        assert page.locator(".workspace-project").count() == len(PROJECTS)
        assert page.locator(".workspace-recent").count() == 2
        assert page.locator(".workspace-new-task").is_visible()
        assert page.locator(".workspace-composer").is_visible()

        page.locator(".workspace-project", has_text="Noda").click()
        page.wait_for_function("document.querySelector('.workspace-chat-context b')?.textContent === 'Noda'")
        page.screenshot(path=str(OUTPUT), full_page=True)

        page.locator('[data-s="settings"]').click()
        page.wait_for_selector(".workspace-settings")
        assert "qwen3:8b" in page.locator(".workspace-settings").inner_text()

        metrics = page.evaluate("""() => ({
          sidebar: document.querySelector('.sidebar')?.getBoundingClientRect().width,
          composer: document.querySelector('.workspace-composer')?.getBoundingClientRect().width || 0,
          bodyOverflow: getComputedStyle(document.body).overflow,
        })""")
        assert 240 <= metrics["sidebar"] <= 300, metrics
        assert metrics["bodyOverflow"] == "hidden", metrics
        browser.close()

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "auth": str(AUTH_OUTPUT), "screenshot": str(OUTPUT)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
