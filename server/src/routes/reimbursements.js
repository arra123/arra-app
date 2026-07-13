import { parseReimbursementInput } from '../ai.js';
import { one, query } from '../db.js';

const COLS = `id, amount, currency, purpose, merchant, location, company,
  occurred_at, due_date, status, note, source, raw_input,
  reimbursed_at, updated_at, created_at`;
const STATUSES = new Set(['pending', 'submitted', 'reimbursed', 'rejected']);

const clean = (value) => {
  const text = value == null ? '' : String(value).trim();
  return text || null;
};

export default async function reimbursementRoutes(app) {
  app.get('/reimbursements', { preHandler: app.auth }, async (request) => {
    const includeClosed = String(request.query?.includeClosed || '') === '1';
    const { rows } = await query(
      `SELECT ${COLS} FROM reimbursements
       WHERE user_id = $1 ${includeClosed ? '' : "AND status NOT IN ('reimbursed','rejected')"}
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
                occurred_at DESC, created_at DESC
       LIMIT 500`,
      [request.user.id],
    );
    return { reimbursements: rows };
  });

  app.post('/reimbursements/parse', { preHandler: app.auth }, async (request, reply) => {
    const text = clean(request.body?.text);
    const image = clean(request.body?.image);
    const preferredKind = request.body?.preferredKind === 'debt' ? 'debt' : 'reimbursement';
    if (!text && !image) return reply.code(400).send({ error: 'Нужен текст, голос или фото' });
    const parsed = await parseReimbursementInput({ text, image, preferredKind });
    return { parsed };
  });

  app.post('/reimbursements', { preHandler: app.auth }, async (request, reply) => {
    const b = request.body || {};
    const amount = Math.abs(Number(b.amount) || 0);
    const purpose = clean(b.purpose);
    if (!amount) return reply.code(400).send({ error: 'Укажите сумму' });
    if (!purpose) return reply.code(400).send({ error: 'Укажите, на что потрачено' });
    const status = STATUSES.has(b.status) ? b.status : 'pending';
    const source = ['manual', 'text', 'voice', 'photo', 'assistant'].includes(b.source) ? b.source : 'manual';
    const item = await one(
      `INSERT INTO reimbursements
         (user_id, amount, currency, purpose, merchant, location, company,
          occurred_at, due_date, status, note, source, raw_input, reimbursed_at)
       VALUES ($1,$2,'RUB',$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::date,$9,$10,$11,$12,
               CASE WHEN $9='reimbursed' THEN now() ELSE NULL END)
       RETURNING ${COLS}`,
      [request.user.id, amount, purpose, clean(b.merchant), clean(b.location), clean(b.company) || 'Компания',
       clean(b.occurred_at), clean(b.due_date), status, clean(b.note), source, clean(b.raw_input)],
    );
    return { reimbursement: item };
  });

  app.patch('/reimbursements/:id', { preHandler: app.auth }, async (request, reply) => {
    const b = request.body || {};
    const status = b.status === undefined ? null : (STATUSES.has(b.status) ? b.status : 'pending');
    const item = await one(
      `UPDATE reimbursements SET
         amount = COALESCE($1, amount),
         purpose = COALESCE($2, purpose),
         merchant = CASE WHEN $3::boolean THEN $4 ELSE merchant END,
         location = CASE WHEN $5::boolean THEN $6 ELSE location END,
         company = COALESCE($7, company),
         occurred_at = COALESCE($8::timestamptz, occurred_at),
         due_date = CASE WHEN $9::boolean THEN $10::date ELSE due_date END,
         status = COALESCE($11, status),
         note = CASE WHEN $12::boolean THEN $13 ELSE note END,
         reimbursed_at = CASE
           WHEN $11='reimbursed' AND status <> 'reimbursed' THEN now()
           WHEN $11 IS NOT NULL AND $11 <> 'reimbursed' THEN NULL
           ELSE reimbursed_at END,
         updated_at = now()
       WHERE id=$14 AND user_id=$15
       RETURNING ${COLS}`,
      [b.amount == null ? null : Math.abs(Number(b.amount) || 0), clean(b.purpose),
       Object.hasOwn(b, 'merchant'), clean(b.merchant), Object.hasOwn(b, 'location'), clean(b.location),
       clean(b.company), clean(b.occurred_at), Object.hasOwn(b, 'due_date'), clean(b.due_date), status,
       Object.hasOwn(b, 'note'), clean(b.note), request.params.id, request.user.id],
    );
    if (!item) return reply.code(404).send({ error: 'Запись не найдена' });
    return { reimbursement: item };
  });

  app.delete('/reimbursements/:id', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM reimbursements WHERE id=$1 AND user_id=$2', [request.params.id, request.user.id]);
    return { ok: true };
  });
}
