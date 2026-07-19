"""ARRA SYNC v2 — безопасная двусторонняя синхронизация для Arra Bro.

Синхронизирует через промежуточную серверную копию:
  * C:\\Claude — проекты и локальные инструкции;
  * ~/.claude — память и настройки Claude Code;
  * ~/.codex — настройки, навыки и контекст Codex.

Удаления намеренно выключены. При замене существующего файла его прежняя
версия сохраняется в C:\\Claude\\.arra-backups. Неоднозначные конфликты
пропускаются и показываются пользователю.

Вывод — JSON Lines для Electron-интерфейса Arra.
"""

from __future__ import annotations

import json
import os
import platform
import shlex
import shutil
import sys
import base64
import threading
import time
import ctypes
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sync_common import (
    LOCAL_CLAUDE,
    LOCAL_CODEX,
    LOCAL_CODEX_MEM,
    LOCAL_PROJECTS,
    REMOTE_CLAUDE,
    REMOTE_CODEX,
    REMOTE_CODEX_MEM,
    REMOTE_PROJECTS,
    SKIP_DIRS,
    SKIP_DIR_PREFIXES,
    SKIP_FILES,
    connect,
    ensure_dir,
    scan_local,
    scan_remote,
)

REAL = sys.stdout
EMIT_LOCK = threading.Lock()
BACKUP_ROOT = LOCAL_PROJECTS / ".arra-backups"
REMOTE_STATE = "/home/tima/sync/noda-state.json"
REMOTE_INDEX_ROOT = "/home/tima/sync/.noda-index"
DEVICE_NAME = os.environ.get("NODA_DEVICE_NAME") or platform.node() or "Компьютер"
DEVICE_ROLE = os.environ.get("NODA_DEVICE_ROLE") or "computer"
RUN_GATE = threading.Event()
RUN_GATE.set()
CONTROL_STARTED = False

SCOPES = (
    {"id": "projects", "label": "Проекты", "local": LOCAL_PROJECTS, "remote": REMOTE_PROJECTS},
    {"id": "claude", "label": "Claude Code", "local": LOCAL_CLAUDE, "remote": REMOTE_CLAUDE},
    {
        "id": "codex-memory", "label": "Codex · память", "local": LOCAL_CODEX_MEM, "remote": REMOTE_CODEX_MEM,
        "skipDirs": {
            "plugins", ".sandbox-bin", ".sandbox", ".tmp", "tmp", "cache",
            "generated_images", "visualizations", "computer-use", "browser",
            "node_repl", "process_manager", "vendor_imports",
        },
        "skipFiles": {
            "logs_2.sqlite", "logs_2.sqlite-wal", "logs_2.sqlite-shm",
            "models_cache.json", "sandbox.log", "sandbox.2026-06-11.log",
        },
    },
    {
        "id": "codex-sessions", "label": "Codex · активные сессии",
        "local": LOCAL_CODEX / "sessions", "remote": "/home/tima/sync/codex-sessions",
    },
    {
        "id": "codex-archive", "label": "Codex · архив сессий",
        "local": LOCAL_CODEX / "archived_sessions", "remote": "/home/tima/sync/codex-archived-sessions",
    },
    {
        "id": "codex-config", "label": "Codex · настройки и навыки",
        "local": LOCAL_CODEX, "remote": REMOTE_CODEX,
        "includeRoots": {
            ".codex-global-state.json", ".personality_migration", "AGENTS.md",
            "config.toml", "history.jsonl", "hooks.json", "keybindings.json",
            "session_index.jsonl", "external_agent_session_imports.json",
            "agents", "automations", "rules", "skills", "ambient-suggestions",
            "attachments",
        },
    },
)


def emit(obj):
    with EMIT_LOCK:
        REAL.write(json.dumps(obj, ensure_ascii=False) + "\n")
        REAL.flush()


def start_control_listener():
    """Listen for pause/resume commands from Electron without interrupting SFTP.

    Blocking the transfer callback is intentional: the current connection and
    temporary file stay alive, so Resume continues the same byte instead of
    restarting the file.
    """
    global CONTROL_STARTED
    if CONTROL_STARTED:
        return
    CONTROL_STARTED = True

    def listen():
        for raw in sys.stdin:
            command = raw.strip().lower()
            if command == "pause" and RUN_GATE.is_set():
                RUN_GATE.clear()
                emit({"type": "paused", "msg": "Передача на паузе"})
            elif command == "resume" and not RUN_GATE.is_set():
                RUN_GATE.set()
                emit({"type": "resumed", "msg": "Передача продолжена"})

    threading.Thread(target=listen, name="noda-sync-control", daemon=True).start()


def wait_for_control():
    while not RUN_GATE.wait(0.25):
        pass


def local_file_issue(path, require_replace=False):
    """Проверить, можно ли безопасно прочитать или заменить файл.

    Для отправки достаточно совместного чтения: VS Code, Codex и Claude могут
    продолжать работу, пока Noda снимает текущий срез файла. При получении нам
    не нужен эксклюзивный доступ: важно лишь, разрешают ли уже открытые дескрипторы
    атомарно переименовать файл. Проверка через share=0 была слишком строгой и
    ошибочно считала занятым любой открытый JSONL сессии Codex.
    """
    path = Path(path)
    if not path.exists():
        return "файл исчез до начала передачи"
    try:
        if os.name == "nt" and require_replace:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            create_file = kernel32.CreateFileW
            create_file.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                    ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
            create_file.restype = ctypes.c_void_p
            # DELETE + FILE_SHARE_READ/WRITE/DELETE проверяет именно возможность
            # будущего os.replace(), не требуя закрывать программу, которая лишь
            # читает файл или держит JSONL открытым с корректным sharing mode.
            handle = create_file(str(path), 0x00010000, 0x00000007, None, 3, 0x80, None)
            invalid = ctypes.c_void_p(-1).value
            if handle == invalid:
                code = ctypes.get_last_error()
                if code in (32, 33):
                    return "открытая программа запрещает заменить файл"
                if code == 5:
                    return "Windows не разрешает заменить файл"
                return f"Windows не разрешает открыть файл (код {code})"
            kernel32.CloseHandle(ctypes.c_void_p(handle))
        with open(path, "rb") as stream:
            stream.read(1)
    except PermissionError:
        return "нет доступа к файлу"
    except OSError as ex:
        return str(ex)
    return ""


