"""Tiny local server that maps Expo static routes to their .html files."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import os


ROOT = Path(os.environ.get('NODA_STATIC_ROOT', '.expo-redesign-test')).resolve()
PORT = int(os.environ.get('NODA_STATIC_PORT', '8765'))


class ExpoHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        relative = urlsplit(path).path.lstrip('/')
        candidate = ROOT / relative
        if relative and not candidate.exists() and (ROOT / f'{relative}.html').exists():
            candidate = ROOT / f'{relative}.html'
        elif not relative:
            candidate = ROOT / 'index.html'
        return str(candidate)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', PORT), ExpoHandler).serve_forever()
