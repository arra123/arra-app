"""Visual smoke test for the exported mobile workspace shell."""

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


OUTPUT = Path(os.environ.get("NODA_MOBILE_SCREENSHOT", Path(os.environ.get("TEMP", ".")) / "noda-mobile-workspace.png"))
AUTH_OUTPUT = OUTPUT.with_name("noda-mobile-auth.png")
DRAWER_OUTPUT = OUTPUT.with_name("noda-mobile-drawer.png")
RETURNS_OUTPUT = OUTPUT.with_name("noda-mobile-returns.png")
SETTINGS_OUTPUT = OUTPUT.with_name("noda-mobile-settings.png")
PROJECT_OUTPUT = OUTPUT.with_name("noda-mobile-project.png")
BASE_URL = os.environ.get("NODA_STATIC_URL", "http://127.0.0.1:8765").rstrip("/")

WORKSPACE_SOCKET = r"""
(() => {
  const projects = [
    { name: '07_Appstore', label: 'Noda', group: 'Tima', path: 'C:\\Claude\\Tima\\07_Appstore', kind: 'javascript', updatedAt: '2026-07-19T10:00:00Z' },
    { name: 'Knowledge-base', label: 'Knowledge Base', group: 'RTeam', path: 'C:\\Claude\\RTeam\\Knowledge-base', kind: 'python', updatedAt: '2026-07-18T10:00:00Z' },
  ];
  class TestWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      this.readyState = TestWebSocket.CONNECTING;
      setTimeout(() => { this.readyState = TestWebSocket.OPEN; this.onopen?.({}); }, 10);
    }
    send(raw) {
      const message = JSON.parse(raw);
      const emit = (payload) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(payload) }), 5);
      if (message.type === 'list_devices') emit({ type: 'devices', devices: [{ id: 'laptop-1', name: 'Ноутбук Тима', role: 'laptop', online: true }] });
      if (message.type === 'workspace_projects') emit({ type: 'workspace_projects', reqId: message.reqId, deviceName: 'Ноутбук Тима', inventory: { root: 'C:\\Claude', projects } });
      if (message.type === 'workspace_models') emit({ type: 'workspace_models', reqId: message.reqId, ok: true, models: [{ name: 'qwen3:8b', family: 'qwen3', parameterSize: '8B' }] });
      if (message.type === 'workspace_chat') emit({ type: 'workspace_chat', reqId: message.reqId, ok: true, message: { role: 'assistant', content: 'Локальная модель готова.' } });
    }
    close() { this.readyState = TestWebSocket.CLOSED; }
  }
  window.WebSocket = TestWebSocket;
})();
"""


def main() -> int:
    errors: list[str] = []
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page.add_init_script(WORKSPACE_SOCKET)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" and "WebSocket" not in message.text else None)

        def api_response(route):
            url = route.request.url
            if url.endswith('/auth/login'):
                route.fulfill(status=200, content_type='application/json', body=json.dumps({
                    "token": "visual-test-token",
                    "user": {"id": "test-user", "email": "test", "name": "Тима"},
                }, ensure_ascii=False))
            elif url.endswith('/ai/threads'):
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"threads": [
                    {"thread_key": "project:07_Appstore", "title": "Продолжить редизайн Noda", "project_name": "Noda"},
                    {"thread_key": "task:test", "title": "План локальных моделей"},
                ]}, ensure_ascii=False))
            elif '/ai/messages' in url:
                route.fulfill(status=200, content_type='application/json', body='{"messages":[]}')
            elif url.endswith('/me'):
                route.fulfill(status=200, content_type='application/json', body='{"user":{"id":"test-user","email":"test","name":"Тима"}}')
            else:
                route.fulfill(status=200, content_type='application/json', body='{}')

        page.route('https://aura.5.42.122.102.sslip.io/**', api_response)
        page.goto(f'{BASE_URL}/chat', wait_until='networkidle')
        try:
            page.get_by_placeholder('Логин').wait_for(timeout=12_000)
        except Exception as error:
            page.screenshot(path=str(OUTPUT.with_name('noda-mobile-debug.png')), full_page=True)
            body = page.locator('body').inner_text()[:1500]
            raise AssertionError(f"Auth screen did not render. Body: {body!r}. Errors: {errors}") from error
        page.screenshot(path=str(AUTH_OUTPUT), full_page=True)
        page.get_by_placeholder('Логин').fill('test')
        page.get_by_placeholder('Пароль').fill('test')
        page.get_by_text('Войти', exact=True).last.click()
        try:
            page.get_by_placeholder('Спросить Noda').wait_for(timeout=15_000)
        except Exception as error:
            page.screenshot(path=str(OUTPUT.with_name('noda-mobile-login-debug.png')), full_page=True)
            body = page.locator('body').inner_text()[:1800]
            raise AssertionError(f"Workspace did not open. Body: {body!r}. Errors: {errors}") from error

        assert page.get_by_text('С чего начнём?', exact=True).is_visible()
        assert page.get_by_text('Noda Cloud', exact=True).is_visible()
        page.screenshot(path=str(OUTPUT), full_page=True)
        page.mouse.click(25, 31)
        page.get_by_placeholder('Поиск проектов').wait_for(timeout=5_000)
        page.wait_for_timeout(500)
        assert page.get_by_text('Компьютер', exact=True).first.is_visible()
        assert page.get_by_text('Настройки', exact=True).first.is_visible()
        page.get_by_text('Noda', exact=True).last.wait_for(timeout=5_000)
        page.get_by_text('План локальных моделей', exact=True).wait_for(timeout=5_000)
        page.screenshot(path=str(DRAWER_OUTPUT), full_page=True)
        page.get_by_text('Tima', exact=True).click()
        page.wait_for_timeout(500)
        page.get_by_text('Noda', exact=True).last.wait_for(timeout=5_000)
        page.screenshot(path=str(PROJECT_OUTPUT), full_page=True)
        page.mouse.click(25, 31)
        page.get_by_text('Возвраты', exact=True).first.click()
        page.wait_for_timeout(500)
        page.get_by_text('Записать', exact=True).wait_for(timeout=5_000)
        page.get_by_text('Список', exact=True).click()
        page.wait_for_timeout(500)
        page.get_by_text('К возврату', exact=True).wait_for(timeout=5_000)
        page.screenshot(path=str(RETURNS_OUTPUT), full_page=True)

        page.mouse.click(25, 31)
        page.get_by_text('Настройки', exact=True).first.click()
        page.wait_for_timeout(500)
        page.get_by_text('Локальная модель', exact=True).wait_for(timeout=5_000)
        page.screenshot(path=str(SETTINGS_OUTPUT), full_page=True)

        browser.close()

    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "auth": str(AUTH_OUTPUT), "chat": str(OUTPUT), "drawer": str(DRAWER_OUTPUT), "project": str(PROJECT_OUTPUT), "returns": str(RETURNS_OUTPUT), "settings": str(SETTINGS_OUTPUT)}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
