// Единственный экземпляр хаба с настоящими зависимостями: push через Expo,
// состояния агентов в БД (чтобы push не терялся после рестарта сервера).
import { join } from 'node:path';

import { config } from '../config.js';
import { query } from '../db.js';
import { sendPushToUser } from '../push.js';
import { createBlobStore } from './blobs.js';
import { createHub } from './hub.js';

export const blobs = createBlobStore({ dir: join(config.uploadDir, 'ara') });

export const hub = createHub({
  blobs,
  sendPush: sendPushToUser,
  async loadStates(userId) {
    const { rows } = await query(
      'SELECT agent_key, state, since FROM ara_agent_states WHERE user_id = $1',
      [userId],
    );
    return new Map(rows.map((r) => [r.agent_key, { state: r.state, since: new Date(r.since).getTime() }]));
  },
  async saveStates(userId, rows) {
    for (const row of rows) {
      await query(
        `INSERT INTO ara_agent_states (user_id, agent_key, state, project, since, updated_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), now())
         ON CONFLICT (user_id, agent_key)
         DO UPDATE SET state = $3, project = $4, since = to_timestamp($5 / 1000.0), updated_at = now()`,
        [userId, row.key, row.state, row.project, row.since],
      );
    }
  },
  async deleteStates(userId, keys) {
    await query('DELETE FROM ara_agent_states WHERE user_id = $1 AND agent_key = ANY($2)', [userId, keys]);
  },
});
