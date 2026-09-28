#!/usr/bin/env python3
"""ara-link — связь компьютера с мобильной «Арой».

Подключается к серверу (канал /agent?token=<ключ устройства>), раз в ~3 с шлёт
снимок агентов (ara.snapshot) и выполняет команды с телефона, вызывая уже
существующие локальные скрипты «Ары» (ara-sessions, ara-transcript, ara-pc,
island-agent-send, island-ask, agent-telegram-bridge).

Одна зависимость: websockets (Arch: pacman -S python-websockets).
Конфиг: ~/.config/ara-link/config.json — {"apiUrl", "token", "device"}.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import shlex
import signal
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:
    from websockets.asyncio.client import connect as ws_connect
except ImportError:  # websockets < 13
    from websockets import connect as ws_connect  # type: ignore

VERSION = "1.0.0"
log = logging.getLogger("ara-link")

CONFIG_PATH = Path(os.environ.get("ARA_LINK_CONFIG", "~/.config/ara-link/config.json")).expanduser()

# Пути от $HOME. Любой можно переопределить в конфиге ("scripts": {...}).
SCRIPTS = {
    "sessions": "~/.config/quickshell/ara/scripts/ara-sessions",
    "transcript": "~/.config/quickshell/ara/scripts/ara-transcript",
    "pc": "~/.config/quickshell/ara/scripts/ara-pc",
    "send": "~/.config/quickshell/ii/modules/ii/notchIsland/scripts/island-agent-send",
    "ask": "~/.config/quickshell/ii/modules/ii/notchIsland/scripts/island-ask",
    "bridge": "~/.local/bin/agent-telegram-bridge",
}

DEFAULTS: dict[str, Any] = {
    "apiUrl": "https://aura.5.42.122.102.sslip.io",
    "wsUrl": None,  # по умолчанию apiUrl с ws(s):// + /agent
    "token": "",
    "device": "laptop",
    "snapshotInterval": 3.0,
    "watchInterval": 1.5,
    "transcriptLimit": 160,
    # Сюда кладутся фото с телефона (путь добавляется к тексту для агента)
    "inboxDir": "~/Pictures/ara-inbox",
    # ssh-хост ПК: нужен, только если ara-link работает на ноутбуке и должен
    # забирать картинки/видео агентов ПК или класть на ПК фото с телефона.
    "pcSsh": None,
    "pcInboxDir": "~/Pictures/ara-inbox",
    "maxFileMb": 400,
    # Команды внутри нового kitty на ноутбуке (fish). К ним добавятся --model и задача.
    "launch": {
        "claude": "exec claude --dangerously-skip-permissions",
        "codex": "exec codex --dangerously-bypass-approvals-and-sandbox",
    },
    "scripts": {},
}

MEDIA_RE = re.compile(r"\.(png|jpe?g|gif|webp|heic|mp4|mov|webm|m4v)$", re.I)
PATH_RE = re.compile(r"(/[^\s\"'`<>()]+?\.(?:png|jpe?g|gif|webp|heic|mp4|mov|webm|m4v))(?=$|[\s\"'`<>(),;:!?]|\.(?:\s|$))", re.I)
MAX_TRANSCRIPT_BYTES = 6 * 1024 * 1024  # сервер режет сообщения больше 8 МБ
MODEL_RE = re.compile(r"^[A-Za-z0-9._:\-\[\]]{1,80}$")


def media_paths(text: str) -> set[str]:
    return set(PATH_RE.findall(text or ""))


def fit_transcript(data: dict) -> dict:
    """Огромная переписка (длинные выводы команд) не должна рвать соединение."""
    if len(json.dumps(data, ensure_ascii=False).encode()) <= MAX_TRANSCRIPT_BYTES:
        return data
    messages = []
    for message in data.get("messages") or []:
        if isinstance(message.get("text"), str) and len(message["text"]) > 20_000:
            message = {**message, "text": message["text"][:20_000] + "\n\n…(обрезано)"}
        messages.append(message)
    data = {**data, "messages": messages}
    while len(messages) > 10 and len(json.dumps(data, ensure_ascii=False).encode()) > MAX_TRANSCRIPT_BYTES:
        messages = messages[len(messages) // 5:]
        data = {**data, "messages": messages}
    return data


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    cfg = {**DEFAULTS, **data}
    cfg["launch"] = {**DEFAULTS["launch"], **(data.get("launch") or {})}
    cfg["scripts"] = {**SCRIPTS, **(data.get("scripts") or {})}
    if cfg["device"] not in ("laptop", "pc"):
        raise SystemExit('config: device должен быть "laptop" или "pc"')
    if not cfg["token"]:
        raise SystemExit(f"config: нет token — впиши ключ устройства из приложения в {path}")
    return cfg


def ws_url(cfg: dict[str, Any]) -> str:
    base = cfg.get("wsUrl") or re.sub(r"^http", "ws", cfg["apiUrl"].rstrip("/")) + "/agent"
    return f"{base}?token={urllib.parse.quote(cfg['token'])}"


def safe_name(name: str) -> str:
    base = os.path.basename(name or "photo.jpg")
    base = re.sub(r"[^\w.\-]+", "_", base, flags=re.UNICODE).strip("._") or "photo.jpg"
    return f"{time.strftime('%Y%m%d-%H%M%S')}-{base[-80:]}"


def graphical_env() -> dict[str, str]:
    """Окружение для kitty, даже если systemd-юнит не получил переменные сессии."""
    env = dict(os.environ)
    runtime = Path(env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}")
    env.setdefault("XDG_RUNTIME_DIR", str(runtime))
    if not env.get("WAYLAND_DISPLAY"):
        sockets = sorted(p.name for p in runtime.glob("wayland-*") if not p.name.endswith(".lock"))
        if sockets:
            env["WAYLAND_DISPLAY"] = sockets[0]
    if not env.get("HYPRLAND_INSTANCE_SIGNATURE"):
        hypr = runtime / "hypr"
        if hypr.is_dir():
            dirs = sorted(hypr.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
            if dirs:
                env["HYPRLAND_INSTANCE_SIGNATURE"] = dirs[0].name
    return env


class AraLink:
    def __init__(self, cfg: dict[str, Any]):
        self.cfg = cfg
        self.device: str = cfg["device"]
        self.api = cfg["apiUrl"].rstrip("/")
        self.ws = None
        self.watch: dict[str, dict] = {}
        self.tx_seen: dict[str, str] = {}  # key -> отпечаток последней отправленной переписки
        self.tx_mtime: dict[str, float] = {}
        self.tx_polled: dict[str, float] = {}
        self.transcripts: dict[str, dict] = {}  # key -> последняя переписка (для проверки путей)
        self.ask_paths: dict[str, set[str]] = {}  # chatId -> пути к медиа из ответов Ары
        self.sessions: dict[str, Any] = {}
        self.wake = asyncio.Event()
        self.tasks: set[asyncio.Task] = set()
        self.stopping = False

    # ---------- утилиты ----------

    def script(self, name: str) -> str:
        return str(Path(self.cfg["scripts"][name]).expanduser())

    async def run(self, argv: list[str], stdin: str | None = None, timeout: float = 30, env=None) -> tuple[int, str, str]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except (FileNotFoundError, PermissionError) as error:
            return 127, "", str(error)
        try:
            out, err = await asyncio.wait_for(proc.communicate(stdin.encode() if stdin is not None else None), timeout)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            await proc.wait()
            return 124, "", f"{os.path.basename(argv[0])}: не ответил за {int(timeout)} с"
        return proc.returncode or 0, out.decode(errors="replace"), err.decode(errors="replace")

    async def run_json(self, argv: list[str], stdin: str | None = None, timeout: float = 30) -> Any:
        code, out, err = await self.run(argv, stdin, timeout)
        if code != 0:
            raise RuntimeError((err or out).strip()[-300:] or f"{os.path.basename(argv[0])}: код {code}")
        text = out.strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # некоторые скрипты печатают лог до JSON — берём последнюю строку
            return json.loads(text.splitlines()[-1])

    async def send(self, event: dict) -> None:
        ws = self.ws
        if ws is None:
            return
        with contextlib.suppress(Exception):
            await ws.send(json.dumps(event, ensure_ascii=False))

    def spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    def remote(self, device: str | None) -> bool:
        """Агент живёт на ПК, а мы — на ноутбуке: ходим через ara-pc / ssh."""
        return device == "pc" and self.device != "pc"

    # ---------- снимок ----------

    async def snapshot(self) -> dict:
        data = await self.run_json([self.script("sessions")], timeout=20)
        live = data.get("live") or []
        for agent in live:
            agent.setdefault("device", self.device)
        self.sessions = data
        return {
            "type": "ara.snapshot",
            "device": self.device,
            "live": live,
            "recent": data.get("recent") or [],
            "pcOnline": bool(data.get("pcOnline")) or self.device == "pc",
        }

    async def snapshot_loop(self) -> None:
        failures = 0
        while True:
            try:
                await self.send(await self.snapshot())
                failures = 0
            except Exception as error:  # noqa: BLE001 — скрипт мог упасть, живём дальше
                failures += 1
                if failures in (1, 10) or failures % 100 == 0:
                    log.warning("ara-sessions: %s", error)
            await asyncio.sleep(self.cfg["snapshotInterval"])

    # ---------- переписка ----------

    async def fetch_transcript(self, entry: dict) -> dict | None:
        path = entry.get("transcript") or ""
        if not path:
            return None
        limit = str(self.cfg["transcriptLimit"])
        if self.remote(entry.get("device")):
            return await self.run_json([self.script("pc"), "transcript", path, limit], timeout=25)
        return await self.run_json([self.script("transcript"), path, limit], timeout=20)

    def remember(self, key: str, data: dict) -> None:
        self.transcripts[key] = data

    async def poll_transcript(self, key: str, entry: dict, force: bool = False) -> None:
        path = entry.get("transcript") or ""
        now = time.monotonic()
        if self.remote(entry.get("device")):
            # файл на ПК — stat недоступен, спрашиваем реже
            if not force and now - self.tx_polled.get(key, 0) < max(3.0, self.cfg["watchInterval"]):
                return
        else:
            try:
                mtime = os.stat(path).st_mtime
            except OSError:
                mtime = -1
            if not force and self.tx_mtime.get(key) == mtime:
                return
            self.tx_mtime[key] = mtime
        self.tx_polled[key] = now
        data = await self.fetch_transcript(entry)
        if not isinstance(data, dict) or data.get("same"):
            return
        data = fit_transcript(data)
        stamp = hashlib.sha1(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        if not force and self.tx_seen.get(key) == stamp:
            return
        self.tx_seen[key] = stamp
        self.remember(key, data)
        log.debug("переписка %s → телефон (%d записей)", key, len(data.get("messages") or []))
        await self.send({"type": "ara.transcript", "agentKey": key, "data": data})

    async def watch_loop(self) -> None:
        while True:
            for key, entry in list(self.watch.items()):
                if self.tx_seen.get(key) == "error" and time.monotonic() - self.tx_polled.get(key, 0) < 10:
                    continue  # скрипт упал — повторим через 10 с, без спама в журнал
                try:
                    await self.poll_transcript(key, entry, force=self.tx_seen.get(key) in (None, "error"))
                except Exception as error:  # noqa: BLE001
                    log.warning("переписка %s: %s", key, error)
                    self.tx_seen[key] = "error"
                    self.tx_polled[key] = time.monotonic()
                    self.tx_mtime.pop(key, None)
            self.wake.clear()
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.wake.wait(), self.cfg["watchInterval"])

    def on_watch(self, agents: list[dict]) -> None:
        fresh = {a["key"]: a for a in agents if isinstance(a, dict) and a.get("key")}
        log.debug("смотрят: %s", ", ".join(fresh) or "никто")
        for key in list(self.tx_seen):
            if key not in fresh or fresh[key].get("transcript") != self.watch.get(key, {}).get("transcript"):
                # новый подписчик или новая сессия в том же терминале — отправить заново
                self.tx_seen.pop(key, None)
                self.tx_mtime.pop(key, None)
        self.watch = fresh
        self.wake.set()

    # ---------- команды ----------

    async def type_into(self, agent: dict, text: str) -> None:
        term = str(agent.get("term"))
        if self.remote(agent.get("device")):
            result = await self.run_json([self.script("pc"), "send", term], stdin=text, timeout=30)
        else:
            result = await self.run_json([self.script("send"), term, text], timeout=30)
        if isinstance(result, dict) and result.get("ok") is False:
            raise RuntimeError(result.get("error") or "Терминал не принял текст")

    async def cmd_send(self, msg: dict) -> dict:
        agent = msg.get("agent") or {}
        text = (msg.get("text") or "").strip()
        images = [p for p in msg.get("images") or [] if isinstance(p, str) and p.startswith("/")]
        if images:
            text = (text + "\n\n" if text else "") + "\n".join(images)
        if not text:
            raise RuntimeError("Пустое сообщение")
        await self.type_into(agent, text)
        self.wake.set()
        return {}

    async def cmd_stop(self, msg: dict) -> dict:
        agent = msg.get("agent") or {}
        term = str(agent.get("term"))
        if self.remote(agent.get("device")):
            argv = [self.script("pc"), "stop", term]
        else:
            argv = [self.script("bridge"), "--terminal-action", "send-key", term, "escape"]
        code, out, err = await self.run(argv, timeout=15)
        if code != 0:
            raise RuntimeError((err or out).strip()[-300:] or "Не удалось остановить")
        return {}

    async def cmd_model(self, msg: dict) -> dict:
        model = str(msg.get("model") or "")
        if not MODEL_RE.match(model):
            raise RuntimeError("Непонятная модель")
        await self.type_into(msg.get("agent") or {}, f"/model {model}")
        return {}

    async def cmd_launch(self, msg: dict) -> dict:
        agent = "codex" if msg.get("agent") == "codex" else "claude"
        device = msg.get("device") or self.device
        raw_dir = (msg.get("dir") or "~").strip()
        task = msg.get("task") or ""
        model = str(msg.get("model") or "")
        if model and not MODEL_RE.match(model):
            raise RuntimeError("Непонятная модель")

        if self.remote(device):
            result = await self.run_json([self.script("pc"), "launch", agent, raw_dir], stdin=task, timeout=40)
            if isinstance(result, dict) and result.get("ok") is False:
                raise RuntimeError(result.get("error") or "ПК не запустил агента")
            return {"device": "pc"}

        directory = Path(raw_dir).expanduser()
        if not directory.is_dir():
            raise RuntimeError(f"Папка не найдена: {raw_dir}")
        command = self.cfg["launch"][agent]
        if model:
            command += f" --model {shlex.quote(model)}"
        if task.strip():
            command += " $ISLAND_TASK"
        env = graphical_env()
        env["ISLAND_TASK"] = task
        listen = f"unix:{env['XDG_RUNTIME_DIR']}/codex-agent-{{kitty_pid}}"
        argv = [
            "kitty", "-o", "allow_remote_control=socket-only", "--listen-on", listen,
            "--directory", str(directory), "fish", "-lc", command,
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv, env=env, cwd=str(directory),
                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE, start_new_session=True,
            )
        except FileNotFoundError as error:
            raise RuntimeError("kitty не найден") from error
        try:
            await asyncio.wait_for(proc.wait(), 1.5)
        except asyncio.TimeoutError:
            self.spawn(self.reap(proc))  # окно открылось и работает
            return {"device": self.device}
        err = (await proc.stderr.read()).decode(errors="replace") if proc.stderr else ""
        if proc.returncode:
            raise RuntimeError(err.strip()[-300:] or f"kitty завершился с кодом {proc.returncode}")
        return {"device": self.device}

    @staticmethod
    async def reap(proc) -> None:
        with contextlib.suppress(Exception):
            if proc.stderr:
                await proc.stderr.read()
            await proc.wait()

    async def cmd_ask(self, msg: dict) -> None:
        req = msg.get("reqId")
        chat = str(msg.get("chatId") or "")
        prompt = msg.get("prompt") or ""
        payload = {
            "prompt": prompt,
            "history": msg.get("history") or [],
            "model": msg.get("model") or "sonnet",
            "style": "talk" if msg.get("style") == "talk" else "brief",
            "name": "Ара",
        }
        # Пути из ответа Ары потом можно запросить через ara.file. Текст телефона
        # (вопрос, история) сюда не попадает: иначе любой путь можно было бы
        # «упомянуть» и скачать.
        answer: list[str] = []

        def note(text: str) -> None:
            answer.append(text)
            if chat:
                paths = self.ask_paths.setdefault(chat, set())
                paths.update(media_paths("".join(answer)))
                if len(paths) > 500:
                    self.ask_paths[chat] = set(list(paths)[-500:])
        try:
            proc = await asyncio.create_subprocess_exec(
                self.script("ask"), json.dumps(payload, ensure_ascii=False),
                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                limit=4 * 1024 * 1024,
            )
        except (FileNotFoundError, PermissionError) as error:
            await self.send({"type": "ara.ask.error", "reqId": req, "error": f"island-ask: {error}"})
            return
        finished = False
        got = False
        stderr = asyncio.create_task(proc.stderr.read()) if proc.stderr else None
        try:
            async def pump():
                nonlocal finished, got
                assert proc.stdout
                async for raw in proc.stdout:
                    line = raw.decode(errors="replace").strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    kind = item.get("t")
                    if kind == "delta":
                        got = True
                        note(item.get("text") or "")
                        await self.send({"type": "ara.ask.delta", "reqId": req, "text": item.get("text") or ""})
                    elif kind == "action":
                        await self.send({"type": "ara.ask.action", "reqId": req, "action": {k: v for k, v in item.items() if k != "t"}})
                    elif kind == "done":
                        finished = True
                        await self.send({"type": "ara.ask.done", "reqId": req})
                    elif kind == "error":
                        finished = True
                        await self.send({"type": "ara.ask.error", "reqId": req, "error": item.get("text") or "Ошибка Ары"})
                await proc.wait()

            await asyncio.wait_for(pump(), 900)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
        err = ""
        if stderr:
            with contextlib.suppress(Exception):
                err = (await asyncio.wait_for(stderr, 5)).decode(errors="replace").strip()
        if not finished:
            if got and not proc.returncode:
                await self.send({"type": "ara.ask.done", "reqId": req})
            else:
                await self.send({"type": "ara.ask.error", "reqId": req, "error": err[-300:] or "Ара не ответила"})

    # ---------- файлы ----------

    def path_allowed(self, path: str, key: str | None, chat: str | None) -> bool:
        """Отдаём только медиа, которые показаны в переписке: точные пути из полей
        images/videos или целые пути из текста агента / ответа Ары. Текст,
        написанный с телефона, не считается — иначе можно «упомянуть» любой файл."""
        if not path.startswith("/") or "\x00" in path or not MEDIA_RE.search(path):
            return False
        allowed: set[str] = set()
        if chat:
            allowed |= self.ask_paths.get(chat, set())
        data = self.transcripts.get(key or "") or {}
        for message in data.get("messages") or []:
            for field in ("images", "videos"):
                allowed.update(p for p in message.get(field) or [] if isinstance(p, str))
            if message.get("role") == "assistant":
                allowed.update(media_paths(message.get("text") or ""))
        if path not in allowed:
            return False
        # Симлинк вроде shot.png -> ~/.ssh/id_ed25519 не пройдёт: цель тоже должна быть медиа
        return bool(MEDIA_RE.search(os.path.realpath(path)))

    async def cmd_file(self, msg: dict) -> None:
        req = msg.get("reqId")
        path = str(msg.get("path") or "")
        key = msg.get("agentKey")
        chat = msg.get("chatId")
        if key and key not in self.transcripts and key in self.watch:
            with contextlib.suppress(Exception):
                self.remember(key, await self.fetch_transcript(self.watch[key]) or {})
        if not self.path_allowed(path, key, chat):
            raise RuntimeError("Этот файл не упоминается в переписке")
        device = key.split(":")[1] if key and key.count(":") >= 2 else self.device
        limit = int(self.cfg["maxFileMb"]) * 1024 * 1024
        if self.remote(device):
            host = self.cfg.get("pcSsh")
            if not host:
                raise RuntimeError("Файлы с ПК: задай pcSsh в конфиге ara-link")
            with tempfile.NamedTemporaryFile(prefix="ara-", suffix=Path(path).suffix, delete=False) as tmp:
                local = tmp.name
            try:
                code, _, err = await self.run(["sh", "-c", f"ssh -o BatchMode=yes {shlex.quote(host)} cat -- {shlex.quote(shlex.quote(path))} > {shlex.quote(local)}"], timeout=300)
                if code != 0:
                    raise RuntimeError(err.strip()[-300:] or "ПК не отдал файл")
                if os.path.getsize(local) > limit:
                    raise RuntimeError("Файл слишком большой")
                await asyncio.to_thread(self.upload_blob, local, req)
            finally:
                with contextlib.suppress(OSError):
                    os.unlink(local)
            return
        if not os.path.isfile(path):
            raise RuntimeError("Файл не найден")
        if os.path.getsize(path) > limit:
            raise RuntimeError("Файл слишком большой")
        await asyncio.to_thread(self.upload_blob, path, req)

    def upload_blob(self, path: str, req: str) -> None:
        query = urllib.parse.urlencode({"token": self.cfg["token"], "reqId": req})
        size = os.path.getsize(path)
        with open(path, "rb") as body:
            request = urllib.request.Request(
                f"{self.api}/ara/blob?{query}", data=body, method="POST",
                headers={"Content-Type": "application/octet-stream", "Content-Length": str(size)},
            )
            try:
                with urllib.request.urlopen(request, timeout=600) as response:
                    response.read()
            except urllib.error.HTTPError as error:
                detail = error.read().decode(errors="replace")[:200]
                raise RuntimeError(f"Сервер не принял файл ({error.code}) {detail}") from error

    def download_blob(self, url: str, target: Path) -> None:
        sep = "&" if "?" in url else "?"
        full = f"{self.api}{url}{sep}token={urllib.parse.quote(self.cfg['token'])}"
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(full, timeout=300) as response, open(target, "wb") as out:
            while chunk := response.read(1 << 16):
                out.write(chunk)

    async def cmd_upload(self, msg: dict) -> dict:
        url = str(msg.get("url") or "")
        if not url.startswith("/ara/blob/"):
            raise RuntimeError("Неверная ссылка на файл")
        name = safe_name(str(msg.get("name") or "photo.jpg"))
        device = msg.get("device") or self.device
        if self.remote(device):
            host = self.cfg.get("pcSsh")
            if not host:
                raise RuntimeError("Фото на ПК: задай pcSsh в конфиге ara-link")
            with tempfile.TemporaryDirectory(prefix="ara-") as tmp:
                local = Path(tmp) / name
                await asyncio.to_thread(self.download_blob, url, local)
                inbox = self.cfg["pcInboxDir"].replace("~", "$HOME", 1) if self.cfg["pcInboxDir"].startswith("~") else self.cfg["pcInboxDir"]
                remote_cmd = f'mkdir -p "{inbox}" && cat > "{inbox}/{name}" && realpath "{inbox}/{name}"'
                code, out, err = await self.run(
                    ["sh", "-c", f"ssh -o BatchMode=yes {shlex.quote(host)} {shlex.quote(remote_cmd)} < {shlex.quote(str(local))}"],
                    timeout=300,
                )
                if code != 0 or not out.strip():
                    raise RuntimeError(err.strip()[-300:] or "ПК не принял фото")
                return {"path": out.strip().splitlines()[-1]}
        target = Path(self.cfg["inboxDir"]).expanduser() / name
        await asyncio.to_thread(self.download_blob, url, target)
        return {"path": str(target)}

    # ---------- приём сообщений ----------

    async def reply(self, msg: dict, handler) -> None:
        req = msg.get("reqId")
        try:
            extra = await handler(msg)
            if extra is not None:
                await self.send({"type": "ara.result", "reqId": req, "ok": True, **extra})
        except Exception as error:  # noqa: BLE001 — любую ошибку показываем на телефоне
            log.warning("%s: %s", msg.get("type"), error)
            await self.send({"type": "ara.result", "reqId": req, "ok": False, "error": str(error) or "Ошибка"})

    async def handle(self, msg: dict) -> None:
        kind = msg.get("type")
        if kind == "ara.watch":
            self.on_watch(msg.get("agents") or [])
        elif kind == "ara.send":
            self.spawn(self.reply(msg, self.cmd_send))
        elif kind == "ara.stop":
            self.spawn(self.reply(msg, self.cmd_stop))
        elif kind == "ara.model":
            self.spawn(self.reply(msg, self.cmd_model))
        elif kind == "ara.launch":
            self.spawn(self.reply(msg, self.cmd_launch))
        elif kind == "ara.upload":
            self.spawn(self.reply(msg, self.cmd_upload))
        elif kind == "ara.file":
            async def file(m):
                await self.cmd_file(m)  # успех сервер сообщит сам, получив файл
            self.spawn(self.reply(msg, file))
        elif kind == "ara.ask":
            self.spawn(self.cmd_ask(msg))
        elif kind == "error":
            log.error("сервер: %s", msg.get("message"))

    async def session(self) -> None:
        async with ws_connect(ws_url(self.cfg), max_size=16 * 1024 * 1024, open_timeout=20, ping_interval=20, ping_timeout=30) as ws:
            self.ws = ws
            self.tx_seen.clear()
            self.tx_mtime.clear()
            self.watch = {}
            log.info("на связи с %s как %s", self.api, self.device)
            await self.send({"type": "ara.hello", "device": self.device, "version": VERSION})
            loops = [asyncio.create_task(self.snapshot_loop()), asyncio.create_task(self.watch_loop())]
            try:
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except (TypeError, json.JSONDecodeError):
                        continue
                    if isinstance(msg, dict):
                        await self.handle(msg)
            finally:
                self.ws = None
                for task in loops:
                    task.cancel()
                for task in loops:
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await task

    async def forever(self) -> None:
        delay = 1.0
        while not self.stopping:
            started = time.monotonic()
            try:
                await self.session()
                log.warning("сервер закрыл соединение")
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001
                code = getattr(getattr(error, "rcvd", None), "code", None)
                if code == 4401 or "invalid token" in str(error):
                    log.error("сервер не принял ключ устройства — выдай новый в приложении")
                    delay = 60
                else:
                    log.warning("нет связи: %s", error)
            if time.monotonic() - started > 60:
                delay = 1.0
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)


def main() -> None:
    parser = argparse.ArgumentParser(description="ara-link: связь компьютера с мобильной «Арой»")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--check", action="store_true", help="напечатать снимок агентов и выйти")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if os.environ.get("ARA_LINK_DEBUG") else logging.INFO, format="%(levelname)s %(message)s", stream=sys.stderr)
    link = AraLink(load_config(args.config))

    if args.check:
        print(json.dumps(asyncio.run(link.snapshot()), ensure_ascii=False, indent=2))
        return

    async def runner():
        loop = asyncio.get_running_loop()
        task = asyncio.current_task()
        for sig in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(NotImplementedError):
                loop.add_signal_handler(sig, task.cancel)
        with contextlib.suppress(asyncio.CancelledError):
            await link.forever()

    asyncio.run(runner())


if __name__ == "__main__":
    main()
