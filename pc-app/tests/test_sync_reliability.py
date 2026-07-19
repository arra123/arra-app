import ctypes
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path


SYNC_DIR = Path(__file__).resolve().parents[1] / "sync"
sys.path.insert(0, str(SYNC_DIR))

from arra_sync import download_fixed_suffix, is_append_only_session, local_file_issue, remote_matches_local_prefix  # noqa: E402


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
