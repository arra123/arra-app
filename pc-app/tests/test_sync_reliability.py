import ctypes
import os
import sys
import tempfile
import unittest
from pathlib import Path


SYNC_DIR = Path(__file__).resolve().parents[1] / "sync"
sys.path.insert(0, str(SYNC_DIR))

from arra_sync import local_file_issue  # noqa: E402


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
