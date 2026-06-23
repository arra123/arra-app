import bcrypt from 'bcryptjs';

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Хук аутентификации: проверяет JWT и кладёт { id, email } в request.user.
 * Использование: { preHandler: app.auth } на защищённых маршрутах.
 */
export function makeAuthHook(app) {
  return async function authHook(request, reply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Не авторизован' });
    }
  };
}
