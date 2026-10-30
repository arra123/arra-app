/** Both the app and server use the same stable, unfiltered dialog order. */
export function dialogProps(agents, now = Date.now()) {
  const numbers = new Map();
  const shown = agents.map(a => {
    const group = `${a.device}:${a.cwd}`;
    const number = (numbers.get(group) || 0) + 1;
    numbers.set(group, number);
    return {
      key: a.key, title: String(a.title || a.project || 'Диалог').slice(0, 100),
      project: String(a.project || 'Arra').slice(0, 60), mascotId: a.mascotId || 0, number,
      // green «done» when it has finished; yellow «wait» only when it really asks something
      state: a.asking ? 'wait' : a.state === 'working' || a.helpers ? 'work' : a.state === 'waiting' ? 'done' : a.state === 'error' ? 'error' : 'idle',
      where: a.device === 'pc' ? 'ПК' : 'Ноутбук',
      note: a.compacting ? 'Сжимает контекст' : a.state !== 'working' && a.helpers && !a.asking ? `Ждёт помощников: ${a.helpers}` : a.state === 'working' ? String(a.stage || a.task || 'Выполняет задачу').replace(/\s+/g, ' ').trim().slice(0, 120) : a.asking ? 'Задал вопрос — ответьте в диалоге' : a.state === 'waiting' ? (String(a.said || '').replace(/[#*`>]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Закончил') : a.state === 'error' ? (a.error || 'Откройте диалог, чтобы проверить ошибку') : 'Нет текущего действия',
      min: a.since ? Math.max(0, Math.round((now-a.since)/60000)) : 0,
    };
  });
  return { layoutVersion: 2, agents: shown, working: agents.filter(a=>a.state==='working').length, waiting: agents.filter(a=>a.asking).length, updated: now };
}

/** ActivityKit caps the whole payload at 4KB; retain IDs, states and mascots. */
export function compactDialogProps(props) {
  let limit = 100;
  let result;
  do {
    result = { ...props, agents: props.agents.map(a => [a.key, a.title.slice(0, limit), a.project.slice(0, Math.min(40, limit)), a.note.slice(0, limit), a.state, a.mascotId, a.number, a.where]) };
    if (encodeURIComponent(JSON.stringify(result)).replace(/%[A-F\d]{2}/g, 'x').length <= 3000) return result;
    limit = Math.floor(limit / 2);
  } while (limit > 0);
  return { ...props, agents: props.agents.map(a=>[a.key,'','','',a.state,a.mascotId,a.number,a.where]) };
}
