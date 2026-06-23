import { query } from './db.js';

export async function savePushToken(userId, token, platform) {
  await query(
    `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, platform = $3`,
    [token, userId, platform || null],
  );
}

// Отправка push через Expo Push API всем устройствам пользователя. Fire-and-forget.
export async function sendPushToUser(userId, title, body, data) {
  try {
    const { rows } = await query('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
    if (!rows.length) return;
    const messages = rows.map((r) => ({
      to: r.token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      data: data || {},
    }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    // Чистим протухшие/невалидные токены, чтобы не копились
    const json = await res.json().catch(() => null);
    const tickets = json?.data || [];
    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered') {
        await query('DELETE FROM push_tokens WHERE token = $1', [messages[i].to]).catch(() => {});
      }
    }
  } catch {
    // сеть/Expo недоступны — не критично
  }
}
