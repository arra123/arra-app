const LAPTOP_RE = /ноут|laptop|notebook|macbook|ultrabook|book/i;
const PC_RE = /мой\s*(?:пк|компьютер)|стацион|desktop|workstation|\bпк\b|\bpc\b|computer/i;

export function normalizeDeviceRole(value, name = '') {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'laptop' || role === 'pc') return role;
  if (LAPTOP_RE.test(String(name || ''))) return 'laptop';
  if (PC_RE.test(String(name || ''))) return 'pc';
  return null;
}

function stamp(row) {
  const value = row.last_seen || row.created_at || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * В интерфейсе показываем физические устройства, а не исторические токены входа.
 * device_key — единственный надёжный идентификатор конкретной машины. Роль
 * (ноутбук/ПК) нужна только для подписи и иконки: две разные машины нельзя
 * склеивать лишь потому, что обе временно получили одинаковую роль.
 */
export function compactDeviceRows(rows, onlineTokenIds = []) {
  const online = new Set((onlineTokenIds || []).map(String));
  const groups = new Map();

  for (const source of rows || []) {
    const role = normalizeDeviceRole(source.role, source.name);
    const normalizedName = String(source.name || 'устройство').trim().toLowerCase().replace(/\s+/g, ' ');
    const hostname = String(source.hostname || '').trim().toLowerCase();
    const key = source.device_key
      ? `key:${source.device_key}`
      : (hostname ? `host:${hostname}` : (role ? `legacy-slot:${role}` : `name:${normalizedName}`));
    const item = { ...source, role, online: online.has(String(source.id)) };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return [...groups.values()].map((items) => {
    items.sort((a, b) => Number(b.online) - Number(a.online) || stamp(b) - stamp(a));
    const selected = { ...items[0] };
    selected.duplicate_count = items.length;
    return selected;
  }).sort((a, b) => Number(b.online) - Number(a.online)
    || (a.role === 'laptop' ? -1 : b.role === 'laptop' ? 1 : 0)
    || stamp(b) - stamp(a));
}

