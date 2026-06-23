import { hashPassword, verifyPassword } from '../auth.js';
import { one } from '../db.js';

export default async function authRoutes(app) {
  // Регистрация
  app.post('/auth/register', async (request, reply) => {
    const { password, name } = request.body || {};
    const email = request.body?.email || request.body?.login;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Нужны логин и пароль' });
    }
    const exists = await one('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists) return reply.code(409).send({ error: 'Такой email уже зарегистрирован' });

    const hash = await hashPassword(password);
    const user = await one(
      'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name',
      [email.toLowerCase(), hash, name || null],
    );
    const token = app.jwt.sign({ id: user.id, email: user.email });
    return { token, user };
  });

  // Вход
  app.post('/auth/login', async (request, reply) => {
    const { password } = request.body || {};
    const email = request.body?.email || request.body?.login;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Нужны логин и пароль' });
    }
    const user = await one(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }
    const token = app.jwt.sign({ id: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  // Текущий пользователь
  app.get('/me', { preHandler: app.auth }, async (request) => {
    const user = await one('SELECT id, email, name, created_at FROM users WHERE id = $1', [
      request.user.id,
    ]);
    return { user };
  });
}
