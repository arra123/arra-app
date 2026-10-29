// Shared by the server and phone. A snapshot never deletes absent chats/messages.
const stamp = (value, fallback = 0) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
const key = (value) => typeof value === 'string' && /^[\w:-]{1,240}$/.test(value) ? value : null;
const tombstones = (value) => Object.fromEntries(Object.entries(value || {}).filter(([id, at]) => key(id) && stamp(at) > 0));
const mergeDeleted = (a, b) => Object.fromEntries([...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].map(id => [id, Math.max(stamp(a?.[id]), stamp(b?.[id]))]));

export function normalizeChat(raw) {
  const id = key(String(raw?.id || ''));
  if (!id || !Array.isArray(raw.messages)) return null;
  const updatedAt = stamp(raw.updatedAt ?? raw.updated);
  const chat = { id, title: String(raw.title || 'Новый чат'), ...(raw.titleManual ? {titleManual: true} : {}), createdAt: stamp(raw.createdAt, updatedAt), updatedAt,
    lastOpenedAt: stamp(raw.lastOpenedAt), style: raw.style === 'talk' ? 'talk' : 'brief',
    model: ['haiku', 'sonnet', 'opus'].includes(raw.model) ? raw.model : 'sonnet',
    deletedMessages: tombstones(raw.deletedMessages), messages: [] };
  chat.messages = raw.messages.map((m, index) => {
    if (!m || typeof m !== 'object') return null;
    const role = m.role === 'user' ? 'user' : 'assistant';
    const message = { id: key(m.id) || `legacy:${id}:${index}`, role, text: String(m.text || m.actText || ''),
      at: stamp(m.at, updatedAt + index / 1000), updatedAt: stamp(m.updatedAt, updatedAt),
      ...(m.device === 'pc' || m.device === 'laptop' ? { device: m.device } : {}) };
    for (const field of ['images', 'actions']) if (Array.isArray(m[field])) message[field] = m[field].filter(v => typeof v === 'string');
    if (m.error || m.role === 'error') message.error = String(m.error || m.text || 'Ошибка ответа');
    if (m.streaming) message.streaming = true;
    if (m.desktop && typeof m.desktop === 'object') message.desktop = m.desktop;
    else if (m.role === 'action') message.desktop = { ...m, originalRole: 'action' };
    return message;
  }).filter(m => m && (!chat.deletedMessages[m.id] || m.updatedAt > chat.deletedMessages[m.id]));
  return chat;
}

export function mergeConversations(previous = {}, incoming = {}) {
  const deleted = mergeDeleted(tombstones(previous.deleted), tombstones(incoming.deleted));
  const chats = new Map();
  for (const raw of [...(previous.chats || []), ...(incoming.chats || [])]) {
    const next = normalizeChat(raw);
    if (!next || deleted[next.id]) continue;
    const old = chats.get(next.id);
    if (!old) { chats.set(next.id, next); continue; }
    const removed = mergeDeleted(old.deletedMessages, next.deletedMessages);
    const messages = new Map(old.messages.map(m => [m.id, m]));
    for (const m of next.messages) {
      const before = messages.get(m.id);
      // Equal revisions from a stale replica must not truncate a streamed answer.
      if (!before || m.updatedAt > before.updatedAt || m.updatedAt === before.updatedAt && m.text.length >= before.text.length) messages.set(m.id, m);
    }
    const newest = next.updatedAt >= old.updatedAt ? next : old;
    chats.set(next.id, { ...newest, updatedAt: Math.max(next.updatedAt, old.updatedAt),
      lastOpenedAt: Math.max(next.lastOpenedAt, old.lastOpenedAt), deletedMessages: removed,
      messages: [...messages.values()].filter(m => !removed[m.id] || m.updatedAt > removed[m.id]).sort((a,b) => a.at - b.at || a.id.localeCompare(b.id)) });
  }
  return { chats: [...chats.values()].filter(c => !deleted[c.id]).sort((a,b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), deleted };
}
