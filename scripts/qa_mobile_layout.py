import json
import os
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import Route
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SCREENS = [
    ("Финансы", "finance"),
    ("Помощник", "assistant"),
    ("ПК", "pc"),
    ("Передача", "transfer"),
    ("Заметки", "notes"),
]
BASE_URL = os.environ.get("QA_URL", "http://127.0.0.1:8081")


def settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=8_000)
    except PlaywrightTimeoutError:
        page.wait_for_timeout(1_200)


def fake_api(route: Route):
    path = route.request.url.split("?", 1)[0]
    if path.endswith("/auth/login") or path.endswith("/me"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body='{"token":"qa-token","user":{"id":"qa","email":"qa"}}',
        )
    elif path.endswith("/debts"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(
                {
                    "debts": [
                        {
                            "id": "debt-1",
                            "counterparty": "Ситидрайв",
                            "amount": "463",
                            "direction": "owes_me",
                            "settled": False,
                            "note": "[Тима] Каршеринг",
                            "occurred_at": "2026-07-27T11:20:00.000Z",
                        },
                        {
                            "id": "debt-2",
                            "counterparty": "Даня",
                            "amount": "1250",
                            "direction": "owes_me",
                            "settled": False,
                            "note": "[Тима] Билеты",
                            "occurred_at": "2026-07-26T18:05:00.000Z",
                        },
                    ]
                },
                ensure_ascii=False,
            ),
        )
    elif path.endswith("/notes"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(
                {
                    "notes": [
                        {
                            "id": "note-1",
                            "title": "План релиза",
                            "body": "Проверить передачу файлов и обновить заметки.",
                            "updated_at": "2026-07-27T13:30:00.000Z",
                            "created_at": "2026-07-27T13:30:00.000Z",
                            "color": "#5B8DEF",
                        },
                        {
                            "id": "note-2",
                            "title": "Покупки",
                            "body": "Кофе, фильтры, кабель.",
                            "updated_at": "2026-07-26T09:10:00.000Z",
                            "created_at": "2026-07-26T09:10:00.000Z",
                        },
                    ]
                },
                ensure_ascii=False,
            ),
        )
    elif path.endswith("/ai/messages"):
        route.fulfill(status=200, content_type="application/json", body='{"messages":[]}')
    elif path.endswith("/pc/tokens"):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=(
                '{"online":true,"tokens":['
                '{"id":"laptop","name":"Ноутбук · QA","role":"laptop","hostname":"QA-LAPTOP","online":true},'
                '{"id":"pc","name":"ПК · QA","role":"pc","hostname":"QA-PC","online":false},'
                '{"id":"server","name":"Сервер · QA","role":"server","hostname":"QA-SERVER","online":true}'
                ']}'
            ),
        )
    elif path.endswith("/files"):
        route.fulfill(status=200, content_type="application/json", body='{"files":[],"agentOnline":true}')
    else:
        route.fulfill(status=200, content_type="application/json", body='{}')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        args=[
            "--host-resolver-rules=MAP api.arratima.ru 5.42.122.102",
        ],
    )
    page = browser.new_page(viewport={"width": 393, "height": 852}, device_scale_factor=1)
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.route("https://api.arratima.ru/**", fake_api)
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
    settle(page)
    page.wait_for_timeout(1_000)

    login_input = page.locator('input[placeholder="Логин"]')
    if login_input.count():
        login_input.fill("qa")
        page.locator('input[placeholder="Пароль"]').fill("qa")
        page.get_by_text("Войти", exact=True).last.click()
        page.get_by_text("Финансы", exact=True).first.wait_for(timeout=30_000)
        settle(page)

    for label, slug in SCREENS:
        tab = page.get_by_text(label, exact=True).last
        if tab.count():
            tab.click()
            settle(page)
        page.screenshot(path=str(ROOT / f"qa-mobile-95-{slug}.png"), full_page=False)
        if slug == "notes":
            page.get_by_text("План релиза", exact=True).click()
            page.wait_for_timeout(500)
            page.screenshot(path=str(ROOT / "qa-mobile-95-notes-editor.png"), full_page=False)
            page.mouse.move(4, 400)
            page.mouse.down()
            page.mouse.move(170, 402, steps=10)
            page.wait_for_timeout(150)
            page.screenshot(path=str(ROOT / "qa-mobile-95-notes-swipe.png"), full_page=False)
            page.mouse.up()

    print(json.dumps({"console_errors": console_errors[-20:]}, ensure_ascii=False))
    browser.close()
