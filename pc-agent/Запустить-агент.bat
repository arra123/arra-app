@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Устанавливаю зависимости агента...
  call npm install
)
echo.
echo === Агент Aura запускается ===
node agent.mjs
pause
