import type { AgentQuestion } from './types';

/** Выбор по каждому вопросу: номера вариантов с нуля. */
export type Selections = number[][];

/** Как ответить: клавишами в терминале (вопрос Claude) или обычным сообщением (Codex). */
export function answersByMessage(question: AgentQuestion) {
  return question.answerVia === 'message';
}

/** Все ли вопросы получили выбор — тогда можно отправлять варианты. */
export function allAnswered(question: AgentQuestion, picked: Selections) {
  return question.questions.every((q, i) => !q.options.length || (picked[i]?.length ?? 0) > 0);
}

/** Одиночный вопрос с одним выбором уходит сразу по нажатию, без кнопки «Ответить». */
export function answersOnTap(question: AgentQuestion) {
  const [only] = question.questions;
  return question.questions.length === 1 && !!only && !only.multi && only.options.length > 0;
}

/**
 * Клавиши для окна AskUserQuestion в Claude Code (сверено с CLI 2.1):
 * - один выбор: цифра выбирает вариант и сразу переходит к следующему вопросу;
 * - несколько: цифры отмечают варианты, фокус остаётся на первом; «вниз» проходит
 *   по вариантам и «Свой ответ» до кнопки Next/Submit, Enter её нажимает;
 * - если вопросов несколько или есть множественный выбор, в конце экран
 *   «Review your answers», где «1» — Submit answers.
 * Одиночный вопрос с одним выбором отправляется цифрой без обзора.
 * Enter после цифры не нажимаем: на следующем вопросе он выбрал бы первый вариант.
 */
export function claudeKeys(question: AgentQuestion, picked: Selections): string[] {
  const keys: string[] = [];
  question.questions.forEach((q, i) => {
    const chosen = [...new Set(picked[i] || [])].filter((n) => n >= 0 && n < q.options.length).sort((a, b) => a - b);
    if (q.multi) {
      for (const n of chosen) keys.push(String(n + 1));
      // варианты + «Type something» → ещё раз вниз на кнопку Next/Submit
      for (let d = 0; d <= q.options.length; d++) keys.push('down');
      keys.push('enter');
    } else {
      keys.push(String((chosen[0] ?? 0) + 1));
    }
  });
  if (!answersOnTap(question)) keys.push('1');
  return keys;
}

/**
 * Текст ответа одним сообщением: выбранные варианты по вопросам и свой текст.
 * Так отвечаем Codex, а Claude — когда пишут своими словами (окно вопроса
 * сначала закрывается Esc, иначе текст попал бы в меню выбора).
 */
export function answerMessage(question: AgentQuestion, picked: Selections, text = ''): string {
  const own = text.trim();
  const parts: string[] = [];
  const many = question.questions.length > 1;
  question.questions.forEach((q, i) => {
    const labels = (picked[i] || []).filter((n) => q.options[n]).map((n) => q.options[n].label);
    if (!labels.length) return;
    const answer = labels.join(', ');
    parts.push(many ? `${q.header || q.question}: ${answer}` : answer);
  });
  if (own) {
    if (parts.length) parts.push(`Своими словами: ${own}`);
    else parts.push(`${question.questions[0]?.header || question.questions[0]?.question || 'Ответ'}: ${own}`);
  }
  return parts.join('\n');
}
