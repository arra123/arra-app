"""Общий код для sync-push и sync-pull.

Главные изменения относительно старой версии:
- сравнение идёт по (size, mtime), а не только по size — иначе теряются файлы,
  где контент поменялся, но длина осталась прежней (типичный кейс с memory/*.md)
- ALWAYS_FORCE — список glob-паттернов, которые ВСЕГДА перекачиваются, даже
  если size+mtime совпали (для критичных мелких файлов: memory, settings.json)
- pre_sync_kill() — мягко закрывает редакторы/PDF-ридеры, чтобы они не
  держали файлы под локом во время копирования
- pretty_changes() — группирует изменения по папкам и выводит читабельно
- verify_remote() / verify_local() — после копирования сверяет каждый файл
  по (size, mtime) и громко сообщает о расхождениях
"""
import os, sys, stat, time, subprocess, fnmatch
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import paramiko
except ImportError:
    print("Нужен paramiko. Запусти:  pip install paramiko")
    sys.exit(2)

# ===== настройки =====
SERVER = os.environ.get("NODA_SYNC_HOST", "186.246.2.140")
USER = os.environ.get("NODA_SYNC_USER", "tima")
PASSWORD = os.environ.get("NODA_SYNC_PASSWORD", "")

LOCAL_PROJECTS = Path(os.environ.get("ARRA_PROJECTS_DIR", "C:/Claude"))
LOCAL_CLAUDE = Path.home() / ".claude"
LOCAL_CODEX = Path.home() / ".codex"
# Только память Codex (~/.codex/memories) — её и гоняем в sync-push/pull.
# Всю ~/.codex НЕ синхронизируем: там 80+ МБ sqlite-логов, auth-токены и
# machine-specific пути в config.toml, которые сломают Codex на другой машине.
LOCAL_CODEX_MEM = LOCAL_CODEX / "memories"
REMOTE_PROJECTS = "/home/tima/sync/claude-projects"
REMOTE_CLAUDE = "/home/tima/sync/claude-config"
REMOTE_CODEX = "/home/tima/sync/codex-config"
REMOTE_CODEX_MEM = "/home/tima/sync/codex-memory"

# Папки, которые НЕ синхронизируем (ни push, ни pull).
SKIP_DIRS = {
    # сборки/зависимости
    "node_modules", ".next", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".turbo", ".cache", ".npm", ".nvm",
    "target",
    # claude code runtime (большие, бесполезные на другой машине)
    "shell-snapshots", "cache", "telemetry",
    "file-history", "ide", "backups", "downloads",
    ".pyenv", "paste-cache", "tasks",
    "image-cache",
    ".arra-backups",
    # внешние
    ".google",
    # архив (старые штуки оставлены локально)
    "_archive",
}
SKIP_DIR_PREFIXES = (
    ".chrome-design-",  # временные профили Chrome: кэш, cookies и заблокированные SQLite-файлы
)

# Корневые папки внутри C:\Claude, которые исключаем только при push
# (бывает, что pull их притаскивает, а на этой машине мы их не хотим заливать)
SKIP_ROOT_DIRS = set()

# Файлы по расширениям — не пушим (только при push, при pull тащим всё)
SKIP_EXTENSIONS = {".pyc", ".pyo", ".log", ".tmp", ".swp"}

# Конкретные имена файлов — не синхронизируем
SKIP_FILES = {
    ".env", ".env.local", ".env.development", ".env.production", ".env.test",
    ".statusline_cache.json",   # ephemeral
    ".last-cleanup",            # ephemeral
    "desktop.ini",              # Windows artifact
    ".credentials.json",        # Claude auth — никогда не отправляем на сервер
    "auth.json",                # Codex auth — только локально
    "daemon-auth-status.json", "daemon-auth-cooldown", "daemon.lock", "daemon.status.json",
    "mcp-needs-auth-cache.json",
}

# Файлы, которые на pull НЕ удаляются, даже если их нет на сервере
# (защита от случайного wipe того, что собрано локально)
PROTECT_ON_PULL_PREFIXES = ("sync-", "sync_", "ПЕРЕКИНЬ")
PROTECT_ON_PULL_DIRS = {"_setup", "_temp"}

