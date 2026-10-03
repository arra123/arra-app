// Пинг WebSocket на уровне протокола: ноутбук с закрытой крышкой или телефон
// без сети не закрывают соединение, и без пинга сервер считал бы их живыми.
export function keepAlive(socket, { intervalMs = 20_000 } = {}) {
  let alive = true;
  socket.on('pong', () => {
    alive = true;
  });
  const timer = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    try {
      socket.ping();
    } catch {
      socket.terminate();
    }
  }, intervalMs);
  timer.unref?.();
  const stop = () => clearInterval(timer);
  socket.on('close', stop);
  return stop;
}
