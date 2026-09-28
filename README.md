# Ара — агенты с компьютера на iPhone

Мобильное приложение для слежения за AI-агентами (Claude Code, Codex), которые
работают в терминалах на ноутбуке и ПК: переписка, ответы, запуск новых агентов,
чаты с помощницей Арой и push, когда агент закончил.

```
iPhone (src/, Expo SDK 56) ──/client──▶ сервер (server/) ◀──/agent── ara-link (ноутбук, ПК)
```

| Папка | Что |
|---|---|
| `src/` | приложение (expo-router): `app/` экраны, `ara/` клиент протокола, чаты, Markdown, `components/` |
| `server/` | Fastify + WebSocket + Postgres: вход, push, протокол `ara.*` (`src/ara/`) |
| `ara-link/` | клиент компьютера на Python, вызывает локальные скрипты «Ары» |
| `docs/ara-mobile/` | задание, протокол, handoff |

## Разработка

```sh
npm install
npx expo start               # dev-клиент
npx tsc --noEmit && npm run lint
cd server && npm test        # тесты протокола
python3 -m unittest discover -s ara-link/tests
```

Сборка и выкладка — `docs/ara-mobile/HANDOFF.md`.
