import { one, query } from '../db.js';

export default async function transactionRoutes(app) {
  // Список операций. ?month=YYYY-MM — только за месяц.
  app.get('/transactions', { preHandler: app.auth }, async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 50, 500);
    const month = /^\d{4}-\d{2}$/.test(request.query?.month || '') ? request.query.month + '-01' : null;
    let where = 'user_id = $1';
    const params = [request.user.id];
    if (month) {
      params.push(month);
      where += ` AND occurred_at >= $${params.length}::date AND occurred_at < ($${params.length}::date + interval '1 month')`;
    }
    params.push(limit);
    const { rows } = await query(
      `SELECT t.id, t.type, t.amount, t.currency, t.category, t.merchant, t.title, t.note,
              t.occurred_at, t.source, t.raw_input,
              (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id)::int AS item_count
       FROM transactions t WHERE ${where.replace(/user_id/g, 't.user_id').replace(/occurred_at/g, 't.occurred_at')}
       ORDER BY t.occurred_at DESC LIMIT $${params.length}`,
      params,
    );
    return { transactions: rows };
  });

  // Создать операцию вручную
  app.post('/transactions', { preHandler: app.auth }, async (request, reply) => {
    const b = request.body || {};
    if (!b.amount) return reply.code(400).send({ error: 'Нужна сумма' });
    const tx = await one(
      `INSERT INTO transactions (user_id, type, amount, currency, category, merchant, title, note, occurred_at, source, raw_input)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, now()),$10,$11)
       RETURNING id, type, amount, currency, category, merchant, title, note, occurred_at, source`,
      [
        request.user.id,
        b.type === 'income' ? 'income' : 'expense',
        Math.abs(Number(b.amount)),
        b.currency || 'RUB',
        b.category || 'Прочее',
        b.merchant || null,
        b.title || null,
        b.note || null,
        b.occurred_at || null,
        b.source || 'manual',
        b.raw_input || null,
      ],
    );
    return { transaction: tx };
  });

  // Редактировать операцию вручную
  app.put('/transactions/:id', { preHandler: app.auth }, async (request, reply) => {
    const b = request.body || {};
    const tx = await one(
      `UPDATE transactions SET
         type = COALESCE($1, type),
         amount = COALESCE($2, amount),
         category = COALESCE($3, category),
         merchant = $4,
         title = $5,
         occurred_at = COALESCE($6, occurred_at)
       WHERE id = $7 AND user_id = $8
       RETURNING id, type, amount, currency, category, merchant, title, note, occurred_at, source`,
      [
        b.type === 'income' ? 'income' : b.type === 'expense' ? 'expense' : null,
        b.amount != null ? Math.abs(Number(b.amount)) : null,
        b.category || null,
        b.merchant ?? null,
        b.title ?? null,
        b.occurred_at || null,
        request.params.id,
        request.user.id,
      ],
    );
    if (!tx) return reply.code(404).send({ error: 'Операция не найдена' });
    return { transaction: tx };
  });

  // Удалить операцию
  app.delete('/transactions/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    return { ok: true };
  });

  // Позиции внутри операции (разбивка заказа на товары со своими категориями)
  app.get('/transactions/:id/items', { preHandler: app.auth }, async (request, reply) => {
    const tx = await one('SELECT id FROM transactions WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    if (!tx) return reply.code(404).send({ error: 'Операция не найдена' });
    const { rows } = await query(
      `SELECT id, title, amount::float8 AS amount, category
       FROM transaction_items WHERE transaction_id = $1 ORDER BY created_at`,
      [request.params.id],
    );
    return { items: rows };
  });

  // Заменить позиции операции целиком. body: { items: [{title, amount, category}] }
  app.put('/transactions/:id/items', { preHandler: app.auth }, async (request, reply) => {
    const tx = await one('SELECT id FROM transactions WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    if (!tx) return reply.code(404).send({ error: 'Операция не найдена' });
    const items = Array.isArray(request.body?.items) ? request.body.items : [];
    await query('DELETE FROM transaction_items WHERE transaction_id = $1', [request.params.id]);
    for (const it of items) {
      if (!it || it.amount == null || !String(it.title || '').trim()) continue;
      await query(
        `INSERT INTO transaction_items (transaction_id, title, amount, category)
         VALUES ($1, $2, $3, $4)`,
        [request.params.id, String(it.title).trim(), Math.abs(Number(it.amount)), it.category || null],
      );
    }
    const { rows } = await query(
      `SELECT id, title, amount::float8 AS amount, category
       FROM transaction_items WHERE transaction_id = $1 ORDER BY created_at`,
      [request.params.id],
    );
    return { items: rows };
  });

  // Сводка за месяц. ?month=YYYY-MM (по умолчанию текущий).
  app.get('/stats/summary', { preHandler: app.auth }, async (request) => {
    const month = /^\d{4}-\d{2}$/.test(request.query?.month || '') ? request.query.month + '-01' : null;
    const params = month ? [request.user.id, month] : [request.user.id];
    const startExpr = month ? '$2::date' : "date_trunc('month', now())";
    const endExpr = month ? "($2::date + interval '1 month')" : "(date_trunc('month', now()) + interval '1 month')";

    const { rows } = await query(
      `SELECT type, COALESCE(SUM(amount),0)::float8 AS total
       FROM transactions
       WHERE user_id = $1 AND occurred_at >= ${startExpr} AND occurred_at < ${endExpr}
       GROUP BY type`,
      params,
    );
    const summary = { income: 0, expense: 0 };
    for (const r of rows) summary[r.type] = r.total;

    // Разбивка по категориям: если у операции есть позиции — считаем по категориям позиций,
    // иначе по категории самой операции.
    const { rows: byCat } = await query(
      `WITH base AS (
         SELECT t.id, COALESCE(t.category,'Прочее') AS category, t.amount,
                EXISTS (SELECT 1 FROM transaction_items i WHERE i.transaction_id = t.id) AS has_items
         FROM transactions t
         WHERE t.user_id = $1 AND t.type = 'expense'
           AND t.occurred_at >= ${startExpr} AND t.occurred_at < ${endExpr}
       ),
       parts AS (
         SELECT category, amount FROM base WHERE NOT has_items
         UNION ALL
         SELECT COALESCE(i.category, b.category, 'Прочее') AS category, i.amount
         FROM transaction_items i JOIN base b ON b.id = i.transaction_id WHERE b.has_items
       )
       SELECT category, COALESCE(SUM(amount),0)::float8 AS total
       FROM parts GROUP BY category ORDER BY total DESC LIMIT 8`,
      params,
    );

    const { rows: byMerchant } = await query(
      `SELECT merchant, COALESCE(SUM(amount),0)::float8 AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND merchant IS NOT NULL
         AND occurred_at >= ${startExpr} AND occurred_at < ${endExpr}
       GROUP BY merchant ORDER BY total DESC LIMIT 8`,
      params,
    );
    return { summary, byCategory: byCat, byMerchant };
  });
}
