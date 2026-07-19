import ctypes
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


SYNC_DIR = Path(__file__).resolve().parents[1] / "sync"
sys.path.insert(0, str(SYNC_DIR))

from arra_sync import (  # noqa: E402
    SCOPES,
    download_fixed_suffix,
    fork_codex_rollout,
    is_append_only_session,
    local_file_issue,
    remote_matches_local_prefix,
)


class FakeSftp:
    def __init__(self, files):
        self.files = files

    def open(self, path, mode):
        if mode != "rb":
            raise ValueError(mode)
        return io.BytesIO(self.files[path])


class AppendOnlySessionTests(unittest.TestCase):
    def test_codex_sessions_are_append_only(self):
        self.assertTrue(is_append_only_session({"id": "codex-sessions"}, "2026/07/session.jsonl"))
        self.assertTrue(is_append_only_session({"id": "codex-config"}, "history.jsonl"))
        self.assertFalse(is_append_only_session({"id": "projects"}, "events.jsonl"))

    def test_codex_index_is_local_derivative_not_synced(self):
        config = next(scope for scope in SCOPES if scope["id"] == "codex-config")
        self.assertNotIn("session_index.jsonl", config["includeRoots"])
        self.assertFalse(is_append_only_session(config, "session_index.jsonl"))

    def test_diverged_rollout_is_forked_with_new_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            original = Path(folder) / "rollout-2026-07-19T10-00-00-11111111-1111-1111-1111-111111111111.jsonl"
            rows = [
                {"type": "session_meta", "payload": {"id": "11111111-1111-1111-1111-111111111111", "cwd": "C:\\\\Claude"}},
                {"type": "event_msg", "payload": {"type": "user_message", "message": "Продолжить важную задачу"}},
            ]
            original.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
            forked = fork_codex_rollout(original, "test-backup")
            self.assertTrue(forked.exists())
            self.assertNotEqual(forked, original)
            fork_rows = [json.loads(line) for line in forked.read_text(encoding="utf-8").splitlines()]
            fork_meta = fork_rows[0]["payload"]
            self.assertNotEqual(fork_meta["id"], rows[0]["payload"]["id"])
            self.assertIn("ветка", fork_meta["title"])
            self.assertEqual(fork_meta["noda_fork"]["reason"], "diverged-before-pull")

    def test_remote_suffix_appends_without_replacing_open_session(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "session.jsonl"
            prefix = b'{"turn":1}\n'
            remote = prefix + b'{"turn":2}\n'
            target.write_bytes(prefix)
            sftp = FakeSftp({"/session.jsonl": remote})
            self.assertTrue(remote_matches_local_prefix(sftp, target, "/session.jsonl", len(prefix)))
            progress = []
            download_fixed_suffix(
                sftp, "/session.jsonl", target, len(prefix), len(remote),
                lambda done, total: progress.append((done, total)),
            )
            self.assertEqual(target.read_bytes(), remote)
            self.assertEqual(progress[-1], (len(remote) - len(prefix), len(remote) - len(prefix)))


@unittest.skipUnless(os.name == "nt", "Windows file-sharing semantics only")
class WindowsReplaceabilityTests(unittest.TestCase):
    def test_regular_file_can_be_replaced(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "session.jsonl"
            target.write_text("one\n", encoding="utf-8")
            self.assertEqual(local_file_issue(target, require_replace=True), "")

    def test_reader_without_delete_share_is_reported_precisely(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "session.jsonl"
            target.write_text("one\n", encoding="utf-8")
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            create_file = kernel32.CreateFileW
            create_file.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                    ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
            create_file.restype = ctypes.c_void_p
            handle = create_file(str(target), 0x80000000, 0x00000003, None, 3, 0x80, None)
            self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
            try:
                self.assertEqual(local_file_issue(target, require_replace=False), "")
                self.assertIn("замен", local_file_issue(target, require_replace=True))
            finally:
                kernel32.CloseHandle(ctypes.c_void_p(handle))

            self.assertEqual(local_file_issue(target, require_replace=True), "")


if __name__ == "__main__":
    unittest.main()
