import { chatWithTools, currentDateNote } from '../ai.js';
import { one, query } from '../db.js';

const CATEGORIES = [
  'Продукты', 'Кафе и рестораны', 'Кофе', 'Доставка', 'Алкоголь',
  'Транспорт', 'Такси', 'Каршеринг', 'Парковка', 'Топливо',
  'Жильё', 'ЖКХ', 'Связь и интернет',
  'Здоровье', 'Аптека', 'Спорт', 'Красота',
  'Одежда', 'Развлечения', 'Кино', 'Музыка', 'Игры', 'Подписки',
  'Образование', 'Книги', 'Подарки', 'Путешествия',
  'Дом и быт', 'Техника', 'Дети', 'Питомцы', 'Авто',
  'Маркетплейс', 'Налоги', 'Бизнес', 'Инвестиции',
  'Зарплата', 'Перевод', 'Прочее',
];

// Единое написание названий — чтобы Озон/Ozon, Компания/компания не считались разными.
const CANON = {
  'ozon': 'Озон', 'озон': 'Озон', 'о зон': 'Озон', 'озон банк': 'Озон',
  'компания': 'Компания', 'company': 'Компания',
  'proxi art': 'ProxyAPI', 'proxy art': 'ProxyAPI', 'прокси арт': 'ProxyAPI', 'proxy api': 'ProxyAPI', 'прокси апи': 'ProxyAPI', 'proxyapi': 'ProxyAPI',
  'wildberries': 'Wildberries', 'вайлдберриз': 'Wildberries', 'вб': 'Wildberries', 'вайлдберис': 'Wildberries',
  'яндекс еда': 'Яндекс Еда', 'яндекс.еда': 'Яндекс Еда', 'yandex eda': 'Яндекс Еда',
  'белка': 'Ситидрайв', 'belkacar': 'BelkaCar', 'ситидрайв': 'Ситидрайв', 'сити драйв': 'Ситидрайв', 'city drive': 'Ситидрайв', 'citydrive': 'Ситидрайв',
  'делимобиль': 'Делимобиль', 'яндекс драйв': 'Яндекс Драйв', 'яндекс.драйв': 'Яндекс Драйв',
  // магазины/сервисы — единое написание (для логотипов и статистики)
  'пятёрочка': 'Пятёрочка', 'пятерочка': 'Пятёрочка', 'магнит': 'Магнит', 'вкусвилл': 'ВкусВилл', 'вкус вилл': 'ВкусВилл',
  'перекрёсток': 'Перекрёсток', 'перекресток': 'Перекрёсток', 'лента': 'Лента', 'ашан': 'Ашан', 'самокат': 'Самокат',
  'яндекс такси': 'Яндекс Такси', 'yandex go': 'Яндекс Такси', 'uber': 'Uber',
  'kfc': 'KFC', 'кфс': 'KFC', 'burger king': 'Burger King', 'бургер кинг': 'Burger King',
  'вкусно и точка': 'Вкусно — и точка', 'макдоналдс': 'Вкусно — и точка', 'mcdonalds': 'Вкусно — и точка',
  'старбакс': 'Starbucks', 'starbucks': 'Starbucks', 'шоколадница': 'Шоколадница', 'кофикс': 'Cofix', 'cofix': 'Cofix',
  'netflix': 'Netflix', 'нетфликс': 'Netflix', 'spotify': 'Spotify', 'спотифай': 'Spotify',
  'youtube': 'YouTube', 'ютуб': 'YouTube', 'steam': 'Steam', 'стим': 'Steam',
  'apple': 'Apple', 'эпл': 'Apple', 'эппл': 'Apple', 'google': 'Google', 'гугл': 'Google',
  'мтс': 'МТС', 'mts': 'МТС', 'билайн': 'Билайн', 'мегафон': 'Мегафон', 'tele2': 'Tele2', 'теле2': 'Tele2',
  'днс': 'DNS', 'dns': 'DNS', 'мвидео': 'М.Видео', 'м видео': 'М.Видео', 'эльдорадо': 'Эльдорадо',
  'aliexpress': 'AliExpress', 'алиэкспресс': 'AliExpress', 'золотое яблоко': 'Золотое яблоко', 'летуаль': "Л'Этуаль",
  'сбер': 'Сбер', 'сбербанк': 'Сбер', 'тинькофф': 'Т-Банк', 'т-банк': 'Т-Банк', 'т банк': 'Т-Банк',
  'озон еда': 'Озон Еда', 'купер': 'Купер', 'сбермаркет': 'Купер', 'самокат еда': 'Самокат',
};
function canon(name) {
  if (!name) return name;
  const k = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  return CANON[k] || String(name).trim();
}