# Файлы, которые ВСЕГДА перекачиваются (даже если size+mtime совпали).
# Это критично для memory: они маленькие, могут переписываться так, что
# size не меняется, а контент — да.
ALWAYS_FORCE_GLOBS = (
    "projects/*/memory/*.md",
    "projects/*/MEMORY.md",
    "settings.json",
    "settings.local.json",
    # память Codex (корень синка = ~/.codex/memories): мелкие md,
    # которые переписываются без изменения размера
    "MEMORY.md",
    "raw_memories.md",
    "memory_summary.md",
    "rollout_summaries/*.md",
    "extensions/*/instructions.md",
)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 МБ — крупные файлы не пушим

# Процессы, которые закрываем перед sync (могут держать файлы под локом).
# ВАЖНО: НЕ закрываем Code.exe / Cursor.exe — там часто хостится терминал
# Claude Code, и его убийство снесёт текущую сессию синхронизации тоже.
# Если редактор реально держит файл — sync переретраит на этом файле и пройдёт.
PROCESSES_TO_KILL = (
    "Acrobat.exe",   # Adobe Acrobat Pro — держит PDF
    "AcroRd32.exe",  # Adobe Reader
    "EXCEL.EXE",
    "WINWORD.EXE",
    "POWERPNT.EXE",
)

BAR_W = 30
LINE = "═" * 64


# ===== утилиты вывода =====

def fmt_bytes(n):
    if n < 1024: return f"{n} B"
    if n < 1024 ** 2: return f"{n / 1024:.0f} KB"
    if n < 1024 ** 3: return f"{n / 1024 ** 2:.1f} MB"
    return f"{n / 1024 ** 3:.2f} GB"


def fmt_time(s):
    s = max(int(s), 0)
    if s < 60: return f"{s} сек"
    if s < 3600: return f"{s // 60} мин {s % 60:02d} сек"
    return f"{s // 3600}ч {(s % 3600) // 60:02d}м"


def banner(title, char="═"):
    line = char * 64
    print()
    print(line)
    print(f"  {title}")
    print(line)


def section(title):
    print(f"\n▸ {title}")


# ===== закрытие процессов =====

def pre_sync_kill():
    """Закрывает редакторы/просмотрщики, чтобы файлы не были под локом.
    Текущий Claude Code и проводник не трогаем."""
    if sys.platform != "win32":
        return
    closed = []
    for name in PROCESSES_TO_KILL:
        try:
            r = subprocess.run(
                ["taskkill", "/IM", name, "/F"],
                capture_output=True, text=True, timeout=10
            )
            if r.returncode == 0:
                closed.append(name)
        except Exception:
            pass
    if closed:
        print(f"  ✗ Закрыты процессы: {', '.join(closed)}")
        time.sleep(1)  # дать ОС освободить хэндлы файлов
    else:
        print("  ◦ Открытых редакторов не найдено")


# ===== SFTP =====

def connect():
    if not PASSWORD:
        raise RuntimeError(
            "Не найдены локальные реквизиты переноса. Noda не хранит пароль сервера в публичной сборке."
        )
    last_error = None
    for attempt in range(3):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                SERVER, username=USER, password=PASSWORD,
                timeout=20, banner_timeout=20, auth_timeout=20,
            )
            sftp = client.open_sftp()
            sftp.get_channel().settimeout(45)
            return client, sftp
        except Exception as ex:
            last_error = ex
            try: client.close()
            except Exception: pass
            if attempt < 2:
                time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"Сервер переноса не ответил после 3 попыток: {last_error}")


# ===== фильтрация =====

