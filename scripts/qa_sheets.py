"""Скриншоты новых нижних листов: запись, каршеринг, ящик чатов.

Запуск: сначала `npx expo start --web --port 8082`, затем
`QA_URL=http://127.0.0.1:8082 python scripts/qa_sheets.py`.
"""

import json
import os
from pathlib import Path

from playwright.sync_api import Route, sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.environ.get("QA_URL", "http://127.0.0.1:8082")
OUT = ROOT / "qa-sheets"


def settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=8_000)
    except PlaywrightTimeoutError:
        page.wait_for_timeout(1_000)


DEBTS = {
    "debts": [
        {
            "id": "debt-1", "counterparty": "Ситидрайв", "amount": "463",
            "direction": "owes_me", "settled": False, "note": "[Тима] Каршеринг",
            "occurred_at": "2026-07-28T11:20:00.000Z",
        },
        {
            "id": "debt-2", "counterparty": "Даня", "amount": "1250",
            "direction": "owes_me", "settled": False, "note": "[Тима] Билеты",
            "occurred_at": "2026-07-27T18:05:00.000Z",
        },
    ]
}

THREADS = {
    "threads": [
        {"id": "main", "title": "Основной", "preset": "finance", "main": True, "preview": "Записал 463 ₽"},
        {"id": "t2", "title": "Компьютер", "preset": "tech", "preview": "Какую видеокарту брать"},
        {"id": "t3", "title": "Разговор", "preset": "general", "preview": "Идея на выходные"},
    ]
}


def fake_api(route: Route):
    path = route.request.url.split("?", 1)[0]
    if path.endswith("/auth/login") or path.endswith("/me"):
        body = '{"token":"qa-token","user":{"id":"qa","email":"qa"}}'
    elif path.endswith("/debts"):
        body = json.dumps(DEBTS, ensure_ascii=False)
    elif path.endswith("/ai/threads"):
        body = json.dumps(THREADS, ensure_ascii=False)
    elif path.endswith("/ai/messages"):
        body = '{"messages":[]}'
    elif path.endswith("/notes"):
        body = '{"notes":[]}'
    elif path.endswith("/pc/tokens"):
        body = '{"online":true,"tokens":[{"id":"pc","name":"ПК · Tima","role":"pc","online":true}]}'
    elif path.endswith("/files"):
        body = '{"files":[],"agentOnline":true}'
    else:
        body = "{}"
    route.fulfill(status=200, content_type="application/json", body=body)


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 393, "height": 852}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.route("https://aura.5.42.122.102.sslip.io/**", fake_api)
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
        settle(page)
        page.wait_for_timeout(1_200)

        login = page.locator('input[placeholder="Логин"]')
        if login.count():
            login.fill("qa")
            page.locator('input[placeholder="Пароль"]').fill("qa")
            page.get_by_text("Войти", exact=True).last.click()
            page.get_by_text("Финансы", exact=True).first.wait_for(timeout=30_000)
            settle(page)

        # Плавающая кнопка в левом нижнем углу
        page.get_by_label("Добавить запись").click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "fab-open.png"))

        # Лист каршеринга
        page.get_by_label("Каршеринг").click()
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "sheet-car.png"))
        page.get_by_text("Отмена", exact=True).last.click()
        page.wait_for_timeout(600)

        # Лист существующей записи
        page.get_by_text("Ситидрайв", exact=True).last.click()
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "sheet-entry.png"))
        page.get_by_text("Отмена", exact=True).last.click()
        page.wait_for_timeout(500)

        # Ящик чатов в помощнике
        page.get_by_text("Помощник", exact=True).last.click()
        settle(page)
        page.get_by_label("Список чатов").click()
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "chat-drawer.png"))

        print(json.dumps({"console_errors": errors[-15:]}, ensure_ascii=False))
        browser.close()


main()
