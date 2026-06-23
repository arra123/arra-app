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
      `SELECT id, type, amount, currency, category, merchant, title, note, occurred_at, source, raw_input
       FROM transactions WHERE ${where}
       ORDER BY occurred_at DESC LIMIT $${params.length}`,
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

    const { rows: byCat } = await query(
      `SELECT category, COALESCE(SUM(amount),0)::float8 AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND occurred_at >= ${startExpr} AND occurred_at < ${endExpr}
       GROUP BY category ORDER BY total DESC LIMIT 8`,
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
