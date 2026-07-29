import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch


SYNC_DIR = Path(__file__).resolve().parents[1] / "sync"
sys.path.insert(0, str(SYNC_DIR))

import arra_sync
import sync_common


class Closable:
    def close(self):
        pass


class FailingSftp(Closable):
    def __init__(self, error):
        self.error = error
        self.put_calls = 0

    def put(self, *_args, **_kwargs):
        self.put_calls += 1
        raise RuntimeError(self.error)


class ChangingSftp(FailingSftp):
    def __init__(self, source, error):
        super().__init__(error)
        self.source = source

    def put(self, *_args, **_kwargs):
        self.source.write_text(
            self.source.read_text(encoding="utf-8") + "x",
            encoding="utf-8",
        )
        return super().put(*_args, **_kwargs)


class SyncResilienceTests(unittest.TestCase):
    def test_generated_temp_directories_are_not_scanned(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "src").mkdir()
            (root / "src" / "keep.txt").write_text("keep", encoding="utf-8")
            transient = root / "tmp" / "export-ios" / "assets"
            transient.mkdir(parents=True)
            (transient / "gone.png").write_bytes(b"temporary")
            audit = root / ".audit-packaged-profile" / "Local Storage"
            audit.mkdir(parents=True)
            (audit / "000003.log").write_text("browser state", encoding="utf-8")
            chrome_cache = root / "Work" / "1_BemApp" / ".codex-tmp" / "chrome-fresh-v6" / "Default" / "Cache" / "Cache_Data"
            chrome_cache.mkdir(parents=True)
            (chrome_cache / "f_000022").write_bytes(b"changing cache")

            files = sync_common.scan_local(root, True, allow_large=True)

            self.assertIn("src/keep.txt", files)
            self.assertNotIn("tmp/export-ios/assets/gone.png", files)
            self.assertNotIn(".audit-packaged-profile/Local Storage/000003.log", files)
            self.assertNotIn("Work/1_BemApp/.codex-tmp/chrome-fresh-v6/Default/Cache/Cache_Data/f_000022", files)

    def test_unfinished_transfer_parts_are_not_scanned(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "dialog.jsonl").write_text("complete", encoding="utf-8")
            (root / "dialog.jsonl.noda-part-25472").write_text("partial", encoding="utf-8")

            files = sync_common.scan_local(root, True, allow_large=True)

            self.assertIn("dialog.jsonl", files)
            self.assertNotIn("dialog.jsonl.noda-part-25472", files)

    def test_active_codex_sessions_are_enabled_but_archive_is_not(self):
        scope_ids = {scope["id"] for scope in arra_sync.active_scopes()}

        self.assertIn("codex-sessions", scope_ids)
        self.assertNotIn("codex-archive", scope_ids)

    def test_file_removed_after_scan_does_not_stop_transfer(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            rel = "tmp/export-ios/assets/disappeared.png"
            scope = {
                "id": "projects",
                "label": "Проекты",
                "local": root,
                "remote": "/remote/projects",
                "localMap": {rel: (128, 1)},
                "remoteMap": {},
                "uploadList": [rel],
                "downloadList": [],
                "conflictList": [],
            }
            events = []

            with (
                patch.object(arra_sync, "scan_everything", return_value=(Closable(), Closable(), [scope], time.time())),
                patch.object(arra_sync, "record_server_state"),
                patch.object(arra_sync, "write_remote_indexes"),
                patch.object(arra_sync, "emit", side_effect=events.append),
            ):
                arra_sync.transfer("push", None)

            self.assertFalse(any(event["type"] in {"error", "fileerror"} for event in events))
            self.assertTrue(any(event["type"] == "file_skipped" for event in events))
            result = next(event for event in reversed(events) if event["type"] == "done")
            self.assertEqual(0, result["errors"])
            self.assertEqual(1, result["skipped"])
            self.assertEqual(0, result["transferred"])

    def test_changing_source_is_skipped_after_retries_and_queue_finishes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            rel = "src/live.txt"
            source = root / rel
            source.parent.mkdir()
            source.write_text("changing", encoding="utf-8")
            scope = {
                "id": "projects", "label": "Проекты", "local": root, "remote": "/remote/projects",
                "localMap": {rel: (source.stat().st_size, int(source.stat().st_mtime))},
                "remoteMap": {}, "uploadList": [rel], "downloadList": [], "conflictList": [],
            }
            events = []
            sftp = ChangingSftp(source, "size mismatch in put! 0 != 8")

            with (
                patch.object(arra_sync, "scan_everything", return_value=(Closable(), sftp, [scope], time.time())),
                patch.object(arra_sync, "record_server_state"),
                patch.object(arra_sync, "write_remote_indexes"),
                patch.object(arra_sync, "ensure_dir"),
                patch.object(arra_sync, "safe_remote_remove"),
                patch.object(arra_sync.time, "sleep"),
                patch.object(arra_sync, "emit", side_effect=events.append),
            ):
                arra_sync.transfer("push", None)

            self.assertEqual(arra_sync.MAX_FILE_ATTEMPTS, sftp.put_calls)
            self.assertFalse(any(event["type"] in {"error", "fileerror"} for event in events))
            self.assertTrue(any(event["type"] == "file_skipped" for event in events))
            result = next(event for event in reversed(events) if event["type"] == "done")
            self.assertEqual(0, result["errors"])
            self.assertEqual(1, result["skipped"])

    def test_more_than_five_hard_file_errors_do_not_stop_the_queue(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            rels = [f"src/file-{index}.txt" for index in range(6)]
            local_map = {}
            for rel in rels:
                source = root / rel
                source.parent.mkdir(exist_ok=True)
                source.write_text(rel, encoding="utf-8")
                local_map[rel] = (source.stat().st_size, int(source.stat().st_mtime))
            scope = {
                "id": "projects", "label": "Проекты", "local": root, "remote": "/remote/projects",
                "localMap": local_map, "remoteMap": {}, "uploadList": rels,
                "downloadList": [], "conflictList": [],
            }
            events = []
            sftp = FailingSftp("Failure")

            with (
                patch.object(arra_sync, "scan_everything", return_value=(Closable(), sftp, [scope], time.time())),
                patch.object(arra_sync, "record_server_state"),
                patch.object(arra_sync, "write_remote_indexes"),
                patch.object(arra_sync, "ensure_dir"),
                patch.object(arra_sync, "safe_remote_remove"),
                patch.object(arra_sync.time, "sleep"),
                patch.object(arra_sync, "emit", side_effect=events.append),
            ):
                arra_sync.transfer("push", None)

            self.assertFalse(any(event["type"] == "error" for event in events))
            self.assertEqual(6, sum(event["type"] == "fileerror" for event in events))
            result = next(event for event in reversed(events) if event["type"] == "done")
            self.assertEqual(6, result["errors"])
            self.assertEqual(0, result["transferred"])


if __name__ == "__main__":
    unittest.main()
