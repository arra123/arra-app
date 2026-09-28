# Протокол `ara.*`

Телефон не видит компьютеры напрямую: всё идёт через сервер.

```
iPhone ──/client?token=<JWT>──▶ сервер (server/src/ara/hub.js) ◀──/agent?token=<ключ устройства>── ara-link (ноутбук, ПК)
```

Все сообщения — JSON с полем `type`. Команды телефона несут `reqId` (любая
строка); сервер подменяет его своим при пересылке на компьютер и возвращает
ответ телефону с исходным `reqId`.

## Ключи агентов

- живой агент: `live:<device>:<term>` — `device` из снимка (`laptop` | `pc`), `term` — терминал;
- недавняя сессия: `recent:<device>:<id>`.

Если агента ПК видят и ноутбук (через ssh), и ara-link на самом ПК, сервер
берёт запись с ПК; иначе команды агентам ПК идут через ноутбук (`ara-pc`).

## Компьютер → сервер

| type | поля | что делает сервер |
|---|---|---|
| `ara.hello` | `device`, `version` | запоминает, чей это ara-link |
| `ara.snapshot` | `device`, `live[]`, `recent[]`, `pcOnline` — вывод `ara-sessions` | держит последний снимок в памяти; при изменении шлёт телефонам `ara.state`; при переходе агента `working → waiting / error` шлёт push (кроме случая, когда экран агента открыт) |
| `ara.transcript` | `agentKey`, `data` — вывод `ara-transcript` | кеширует и пересылает подписанным телефонам |
| `ara.result` | `reqId`, `ok`, `error?`, … | ответ на команду |
| `ara.ask.delta` / `ara.ask.action` / `ara.ask.done` / `ara.ask.error` | `reqId`, `text` / `action` / — / `error` | поток ответа Ары |

## Сервер → компьютер

| type | поля |
|---|---|
| `ara.welcome` | `deviceId`, `phoneOnline` |
| `ara.watch` | `agents: [{key, device, agent, term, transcript}]` — чью переписку сейчас смотрят телефоны. Пока ключ в списке, ara-link шлёт `ara.transcript` при каждом изменении журнала |
| `ara.send` | `reqId`, `agent`, `text`, `images[]` — пути на компьютере, добавляются к тексту |
| `ara.stop` | `reqId`, `agent` |
| `ara.model` | `reqId`, `agent`, `model` |
| `ara.launch` | `reqId`, `device`, `agent: claude\|codex`, `dir`, `task`, `model?` |
| `ara.ask` | `reqId`, `chatId`, `prompt`, `history[{role,text}]`, `style: brief\|talk`, `model: haiku\|sonnet\|opus` |
| `ara.file` | `reqId`, `path`, `agentKey?`, `chatId?` — отдать файл, если путь упомянут в этой переписке: `POST /ara/blob?token=<ключ>&reqId=<reqId>` (сырые байты) |
| `ara.upload` | `reqId`, `url` (`/ara/blob/<id>`), `name`, `device` — скачать фото (`GET <url>?token=<ключ>`), положить в inbox, ответить `ara.result {path}` |

## Телефон → сервер

| type | поля | ответ |
|---|---|---|
| `ara.hello` / `ara.refresh` | — | `ara.state` |
| `ara.subscribe` | `agentKey` (одна подписка на сокет) | сразу кеш `ara.transcript`, дальше изменения |
| `ara.unsubscribe` | — | — |
| `ara.send` | `reqId`, `agentKey`, `text`, `images?` | `ara.result` |
| `ara.stop` | `reqId`, `agentKey` | `ara.result` |
| `ara.model` | `reqId`, `agentKey`, `model` | `ara.result` |
| `ara.launch` | `reqId`, `device`, `agent`, `dir`, `task`, `model?` | `ara.result` |
| `ara.ask` | `reqId`, `chatId`, `prompt`, `history`, `style`, `model` | поток `ara.ask.*` |
| `ara.file` | `reqId`, `path`, `agentKey?` или `chatId?` | `ara.result {url, mime, name, size}`; скачивать `GET <url>` с `Authorization: Bearer <JWT>` (поддерживается Range) |

Фото с телефона: `POST /ara/upload?agentKey=…` (или `?device=laptop|pc`),
multipart `file` → `{path}` — путь на компьютере; потом `ara.send {images:[path]}`.

## Сервер → телефон

- `ara.state` — `{agents[], recent[], devices: {laptop:{online,via}, pc:{online,via}}, at}`.
  У агента: `key, device, agent, project, cwd, ws, term, title, busy, state, task, transcript, model, since` (мс, с какого момента в текущем состоянии).
- `ara.transcript`, `ara.result`, `ara.ask.*` — см. выше.

## Push

`data: {type: "ara.agent", agentKey, state}`; нажатие открывает экран агента.
Последнее состояние каждого агента хранится в `ara_agent_states`, чтобы после
рестарта сервера переход не потерялся.