def change_path(scope_id, rel, key):
    if scope_id == "projects" and rel == key:
        return Path(rel).name
    prefix = key + "/"
    if scope_id == "projects" and rel.startswith(prefix):
        return rel[len(prefix):]
    return rel


def change_folder(path):
    parts = path.split("/")
    return parts[0] if len(parts) > 1 else "(корень)"


def safe_remote_remove(sftp, path):
    try:
        sftp.remove(path)
    except Exception:
        pass


def is_append_only_session(scope, rel):
    if not rel.lower().endswith(".jsonl"):
        return False
    if scope.get("id") in {"codex-sessions", "codex-archive"}:
        return True
    return scope.get("id") == "codex-config" and Path(rel).name.lower() in {
        "history.jsonl", "session_index.jsonl", "external_agent_session_imports.jsonl",
    }


def remote_matches_local_prefix(sftp, local_path, remote_path, remote_size, window=65536):
    """Проверяет конец уже загруженной части append-only файла."""
    if remote_size <= 0:
        return True
    offset = max(0, int(remote_size) - int(window))
    length = int(remote_size) - offset
    try:
        with open(local_path, "rb") as local_stream:
            local_stream.seek(offset)
            local_tail = local_stream.read(length)
        with sftp.open(remote_path, "rb") as remote_stream:
            remote_stream.seek(offset)
            remote_tail = remote_stream.read(length)
        return local_tail == remote_tail and len(local_tail) == length
    except Exception:
        return False


def upload_fixed_prefix(sftp, local_path, remote_stream, start, end, progress_callback):
    """Передаёт зафиксированный диапазон, даже если исходный JSONL дописывается."""
    sent = int(start)
    origin = sent
    remaining = max(0, int(end) - sent)
    with open(local_path, "rb") as source:
        source.seek(sent)
        while remaining:
            wait_for_control()
            chunk = source.read(min(1024 * 1024, remaining))
            if not chunk:
                raise RuntimeError("файл стал короче во время отправки")
            remote_stream.write(chunk)
            sent += len(chunk)
            remaining -= len(chunk)
            progress_callback(sent - origin, int(end) - origin)
    remote_stream.flush()


def download_fixed_suffix(sftp, remote_path, local_path, start, end, progress_callback):
    """Append only the stable missing suffix of a remote JSONL session."""
    received = int(start)
    origin = received
    remaining = max(0, int(end) - received)
    with sftp.open(remote_path, "rb") as remote_stream, open(local_path, "ab") as local_stream:
        remote_stream.seek(received)
        while remaining:
            wait_for_control()
            chunk = remote_stream.read(min(1024 * 1024, remaining))
            if not chunk:
                raise RuntimeError("серверный файл стал короче во время получения")
            local_stream.write(chunk)
            received += len(chunk)
            remaining -= len(chunk)
            progress_callback(received - origin, int(end) - origin)
        local_stream.flush()
        os.fsync(local_stream.fileno())


def read_server_state(sftp):
    try:
        with sftp.file(REMOTE_STATE, "r") as stream:
            return json.loads(stream.read().decode("utf-8", "replace"))
    except Exception:
        return {"devices": {}}


def write_server_state(sftp, state):
    tmp = REMOTE_STATE + ".tmp"
    payload = json.dumps(state, ensure_ascii=False, indent=2).encode("utf-8")
    with sftp.file(tmp, "wb") as stream:
        stream.write(payload)
    try:
        sftp.posix_rename(tmp, REMOTE_STATE)
    except Exception:
        try:
            sftp.remove(REMOTE_STATE)
        except Exception:
            pass
        sftp.rename(tmp, REMOTE_STATE)


def record_server_state(sftp, direction, transferred, transferred_bytes, errors):
    state = read_server_state(sftp)
    state.setdefault("devices", {})
    event = {
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "device": DEVICE_NAME,
        "role": DEVICE_ROLE,
        "files": int(transferred or 0),
        "bytes": int(transferred_bytes or 0),
        "errors": int(errors or 0),
    }
    device = state["devices"].setdefault(DEVICE_NAME, {"role": DEVICE_ROLE})
    device["role"] = DEVICE_ROLE
    if direction == "push":
        state["lastPush"] = event
        device["lastPush"] = event
    elif direction == "pull":
        state["lastPull"] = event
        device["lastPull"] = event
    write_server_state(sftp, state)


