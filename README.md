# Нода

Личный хаб: финансы, заметки и связь с компьютером в одном месте.
Сайт — [arratima.ru](https://arratima.ru/).

## Из чего состоит

| Часть | Папка | Что это |
|---|---|---|
| Сайт | `noda-ios/` | Витрина и хаб проектов, деплой в корень arratima.ru |
| iPhone | `src/` | Expo SDK 56 + expo-router, раздаётся через TestFlight |
| ПК | `pc-app/` | Electron для Windows, приём файлов и управление компьютером |
| Бэкенд | `server/` | Fastify на порту 4000, PostgreSQL (схема `apple`) |

Всё остальное в репозитории — вспомогательное: `scripts/` (деплой, сборка,
QA-скриншоты), `assets/` (иконки и изображения приложения), `hub-api/`
(данные хаба проектов), `stickers/` (референсы для УльянаOS).

## Команды

```bash
npx expo start        # дев-сервер приложения
npx tsc --noEmit      # проверка типов
npm run lint          # линт
```

Деплой сайта — `node scripts/deploy_noda_ios_root.mjs`,
бэкенда — `node scripts/deploy_server.mjs`.

## Сборка приложения

```bash
eas build -p ios -e production --non-interactive     # нативная сборка
eas submit -p ios --latest --profile production      # заливка в TestFlight
eas update --branch production -m "..."              # правки JS без пересборки
```

Доступы и ключи — в `.env` (не коммитится). Подробности разработки — в `CLAUDE.md`.
