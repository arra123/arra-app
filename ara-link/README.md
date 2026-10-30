# ara-link

Связь компьютера (ноутбук / ПК) с мобильной «Арой». Подключается к серверу по
WebSocket `/agent?token=<ключ устройства>`, раз в ~3 с шлёт снимок агентов и
выполняет команды с телефона через уже существующие локальные скрипты «Ары».

Python 3.11+, одна зависимость — `websockets` (`sudo pacman -S python-websockets`).

## Установка

1. В приложении: **Настройки → Подключить компьютер → Ноутбук** — появится ключ.
2. На ноутбуке:

   ```sh
   cd ara-link
   ./install.sh <ключ> laptop
   journalctl --user -u ara-link -f
   ```

   Скрипт кладёт `ara_link.py` в `~/.local/share/ara-link/`, конфиг — в
   `~/.config/ara-link/config.json`, включает `systemctl --user` юнит `ara-link`.

Достаточно одного экземпляра на ноутбуке: `ara-sessions` уже видит агентов ПК
(`device: "pc"`), а писать им, останавливать и запускать новых ara-link будет
через `ara-pc`. Второй экземпляр на ПК (`./install.sh <ключ ПК> pc`) не
обязателен; если он есть, сервер сам направит команды агентам ПК на ПК.

## Конфиг `~/.config/ara-link/config.json`

| Поле | По умолчанию | Что это |
|---|---|---|
| `apiUrl` | `https://aura.5.42.122.102.sslip.io` | сервер |
| `token` | — | ключ устройства из приложения |
| `device` | `laptop` | `laptop` или `pc` — где запущен ara-link |
| `pcSsh` | `null` | ssh-хост ПК (например `pc`). Нужен ноутбуку, чтобы отдавать телефону картинки/видео агентов ПК и класть на ПК фото с телефона |
| `inboxDir` | `~/Pictures/ara-inbox` | куда класть фото с телефона |
| `pcInboxDir` | `~/Pictures/ara-inbox` | то же на ПК (через `pcSsh`) |
| `launch.claude` / `launch.codex` | `exec claude --dangerously-skip-permissions` / `exec codex --dangerously-bypass-approvals-and-sandbox` | команда в новом kitty (fish); к ней добавляются `--model` и `$ISLAND_TASK` |
| `scripts.*` | пути из таблицы ниже | переопределить путь к скрипту |
| `snapshotInterval`, `watchInterval`, `transcriptLimit`, `maxFileMb` | 3, 1.5, 160, 400 | тонкая настройка |

Проверка без сервера: `python3 ara_link.py --check` печатает снимок агентов.

## Какие скрипты вызываются

| Команда с телефона | Ноутбук (агент на ноутбуке) | Агент на ПК (с ноутбука) |
|---|---|---|
| снимок | `ara-sessions` | — (уже в снимке) |
| переписка | `ara-transcript <file> 160` (только если файл изменился) | `ara-pc transcript <file> 160` раз в 3 с |
| `ara.send` | `island-agent-send <term> <text>` | `ara-pc send <term>` (текст в stdin) |
| `ara.stop` | `agent-telegram-bridge --terminal-action send-key <term> escape` | `ara-pc stop <term>` |
| `ara.model` | `/model <m>` в терминал агента | то же через `ara-pc send` |
| `ara.launch` | `kitty … fish -lc 'exec claude … $ISLAND_TASK'` | `ara-pc launch claude\|codex <dir>` (задача в stdin) |
| `ara.ask` | `island-ask '<json>'`, строки JSON → поток на телефон | — |
| `ara.file` | загрузка файла на сервер, если путь упомянут в переписке | `ssh <pcSsh> cat -- <path>` |
| `ara.upload` | скачать фото в `inboxDir`, вернуть путь | `ssh <pcSsh> 'cat > …'` |

Протокол целиком — в `docs/ara-mobile/PROTOCOL.md`.

## Тест

```sh
python3 -m unittest discover -s ara-link/tests -v
```

Поднимает поддельный сервер (websockets + HTTP) и подменяет все локальные
скрипты и `kitty` во временном `$HOME`.