def should_skip_file(path, base, is_push):
    """Возвращает True, если файл нужно пропустить."""
    try:
        rel = path.relative_to(base)
    except ValueError:
        return True

    if base == LOCAL_PROJECTS and len(rel.parts) > 0 and rel.parts[0] in SKIP_ROOT_DIRS:
        return True

    for part in rel.parts:
        if part in SKIP_DIRS or any(part.startswith(prefix) for prefix in SKIP_DIR_PREFIXES):
            return True

    if path.name in SKIP_FILES:
        return True

    if is_push:
        if path.suffix.lower() in SKIP_EXTENSIONS:
            return True
        try:
            if path.stat().st_size > MAX_FILE_SIZE:
                return True
        except Exception:
            return True
    return False


def is_forced(rel):
    """Этот относительный путь обязан перекачиваться всегда."""
    for pat in ALWAYS_FORCE_GLOBS:
        if fnmatch.fnmatch(rel, pat):
            return True
    return False


def is_protected_on_pull(rel):
    """При pull — не удалять локально такой файл, даже если на сервере его нет."""
    if rel.startswith(PROTECT_ON_PULL_PREFIXES):
        return True
    first = rel.split("/", 1)[0]
    if first in PROTECT_ON_PULL_DIRS:
        return True
    return False


# ===== сканирование =====

def scan_local(base, is_push, label="local", progress=None, extra_skip_dirs=None, extra_skip_files=None,
               include_roots=None):
    """Возвращает dict: relpath → (size, mtime_int).
    Ручной DFS, чтобы НЕ заходить в SKIP_DIRS (node_modules, .git и т.п.).
    rglob идёт во все папки и фильтрует постфактум — это убивало 10+ минут на скан."""
    files = {}
    if not base.exists():
        return files

    skip_dirs = SKIP_DIRS | set(extra_skip_dirs or ())
    skip_files = SKIP_FILES | set(extra_skip_files or ())
    include_roots = set(include_roots or ())
    stack = [base]
    last_print = time.time()
    dirs = 0
    while stack:
        d = stack.pop()
        dirs += 1
        try:
            entries = list(os.scandir(d))
        except Exception:
            continue
        for e in entries:
            try:
                if d == base and include_roots and e.name not in include_roots:
                    continue
                if e.is_dir(follow_symlinks=False):
                    if e.name in skip_dirs or any(e.name.startswith(prefix) for prefix in SKIP_DIR_PREFIXES):
                        continue
                    if base == LOCAL_PROJECTS and d == base and e.name in SKIP_ROOT_DIRS:
                        continue
                    stack.append(Path(e.path))
                elif e.is_file(follow_symlinks=False):
                    if e.name in skip_files:
                        continue
                    if is_push and Path(e.name).suffix.lower() in SKIP_EXTENSIONS:
                        continue
                    try:
                        st = e.stat()
                        if is_push and st.st_size > MAX_FILE_SIZE:
                            continue
                        rel = str(Path(e.path).relative_to(base)).replace("\\", "/")
                        files[rel] = (st.st_size, int(st.st_mtime))
                    except Exception:
                        pass
            except Exception:
                pass
        now = time.time()
        if now - last_print > (0.35 if progress else 1.0):
            if progress:
                progress(files=len(files), dirs=dirs)
            else:
                sys.stdout.write(f"\r  Сканирую {label}: {len(files)} файлов…  ")
                sys.stdout.flush()
            last_print = now
    if progress:
        progress(files=len(files), dirs=dirs, done=True)
    else:
        sys.stdout.write(f"\r  Сканирую {label}: {len(files)} файлов — готово       \n")
        sys.stdout.flush()
    return files


