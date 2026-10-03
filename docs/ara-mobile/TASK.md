# Задача: «Нода» становится мобильной «Арой» (iPhone)

Ты работаешь в облачной сессии Claude Code над репозиторием «Ноды»
(`arra123/arra-app`, ветка `ara-mobile`). Секретов (.env, EXPO_TOKEN, доступа к
серверам) здесь нет: ты пишешь и проверяешь код, а сборку/выкладку сделает
агент на ноутбуке пользователя по твоей инструкции (см. «Как сдать работу»).

## Что это за продукт

У пользователя на ноутбуке (Arch + Hyprland) и ПК (Arch + KDE) работают
AI-агенты: Claude Code и Codex, каждый в своём настоящем терминале kitty на
своём рабочем столе. На компьютере уже есть приложение «Ара» (скриншоты в
`docs/ara-mobile/refs/`): слева агенты по устройствам и чаты с помощницей Арой,
справа переписка агента в сжатом виде (сообщения и ответы целиком, действия
свёрнуты в строку «N действий · последнее», план чек-листом, картинки, видео),
поле ввода — текст уходит прямо в терминал агента.

**Нужно то же самое на iPhone**: следить за агентами на обоих компьютерах,
читать их переписку, отвечать им, запускать новых, говорить с Арой, получать
уведомление, когда агент закончил и ждёт ответа.

Старые функции «Ноды» (финансы, заметки, перенос файлов, УльянаOS, долги…)
пользователю больше не нужны: **убери их из приложения целиком**, данные можно
не переносить. Оставь только то, что нужно новой «Аре»: вход (auth), push,
инфраструктуру сервера. Название приложения в интерфейсе — «Ара». Bundle ID,
slug, EAS-проект, домен API не меняй (см. «Наследие имён» в CLAUDE.md).

## Дизайн (iPhone, как приложение Codex/ChatGPT для iOS)

- Тёмная тема: фон `#0a0a0c`, карточки `#141518`, текст `#f2f2f5`, вторичный
  `#8d8f99`. Акценты статусов: работает — зелёный `#34d399`, ждёт ответа —
  жёлтый `#f5c542`, прервался — красный `#f87171`, давно — серый.
- Liquid Glass (`expo-glass-effect`, уже есть `src/components/glass-card.tsx`)
  для шапок, нижней панели ввода, выпадающих меню — как «стеклянная» оболочка
  Codex на iOS. Все отступы и safe area по метрикам iPhone, Dynamic Type,
  хаптика на действиях, жесты «назад» свайпом.
- Анимации `react-native-reanimated` 4: появление сообщений, раскрытие действий
  и плана, смена статуса, переходы экранов. Плавно, без рывков.
- Экраны:
  1. **Главный**: переключатель «Работа / Разговор» сверху (как Codex / ChatGPT).
     «Работа» — агенты сгруппированы по устройству (Ноутбук / ПК), у каждого
     иконка Claude или Codex, проект, одна строка «что делает», цветная точка
     статуса, стол; ниже «Недавние сессии». «Разговор» — чаты с Арой.
     Кнопка «+» — новый агент (Claude/Codex, устройство, папка, первая задача)
     или новый чат с Арой.
  2. **Агент**: шапка (проект, устройство, статус, модель), строка «Работает
     4 мин · сейчас: Читает файл X» / «Закончил 3 мин назад · ждёт ответа»,
     карточка плана с прогрессом, лента сообщений как на ПК (ответы в Markdown:
     таблицы, списки, код; действия свёрнуты и раскрываются; картинки открываются
     на весь экран с зумом; видео проигрываются), поле ввода с фото из галереи /
     камеры, диктовкой (iOS), кнопка «Остановить», пока агент работает.
  3. **Чат с Арой**: то же, ответы от Ары (см. ниже), переключатель «Чётко /
     Поговорить», выбор модели Haiku / Sonnet / Opus.
- Push-уведомление, когда агент перешёл из «работает» в «ждёт ответа» или
  «прервался»; нажатие открывает этого агента.

## Архитектура

Телефон не видит компьютеры напрямую. Всё идёт через сервер «Ноды»
(`server/`, Fastify, WebSocket; прод: `https://aura.5.42.122.102.sslip.io`).
Уже есть: канал устройства `/agent?token=<ключ устройства>` (см.
`server/src/routes/files.js`, `pc-agent/agent.mjs`), канал приложения `/client`
(JWT), выдача ключей устройств, push (`server/src/push.js`).

Сделай:

1. **Сервер**: протокол `ara.*` поверх этих каналов.
   - Устройство раз в ~3 с шлёт `ara.snapshot` (список агентов и недавних
     сессий, формат ниже); сервер держит последний снимок каждого устройства в
     памяти (и кратко в БД для push), отдаёт телефону при подключении и шлёт
     изменения.
   - Телефон → устройство: `ara.subscribe {agentKey}` (пока экран агента
     открыт, устройство шлёт `ara.transcript` при каждом изменении журнала),
     `ara.send {term, text, images?}`, `ara.stop {term}`, `ara.launch {agent,
     dir, task, model?}`, `ara.model {term, model}`, `ara.ask {chatId, prompt,
     history, style, model}` (ответ Ары приходит потоком `ara.ask.delta` /
     `ara.ask.done`), `ara.upload` (фото с телефона → файл на устройстве, путь
     добавляется к тексту для агента).
   - Push: сервер сам сравнивает состояния агентов в снимках и шлёт push при
     переходе working → waiting / error.
