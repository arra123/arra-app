import { pool, one } from '../db.js';
import { mergeConversations } from './conversations-merge.js';

export async function initConversations() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ara_conversations (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data jsonb NOT NULL DEFAULT '{"chats":[],"deleted":{}}', updated_at timestamptz NOT NULL DEFAULT now())`);
}
export async function readConversations(userId) {
  return (await one('SELECT data FROM ara_conversations WHERE user_id=$1', [userId]))?.data || { chats: [], deleted: {} };
}
export async function saveConversations(userId, incoming) {
  if (!incoming || !Array.isArray(incoming.chats) || incoming.chats.length > 2000 || incoming.chats.some(c => !c || !Array.isArray(c.messages) || c.messages.length > 10000))
    throw Object.assign(new Error('Некорректный список разговоров'), { statusCode: 400 });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO ara_conversations (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const { rows } = await db.query('SELECT data FROM ara_conversations WHERE user_id=$1 FOR UPDATE', [userId]);
    const data = mergeConversations(rows[0].data, incoming);
    data.revision = Number(rows[0].data.revision || 0) + 1;
    await db.query('UPDATE ara_conversations SET data=$2::jsonb, updated_at=now() WHERE user_id=$1', [userId, JSON.stringify(data)]);
    await db.query('COMMIT');
    return data;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
