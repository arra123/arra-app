#!/usr/bin/env bash
# Запускать ПОСЛЕ `gh auth login`. Создаёт приватный репозиторий, заливает секреты,
# пушит код → GitHub Actions сам собирает iOS и заливает в TestFlight.
set -e
cd "$(dirname "$0")/.."

REPO="${1:-arra-app}"
SEC=_codemagic_secrets

if ! gh auth status >/dev/null 2>&1; then
  echo "Сначала: gh auth login"; exit 1
fi

# 1) репозиторий (создаст, если ещё нет; иначе добавит remote)
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$REPO" --private --source=. --remote=origin || {
    OWNER=$(gh api user --jq .login)
    git remote add origin "https://github.com/$OWNER/$REPO.git"
  }
fi

# 2) секреты в Actions (из файлов _codemagic_secrets)
set_secret () { gh secret set "$1" --body "$(cat "$SEC/$1.txt")"; echo "  ✓ $1"; }
echo "Заливаю секреты:"
set_secret EXPO_TOKEN
set_secret IOS_DIST_P12_B64
set_secret IOS_DIST_P12_PASSWORD
set_secret IOS_PROFILE_B64
set_secret ASC_KEY_P8_B64

# 3) пуш → триггерит сборку
git push -u origin master

echo
echo "Готово. Сборка iOS запущена. Статус:"
gh run list --workflow "iOS → TestFlight" --limit 1 || true
echo "Следить: gh run watch"
