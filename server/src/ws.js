import { sendPushToUser } from './push.js';

// In-memory шина: userId -> Map(tokenId -> Set<socket>)
// Каждый ПК (устройство) = отдельный pc_token. Маршрутизируем файлы на конкретное устройство.
const users = new Map();

// Клиентские сокеты (телефон/веб-приложение): userId -> Set<socket>
// Используются для релея «телефон ↔ ПК-агент» (терминал, файлы, Claude).
const clients = new Map();

export function addAgent(userId, tokenId, socket) {
  if (!users.has(userId)) users.set(userId, new Map());
  const devices = users.get(userId);
  if (!devices.has(tokenId)) devices.set(tokenId, new Set());
  devices.get(tokenId).add(socket);
}

export function removeAgent(userId, tokenId, socket) {
  const devices = users.get(userId);
  if (!devices) return;
  const set = devices.get(tokenId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) devices.delete(tokenId);
}

/** Есть ли хоть один онлайн-ПК у пользователя */
export function isAgentOnline(userId) {
  const devices = users.get(userId);
  if (!devices) return false;
  for (const set of devices.values()) if (set.size > 0) return true;
  return false;
}

/** Список id онлайн-устройств пользователя */
export function onlineTokenIds(userId) {
  const devices = users.get(userId);
  if (!devices) return [];
  return [...devices.keys()].filter((id) => devices.get(id).size > 0);
}

/** Отправить событие на конкретное устройство. Вернёт true, если доставлено хоть одному сокету. */
export function notifyDevice(userId, tokenId, event) {
  const set = users.get(userId)?.get(tokenId);
  if (!set || set.size === 0) return false;
  const payload = JSON.stringify(event);
  let sent = false;
  for (const socket of set) {
    try {
      socket.send(payload);
      sent = true;
    } catch {
      /* мёртвый сокет */
    }
  }
  return sent;
}

/** Отправить событие всем устройствам пользователя (broadcast) */
export function notifyUser(userId, event) {
  const devices = users.get(userId);
  if (!devices) return;
  const payload = JSON.stringify(event);
  for (const set of devices.values()) {
    for (const socket of set) {
      try {
        socket.send(payload);
      } catch {
        /* мёртвый сокет */
      }
    }
  }
}

// ---- Клиентские (телефон) сокеты + релей ----

export function addClient(userId, socket) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(socket);
  notifyUser(userId, { type: 'presence', phoneOnline: true });
}

export function removeClient(userId, socket) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) {
    clients.delete(userId);
    notifyUser(userId, { type: 'presence', phoneOnline: false });
  }
}

/** Есть ли открытый телефонный/веб-клиент у пользователя. */
export function isClientOnline(userId) {
  return (clients.get(userId)?.size || 0) > 0;
}

/** Переслать сообщение от ПК-агента всем клиентам пользователя (терминал/файлы/Claude) */
export function relayToClients(userId, event) {
  // Важные события дублируем push-уведомлением (дойдёт, даже если приложение закрыто)
  maybePush(userId, event);
  const set = clients.get(userId);
  if (!set || set.size === 0) return false;
  const payload = JSON.stringify(event);
  let sent = false;
  for (const socket of set) {
    try {
      socket.send(payload);
      sent = true;
    } catch {
      /* мёртвый сокет */
    }
  }
  return sent;
}

function maybePush(userId, event) {
  let title = null;
  let body = null;
  if (event?.type === 'file_saved') { title = 'Файл получен на компьютере'; body = event.name || 'Готов к работе'; }
  else if (event?.type === 'claude_done') { title = 'Claude закончил'; body = 'Задача в терминале выполнена'; }
  if (title) sendPushToUser(userId, title, body, { type: event.type });
}

/**
 * Переслать сообщение от клиента (телефона) на ПК-агент(ы).
 * Если задан deviceId — на конкретное устройство, иначе всем ПК пользователя.
 * Возвращает true, если доставлено.
 */
export function relayToAgents(userId, event, deviceId) {
  if (deviceId) return notifyDevice(userId, deviceId, event);
  const devices = users.get(userId);
  if (!devices) return false;
  const payload = JSON.stringify(event);
  let sent = false;
  for (const set of devices.values()) {
    for (const socket of set) {
      try {
        socket.send(payload);
        sent = true;
      } catch {
        /* мёртвый сокет */
      }
    }
  }
  return sent;
}
