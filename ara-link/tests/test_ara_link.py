"""Тест ara-link с поддельным сервером и подменёнными локальными скриптами.

Запуск: python3 -m unittest discover -s ara-link/tests -v
"""
import asyncio
import http.server
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

from websockets.asyncio.server import serve

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ara_link  # noqa: E402

SCRIPTS = {
    ".config/quickshell/ara/scripts/ara-sessions": r"""#!/bin/sh
cat <<EOF
{"live":[{"agent":"claude","project":"helper","cwd":"$HOME","ws":4,"term":111,"title":"","busy":true,"state":"working","idle":0,"device":"laptop","task":"почини","transcript":"$HOME/t.jsonl"},
 {"agent":"codex","project":"notch","cwd":"/home/pc/notch","ws":1,"term":222,"busy":false,"state":"waiting","idle":40,"device":"pc","task":"","transcript":"/pc/x.jsonl"}],
 "recent":[{"agent":"codex","project":"helper","cwd":"$HOME","id":"s1","title":"первая","mtime":1790634392.0,"transcript":"$HOME/r.jsonl"}],"pcOnline":true}
EOF
""",
    ".config/quickshell/ara/scripts/ara-transcript": r"""#!/bin/sh
echo "transcript $*" >> "$HOME/calls.log"
body=$(cat "$1")
printf '{"messages":[{"role":"user","text":"%s","images":["%s/pic.png"]},{"role":"assistant","text":"видео тут %s/clip.mp4"}],"model":"claude-opus-5-5","plan":[]}\n' "$body" "$HOME" "$HOME"
""",
    ".config/quickshell/ara/scripts/ara-pc": r"""#!/bin/sh
stdin=""
if [ "$1" = send ] || [ "$1" = launch ]; then stdin=$(cat); fi
echo "pc $* <$stdin>" >> "$HOME/calls.log"
case "$1" in
  transcript) echo '{"messages":[{"role":"assistant","text":"с ПК"}]}' ;;
  *) echo '{"ok":true}' ;;
esac
""",
    ".config/quickshell/ii/modules/ii/notchIsland/scripts/island-agent-send": r"""#!/bin/sh
echo "send $1 <$2>" >> "$HOME/calls.log"
echo '{"ok":true}'
""",
    ".config/quickshell/ii/modules/ii/notchIsland/scripts/island-ask": r"""#!/usr/bin/env python3
import json, sys
p = json.loads(sys.argv[1])
open(__import__('os').environ['HOME'] + '/ask.json', 'w').write(sys.argv[1])
print(json.dumps({"t": "delta", "text": "При"}), flush=True)
print(json.dumps({"t": "action", "kind": "agent", "text": "Передала задачу"}), flush=True)
print(json.dumps({"t": "delta", "text": "вет, " + p["style"]}), flush=True)
print(json.dumps({"t": "delta", "text": " Вот кадр: /home/answer.png"}), flush=True)
print(json.dumps({"t": "done"}), flush=True)
""",
    ".local/bin/agent-telegram-bridge": r"""#!/bin/sh
echo "bridge $*" >> "$HOME/calls.log"
""",
    "bin/kitty": r"""#!/bin/sh
echo "kitty $* task=<$ISLAND_TASK>" >> "$HOME/calls.log"
sleep 2
""",
}


class BlobHandler(http.server.BaseHTTPRequestHandler):
    uploads: list = []

    def log_message(self, *args):
        pass

    def do_POST(self):
        size = int(self.headers.get("Content-Length") or 0)
        BlobHandler.uploads.append((self.path, self.rfile.read(size)))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_GET(self):
        if not self.path.startswith("/ara/blob/photo1?token=secret"):
            self.send_response(401)
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"JPEGDATA")


class AraLinkTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        for rel, body in SCRIPTS.items():
            path = self.home / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body)
            path.chmod(0o755)
        runner = self.home / "bin/systemd-run"
        runner.write_text('#!/bin/sh\nwhile [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n')
        runner.chmod(0o755)
        (self.home / "t.jsonl").write_text("первый")
        (self.home / "pic.png").write_bytes(b"PNGDATA")
        (self.home / "secret.txt").write_text("nope")
        self.env = {k: os.environ.get(k) for k in ("HOME", "PATH", "XDG_RUNTIME_DIR")}
        os.environ["HOME"] = str(self.home)
        os.environ["PATH"] = f"{self.home / 'bin'}:{os.environ['PATH']}"
        os.environ["XDG_RUNTIME_DIR"] = str(self.home)

        BlobHandler.uploads = []
        self.http = http.server.ThreadingHTTPServer(("127.0.0.1", 0), BlobHandler)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

        self.inbox: asyncio.Queue = asyncio.Queue()
        self.conn = None
        self.connected = asyncio.Event()

        async def handler(ws):
            self.assertIn("token=secret", ws.request.path)
            self.conn = ws
            self.connected.set()
            async for raw in ws:
                await self.inbox.put(json.loads(raw))

        self.server = await serve(handler, "127.0.0.1", 0)
        port = self.server.sockets[0].getsockname()[1]
        cfg = {
            **ara_link.DEFAULTS,
            "apiUrl": f"http://127.0.0.1:{self.http.server_address[1]}",
            "wsUrl": f"ws://127.0.0.1:{port}/agent",
            "token": "secret",
            "device": "laptop",
            "snapshotInterval": 0.3,
            "watchInterval": 0.2,
            "scripts": dict(ara_link.SCRIPTS),
        }
        self.link = ara_link.AraLink(cfg)
        self.task = asyncio.create_task(self.link.forever())
        await asyncio.wait_for(self.connected.wait(), 5)

    async def asyncTearDown(self):
        self.task.cancel()
        for task in list(self.link.tasks):
            task.cancel()
        with self._suppress():
            await self.task
        await asyncio.sleep(0.1)
        self.server.close()
        await self.server.wait_closed()
        self.http.shutdown()
        for key, value in self.env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    @staticmethod
    def _suppress():
        import contextlib
        return contextlib.suppress(asyncio.CancelledError, Exception)

    async def expect(self, kind, pred=lambda m: True, timeout=5):
        async def wait():
            while True:
                msg = await self.inbox.get()
                if msg.get("type") == kind and pred(msg):
                    return msg
        return await asyncio.wait_for(wait(), timeout)

    async def command(self, msg):
        await self.conn.send(json.dumps(msg, ensure_ascii=False))

    def calls(self):
        path = self.home / "calls.log"
        return path.read_text() if path.exists() else ""

    async def test_snapshot_and_transcript(self):
        hello = await self.expect("ara.hello")
        self.assertEqual(hello["device"], "laptop")
        snap = await self.expect("ara.snapshot")
        self.assertEqual([a["term"] for a in snap["live"]], [111, 222])
        self.assertTrue(snap["pcOnline"])
        self.assertEqual(snap["recent"][0]["id"], "s1")

        await self.command({"type": "ara.watch", "agents": [
            {"key": "live:laptop:111", "device": "laptop", "agent": "claude", "term": 111, "transcript": str(self.home / "t.jsonl")},
            {"key": "live:pc:222", "device": "pc", "agent": "codex", "term": 222, "transcript": "/pc/x.jsonl"},
        ]})
        first = await self.expect("ara.transcript", lambda m: m["agentKey"] == "live:laptop:111")
        self.assertEqual(first["data"]["messages"][0]["text"], "первый")
        pc = await self.expect("ara.transcript", lambda m: m["agentKey"] == "live:pc:222")
        self.assertEqual(pc["data"]["messages"][0]["text"], "с ПК")

        # журнал изменился → новая переписка; без изменений — тишина
        await asyncio.sleep(0.1)
        (self.home / "t.jsonl").write_text("второй")
        os.utime(self.home / "t.jsonl", (1, 1))
        second = await self.expect("ara.transcript", lambda m: m["agentKey"] == "live:laptop:111")
        self.assertEqual(second["data"]["messages"][0]["text"], "второй")
        self.assertEqual(sum(line.startswith("transcript ") for line in self.calls().splitlines()), 2)

    async def test_commands(self):
        await self.expect("ara.snapshot")
        laptop_agent = {"key": "live:laptop:111", "device": "laptop", "term": 111}
        pc_agent = {"key": "live:pc:222", "device": "pc", "term": 222}

        await self.command({"type": "ara.send", "reqId": "r1", "agent": laptop_agent, "text": "продолжай", "images": ["/home/x/a.jpg"]})
        self.assertTrue((await self.expect("ara.result", lambda m: m["reqId"] == "r1"))["ok"])
        self.assertIn("send 111 <продолжай\n\n/home/x/a.jpg>", self.calls())
        # island-agent-send submits the text itself; a second Enter is a duplicate.
        self.assertNotIn("bridge --terminal-action send-key 111 enter", self.calls())

        await self.command({"type": "ara.send", "reqId": "r2", "agent": pc_agent, "text": "на ПК"})
        self.assertTrue((await self.expect("ara.result", lambda m: m["reqId"] == "r2"))["ok"])
        self.assertIn("pc send 222 <на ПК>", self.calls())
        self.assertNotIn("pc key 222 enter", self.calls())

        await self.command({"type": "ara.stop", "reqId": "r3", "agent": laptop_agent})
        await self.command({"type": "ara.stop", "reqId": "r4", "agent": pc_agent})
        await self.expect("ara.result", lambda m: m["reqId"] == "r3")
        await self.expect("ara.result", lambda m: m["reqId"] == "r4")
        self.assertIn("bridge --terminal-action send-key 111 escape", self.calls())
        self.assertIn("pc stop 222", self.calls())

        await self.command({"type": "ara.model", "reqId": "r5", "agent": laptop_agent, "model": "sonnet"})
        result = await self.expect("ara.result", lambda m: m["reqId"] == "r5")
        self.assertTrue(result["queued"])
        self.assertNotIn("send 111 </model sonnet>", self.calls())
        change = self.link.model_queue.pop("laptop:111")
        await self.link.apply_queued_model(change)
        self.assertIn("send 111 </model sonnet>", self.calls())
        await self.command({"type": "ara.model", "reqId": "r6", "agent": laptop_agent, "model": "x; rm -rf /"})
        self.assertFalse((await self.expect("ara.result", lambda m: m["reqId"] == "r6"))["ok"])

        await self.command({"type": "ara.launch", "reqId": "r7", "device": "laptop", "agent": "claude", "dir": str(self.home), "task": "сделай тесты", "model": "opus"})
        launched = await self.expect("ara.result", lambda m: m["reqId"] == "r7")
        self.assertTrue(launched["ok"], launched)
        log = self.calls()
        self.assertIn(f"--directory {self.home} fish -lc exec claude --dangerously-skip-permissions --model opus $ISLAND_TASK task=<сделай тесты>", log)
        self.assertIn("--listen-on unix:" + str(self.home) + "/codex-agent-{kitty_pid}", log)

        await self.command({"type": "ara.launch", "reqId": "r8", "device": "pc", "agent": "codex", "dir": "/home/pc/proj", "task": "проверь"})
        self.assertTrue((await self.expect("ara.result", lambda m: m["reqId"] == "r8"))["ok"])
        self.assertIn("pc launch codex /home/pc/proj <проверь>", self.calls())

        await self.command({"type": "ara.launch", "reqId": "r9", "device": "laptop", "agent": "codex", "dir": "/нет/такой"})
        failed = await self.expect("ara.result", lambda m: m["reqId"] == "r9")
        self.assertFalse(failed["ok"])
        self.assertIn("Папка не найдена", failed["error"])

    async def test_ask_stream(self):
        await self.expect("ara.snapshot")
        await self.command({"type": "ara.ask", "reqId": "a1", "chatId": "c1", "prompt": "Вот видео /home/v.mp4", "history": [{"role": "user", "text": "ранее"}], "style": "talk", "model": "haiku"})
        first = await self.expect("ara.ask.delta")
        action = await self.expect("ara.ask.action")
        second = await self.expect("ara.ask.delta")
        await self.expect("ara.ask.delta")
        await self.expect("ara.ask.done")
        self.assertEqual(first["text"] + second["text"], "Привет, talk")
        self.assertEqual(action["action"]["text"], "Передала задачу")
        sent = json.loads((self.home / "ask.json").read_text())
        self.assertEqual(sent["name"], "Ара")
        self.assertEqual(sent["model"], "haiku")
        self.assertEqual(sent["history"], [{"role": "user", "text": "ранее"}])
        # путь из ответа Ары можно запросить, из вопроса телефона — нет
        self.assertTrue(self.link.path_allowed("/home/answer.png", None, "c1"))
        self.assertFalse(self.link.path_allowed("/home/answer.png", None, "c2"))
        self.assertFalse(self.link.path_allowed("/home/v.mp4", None, "c1"))

    async def test_files(self):
        await self.expect("ara.snapshot")
        key = "live:laptop:111"
        await self.command({"type": "ara.watch", "agents": [{"key": key, "device": "laptop", "term": 111, "transcript": str(self.home / "t.jsonl")}]})
        await self.expect("ara.transcript")

        await self.command({"type": "ara.file", "reqId": "f1", "agentKey": key, "path": str(self.home / "pic.png")})
        for _ in range(50):
            if BlobHandler.uploads:
                break
            await asyncio.sleep(0.05)
        path, body = BlobHandler.uploads[0]
        self.assertEqual(body, b"PNGDATA")
        self.assertIn("reqId=f1", path)
        self.assertIn("token=secret", path)

        await self.command({"type": "ara.file", "reqId": "f2", "agentKey": key, "path": str(self.home / "secret.txt")})
        denied = await self.expect("ara.result", lambda m: m["reqId"] == "f2")
        self.assertFalse(denied["ok"])
        self.assertIn("не упоминается", denied["error"])

        # Упоминание в тексте пользователя не даёт доступа; симлинк на не-медиа тоже
        self.assertFalse(self.link.path_allowed(str(self.home / "t.jsonl"), key, None))
        (self.home / "clip.mp4").symlink_to(self.home / "secret.txt")
        self.assertFalse(self.link.path_allowed(str(self.home / "clip.mp4"), key, None))
        (self.home / "clip.mp4").unlink()

        await self.command({"type": "ara.file", "reqId": "f3", "agentKey": key, "path": str(self.home / "clip.mp4")})
        missing = await self.expect("ara.result", lambda m: m["reqId"] == "f3")
        self.assertEqual(missing["error"], "Файл не найден")

        await self.command({"type": "ara.upload", "reqId": "u1", "url": "/ara/blob/photo1", "name": "IMG 0001.JPG", "device": "laptop"})
        up = await self.expect("ara.result", lambda m: m["reqId"] == "u1")
        self.assertTrue(up["ok"], up)
        saved = Path(up["path"])
        self.assertEqual(saved.parent, self.home / "Pictures/ara-inbox")
        self.assertTrue(saved.name.endswith("IMG_0001.JPG"))
        self.assertEqual(saved.read_bytes(), b"JPEGDATA")

        await self.command({"type": "ara.upload", "reqId": "u2", "url": "/ara/blob/photo1", "name": "a.jpg", "device": "pc"})
        pc = await self.expect("ara.result", lambda m: m["reqId"] == "u2")
        self.assertFalse(pc["ok"])
        self.assertIn("pcSsh", pc["error"])


class FitTranscriptTest(unittest.TestCase):
    def test_huge_transcript_is_trimmed(self):
        big = {"messages": [{"role": "assistant", "text": "x" * 100_000} for _ in range(160)], "plan": []}
        fitted = ara_link.fit_transcript(big)
        size = len(json.dumps(fitted, ensure_ascii=False).encode())
        self.assertLess(size, ara_link.MAX_TRANSCRIPT_BYTES)
        self.assertTrue(fitted["messages"][-1]["text"].endswith("(обрезано)"))
        small = {"messages": [{"role": "user", "text": "hi"}]}
        self.assertIs(ara_link.fit_transcript(small), small)


if __name__ == "__main__":
    unittest.main()