def write_remote_indexes(sftp, scopes):
    """Refresh the compact server indexes after Noda changes server state.

    The server-state file deliberately invalidates indexes written by older clients.
    Writing these snapshots after the state update keeps the next check instant while
    preserving compatibility with those clients.
    """
    try:
        ensure_dir(sftp, REMOTE_INDEX_ROOT)
        for scope in scopes:
            payload = {
                "files": {
                    rel: [int(meta[0]), int(meta[1])]
                    for rel, meta in scope["remoteMap"].items()
                },
                "dirs": 0,
            }
            blob = zlib.compress(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
                6,
            )
            path = f"{REMOTE_INDEX_ROOT}/{scope['id']}-v2.z"
            temp = path + f".tmp-{os.getpid()}"
            with sftp.open(temp, "wb") as stream:
                stream.write(blob)
            try:
                sftp.posix_rename(temp, path)
            except Exception:
                safe_remote_remove(sftp, path)
                sftp.rename(temp, path)
    except Exception as ex:
        emit({"type": "diagnostic", "area": "remote-index", "error": str(ex)[:260]})


def project_key(scope_id, rel):
    if scope_id == "claude":
        return "@claude"
    if scope_id.startswith("codex"):
        return "@" + scope_id
    parts = rel.split("/")
    containers = {"Work", "Tima", "MAMA", "Tools"}
    if len(parts) >= 2 and parts[0] in containers:
        return f"{parts[0]}/{parts[1]}"
    return parts[0] if parts else "(корень)"


def project_label(key):
    if key == "@claude":
        return "Память Claude Code"
    codex_labels = {
        "@codex-memory": "Codex · память",
        "@codex-sessions": "Codex · продолжение сессий",
        "@codex-archive": "Codex · архив сессий",
        "@codex-config": "Codex · настройки и навыки",
    }
    if key in codex_labels:
        return codex_labels[key]
    return key.split("/")[-1]


def in_scope(scope_id, rel, only):
    if not only:
        return True
    return project_key(scope_id, rel) == only


def classify(local, remote):
    """Вернуть upload/download/conflicts на основе наличия, size и mtime.

    mtime сохраняется при каждой передаче, поэтому более новое время обозначает
    сторону-источник. Если времена практически одинаковы, но размеры различны,
    направление небезопасно угадывать — это конфликт.
    """
    upload, download, conflicts = [], [], []
    for rel in sorted(set(local) | set(remote)):
        l = local.get(rel)
        r = remote.get(rel)
        if l is None:
            download.append(rel)
            continue
        if r is None:
            upload.append(rel)
            continue
        if l[0] == r[0] and abs(l[1] - r[1]) <= 2:
            continue
        if l[1] > r[1] + 2:
            upload.append(rel)
        elif r[1] > l[1] + 2:
            download.append(rel)
        else:
            conflicts.append(rel)
    return upload, download, conflicts


def fast_scan_remote(client, scope_id, remote_base, label, progress, started, extra_skip_dirs=None, extra_skip_files=None,
                     include_roots=None):
    """Собрать индекс на сервере одним процессом вместо тысяч SFTP round-trip.

    Старый рекурсивный listdir_attr занимал минуты: каждый каталог требовал
    отдельного сетевого запроса. Здесь os.scandir выполняется непосредственно
    на сервере, а назад приезжает один JSON с size/mtime.
    """
    progress(files=0, dirs=0)
    script = r'''
import base64, json, os, sys, time, zlib
base = sys.argv[1]
skip_dirs = set(json.loads(sys.argv[2]))
skip_prefixes = tuple(json.loads(sys.argv[3]))
skip_files = set(json.loads(sys.argv[4]))
include_roots = set(json.loads(sys.argv[5]))
cache_path = sys.argv[6]
state_path = sys.argv[7]
blob = None
try:
    cache_mtime = os.path.getmtime(cache_path)
    state_mtime = os.path.getmtime(state_path) if os.path.exists(state_path) else 0
    if cache_mtime >= state_mtime and time.time() - cache_mtime < 600:
        with open(cache_path, "rb") as stream: blob = stream.read()
except Exception: blob = None
if not blob:
    files = {}
    dirs = 0
    if os.path.isdir(base):
        stack = [base]
        while stack:
            folder = stack.pop(); dirs += 1
            try: entries = list(os.scandir(folder))
            except Exception: continue
            for entry in entries:
                try:
                    if folder == base and include_roots and entry.name not in include_roots: continue
                    if entry.is_dir(follow_symlinks=False):
                        if entry.name not in skip_dirs and not entry.name.startswith(skip_prefixes): stack.append(entry.path)
                    elif entry.is_file(follow_symlinks=False) and entry.name not in skip_files:
                        st = entry.stat()
                        rel = os.path.relpath(entry.path, base).replace(os.sep, "/")
                        files[rel] = [int(st.st_size), int(st.st_mtime)]
                except Exception: pass
    blob = zlib.compress(json.dumps({"files": files, "dirs": dirs}, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 6)
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        temp = cache_path + ".tmp-" + str(os.getpid())
        with open(temp, "wb") as stream: stream.write(blob)
        os.replace(temp, cache_path)
    except Exception: pass
print(base64.b64encode(blob).decode("ascii"))
'''
    cache_path = f"/home/tima/sync/.noda-index/{scope_id}-v2.z"
    cmd = "python3 -c {script} {base} {dirs} {prefixes} {files} {include} {cache} {state}".format(
        script=shlex.quote(script), base=shlex.quote(remote_base),
        dirs=shlex.quote(json.dumps(sorted(SKIP_DIRS | set(extra_skip_dirs or ())))),
        prefixes=shlex.quote(json.dumps(sorted(SKIP_DIR_PREFIXES))),
        files=shlex.quote(json.dumps(sorted(SKIP_FILES | set(extra_skip_files or ())))),
        include=shlex.quote(json.dumps(sorted(set(include_roots or ())))),
        cache=shlex.quote(cache_path), state=shlex.quote(REMOTE_STATE),
    )
    _stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
    raw = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace").strip()
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"Индекс сервера не построен: {err or 'код ' + str(code)}")
    payload = json.loads(zlib.decompress(base64.b64decode(raw.strip())).decode("utf-8"))
    files = {k: (int(v[0]), int(v[1])) for k, v in (payload.get("files") or {}).items()}
    progress(files=len(files), dirs=int(payload.get("dirs") or 0), done=True)
    return files