const PROMPT = `Ты — Arra, личный финансовый помощник Тимофея. Отвечай по-русски, дружелюбно, КРАТКО и по делу.
Ты управляешь ВСЕМ в приложении через инструменты: траты/доходы, долги, заметки, статистика.

ГЛАВНЫЕ ПРАВИЛА:
1. НИКОГДА не пиши «сделал/записал/отметил/удалил», если в ЭТОМ ответе не вызвал инструмент и не получил ok. Сначала ДЕЙСТВИЕ — потом отчёт фактом. Врать про результат запрещено.
2. Перед изменением/удалением сначала найди объект: list_transactions / list_debts / list_notes, возьми id, потом меняй. Не плоди дубли.
3. Массовые операции («все каршеринги», «всё за компанию», «перенеси все такси в категорию Такси») — делай ОДНИМ вызовом update_debts_bulk / update_transactions_bulk по match, не перечисляй руками.
4. После действия — короткое подтверждение по факту (что/сколько/категория). На вопросы о суммах бери числа из «ТЕКУЩЕЕ СОСТОЯНИЕ» ниже или из query_spending/get_summary — НЕ выдумывай.
5. Несколько операций в одном сообщении — несколько вызовов add_transaction.
6. Категория — из списка по сути товара; merchant — магазин/сервис (Озон, Пятёрочка, Netflix).
7. Если данные не дают ответа — честно скажи и предложи действие. НЕ повторяй один и тот же ответ дважды.

КАТЕГОРИЗАЦИЯ — выбирай САМУЮ КОНКРЕТНУЮ категорию, а не общую:
- кофе/латте/капучино/Starbucks/кофейня → «Кофе» (НЕ «Кафе и рестораны»).
- пиво/вино/бар/алкоголь → «Алкоголь». доставка еды (Яндекс Еда/Самокат/Деливери) → «Доставка».
- каршеринг (Ситидрайв/Делимобиль/Яндекс Драйв/Белка) → «Каршеринг» (НЕ «Транспорт»). метро/автобус/проездной → «Транспорт». такси → «Такси».
- бензин/заправка/АЗС → «Топливо». парковка → «Парковка».
- лекарства/аптека → «Аптека» (НЕ «Здоровье»). врач/анализы/клиника → «Здоровье».
- фитнес/зал/тренировки → «Спорт». салон/барбершоп/маникюр → «Красота».
- кино/билет в кино → «Кино». игры/Steam/PlayStation → «Игры». музыка/Spotify → «Музыка».
- Ozon/Wildberries/AliExpress (вещи) → «Маркетплейс» (merchant = название). техника/электроника/DNS → «Техника».
- ЖКХ/коммуналка/свет/вода → «ЖКХ». налоги/штрафы/пошлины → «Налоги».
- Примеры: «латте в Старбаксе 350» → категория Кофе, merchant Starbucks. «заправил бензин 2000» → Топливо. «аптека 540» → Аптека. «Сити Драйв 480» → Каршеринг, merchant Ситидрайв.
- Если по сути товара НЕ ясно — ставь «Прочее», НЕ угадывай криво.

ДОЛГИ — направление строго по смыслу:
- «дал/одолжил Егору 500», «Егор должен мне» → direction='owes_me' (мне должны), counterparty='Егор'.
- «занял у Егора 500», «я должен Егору» → direction='i_owe' (я должен), counterparty='Егор'.
- КОМПЕНСАЦИЯ: «я заплатил за каршеринг 1900, компания компенсирует/вернёт» — это ДВЕ вещи:
  1) add_transaction (расход, категория Транспорт/Авто),
  2) add_debt direction='owes_me' (КОМПАНИЯ должна мне эти деньги), counterparty=название компании.
  Никогда не ставь i_owe, когда деньги должны ВЕРНУТЬ ТЕБЕ.
- «Егор вернул долг», «компания компенсировала» → НЕ создавай новый долг: вызови list_debts, найди по counterparty и вызови settle_debt (пометить возвращённым). Долг останется виден как погашенный.
- КАРШЕРИНГ: если назван сервис (Белка/BelkaCar, Ситидрайв/City Drive, Делимобиль, Яндекс Драйв) — ставь его как counterparty (тогда подтянется логотип), а note = «каршеринг» + дата если есть. Пример: «каршеринг Сити Драйв 500 18.06» → add_debt counterparty='Ситидрайв', amount=500, direction='owes_me', note='каршеринг', occurred_at='2026-06-18'.
- ДАТЫ долга: occurred_at — КОГДА возник долг (когда дал/был каршеринг), due_date — срок возврата. Если в тексте есть дата (в т.ч. в названии операции) — передавай occurred_at. Понимай относительные даты («вчера», «21 июня»).
- Когда просят «покажи долги с датами» — вызови list_debts: там есть occurred_at, due_date, note, settled. Показывай occurred_at как дату долга. Если occurred_at нет в данных — НЕ выдумывай, но и не зацикливайся: предложи открыть долг и поставить дату. НЕ повторяй один и тот же ответ — если данные не изменились, отвечай иначе или признай ограничение.

Доступные категории: ${CATEGORIES.join(', ')}.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_transaction',
      description: 'Записать трату или доход',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number' },
          category: { type: 'string' },
          merchant: { type: 'string', description: 'магазин/сервис, если есть' },
          title: { type: 'string' },
          occurred_at: { type: 'string', description: 'ISO 8601, если указана дата; иначе не передавай' },
        },
        required: ['type', 'amount', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_debt',
      description: 'Записать долг. owes_me — деньги должны ВЕРНУТЬ ТЕБЕ (в т.ч. компенсация от компании). i_owe — должен ТЫ.',
      parameters: {
        type: 'object',
        properties: {
          counterparty: { type: 'string', description: 'человек или компания' },
          amount: { type: 'number' },
          direction: { type: 'string', enum: ['owes_me', 'i_owe'], description: 'owes_me — мне должны/компенсируют, i_owe — я должен' },
          note: { type: 'string', description: 'за что долг / комментарий, если указан' },
          occurred_at: { type: 'string', description: 'КОГДА возник долг (дата события: когда дал/был каршеринг и т.п.), ISO YYYY-MM-DD. Если в тексте есть дата — ОБЯЗАТЕЛЬНО передай.' },
          due_date: { type: 'string', description: 'срок возврата ISO YYYY-MM-DD, если назван' },
        },
        required: ['counterparty', 'amount', 'direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_debts',
      description: 'Показать долги (с id) — нужно ПЕРЕД пометкой «вернули»/изменением, чтобы не плодить дубли',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'settle_debt',
      description: 'Пометить долг возвращённым/компенсированным по id (долг останется виден как погашенный)',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_debts_bulk',
      description: 'Массово изменить долги, подходящие под match (по имени должника ИЛИ заметке). Напр. сделать все «каршеринг» активными или погашенными. Возвращает, сколько изменено.',
      parameters: {
        type: 'object',
        properties: {
          match: { type: 'string', description: 'подстрока для counterparty/note, напр. "каршеринг", "компания"' },
          settled: { type: 'boolean', description: 'true — пометить вернули/погашено; false — сделать активными' },
          occurred_at: { type: 'string', description: 'поставить дату события всем ISO YYYY-MM-DD' },
          due_date: { type: 'string', description: 'поставить срок всем ISO YYYY-MM-DD' },
        },
        required: ['match'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_debt',
      description: 'Изменить долг по id: дату события occurred_at, срок due_date, сумму, заметку',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          occurred_at: { type: 'string', description: 'дата возникновения ISO YYYY-MM-DD' },
          due_date: { type: 'string', description: 'срок ISO YYYY-MM-DD' },
          amount: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: 'Создать заметку',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' }, body: { type: 'string' } },
        required: ['body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'Показать заметки (с id) — перед изменением/удалением',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Изменить заметку по id (заголовок и/или текст)',
      parameters: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Удалить заметку по id',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_transactions_bulk',
      description: 'Массово изменить операции по совпадению (в названии/магазине/категории). Напр. перенести все «такси» в категорию Такси, или удалить все по слову. set_category — новая категория; delete=true — удалить совпавшие.',
      parameters: {
        type: 'object',
        properties: {
          match: { type: 'string', description: 'подстрока: ищется в title/merchant/category' },
          set_category: { type: 'string' },
          set_merchant: { type: 'string' },
          delete: { type: 'boolean' },
        },
        required: ['match'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_transactions',
      description: 'Показать последние операции (с id) — нужно ПЕРЕД изменением/удалением/объединением, чтобы не плодить дубли',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'сколько последних, по умолчанию 30' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_transaction',
      description: 'Изменить существующую операцию по id (что нужно — то и передай)',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number' },
          category: { type: 'string' },
          merchant: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_transaction',
      description: 'Удалить операцию по id (например дубликат)',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_spending',
      description: 'Сколько потрачено (можно по категории и/или магазину, за месяц)',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          merchant: { type: 'string' },
          month: { type: 'string', description: 'YYYY-MM; по умолчанию текущий' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summary',
      description: 'Сводка за месяц: доход, расход, топ категорий и магазинов',
      parameters: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' } } },
    },
  },
];

function monthRange(month) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month + '-01' : null;
  return {
    start: m ? `${m}` : null,
    startExpr: m ? '$2::date' : "date_trunc('month', now())",
    endExpr: m ? "($2::date + interval '1 month')" : "(date_trunc('month', now()) + interval '1 month')",
  };
}

// Живой снимок состояния пользователя — даём модели прямо в контекст, чтобы она НЕ выдумывала
// и могла отвечать на простые вопросы без лишних вызовов.
async function buildContext(userId) {
  try {
    const sum = await one(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type='expense'),0)::int AS expense,
              COALESCE(SUM(amount) FILTER (WHERE type='income'),0)::int AS income,
              COUNT(*)::int AS cnt
       FROM transactions WHERE user_id=$1 AND occurred_at >= date_trunc('month', now())`, [userId]);
    const { rows: cats } = await query(
      `SELECT category, SUM(amount)::int AS total FROM transactions
       WHERE user_id=$1 AND type='expense' AND occurred_at >= date_trunc('month', now())
       GROUP BY category ORDER BY total DESC LIMIT 6`, [userId]);
    const { rows: recent } = await query(
      `SELECT to_char(occurred_at,'DD.MM') AS d, type, amount::int AS a, category, merchant
       FROM transactions WHERE user_id=$1 ORDER BY occurred_at DESC LIMIT 8`, [userId]);
    const debt = await one(
      `SELECT COUNT(*) FILTER (WHERE NOT settled)::int AS active,
              COALESCE(SUM(amount) FILTER (WHERE NOT settled AND direction='owes_me'),0)::int AS owed_me,
              COALESCE(SUM(amount) FILTER (WHERE NOT settled AND direction='i_owe'),0)::int AS i_owe,
              COUNT(*)::int AS total FROM debts WHERE user_id=$1`, [userId]);
    const notes = await one('SELECT COUNT(*)::int AS n FROM notes WHERE user_id=$1', [userId]);
    const catStr = cats.map((c) => `${c.category} ${c.total}₽`).join(', ') || '—';
    const recStr = recent.map((r) => `${r.d} ${r.type === 'income' ? '+' : '−'}${r.a}₽ ${r.category}${r.merchant ? ' ' + r.merchant : ''}`).join('; ') || '—';
    return `ТЕКУЩЕЕ СОСТОЯНИЕ (этот месяц): расход ${sum.expense}₽, доход ${sum.income}₽, операций ${sum.cnt}.
По категориям: ${catStr}.
Долги: активных ${debt.active} (мне должны ${debt.owed_me}₽, я должен ${debt.i_owe}₽), всего записей ${debt.total}.
Заметок: ${notes.n}.
Последние операции: ${recStr}.
Эти числа уже актуальны — можешь отвечать на простые вопросы по ним без вызова инструментов. Для точных выборок (по конкретной категории/магазину/месяцу) используй query_spending/get_summary.`;
  } catch {
    return '';
  }
}

