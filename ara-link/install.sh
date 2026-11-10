#!/bin/sh
# Установка ara-link для текущего пользователя (Arch).
# Использование: ./install.sh [ключ-устройства] [laptop|pc]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
token=${1:-}
device=${2:-laptop}

python3 -c 'import websockets' 2>/dev/null || {
  echo "Нужен python-websockets: sudo pacman -S --needed python-websockets" >&2
  exit 1
}

install -Dm755 "$here/ara_link.py" "$HOME/.local/share/ara-link/ara_link.py"
install -Dm644 "$here/ara-link.service" "$HOME/.config/systemd/user/ara-link.service"

config="$HOME/.config/ara-link/config.json"
if [ ! -f "$config" ]; then
  [ -n "$token" ] || { echo "Первый запуск: ./install.sh <ключ> [laptop|pc]" >&2; exit 1; }
  mkdir -p "$(dirname "$config")"
  umask 077
  printf '{\n  "apiUrl": "https://aura.5.42.122.102.sslip.io",\n  "token": "%s",\n  "device": "%s"\n}\n' "$token" "$device" > "$config"
  echo "Конфиг: $config"
fi

python3 "$HOME/.local/share/ara-link/ara_link.py" --check > /dev/null && echo "ara-sessions отвечает"
systemctl --user daemon-reload
systemctl --user enable --now ara-link.service
systemctl --user restart ara-link.service
echo "Готово. Журнал: journalctl --user -u ara-link -f"