def scan_everything(mode="status"):
    started = time.time()
    emit({"type": "phase", "msg": "Подключаюсь к серверу…", "detail": "Проверяю защищённое соединение"})
    client, sftp = connect()
    result = []
    try:
        maps = {scope["id"]: {} for scope in SCOPES}

        def remote_task(scope):
            label = scope["label"]
            def remote_progress(files=0, dirs=0, done=False, _label=label):
                emit({"type": "scan", "side": "remote", "scope": _label, "files": files,
                      "dirs": dirs, "done": done, "elapsed": int(time.time() - started),
                      "msg": f"Сканирую сервер · {_label}"})
            return fast_scan_remote(client, scope["id"], scope["remote"], label, remote_progress, started,
                                    scope.get("skipDirs"), scope.get("skipFiles"), scope.get("includeRoots"))

        def local_task(scope):
            label = scope["label"]
            def local_progress(files=0, dirs=0, done=False, _label=label):
                emit({"type": "scan", "side": "local", "scope": _label, "files": files,
                      "dirs": dirs, "done": done, "elapsed": int(time.time() - started),
                      "msg": f"Сканирую этот компьютер · {_label}"})
            return scan_local(scope["local"], mode == "push", label, progress=local_progress,
                              extra_skip_dirs=scope.get("skipDirs"), extra_skip_files=scope.get("skipFiles"),
                              include_roots=scope.get("includeRoots"),
                              allow_large=scope["id"] in {"codex-sessions", "codex-archive"})

        with ThreadPoolExecutor(max_workers=min(12, len(SCOPES) * 2)) as pool:
            futures = {}
            for scope in SCOPES:
                futures[pool.submit(remote_task, scope)] = (scope["id"], "remote")
                futures[pool.submit(local_task, scope)] = (scope["id"], "local")
            for future in as_completed(futures):
                sid, side = futures[future]
                maps[sid][side] = future.result()

        for scope in SCOPES:
            local = maps[scope["id"]]["local"]
            remote = maps[scope["id"]]["remote"]
            upload, download, conflicts = classify(local, remote)
            result.append({**scope, "localMap": local, "remoteMap": remote,
                           "uploadList": upload, "downloadList": download,
                           "conflictList": conflicts})
        return client, sftp, result, started
    except Exception:
        try:
            sftp.close()
            client.close()
        except Exception:
            pass
        raise


def build_status(scopes, started, server_state=None):
    projects = {}
    scope_rows = []
    local_files = remote_files = upload_n = download_n = conflict_n = blocked_n = 0

    def ensure_row(scope, rel):
        key = project_key(scope["id"], rel)
        row = projects.setdefault(key, {
            "name": key, "label": project_label(key), "scope": scope["id"],
            "upload": 0, "download": 0, "conflicts": 0,
            "uploadBytes": 0, "downloadBytes": 0, "total": 0,
            "localFiles": 0, "remoteFiles": 0, "localLatest": 0, "remoteLatest": 0,
            "blocked": 0, "changes": [], "folders": {},
        })
        return row

    def bucket(scope, rel, kind, size):
        row = ensure_row(scope, rel)
        row[kind] += 1
        if kind != "conflicts":
            row[kind + "Bytes"] += int(size or 0)

    def add_change(scope, rel, direction, size, mtime, issue=""):
        nonlocal blocked_n
        row = ensure_row(scope, rel)
        key = project_key(scope["id"], rel)
        short = change_path(scope["id"], rel, key)
        folder = change_folder(short)
        if len(row["changes"]) < 120:
            row["changes"].append({
                "path": short, "direction": direction, "bytes": int(size or 0),
                "mtime": int(mtime or 0), "blocked": bool(issue), "reason": issue,
            })
        summary = row["folders"].setdefault(folder, {"name": folder, "files": 0, "bytes": 0, "blocked": 0})
        summary["files"] += 1
        summary["bytes"] += int(size or 0)
        if issue:
            row["blocked"] += 1
            summary["blocked"] += 1
            blocked_n += 1

    for scope in scopes:
        local, remote = scope["localMap"], scope["remoteMap"]
        uploads, downloads, conflicts = scope["uploadList"], scope["downloadList"], scope["conflictList"]
        local_files += len(local); remote_files += len(remote)
        upload_n += len(uploads); download_n += len(downloads); conflict_n += len(conflicts)
        for rel, meta in local.items():
            row = ensure_row(scope, rel)
            row["localFiles"] += 1
            row["localLatest"] = max(row["localLatest"], int(meta[1] or 0))
        for rel, meta in remote.items():
            row = ensure_row(scope, rel)
            row["remoteFiles"] += 1
            row["remoteLatest"] = max(row["remoteLatest"], int(meta[1] or 0))
        for rel in uploads:
            bucket(scope, rel, "upload", local[rel][0])
            issue = local_file_issue(scope["local"] / Path(rel.replace("/", os.sep)))
            add_change(scope, rel, "upload", local[rel][0], local[rel][1], issue)
        for rel in downloads:
            bucket(scope, rel, "download", remote[rel][0])
            local_target = scope["local"] / Path(rel.replace("/", os.sep))
            issue = local_file_issue(local_target) if local_target.exists() else ""
            add_change(scope, rel, "download", remote[rel][0], remote[rel][1], issue)
        for rel in conflicts:
            bucket(scope, rel, "conflicts", 0)
            meta = local.get(rel) or remote.get(rel) or (0, 0)
            add_change(scope, rel, "conflict", meta[0], meta[1])
        for rel in local:
            ensure_row(scope, rel)["total"] += 1
        scope_rows.append({
            "id": scope["id"], "label": scope["label"],
            "localFiles": len(local), "remoteFiles": len(remote),
            "upload": len(uploads), "download": len(downloads), "conflicts": len(conflicts),
        })

    def scope_rank(value):
        if value == "projects": return 0
        if value == "claude": return 1
        if value.startswith("codex"): return 2
        return 9
    rows = sorted(projects.values(), key=lambda p: (scope_rank(p["scope"]), p["label"].casefold()))
    for row in rows:
        row["changes"].sort(key=lambda item: (item["direction"], item["path"].casefold()))
        row["folders"] = sorted(row["folders"].values(), key=lambda item: item["name"].casefold())
    emit({
        "type": "status", "server": "186.246.2.140",
        "localFiles": local_files, "remoteFiles": remote_files,
        "upload": upload_n, "download": download_n, "conflicts": conflict_n, "blocked": blocked_n,
        "projects": rows, "scopes": scope_rows,
        "serverState": server_state or {"devices": {}},
        "elapsed": int(time.time() - started),
    })


