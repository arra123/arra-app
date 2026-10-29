"""Shared Conversations transport. Existing local JSON remains the offline copy."""
import asyncio
import hashlib
import json
import os
import tempfile
import time
import urllib.request
from pathlib import Path


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as file:
        json.dump(data, file, ensure_ascii=False)
        name = file.name
    os.replace(name, path)


def canonical(chats, baseline, device):
    previous = {c['id']: c for c in baseline}
    result = []
    for raw in chats:
        cid = str(raw['id']); old = previous.get(cid, {})
        at = raw.get('updatedAt') or raw.get('updated') or int(time.time() * 1000)
        c = {**raw, 'id': cid, 'updatedAt': at, 'createdAt': raw.get('createdAt', at), 'messages': []}
        prior = {m['id']: m for m in old.get('messages', [])}
        for i, original in enumerate(raw.get('messages', [])):
            mid = original.get('id') or f'legacy:{cid}:{i}'
            before = prior.get(mid, {})
            lines = (original.get('text') or '').splitlines()
            images = list(dict.fromkeys(original.get('images', []) + [line[2:].strip() for line in lines if line.startswith('📎 ')]))
            text = '\n'.join(line for line in lines if not line.startswith('📎 '))
            message = {**original, 'id': mid, 'role': 'user' if original.get('role') == 'user' else 'assistant',
                       'text': text or original.get('actText', ''), 'images': images,
                       'at': original.get('at') or before.get('at') or at + i / 1000,
                       'device': original.get('device') or device}
            if original.get('role') == 'action': message['desktop'] = {**original, 'originalRole': 'action'}
            if original.get('role') == 'error': message['error'] = text
            changed = before and any(message.get(k) != before.get(k) for k in ('text', 'images', 'error', 'streaming', 'actions'))
            message['updatedAt'] = int(time.time() * 1000) if changed else before.get('updatedAt', original.get('updatedAt', at))
            c['messages'].append(message)
        removed = dict(old.get('deletedMessages', {})); removed.update(raw.get('deletedMessages', {}))
        ids = {m['id'] for m in c['messages']}
        for mid in prior.keys() - ids: removed[mid] = int(time.time() * 1000)
        c['deletedMessages'] = removed
        result.append(c)
    return result


def desktop(chats):
    result = []
    for c in chats:
        messages = []
        for m in c['messages']:
            original = m.get('desktop') or {}
            text = m['text'] + ''.join('\n📎 ' + p for p in m.get('images', []) if p.startswith('/'))
            message = {**m, **original, 'id': m['id'], 'at': m['at'], 'updatedAt': m['updatedAt'], 'text': text,
                       'role': original.get('originalRole') or ('error' if m.get('error') else m['role'])}
            messages.append(message)
        result.append({**c, 'updated': c['updatedAt'], 'messages': messages})
    return result


class ConversationSync:
    def __init__(self, api, token, device):
        self.url = api + '/ara/conversations'; self.token = token; self.device = device
        self.path = Path.home() / '.local/share/notch-island/chats.json'
        self.meta = self.path.with_name('conversations-sync.json')
        self.incoming = None
        self.sent_hash = None
        try: self.saved = json.loads(self.meta.read_text())
        except (OSError, ValueError): self.saved = {'native': [], 'deleted': {}, 'revision': -1}

    def request(self, payload=None):
        body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
        req = urllib.request.Request(self.url, data=body, headers={'x-device-token': self.token, 'content-type': 'application/json'})
        with urllib.request.urlopen(req, timeout=12) as response: return json.load(response)

    async def step(self):
        # A malformed/read-in-progress local file must never be interpreted as deletion.
        try:
            source = self.path.read_bytes(); local = json.loads(source)
        except FileNotFoundError: source = b'[]'; local = []
        if not isinstance(local, list): raise ValueError('Invalid local conversations')
        digest = hashlib.sha256(source).hexdigest()
        if digest != self.sent_hash:
            chats = canonical(local, self.saved['native'], self.device)
            removed = dict(self.saved.get('deleted', {})); ids = {c['id'] for c in chats}
            for old in self.saved['native']:
                if old['id'] not in ids: removed[old['id']] = int(time.time() * 1000)
            self.saved.update(native=chats, deleted=removed)
            atomic_json(self.meta, self.saved)  # pending deletions survive a network outage/restart
            data = await asyncio.to_thread(self.request, {'chats': chats, 'deleted': removed})
            self.sent_hash = digest
        elif self.incoming and self.incoming.get('revision', 0) > self.saved.get('revision', -1):
            data = self.incoming
        else: return
        if any(m.get('nativeStreaming') for c in local for m in c.get('messages', [])):
            self.incoming = data  # Don't overwrite the native composer's active answer.
            return
        try: current = self.path.read_bytes()
        except FileNotFoundError: current = b'[]'
        if current != source:
            self.sent_hash = None
            return  # the user wrote while HTTP was in flight; merge that change first
        native = desktop(data['chats'])
        new_source = json.dumps(native, ensure_ascii=False).encode()
        if json.loads(source) != native: atomic_json(self.path, native)
        self.sent_hash = hashlib.sha256(self.path.read_bytes() if self.path.exists() else new_source).hexdigest()
        self.saved.update(native=canonical(native, data['chats'], self.device), deleted=data.get('deleted', {}), revision=data.get('revision', 0))
        atomic_json(self.meta, self.saved)

    async def run(self):
        while True:
            try: await self.step()
            except Exception as error:
                import logging
                logging.getLogger('ara-link').warning('Conversation sync: %s', error)
                await asyncio.sleep(2)
            await asyncio.sleep(.7)