def scan_remote(sftp, remote_base, label="remote", progress=None):
    """Возвращает dict: relpath → (size, mtime_int)."""
    files = {}
    last_print = [time.time()]
    dirs = [0]

    def walk(rpath, prefix=""):
        dirs[0] += 1
        try:
            entries = sftp.listdir_attr(rpath)
        except Exception:
            return
        for e in entries:
            rel = f"{prefix}/{e.filename}" if prefix else e.filename
            full = f"{rpath}/{e.filename}"
            if stat.S_ISDIR(e.st_mode):
                if e.filename not in SKIP_DIRS and not any(e.filename.startswith(prefix) for prefix in SKIP_DIR_PREFIXES):
                    walk(full, rel)
            else:
                if e.filename in SKIP_FILES:
                    continue
                files[rel] = (e.st_size, int(e.st_mtime))
            now = time.time()
            if now - last_print[0] > (0.35 if progress else 1.0):
                if progress:
                    progress(files=len(files), dirs=dirs[0])
                else:
                    sys.stdout.write(f"\r  Сканирую {label}: {len(files)} файлов…  ")
                    sys.stdout.flush()
                last_print[0] = now

    walk(remote_base)
    if progress:
        progress(files=len(files), dirs=dirs[0], done=True)
    else:
        sys.stdout.write(f"\r  Сканирую {label}: {len(files)} файлов — готово       \n")
        sys.stdout.flush()
    return files


# ===== diff =====

def diff_for_copy(src_map, dst_map):
    """Что нужно скопировать src → dst.
    Сравниваем по (size, mtime). ALWAYS_FORCE_GLOBS гарантированно попадают."""
    to_copy = []
    for rel, (sz, mt) in src_map.items():
        if is_forced(rel):
            to_copy.append(rel)
            continue
        d = dst_map.get(rel)
        if d is None:
            to_copy.append(rel)
            continue
        d_sz, d_mt = d
        if d_sz != sz:
            to_copy.append(rel)
            continue
        # mtime: разрешаем расхождение в 2 секунды (FS rounding на SFTP)
        if abs(d_mt - mt) > 2:
            to_copy.append(rel)
    return to_copy


# ===== красивый вывод изменений по папкам =====

def group_by_folder(rels, src_map, depth=3):
    """Группирует список путей по верхним N сегментам."""
    groups = {}
    for rel in rels:
        parts = rel.split("/")
        if len(parts) > 1:
            key = "/".join(parts[:depth - 1])
        else:
            key = "(root)"
        groups.setdefault(key, []).append((rel, src_map[rel][0]))
    return groups


def pretty_changes(title, rels, src_map, max_files_per_group=5):
    """Печатает изменения, сгруппированные по папкам."""
    if not rels:
        return
    print(f"\n  {title}:")
    groups = group_by_folder(rels, src_map)
    for folder in sorted(groups.keys()):
        items = groups[folder]
        total_sz = sum(sz for _, sz in items)
        print(f"    • {folder}/  ({len(items)} {plural(len(items))}, {fmt_bytes(total_sz)})")
        names = sorted(items, key=lambda x: -x[1])
        shown = names[:max_files_per_group]
        for rel, sz in shown:
            name = rel.rsplit("/", 1)[-1] if "/" in rel else rel
            print(f"        {name}  ({fmt_bytes(sz)})")
        if len(names) > max_files_per_group:
            rest = len(names) - max_files_per_group
            print(f"        … и ещё {rest}")


def plural(n):
    if n % 10 == 1 and n % 100 != 11:
        return "файл"
    if 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14):
        return "файла"
    return "файлов"


# ===== удалённые операции =====

def ensure_dir(sftp, path):
    """Создаёт каталог на сервере (рекурсивно)."""
    parts = path.split("/")
    cur = ""
    for p in parts:
        if not p:
            cur = "/"
            continue
        cur = f"{cur}/{p}" if cur != "/" else f"/{p}"
        try:
            sftp.stat(cur)
        except Exception:
            try:
                sftp.mkdir(cur)
            except Exception:
                pass


def progress_line(done_n, total_n, done_b, total_b, t_start):
    pct = done_n / total_n if total_n else 1
    filled = int(BAR_W * pct)
    bar = "█" * filled + "░" * (BAR_W - filled)
    elapsed = max(time.time() - t_start, 0.001)
    speed = done_b / elapsed
    remaining = max(total_b - done_b, 0)
    eta = remaining / speed if speed > 0 else 0
    return (f"  [{bar}] {done_n}/{total_n} ({int(pct * 100)}%) · "
            f"{fmt_bytes(done_b)}/{fmt_bytes(total_b)} · "
            f"{fmt_bytes(speed)}/с · ETA {fmt_time(eta)}     ")