def backup_path(scope_id, rel, stamp):
    return BACKUP_ROOT / stamp / scope_id / Path(rel.replace("/", os.sep))


def backup_local_file(source, scope_id, rel, stamp):
    if not source.exists():
        return
    target = backup_path(scope_id, rel, stamp)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def backup_remote_file(sftp, remote_path, scope_id, rel, stamp):
    target = backup_path(scope_id, rel, stamp)
    target.parent.mkdir(parents=True, exist_ok=True)
    sftp.get(remote_path, str(target))


def transfer(mode, only, dry_run=False):
    start_control_listener()
    client, sftp, scopes, started = scan_everything(mode)
    try:
        projects = next((scope for scope in scopes if scope["id"] == "projects"), None)
        if (
            mode in ("push", "sync") and not only and projects and
            len(projects["localMap"]) >= 5000 and len(projects["remoteMap"]) < 1000 and
            os.environ.get("NODA_ALLOW_EMPTY_SERVER") != "1"
        ):
            emit({
                "type": "error",
                "error": (
                    "Сервер переноса вернул аномально пустой индекс. Передача не начата, "
                    "чтобы Noda не отправила весь компьютер не на тот сервер."
                ),
                "code": "remote-index-empty",
                "localFiles": len(projects["localMap"]),
                "remoteFiles": len(projects["remoteMap"]),
            })
            return
        operations = []
        conflicts = []
        for scope in scopes:
            uploads = [r for r in scope["uploadList"] if in_scope(scope["id"], r, only)]
            downloads = [r for r in scope["downloadList"] if in_scope(scope["id"], r, only)]
            scope_conflicts = [r for r in scope["conflictList"] if in_scope(scope["id"], r, only)]
            if mode in ("push", "sync"):
                for rel in uploads:
                    size = int(scope["localMap"][rel][0])
                    remote = scope["remoteMap"].get(rel)
                    if is_append_only_session(scope, rel) and remote and 0 < int(remote[0]) < size:
                        remote_path = f"{scope['remote']}/{rel}"
                        local_path = scope["local"] / Path(rel.replace("/", os.sep))
                        if remote_matches_local_prefix(sftp, local_path, remote_path, int(remote[0])):
                            scope.setdefault("appendOffsets", {})[rel] = int(remote[0])
                            size -= int(remote[0])
                    operations.append(("push", scope, rel, size))
            if mode in ("pull", "sync"):
                for rel in downloads:
                    remote_size = int(scope["remoteMap"][rel][0])
                    local_path = scope["local"] / Path(rel.replace("/", os.sep))
                    if is_append_only_session(scope, rel) and local_path.exists():
                        local_size = int(local_path.stat().st_size)
                        remote_path = f"{scope['remote']}/{rel}"
                        if 0 <= local_size < remote_size and remote_matches_local_prefix(
                            sftp, local_path, remote_path, local_size
                        ):
                            scope.setdefault("pullAppendOffsets", {})[rel] = local_size
                            operations.append(("pull", scope, rel, remote_size - local_size))
                            continue
                        # Never replace an active Codex JSONL with a divergent
                        # copy. Both histories remain intact and the UI shows a
                        # conflict instead of an endless Windows lock error.
                        scope_conflicts.append(rel)
                        continue
                    operations.append(("pull", scope, rel, remote_size))
            conflicts.extend((scope, rel) for rel in scope_conflicts)

        operations.sort(key=lambda op: (project_label(project_key(op[1]["id"], op[2])).casefold(), op[2].casefold()))
        total = len(operations)
        total_bytes = sum(op[3] for op in operations)
        project_plan = {}
        scope_plan = {}

        # The UI needs the complete hierarchy, not only the changed byte count.
        # Build compact inventory rows for every source project/folder, then attach
        # the actual changed files that will move in this run.
        for scope in scopes:
            source_map = scope["localMap"] if mode in ("push", "sync") else scope["remoteMap"]
            target_map = scope["remoteMap"] if mode in ("push", "sync") else scope["localMap"]
            scope_row = {
                "id": scope["id"], "label": scope["label"],
                "inventoryFiles": len(source_map), "targetFiles": len(target_map),
                "files": 0, "bytes": 0, "verified": 0, "errors": 0,
                "snapshotFiles": 0,
            }
            scope_plan[scope["id"]] = scope_row
            for rel in source_map:
                key = project_key(scope["id"], rel)
                if only and key != only:
                    continue
                plan = project_plan.setdefault(key, {
                    "name": key, "label": project_label(key),
                    "scopeId": scope["id"], "scopeLabel": scope["label"],
                    "files": 0, "bytes": 0, "inventoryFiles": 0,
                    "targetFiles": 0, "folders": {},
                })
                plan["inventoryFiles"] += 1
                short = change_path(scope["id"], rel, key)
                folder = change_folder(short)
                folder_row = plan["folders"].setdefault(folder, {
                    "name": folder, "inventoryFiles": 0, "files": 0, "bytes": 0,
                })
                folder_row["inventoryFiles"] += 1
            for rel in target_map:
                key = project_key(scope["id"], rel)
                if only and key != only:
                    continue
                plan = project_plan.get(key)
                if plan:
                    plan["targetFiles"] += 1

        plan_items = []
        for direction, scope, rel, size in operations:
            key = project_key(scope["id"], rel)
            plan = project_plan.setdefault(key, {
                "name": key, "label": project_label(key),
                "scopeId": scope["id"], "scopeLabel": scope["label"],
                "files": 0, "bytes": 0, "inventoryFiles": 0,
                "targetFiles": 0, "folders": {},
            })
            plan["files"] += 1
            plan["bytes"] += int(size or 0)
            scope_plan[scope["id"]]["files"] += 1
            scope_plan[scope["id"]]["bytes"] += int(size or 0)
            short = change_path(scope["id"], rel, key)
            folder = change_folder(short)
            folder_row = plan["folders"].setdefault(folder, {
                "name": folder, "inventoryFiles": 0, "files": 0, "bytes": 0,
            })
            folder_row["files"] += 1
            folder_row["bytes"] += int(size or 0)
            snapshot = is_append_only_session(scope, rel)
            if snapshot:
                scope_plan[scope["id"]]["snapshotFiles"] += 1
            plan_items.append({
                "scopeId": scope["id"], "scope": scope["label"],
                "projectKey": key, "project": project_label(key),
                "file": rel, "path": short, "folder": folder,
                "bytes": int(size or 0),
                "snapshot": snapshot,
                "snapshotBytes": int((scope["localMap"] if direction == "push" else scope["remoteMap"])[rel][0]),
            })

        project_rows = []
        for plan in project_plan.values():
            plan["folders"] = sorted(plan["folders"].values(), key=lambda row: row["name"].casefold())
            project_rows.append(plan)
        project_rows.sort(key=lambda p: (p["scopeId"], p["label"].casefold()))
        scope_rows = [scope_plan[scope["id"]] for scope in scopes]
        emit({"type": "plan", "direction": mode, "files": total, "bytes": total_bytes,
              "only": only or "", "conflicts": len(conflicts),
              "scopes": scope_rows, "projects": project_rows, "items": plan_items})
        for scope, rel in conflicts[:100]:
            emit({"type": "fileerror", "file": f"{scope['label']} · {rel}",
                  "error": "конфликт: версии различаются, направление не определено — пропущено"})

        if dry_run:
            emit({"type": "done", "direction": mode, "transferred": 0, "errors": 0,
                  "bytes": 0, "planned": total, "plannedBytes": total_bytes,
                  "skipped": len(conflicts), "preview": True,
                  "proof": scope_rows,
                  "elapsed": int(time.time() - started)})
            return

        if total == 0:
            done_state = None
            if mode in ("push", "pull"):
                record_server_state(sftp, mode, 0, 0, 0)
                write_remote_indexes(sftp, scopes)
                done_state = read_server_state(sftp)
            emit({"type": "done", "direction": mode, "transferred": 0, "errors": 0,
                  "bytes": 0, "skipped": len(conflicts), "msg": "Уже актуально",
                  "planned": 0, "verified": 0, "proof": scope_rows,
                  "serverState": done_state or {},
                  "elapsed": int(time.time() - started)})
            return

        blocked = []
        emit({"type": "preflight", "checked": 0, "total": total, "blocked": 0,
              "msg": "Проверяю открытые и заблокированные файлы"})
        for index, (direction, scope, rel, _size) in enumerate(operations, 1):
            wait_for_control()
            local_path = scope["local"] / Path(rel.replace("/", os.sep))
            issue = ""
            if direction == "push" or local_path.exists():
                append_pull = direction == "pull" and rel in scope.get("pullAppendOffsets", {})
                issue = local_file_issue(local_path, require_replace=(direction == "pull" and not append_pull))
            if issue:
                blocked.append({
                    "project": project_label(project_key(scope["id"], rel)),
                    "file": rel, "reason": issue, "direction": direction,
                })
            if index == total or index % 25 == 0:
                emit({"type": "preflight", "checked": index, "total": total,
                      "blocked": len(blocked), "file": rel})
        if blocked:
            emit({"type": "blocked", "count": len(blocked), "files": blocked[:100],
                  "error": "Передача не начата: некоторые файлы открыты или меняются. Закрой указанные редакторы и повтори."})
            return
        emit({"type": "preflight", "checked": total, "total": total, "blocked": 0, "done": True})

        stamp = time.strftime("%Y-%m-%d_%H-%M-%S")
        done = done_bytes = errors = 0
        t0 = time.time()
        project_done_files = {key: 0 for key in project_plan}
        project_done_bytes = {key: 0 for key in project_plan}
        successful = []
        recent_emit = [0.0]
        for direction, scope, rel, size in operations:
            wait_for_control()
            local_path = scope["local"] / Path(rel.replace("/", os.sep))
            remote_path = f"{scope['remote']}/{rel}"
            key = project_key(scope["id"], rel)
            label = project_label(key)
            plan = project_plan[key]
            ok = False
            last_error = ""
            expected_mtime = 0
            success_size = int(size)

            def progress_callback(transferred, file_total):
                wait_for_control()
                now = time.time()
                if transferred < file_total and now - recent_emit[0] < 0.18:
                    return
                recent_emit[0] = now
                aggregate = done_bytes + int(transferred or 0)
                speed = int(aggregate / max(now - t0, 0.001))
                eta = int((total_bytes - aggregate) / speed) if speed else None
                emit({
                    "type": "progress", "direction": direction,
                    "scopeId": scope["id"], "scope": scope["label"],
                    "project": label, "projectKey": key,
                    "done": done, "total": total, "bytes": aggregate, "totalBytes": total_bytes,
                    "file": rel, "fileBytes": int(transferred or 0), "fileTotal": int(file_total or size),
                    "speed": speed, "eta": eta,
                    "projectDone": project_done_files[key], "projectTotal": plan["files"],
                    "projectBytes": project_done_bytes[key] + int(transferred or 0),
                    "projectTotalBytes": plan["bytes"], "state": "copying",
                })

            for attempt in range(4):
                try:
                    if direction == "push":
                        issue = local_file_issue(local_path, require_replace=False)
                        if issue:
                            raise RuntimeError(issue)
                        before = local_path.stat()
                        expected_mtime = int(before.st_mtime)
                        expected_size = int(before.st_size)
                        success_size = expected_size
                        append_only = is_append_only_session(scope, rel)
                        remote_before = None
                        if rel in scope["remoteMap"]:
                            remote_before = sftp.stat(remote_path)
                        ensure_dir(sftp, remote_path.rsplit("/", 1)[0])
                        can_append = bool(
                            append_only and remote_before and
                            0 < int(remote_before.st_size) < expected_size and
                            (
                                scope.get("appendOffsets", {}).get(rel) == int(remote_before.st_size) or
                                remote_matches_local_prefix(sftp, local_path, remote_path, int(remote_before.st_size))
                            )
                        )
                        if can_append:
                            with sftp.open(remote_path, "ab") as remote_stream:
                                upload_fixed_prefix(sftp, local_path, remote_stream, int(remote_before.st_size), expected_size, progress_callback)
                        else:
                            if remote_before:
                                backup_remote_file(sftp, remote_path, scope["id"], rel, stamp)
                            temp_remote = remote_path + f".noda-part-{os.getpid()}"
                            safe_remote_remove(sftp, temp_remote)
                            if append_only:
                                with sftp.open(temp_remote, "wb") as remote_stream:
                                    upload_fixed_prefix(sftp, local_path, remote_stream, 0, expected_size, progress_callback)
                            else:
                                sftp.put(str(local_path), temp_remote, callback=progress_callback, confirm=True)
                                after = local_path.stat()
                                if before.st_size != after.st_size or int(before.st_mtime) != int(after.st_mtime):
                                    safe_remote_remove(sftp, temp_remote)
                                    raise RuntimeError("файл изменился во время отправки")
                            uploaded = sftp.stat(temp_remote)
                            if int(uploaded.st_size) != expected_size:
                                safe_remote_remove(sftp, temp_remote)
                                raise RuntimeError("сервер получил неполный размер файла")
                            try:
                                sftp.posix_rename(temp_remote, remote_path)
                            except Exception:
                                safe_remote_remove(sftp, remote_path)
                                sftp.rename(temp_remote, remote_path)
                        try:
                            sftp.utime(remote_path, (expected_mtime, expected_mtime))
                        except Exception:
                            pass
                        if int(sftp.stat(remote_path).st_size) != expected_size:
                            raise RuntimeError("проверка размера на сервере не пройдена")
                    else:
                        append_offset = scope.get("pullAppendOffsets", {}).get(rel)
                        if local_path.exists():
                            issue = local_file_issue(local_path, require_replace=append_offset is None)
                            if issue:
                                raise RuntimeError(issue)
                        remote_before = sftp.stat(remote_path)
                        expected_mtime = int(remote_before.st_mtime)
                        success_size = int(remote_before.st_size)
                        if local_path.exists() and append_offset is None:
                            backup_local_file(local_path, scope["id"], rel, stamp)
                        local_path.parent.mkdir(parents=True, exist_ok=True)
                        if append_offset is not None:
                            if int(local_path.stat().st_size) != int(append_offset):
                                raise RuntimeError("активная сессия изменилась до получения продолжения")
                            download_fixed_suffix(
                                sftp, remote_path, local_path, int(append_offset),
                                int(remote_before.st_size), progress_callback,
                            )
                        else:
                            tmp = str(local_path) + ".noda-part"
                            try:
                                os.remove(tmp)
                            except OSError:
                                pass
                            sftp.get(remote_path, tmp, callback=progress_callback)
                            if os.path.getsize(tmp) != int(remote_before.st_size):
                                try: os.remove(tmp)
                                except OSError: pass
                                raise RuntimeError("получен неполный размер файла")
                            os.replace(tmp, str(local_path))
                        remote_after = sftp.stat(remote_path)
                        if (int(remote_before.st_size), int(remote_before.st_mtime)) != (int(remote_after.st_size), int(remote_after.st_mtime)):
                            raise RuntimeError("серверный файл изменился во время получения")
                        try:
                            os.utime(str(local_path), (expected_mtime, expected_mtime))
                        except Exception:
                            pass
                        if local_path.stat().st_size != int(remote_before.st_size):
                            raise RuntimeError("проверка локального размера не пройдена")
                    ok = True
                    break
                except Exception as ex:
                    last_error = str(ex)
                    emit({"type": "retry", "direction": direction, "project": label,
                          "file": rel, "attempt": attempt + 1, "error": last_error[:160]})
                    if attempt < 3:
                        time.sleep(0.6 * (attempt + 1))
            done += 1
            if ok:
                done_bytes += size
                project_done_files[key] += 1
                project_done_bytes[key] += size
                successful.append((direction, scope, rel, success_size, int(expected_mtime)))
                if direction == "push":
                    scope["remoteMap"][rel] = (int(success_size), int(expected_mtime))
            else:
                errors += 1
                emit({"type": "fileerror", "file": rel, "error": last_error[:160]})
            speed = int(done_bytes / max(time.time() - t0, 0.001))
            eta = int((total_bytes - done_bytes) / speed) if speed else None
            emit({"type": "progress", "direction": direction,
                  "scopeId": scope["id"], "scope": scope["label"],
                  "project": label, "projectKey": key,
                  "done": done, "total": total, "bytes": done_bytes,
                  "totalBytes": total_bytes, "file": rel, "fileBytes": size if ok else 0,
                  "fileTotal": size, "speed": speed, "eta": eta,
                  "projectDone": project_done_files[key], "projectTotal": plan["files"],
                  "projectBytes": project_done_bytes[key], "projectTotalBytes": plan["bytes"],
                  "state": "done" if ok else "failed"})

        emit({"type": "verify", "done": 0, "total": len(successful), "msg": "Проверяю все переданные файлы"})
        verified = 0
        verify_errors = 0
        verified_by_scope = {scope["id"]: 0 for scope in scopes}
        errors_by_scope = {scope["id"]: 0 for scope in scopes}
        verify_batch = []
        verify_emit_at = time.time()
        for index, (direction, scope, rel, expected_size, expected_mtime) in enumerate(successful, 1):
            wait_for_control()
            item_ok = False
            try:
                if direction == "push":
                    meta = sftp.stat(f"{scope['remote']}/{rel}")
                else:
                    meta = (scope["local"] / Path(rel.replace("/", os.sep))).stat()
                actual = (int(meta.st_size), int(meta.st_mtime))
                if actual[0] != expected_size or abs(actual[1] - expected_mtime) > 2:
                    raise RuntimeError(f"ожидалось {expected_size} байт, получено {actual[0]}")
                verified += 1
                verified_by_scope[scope["id"]] += 1
                item_ok = True
            except Exception as ex:
                verify_errors += 1
                errors_by_scope[scope["id"]] += 1
                emit({"type": "fileerror", "file": rel, "error": "проверка после передачи: " + str(ex)[:130]})
            key = project_key(scope["id"], rel)
            verify_batch.append({
                "scopeId": scope["id"], "scope": scope["label"],
                "projectKey": key, "project": project_label(key),
                "file": rel, "ok": item_ok,
                "snapshot": is_append_only_session(scope, rel),
                "snapshotBytes": int(expected_size),
            })
            now = time.time()
            if index == len(successful) or len(verify_batch) >= 40 or now - verify_emit_at >= 0.12:
                latest = verify_batch[-1]
                emit({"type": "verify_progress", "done": index, "total": len(successful),
                      "verified": verified, "errors": verify_errors,
                      "scopeId": latest["scopeId"], "scope": latest["scope"],
                      "projectKey": latest["projectKey"], "project": latest["project"],
                      "file": latest["file"], "ok": latest["ok"],
                      "snapshot": latest["snapshot"],
                      "snapshotBytes": latest["snapshotBytes"],
                      "items": verify_batch})
                verify_batch = []
                verify_emit_at = now

        errors += verify_errors
        for scope_row in scope_rows:
            scope_row["verified"] = verified_by_scope.get(scope_row["id"], 0)
            scope_row["errors"] = max(0, int(scope_row["files"]) - int(scope_row["verified"]))
        if mode in ("push", "pull"):
            record_server_state(sftp, mode, verified, done_bytes, errors)
            write_remote_indexes(sftp, scopes)
        done_state = read_server_state(sftp) if mode in ("push", "pull") else None
        emit({"type": "done", "direction": mode, "transferred": verified,
              "errors": errors, "bytes": done_bytes, "skipped": len(conflicts),
              "verified": verified, "planned": total,
              "proof": scope_rows,
              "serverState": done_state or {},
              "elapsed": int(time.time() - started)})
    finally:
        try:
            sftp.close()
            client.close()
        except Exception:
            pass


def main():
    args = sys.argv[1:]
    mode = args[0] if args else "status"
    only = None
    dry_run = "--dry-run" in args
    if "--only" in args:
        idx = args.index("--only")
        if idx + 1 < len(args):
            only = args[idx + 1]
    try:
        if mode == "authority":
            client, sftp = connect()
            try:
                emit({"type": "authority", "serverState": read_server_state(sftp)})
            finally:
                sftp.close()
                client.close()
        elif mode == "status":
            client, sftp, scopes, started = scan_everything()
            try:
                build_status(scopes, started, read_server_state(sftp))
            finally:
                sftp.close()
                client.close()
        elif mode in ("sync", "push", "pull"):
            transfer(mode, only, dry_run=dry_run)
        else:
            emit({"type": "error", "error": f"неизвестный режим: {mode}"})
            sys.exit(2)
    except Exception as ex:
        emit({"type": "error", "error": str(ex)[:260]})
        sys.exit(1)


if __name__ == "__main__":
    main()