async function execTool(userId, name, args) {
  try {
    if (name === 'add_transaction') {
      const tx = await one(
        `INSERT INTO transactions (user_id, type, amount, currency, category, merchant, title, occurred_at, source)
         VALUES ($1,$2,$3,'RUB',$4,$5,$6,COALESCE($7, now()),'assistant')
         RETURNING id, type, amount, category, merchant`,
        [userId, args.type === 'income' ? 'income' : 'expense', Math.abs(Number(args.amount) || 0),
         args.category || 'Прочее', canon(args.merchant) || null, args.title || null, args.occurred_at || null],
      );
      return { ok: true, transaction: tx };
    }
    if (name === 'add_debt') {
      const debt = await one(
        `INSERT INTO debts (user_id, counterparty, amount, currency, direction, note, due_date, occurred_at)
         VALUES ($1,$2,$3,'RUB',$4,$5,$6,COALESCE($7, now()))
         RETURNING id, counterparty, amount, direction, due_date, occurred_at`,
        [userId, canon(args.counterparty) || 'Без имени', Math.abs(Number(args.amount) || 0),
         args.direction === 'i_owe' ? 'i_owe' : 'owes_me', args.note || null, args.due_date || null, args.occurred_at || null],
      );
      return { ok: true, debt };
    }
    if (name === 'list_debts') {
      const { rows } = await query(
        `SELECT id, counterparty, amount, direction, settled, note,
                to_char(occurred_at, 'YYYY-MM-DD') AS occurred_at,
                to_char(due_date, 'YYYY-MM-DD') AS due_date
         FROM debts WHERE user_id = $1 ORDER BY settled ASC, occurred_at DESC LIMIT 100`,
        [userId],
      );
      return { debts: rows };
    }
    if (name === 'update_debts_bulk') {
      const match = (args.match || '').trim();
      if (!match) return { error: 'нужен match' };
      const sets = [];
      const vals = [userId, `%${match}%`];
      if (typeof args.settled === 'boolean') {
        vals.push(args.settled); sets.push(`settled = $${vals.length}`);
        sets.push(`settled_at = CASE WHEN $${vals.length} THEN now() ELSE NULL END`);
      }
      if (args.occurred_at) { vals.push(args.occurred_at); sets.push(`occurred_at = $${vals.length}::timestamptz`); }
      if (args.due_date) { vals.push(args.due_date); sets.push(`due_date = $${vals.length}::date`); }
      if (!sets.length) return { error: 'нечего менять' };
      const { rowCount } = await query(
        `UPDATE debts SET ${sets.join(', ')}
         WHERE user_id = $1 AND (counterparty ILIKE $2 OR note ILIKE $2)`, vals);
      return { ok: true, updated: rowCount };
    }
    if (name === 'update_debt') {
      if (!args.id) return { error: 'нужен id' };
      const debt = await one(
        `UPDATE debts SET
           occurred_at = COALESCE($1::timestamptz, occurred_at),
           due_date    = CASE WHEN $2::text IS NULL THEN due_date WHEN $2='' THEN NULL ELSE $2::date END,
           amount      = COALESCE($3, amount),
           note        = COALESCE($4, note)
         WHERE id = $5 AND user_id = $6
         RETURNING id, counterparty, amount, direction, to_char(occurred_at,'YYYY-MM-DD') AS occurred_at`,
        [args.occurred_at || null, args.due_date === undefined ? null : (args.due_date || ''),
         args.amount != null ? Math.abs(Number(args.amount)) : null, args.note ?? null, args.id, userId],
      );
      return debt ? { ok: true, debt } : { error: 'не найдено' };
    }
    if (name === 'settle_debt') {
      if (!args.id) return { error: 'нужен id' };
      const debt = await one(
        `UPDATE debts SET settled = true, settled_at = now() WHERE id = $1 AND user_id = $2
         RETURNING id, counterparty, amount, direction, settled`,
        [args.id, userId],
      );
      return debt ? { ok: true, debt } : { error: 'не найдено' };
    }
    if (name === 'create_note') {
      const note = await one(
        'INSERT INTO notes (user_id, title, body) VALUES ($1,$2,$3) RETURNING id, title',
        [userId, args.title || null, args.body || ''],
      );
      return { ok: true, note };
    }
    if (name === 'list_notes') {
      const { rows } = await query(
        "SELECT id, title, left(body, 200) AS body, to_char(updated_at,'DD.MM.YYYY') AS updated FROM notes WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100",
        [userId]);
      return { notes: rows };
    }
    if (name === 'update_note') {
      if (!args.id) return { error: 'нужен id' };
      const note = await one(
        `UPDATE notes SET title = COALESCE($1, title), body = COALESCE($2, body), updated_at = now()
         WHERE id = $3 AND user_id = $4 RETURNING id, title`,
        [args.title ?? null, args.body ?? null, args.id, userId]);
      return note ? { ok: true, note } : { error: 'не найдено' };
    }
    if (name === 'delete_note') {
      if (!args.id) return { error: 'нужен id' };
      const { rowCount } = await query('DELETE FROM notes WHERE id=$1 AND user_id=$2', [args.id, userId]);
      return { ok: rowCount > 0 };
    }
    if (name === 'update_transactions_bulk') {
      const match = (args.match || '').trim();
      if (!match) return { error: 'нужен match' };
      const like = `%${match}%`;
      const where = `user_id=$1 AND (title ILIKE $2 OR merchant ILIKE $2 OR category ILIKE $2)`;
      if (args.delete) {
        const { rowCount } = await query(`DELETE FROM transactions WHERE ${where}`, [userId, like]);
        return { ok: true, deleted: rowCount };
      }
      const sets = []; const vals = [userId, like];
      if (args.set_category) { vals.push(args.set_category); sets.push(`category = $${vals.length}`); }
      if (args.set_merchant) { vals.push(args.set_merchant); sets.push(`merchant = $${vals.length}`); }
      if (!sets.length) return { error: 'нечего менять' };
      const { rowCount } = await query(`UPDATE transactions SET ${sets.join(', ')} WHERE ${where}`, vals);
      return { ok: true, updated: rowCount };
    }
    if (name === 'list_transactions') {
      const lim = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
      const { rows } = await query(
        `SELECT id, type, amount, category, merchant, title, occurred_at
         FROM transactions WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT ${lim}`,
        [userId],
      );
      return { transactions: rows };
    }
    if (name === 'update_transaction') {
      if (!args.id) return { error: 'нужен id' };
      const sets = [];
      const vals = [];
      const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
      if (args.type) add('type', args.type === 'income' ? 'income' : 'expense');
      if (args.amount != null) add('amount', Math.abs(Number(args.amount) || 0));
      if (args.category != null) add('category', args.category);
      if (args.merchant !== undefined) add('merchant', canon(args.merchant) || null);
      if (args.title !== undefined) add('title', args.title || null);
      if (!sets.length) return { error: 'нечего менять' };
      vals.push(args.id); vals.push(userId);
      const tx = await one(
        `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND user_id = $${vals.length}
         RETURNING id, type, amount, category, merchant`, vals);
      return tx ? { ok: true, transaction: tx } : { error: 'не найдено' };
    }
    if (name === 'delete_transaction') {
      if (!args.id) return { error: 'нужен id' };
      const { rowCount } = await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [args.id, userId]);
      return { ok: rowCount > 0 };
    }
    if (name === 'query_spending') {
      const { start, startExpr, endExpr } = monthRange(args.month);
      const params = [userId];
      if (start) params.push(start);
      let extra = '';
      if (args.category) { params.push(args.category); extra += ` AND category = $${params.length}`; }
      if (args.merchant) { params.push(args.merchant); extra += ` AND merchant ILIKE $${params.length}`; if (args.merchant) params[params.length - 1] = `%${args.merchant}%`; }
      const row = await one(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total, COUNT(*)::int AS count
         FROM transactions
         WHERE user_id = $1 AND type='expense' AND occurred_at >= ${startExpr} AND occurred_at < ${endExpr}${extra}`,
        params,
      );
      return { total: row.total, count: row.count, category: args.category || null, merchant: args.merchant || null };
    }
    if (name === 'get_summary') {
      const { start, startExpr, endExpr } = monthRange(args.month);
      const params = start ? [userId, start] : [userId];
      const { rows } = await query(
        `SELECT type, COALESCE(SUM(amount),0)::float8 AS total FROM transactions
         WHERE user_id=$1 AND occurred_at >= ${startExpr} AND occurred_at < ${endExpr} GROUP BY type`, params);
      const sum = { income: 0, expense: 0 };
      for (const r of rows) sum[r.type] = r.total;
      const { rows: cats } = await query(
        `SELECT category, COALESCE(SUM(amount),0)::float8 AS total FROM transactions
         WHERE user_id=$1 AND type='expense' AND occurred_at >= ${startExpr} AND occurred_at < ${endExpr}
         GROUP BY category ORDER BY total DESC LIMIT 5`, params);
      return { income: sum.income, expense: sum.expense, topCategories: cats };
    }
    return { error: 'unknown tool' };
  } catch (e) {
    return { error: e.message };
  }
}

export default async function assistantRoutes(app) {
  app.get('/ai/messages', { preHandler: app.auth }, async (request) => {
    const { rows } = await query(
      'SELECT id, role, content, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 200',
      [request.user.id],
    );
    return { messages: rows };
  });

  app.post('/ai/assistant', { preHandler: app.auth }, async (request, reply) => {
    const text = (request.body?.text || '').trim();
    if (!text) return reply.code(400).send({ error: 'Нужен text' });

    await query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1,$2,$3)', [request.user.id, 'user', text]);

    const { rows: hist } = await query(
      'SELECT role, content FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 16',
      [request.user.id],
    );
    const context = await buildContext(request.user.id);
    const messages = [
      { role: 'system', content: `${PROMPT}\n\n${currentDateNote()}\n\n${context}` },
      ...hist.reverse().map((h) => ({ role: h.role, content: h.content })),
    ];

    let final = '';
    try {
      for (let i = 0; i < 12; i++) {
        const msg = await chatWithTools(messages, TOOLS);
        messages.push(msg);
        if (msg.tool_calls?.length) {
          for (const tc of msg.tool_calls) {
            let args = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
            const result = await execTool(request.user.id, tc.function.name, args);
            messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
          }
          continue;
        }
        final = msg.content || '';
        break;
      }
    } catch (e) {
      final = 'Не получилось обработать: ' + e.message;
    }
    if (!final) final = 'Готово.';

    await query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1,$2,$3)', [request.user.id, 'assistant', final]);
    return { reply: final };
  });

  // Очистить диалог
  app.delete('/ai/messages', { preHandler: app.auth }, async (request) => {
    await query('DELETE FROM chat_messages WHERE user_id = $1', [request.user.id]);
    return { ok: true };
  });

  // Отменить последнюю запись, сделанную помощником (операция или долг)
  app.post('/ai/undo', { preHandler: app.auth }, async (request) => {
    const uid = request.user.id;
    const tx = await one(
      `SELECT id, type, amount, category FROM transactions
       WHERE user_id = $1 AND source = 'assistant' ORDER BY created_at DESC LIMIT 1`, [uid]);
    if (tx) {
      await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [tx.id, uid]);
      const sign = tx.type === 'income' ? 'доход' : 'расход';
      return { ok: true, kind: 'transaction', label: `${sign} ${Math.round(Number(tx.amount))} ₽ · ${tx.category}` };
    }
    const debt = await one(
      `SELECT id, counterparty, amount FROM debts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [uid]);
    if (debt) {
      await query('DELETE FROM debts WHERE id = $1 AND user_id = $2', [debt.id, uid]);
      return { ok: true, kind: 'debt', label: `долг · ${debt.counterparty} ${Math.round(Number(debt.amount))} ₽` };
    }
    return { ok: false };
  });
}
