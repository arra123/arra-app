import { setTimeout as delay } from 'node:timers/promises';
import { query } from './db.js';

export async function savePushToken(userId, token, platform) {
  await query(
    `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, platform = $3`,
    [token, userId, platform || null],
  );
}

async function expoRequest(path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/' + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const error = new Error('Expo HTTP ' + response.status);
        error.permanent = response.status !== 429 && response.status < 500;
        throw error;
      }
      const json = await response.json();
      if (!json.data || json.errors?.length) throw Object.assign(new Error('Expo rejected push request'), { permanent: true });
      return json.data;
    } catch (error) {
      if (error.permanent || attempt === 2) throw error;
      await delay(1000 * 2 ** attempt);
    }
  }
}

async function recordError(token, error, stage) {
  console.warn('Arra push:', stage, error || 'Unknown'); // Never log device tokens.
  if (error === 'DeviceNotRegistered') await query('DELETE FROM push_tokens WHERE token = $1', [token]);
}

/** Expo acceptance is followed by a persistent APNs/FCM receipt check. */
export async function sendPushToUser(userId, title, body, data) {
  try {
    const { rows } = await query('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
    if (!rows.length) return { accepted: 0, error: 'Телефон не зарегистрирован для уведомлений' };
    let accepted = 0;
    let error;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const tickets = await expoRequest('send', batch.map(({ token }) => ({
        to: token, title, body, sound: 'default', priority: 'high', ttl: 3600, data: data || {},
        ...(data?.type === 'ara.agent' ? { mutableContent: true } : {}),
      })));
      for (let i = 0; i < batch.length; i++) {
        const ticket = tickets[i];
        if (ticket?.status === 'ok' && ticket.id) {
          accepted++;
          await query('INSERT INTO push_receipts (id, token) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [ticket.id, batch[i].token]);
        } else {
          error = ticket?.details?.error || 'MissingTicket';
          await recordError(batch[i].token, error, 'ticket');
        }
      }
    }
    return { accepted, error };
  } catch (error) {
    console.warn('Arra push request failed:', error.name, error.message);
    return { accepted: 0, error: 'Не удалось отправить уведомление. Повтори через минуту.' };
  }
}

let checking = false;
export async function checkPushReceipts() {
  if (checking) return;
  checking = true;
  try {
    const { rows } = await query('SELECT id, token, created_at FROM push_receipts WHERE check_after <= now() ORDER BY check_after LIMIT 300');
    if (!rows.length) return;
    const receipts = await expoRequest('getReceipts', { ids: rows.map(row => row.id) });
    for (const row of rows) {
      const receipt = receipts[row.id];
      if (receipt || Date.now() - new Date(row.created_at).getTime() > 23 * 3600000) {
        if (receipt?.status === 'error') await recordError(row.token, receipt.details?.error, 'receipt');
        else if (receipt?.status === 'ok') console.info('Arra push: provider accepted');
        else console.warn('Arra push: receipt expired');
        await query('DELETE FROM push_receipts WHERE id = $1', [row.id]);
      } else {
        await query("UPDATE push_receipts SET check_after = now() + interval '5 minutes' WHERE id = $1", [row.id]);
      }
    }
  } catch (error) { console.warn('Arra push receipt check failed:', error.name, error.message); }
  finally { checking = false; }
}
setInterval(checkPushReceipts, 60000).unref();
