import { one, query } from '../db.js';

const DEBT_COLS = 'id, counterparty, amount, currency, direction, note, settled, settled_at, due_date, occurred_at, created_at';

export default async function debtRoutes(app) {
  // Список долгов. По умолчанию активные (обратная совместимость со старым приложением).
  // ?all=true — включая погашенные (для нового UI, где они видны помеченными).
  app.get('/debts', { preHandler: app.auth }, async (request) => {
    const includeSettled = request.query?.all === 'true';
    const { rows } = await query(
      `SELECT ${DEBT_COLS}
       FROM debts WHERE user_id = $1 ${includeSettled ? '' : 'AND settled = false'}
       ORDER BY settled ASC, COALESCE(due_date, '9999-12-31') ASC, created_at DESC`,
      [request.user.id],
    );
    return { debts: rows };
  });

  // Создать долг
  app.post('/debts', { preHandler: app.auth }, async (request, reply) => {
    const b = request.body || {};
    if (!b.counterparty || !b.amount) {
      return reply.code(400).send({ error: 'Нужны имя и сумма' });
    }
    const debt = await one(
      `INSERT INTO debts (user_id, counterparty, amount, currency, direction, note, due_date, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()))
       RETURNING ${DEBT_COLS}`,
      [
        request.user.id,
        b.counterparty,
        Math.abs(Number(b.amount)),
        b.currency || 'RUB',
        b.direction === 'i_owe' ? 'i_owe' : 'owes_me',
        b.note || null,
        b.due_date || null,
        b.occurred_at || null,
      ],
    );
    return { debt };
  });

  // Удалить долг
  app.delete('/debts/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM debts WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    return { ok: true };
  });

  // Обновить долг: сумма, направление, имя, срок, заметка, статус «вернули».
  app.patch('/debts/:id', { preHandler: app.auth }, async (request) => {
    const b = request.body || {};
    const settled = typeof b.settled === 'boolean' ? b.settled : null;
    const debt = await one(
      `UPDATE debts SET
         counterparty = COALESCE($1, counterparty),
         amount       = COALESCE($2, amount),
         direction    = COALESCE($3, direction),
         note         = COALESCE($4, note),
         due_date     = CASE WHEN $5::text IS NULL THEN due_date
                             WHEN $5 = '' THEN NULL
                             ELSE $5::date END,
         settled      = COALESCE($6, settled),
         settled_at   = CASE WHEN $6 IS TRUE THEN now()
                             WHEN $6 IS FALSE THEN NULL
                             ELSE settled_at END,
         occurred_at  = COALESCE($9::timestamptz, occurred_at)
       WHERE id = $7 AND user_id = $8
       RETURNING ${DEBT_COLS}`,
      [
        b.counterparty ?? null,
        b.amount != null ? Math.abs(Number(b.amount)) : null,
        b.direction === 'i_owe' || b.direction === 'owes_me' ? b.direction : null,
        b.note ?? null,
        b.due_date === undefined ? null : (b.due_date || ''),
        settled,
        request.params.id,
        request.user.id,
        b.occurred_at || null,
      ],
    );
    return { debt };
  });
}