2. **Клиент устройства** `ara-link/` (Python 3, одна зависимость `websockets`,
   или Node без лишнего): подключается к `/agent`, шлёт снимки, выполняет
   команды, вызывая **уже существующие локальные скрипты** (они есть на обоих
   компьютерах, пути ниже). Конфиг `~/.config/ara-link/config.json`
   (`apiUrl`, `token`, `device: "laptop" | "pc"`). systemd user unit в комплекте.
3. **Приложение**: Expo SDK 56 (см. правила в CLAUDE.md и AGENTS.md: читать
   версионированную документацию Expo v56, без нативных SwiftUI-контролов,
   цвета из `src/constants/theme.ts`, весь текст по-русски). Экран «Подключить
   компьютер» выдаёт ключ устройства (как сейчас для ПК-агента).

## Локальные скрипты на компьютерах (их вызывает ara-link)

Все пути от `$HOME`:

| Что | Команда | Вывод |
|---|---|---|
| Агенты и недавние сессии | `~/.config/quickshell/ara/scripts/ara-sessions` | JSON ниже; `live[].device` = `laptop` или `pc` (агенты ПК уже видны с ноутбука через ssh) |
| Переписка агента | `~/.config/quickshell/ara/scripts/ara-transcript <transcript> 160 [mtime]` | JSON ниже; с `mtime` отвечает `{"same":true}` если не менялось |
| Переписка агента на ПК (с ноутбука) | `~/.config/quickshell/ara/scripts/ara-pc transcript <transcript> 160` | то же |
| Текст в терминал агента | `~/.config/quickshell/ii/modules/ii/notchIsland/scripts/island-agent-send <term> <text>` | `{"ok":true}` |
| То же на ПК | `printf '%s' "$text" \| ~/.config/quickshell/ara/scripts/ara-pc send <term>` | `{"ok":true}` |
| Остановить (Esc) | `~/.local/bin/agent-telegram-bridge --terminal-action send-key <term> escape`; на ПК `ara-pc stop <term>` | код 0 |
| Новый агент на ПК | `printf '%s' "$task" \| ara-pc launch claude\|codex <dir>` | `{"ok":true}` |
| Новый агент на ноутбуке | `kitty -o allow_remote_control=socket-only --listen-on unix:$XDG_RUNTIME_DIR/codex-agent-{kitty_pid} --directory <dir> fish -lc 'exec claude --dangerously-skip-permissions --model <m> $ISLAND_TASK'` с `ISLAND_TASK` в окружении | — |
| Ответ Ары | `~/.config/quickshell/ii/modules/ii/notchIsland/scripts/island-ask '<json>'` (`{"prompt","history":[{role,text}],"model","style":"brief"\|"talk","name":"Ара"}`) | JSON-строки `{"t":"delta","text"}`, `{"t":"action",…}`, `{"t":"done"}`, `{"t":"error","text"}` |

Проще всего запускать ara-link на ноутбуке: он уже видит агентов ПК
(`device: "pc"` в снимке) и умеет им писать через `ara-pc`. Второй экземпляр на
ПК не обязателен.

Пример `ara-sessions`:

```json
{"live":[{"agent":"claude","project":"helper","cwd":"/home/tima/Claude/helper","ws":4,"term":58872,
  "title":"","busy":true,"state":"working","idle":0,"device":"laptop",
  "task":"последняя просьба пользователя","transcript":"/home/tima/.claude/projects/.../<id>.jsonl"}],
 "recent":[{"agent":"codex","project":"helper","cwd":"/home/tima/Claude/helper","id":"<session id>",
  "title":"первая просьба","mtime":1790634392.0,"transcript":"..."}],"pcOnline":true}
```

`state`: `working` | `waiting` (ждёт ответа) | `error` (прервался) | `old` (>1 ч).

Пример `ara-transcript`:

```json
{"messages":[
  {"role":"user","text":"...","images":["/abs/path.png"]},
  {"role":"assistant","text":"Markdown ответа","images":[],"videos":["/abs/v.mp4"],"sites":["http://localhost:3000"]},
  {"role":"steps","items":[{"icon":"description","text":"Читает AraWindow.qml"},{"icon":"terminal","text":"Запускает скрипт Python"}],"more":0}],
 "model":"claude-opus-5-5","lastUser":1790634737.8,"last":1790635306.1,
 "plan":[{"text":"пункт","status":"completed|in_progress|pending"}]}
```

`icon` — имена Material Symbols; на iOS замени на SF Symbols по смыслу.
Картинки и видео — пути на компьютере: ara-link должен отдавать их телефону
(загрузкой на сервер по запросу `ara.file {path}` с проверкой, что путь
упомянут в переписке).

## Проверка

- `npx tsc --noEmit`, `npm run lint` в корне; тесты сервера, если есть.
- Для ara-link — небольшой тест с поддельным сервером (websockets) и
  подменёнными локальными скриптами.
- Снимки экранов приложения сделать не получится; опиши экраны словами в отчёте.

## Как сдать работу

1. Коммиты в ветку `ara-mobile`, по-русски, осмысленные. Push в GitHub.
2. Файл `docs/ara-mobile/HANDOFF.md`: что сделано; миграции БД; команды выкладки
   сервера (`node scripts/deploy_server.mjs`), сборки (`eas build -p ios -e
   production`, `eas submit`), установки ara-link на ноутбуке (конфиг, systemd);
   что проверить руками на телефоне.
3. Открой pull request `ara-mobile` → `master` с этим описанием.
