#!/usr/bin/env python3
"""Arra as an iPhone 17 Pro Max on the desktop: a frameless, see-through window
shaped like the phone (440 x 956 pt screen, Dynamic Island, status bar, home
indicator) with the web build inside, and a small control panel at its side.

    python3 main.py [url]        default http://127.0.0.1:8765/
"""
import os
import subprocess
import sys
import time

from PySide6.QtCore import QObject, QUrl, Slot, Signal
from PySide6.QtGui import QGuiApplication
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtWebEngineQuick import QtWebEngineQuick

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))


class Host(QObject):
    """What QML cannot do itself: rebuild the web version, open a folder."""
    rebuilt = Signal(bool, str)

    @Slot()
    def rebuild(self):
        proc = subprocess.Popen(
            ["npx", "expo", "export", "--platform", "web", "--output-dir", "dist-web"],
            cwd=PROJECT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self._proc = proc
        self._started = time.time()
        from PySide6.QtCore import QTimer
        t = QTimer(self)
        t.setInterval(500)

        def poll():
            if proc.poll() is None:
                return
            t.stop()
            out = proc.stdout.read() if proc.stdout else ""
            self.rebuilt.emit(proc.returncode == 0, out[-300:])
        t.timeout.connect(poll)
        t.start()
        self._timer = t

    @Slot(str)
    def openPath(self, path):
        subprocess.Popen(["xdg-open", path])

    @Slot(result=str)
    def notePath(self):
        """A new note picture: ~/Pictures/arra-notes/note-<time>.png"""
        d = os.path.expanduser("~/Pictures/arra-notes")
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, time.strftime("note-%Y-%m-%d_%H.%M.%S.png"))

    @Slot(str, str)
    def logNote(self, path, url):
        """notes.tsv: time, the picture, the screen (url) it was drawn on"""
        with open(os.path.expanduser("~/Pictures/arra-notes/notes.tsv"), "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{path}\t{url}\n")

    @Slot(result=str)
    def shotPath(self):
        d = os.path.expanduser("~/Pictures/Screenshots")
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, time.strftime("arra-phone-%Y-%m-%d_%H.%M.%S.png"))


DEVTOOLS = "127.0.0.1:9333"


def touch_emulation():
    """The mouse acts as a finger: a drag is a swipe (scroll with momentum,
    the side panel, swiping rows), like Chrome's phone mode. Done through the
    engine's DevTools port; the session stays attached so the mode stays on,
    and is re-attached after a reload."""
    import asyncio
    import json
    import threading
    import urllib.request

    async def attach():
        import websockets
        while True:
            try:
                pages = json.load(urllib.request.urlopen(f"http://{DEVTOOLS}/json", timeout=2))
                page = next(p for p in pages if p.get("type") == "page")
                async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
                    for i, (method, params) in enumerate([
                        ("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5}),
                        ("Emulation.setEmitTouchEventsForMouse", {"enabled": True, "configuration": "mobile"}),
                    ], 1):
                        await ws.send(json.dumps({"id": i, "method": method, "params": params}))
                    async for _ in ws:
                        pass
            except Exception as error:
                with open(os.path.join(os.environ.get("XDG_RUNTIME_DIR", "/tmp"), "arra-phone-touch.log"), "a") as f:
                    f.write(f"{time.strftime('%H:%M:%S')} {type(error).__name__}: {error}\n")
            await asyncio.sleep(1.5)

    threading.Thread(target=lambda: asyncio.run(attach()), daemon=True).start()


def main():
    os.environ.setdefault("QTWEBENGINE_REMOTE_DEBUGGING", DEVTOOLS)
    QtWebEngineQuick.initialize()
    QGuiApplication.setApplicationName("arra-phone")
    QGuiApplication.setDesktopFileName("arra-phone")
    app = QGuiApplication(sys.argv[:1])
    host = Host()
    engine = QQmlApplicationEngine()
    engine.setInitialProperties({"startUrl": sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"})
    engine.rootContext().setContextProperty("host", host)
    engine.load(QUrl.fromLocalFile(os.path.join(HERE, "Phone.qml")))
    if not engine.rootObjects():
        sys.exit(1)
    touch_emulation()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
