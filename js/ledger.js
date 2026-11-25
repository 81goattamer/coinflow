// お金の計算（設計書 4〜8章）。state を受け取って値を返すだけで、DOM にも保存先にも依存しない
import { addDays, addMonths, dayInMonth, monthOf, shiftDate, weekday } from './dates.js';

export const TYPE_ORDER = ['cash', 'card', 'saving'];

export function activeAccounts(state, types = TYPE_ORDER) {
  return state.accounts
    .filter((a) => !a.deleted && types.includes(a.type))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.order - b.order);
}

const doneLends = (tx) => (tx.lends ?? []).filter((l) => l.done);
export const lendReturned = (tx) => doneLends(tx).reduce((s, l) => s + l.amount, 0);
export const refundOf = (tx) => (tx.cancel?.state === 'done' ? tx.cancel.refund : 0);
// ポイント利用: 支出は満額のまま、使ったポイントは収入として足す。口座から出ていくのは差額だけ
export const POINT_CAT = '__points';
export const pointsOf = (tx) => (tx.type === 'expense' ? tx.points ?? 0 : 0);

// ---- 不定期の予約（例: 電気代）から登録した支払い ----

export const isIrregular = (rsv) => rsv?.repeat?.kind === 'irregular';

export const isRegular = (rsv) => rsv.type !== 'salary' && ['days', 'weekly', 'monthly'].includes(rsv.repeat?.kind);

// 不定期の支払いのうち、まだ支払日が来ていないもの。履歴にも計算にも入れない
export const isPlanned = (tx, today) => !!tx.itemId && tx.date > today;

// 支払日が来ていない不定期の支払いを除いた state。残高・分析・履歴の計算にはこれを渡す
export function liveState(state, today) {
  return { ...state, txs: state.txs.filter((tx) => !isPlanned(tx, today)) };
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// 1つの項目の支払い。planned は支払日の近い順、paid は新しい順
export function itemPayments(state, itemId, today) {
  const list = state.txs.filter((tx) => tx.itemId === itemId);
  return {
    planned: list.filter((tx) => isPlanned(tx, today)).sort(byDate),
    paid: list.filter((tx) => !isPlanned(tx, today)).sort((a, b) => byDate(b, a)),
  };
}

// 項目を削除したあとに残った、支払日前の支払い
export function orphanPlanned(state, today) {
  const items = new Set(state.reservations.filter(isIrregular).map((r) => r.id));
  return state.txs.filter((tx) => isPlanned(tx, today) && !items.has(tx.itemId)).sort(byDate);
}

// ---- 残高（4章） ----

export function balances(state) {
  const bal = new Map(state.accounts.map((a) => [a.id, a.type === 'card' ? -a.initial : a.initial]));
  const add = (id, v) => {
    if (id && bal.has(id)) bal.set(id, bal.get(id) + v);
  };
  for (const tx of state.txs) {
    switch (tx.type) {
      case 'expense':
        add(tx.accountId, -tx.amount + pointsOf(tx));
        for (const l of doneLends(tx)) add(l.accountId, l.amount);
        if (tx.cancel?.state === 'done') add(tx.cancel.to === 'month' ? tx.accountId : tx.cancel.accountId, tx.cancel.refund);
        break;
      case 'income':
        add(tx.accountId, tx.amount);
        break;
      case 'transfer':
        add(tx.accountId, -tx.amount);
        add(tx.toAccountId, tx.amount);
        break;
      case 'cardpay':
        add(tx.accountId, -tx.amount);
        add(tx.cardId, tx.amount);
        break;
      default:
    }
    // 借入の返済（支出の借入・収入の借入どちらも、返すのに使った口座から引く）
    if (tx.borrow?.done) add(tx.borrow.accountId, -tx.amount);
  }
  for (const adj of state.adjustments) add(adj.accountId, adj.diff);
  return bal;
}

export function unpaidOf(bal, cardId) {
  return -(bal.get(cardId) ?? 0);
}

// 総残高（BAL-01）
export function totalBalance(state, bal = balances(state)) {
  const byId = new Map(state.accounts.map((a) => [a.id, a]));
  let total = 0;
  for (const a of state.accounts) {
    if (a.deleted) continue;
    if (a.type === 'cash') total += bal.get(a.id);
    if (a.type === 'card' && byId.get(a.card.debitId)?.type === 'cash') total -= unpaidOf(bal, a.id);
  }
  return total;
}

// ---- クレジットカードの支払い回（5章） ----

export function cycleOfDate(card, date) {
  const m = monthOf(date);
  return date <= dayInMonth(m, card.closingDay) ? m : addMonths(m, 1);
}

export function payDateOf(card, cycle) {
  return shiftDate(dayInMonth(addMonths(cycle, card.payMonths), card.payDay), card.shift);
}

export function startCycle(card) {
  let c = addMonths(monthOf(card.startDate), -3);
  // 登録した日より後で最初の支払日の回（CARD-09）。登録した日が支払日なら、その日の支払いは済んでいるものとする
  while (payDateOf(card, c) <= card.startDate) c = addMonths(c, 1);
  return c;
}

const paidCycles = (state, id) => new Set(state.txs.filter((t) => t.type === 'cardpay' && t.cardId === id).map((t) => t.cycle));

// 回 c より後の分（利用・返金・回を決めた調整）を返す関数を作る
function afterOf(state, account) {
  const card = account.card;
  const charges = state.txs.filter((t) => t.type === 'expense' && t.accountId === account.id);
  const adjs = state.adjustments.filter((a) => a.accountId === account.id && a.cycle);
  return (c) => {
    let s = 0;
    for (const a of adjs) if (a.cycle > c) s -= a.diff;
    for (const t of charges) {
      if (cycleOfDate(card, t.date) > c) s += t.amount - pointsOf(t);
      if (t.cancel?.state === 'done' && t.cancel.to === 'month' && t.cancel.cycle > c) s -= t.cancel.refund;
    }
    return s;
  };
}

// カードの状態: 未払い額と次の回（支払日・支払額・支払日が来たか）
export function cardStatus(state, account, today, bal = balances(state)) {
  const card = account.card;
  const unpaid = unpaidOf(bal, account.id);
  const paid = paidCycles(state, account.id);
  const after = afterOf(state, account);
  let c = startCycle(card);
  for (let i = 0; i < 600; i++, c = addMonths(c, 1)) {
    if (paid.has(c)) continue;
    const amount = Math.max(0, unpaid - after(c));
    const payDate = payDateOf(card, c);
    if (payDate <= today && amount === 0) continue;
    return { unpaid, cycle: c, payDate, amount, due: payDate <= today };
  }
  return { unpaid, cycle: null, payDate: null, amount: 0, due: false };
}

// これからの支払い（ACC-13・ACC-22）。次の回から、今日使った分が入る回まで。最後の rest はそれより後の分
// amount は払う額（0 以上）、raw はその回に入っている額（払いすぎなどで負にもなる。合計が未払い額）
export function cardPlan(state, account, today) {
  const card = account.card;
  const st = cardStatus(state, account, today);
  const paid = paidCycles(state, account.id);
  const after = afterOf(state, account);
  const cycles = [st.cycle ?? cycleOfDate(card, today)];
  const last = cycleOfDate(card, today);
  const nextOf = (c) => {
    let n = addMonths(c, 1);
    while (paid.has(n)) n = addMonths(n, 1);
    return n;
  };
  for (let n = nextOf(cycles[0]); n <= last; n = nextOf(n)) cycles.push(n);
  let left = st.unpaid;
  let sum = 0;
  let paidSum = 0;
  const part = (cycle, raw, rest) => {
    sum += raw;
    const amount = Math.max(0, sum - paidSum);
    paidSum += amount;
    return { cycle, payDate: payDateOf(card, cycle), raw, amount, rest };
  };
  const parts = cycles.map((c) => {
    const later = after(c);
    const p = part(c, left - later, false);
    left = later;
    return p;
  });
  return [...parts, part(nextOf(cycles.at(-1)), left, true)];
}

// これから登録するカードの、金額を入れる支払い回（今日までに使った分が入る回）
export function newCardPlan(card, today) {
  const last = cycleOfDate(card, today);
  const out = [];
  let c = startCycle({ ...card, startDate: today });
  do {
    out.push({ cycle: c, payDate: payDateOf(card, c), raw: 0, amount: 0, rest: false });
    c = addMonths(c, 1);
  } while (c <= last);
  return out;
}

// 支払日が来たカード（CARD-01）
export function dueCardPayments(state, today, bal = balances(state)) {
  return activeAccounts(state, ['card'])
    .map((a) => ({ account: a, status: cardStatus(state, a, today, bal) }))
    .filter((x) => x.status.due);
}

// キャンセルの返金先に選べる、まだ払っていない回（CXL-02）
export function unpaidCycles(state, account, today, count = 4) {
  const st = cardStatus(state, account, today);
  const start = st.cycle ?? cycleOfDate(account.card, today);
  return Array.from({ length: count }, (_, i) => {
    const c = addMonths(start, i);
    return { cycle: c, payDate: payDateOf(account.card, c) };
  });
}

// ---- 分析（6章） ----

export const REPAY_CAT = '__repay';

export function analyze(state, month) {
  const res = {
    expense: 0,
    income: 0,
    expCats: new Map(),
    incCats: new Map(),
    expDays: new Array(32).fill(0),
    incDays: new Array(32).fill(0),
  };
  const put = (kind, catId, date, v) => {
    if (!v) return;
    const cats = kind === 'expense' ? res.expCats : res.incCats;
    const key = catId ?? null;
    cats.set(key, (cats.get(key) ?? 0) + v);
    (kind === 'expense' ? res.expDays : res.incDays)[Number(date.slice(8))] += v;
    res[kind] += v;
  };
  for (const tx of state.txs) {
    if (tx.type === 'expense' && monthOf(tx.date) === month) {
      put('expense', tx.catId, tx.date, tx.amount - lendReturned(tx) - refundOf(tx));
      put('income', POINT_CAT, tx.date, pointsOf(tx));
    }
    if (tx.type === 'income') {
      if (monthOf(tx.date) === month) put('income', tx.catId, tx.date, tx.amount);
      if (tx.borrow?.done && monthOf(tx.borrow.doneDate) === month) put('expense', REPAY_CAT, tx.borrow.doneDate, tx.amount);
    }
  }
  return res;
}

// ---- 履歴の行（7章） ----

export function historyRows(state) {
  const rows = [];
  for (const tx of state.txs) {
    const filter = tx.type === 'cardpay' ? 'expense' : tx.type;
    rows.push({ key: tx.id, kind: 'tx', filter, date: tx.date, time: tx.time, tx });
    if (pointsOf(tx)) rows.push({ key: `${tx.id}:p`, kind: 'points', filter: 'income', date: tx.date, time: tx.time, tx });
    for (const l of tx.lends ?? []) {
      if (l.done) rows.push({ key: `${tx.id}:${l.id}`, kind: 'lend', filter: 'expense', date: l.doneDate, time: l.doneTime, tx, party: l });
    }
    if (tx.borrow?.done) {
      rows.push({ key: `${tx.id}:b`, kind: 'borrow', filter, date: tx.borrow.doneDate, time: tx.borrow.doneTime, tx, party: tx.borrow });
    }
    if (tx.cancel?.state === 'done') {
      rows.push({ key: `${tx.id}:r`, kind: 'refund', filter: 'expense', date: tx.cancel.doneDate, time: tx.cancel.doneTime, tx });
    }
  }
  for (const adj of state.adjustments) {
    if (adj.show) rows.push({ key: adj.id, kind: 'adj', filter: null, date: adj.date, time: adj.time, adj });
  }
  return sortRows(rows);
}

// 日付の新しい順。同じ日は時刻なしが先頭、そのあと時刻の新しい順（HIST-11）
export function sortRows(rows) {
  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (!a.time !== !b.time) return a.time ? 1 : -1;
    if (a.time !== b.time) return a.time < b.time ? 1 : -1;
    return 0;
  });
}

// その口座に関係する行（口座の明細）
export function rowTouches(row, id) {
  if (row.kind === 'adj') return row.adj.accountId === id;
  const tx = row.tx;
  if (row.kind === 'lend' || row.kind === 'borrow') return row.party.accountId === id;
  if (row.kind === 'refund') return (tx.cancel.to === 'month' ? tx.accountId : tx.cancel.accountId) === id;
  return tx.accountId === id || tx.toAccountId === id || tx.cardId === id;
}

// 金額の符号付きの値（口座の明細の表示用）
export function rowAmountFor(row, id) {
  const tx = row.tx;
  switch (row.kind) {
    case 'adj': return row.adj.diff;
    case 'lend': return row.party.amount;
    case 'borrow': return -tx.amount;
    case 'refund': return tx.cancel.refund;
    case 'points': return tx.points;
    default:
      if (tx.type === 'income') return tx.amount;
      if (tx.type === 'expense') return -tx.amount;
      if (tx.type === 'transfer') return tx.toAccountId === id ? tx.amount : -tx.amount;
      return tx.cardId === id ? tx.amount : -tx.amount;
  }
}

// ---- 予約（8章） ----

export function salaryDate(rsv, month) {
  return shiftDate(dayInMonth(month, rsv.payDay), rsv.shift);
}

// 給与の最初の回の月
export function firstSalaryMonth(rsv, today) {
  const m = monthOf(today);
  return salaryDate(rsv, m) >= today ? m : addMonths(m, 1);
}

// 次の回。繰り返しなしは null
export function nextReservation(rsv) {
  if (rsv.type === 'salary') {
    const month = addMonths(rsv.month, 1);
    return { ...rsv, month, date: salaryDate(rsv, month) };
  }
  const r = rsv.repeat ?? { kind: 'none' };
  if (r.kind === 'days') return { ...rsv, date: addDays(rsv.date, Math.max(1, r.n)) };
  if (r.kind === 'weekly') return { ...rsv, date: addDays(rsv.date, 7) };
  if (r.kind === 'monthly') return { ...rsv, date: dayInMonth(addMonths(monthOf(rsv.date), 1), r.day) };
  return null;
}

// 繰り返しの最初の日（今日以降で一番近い日）
export function firstRepeatDate(repeat, today) {
  if (repeat.kind === 'weekly') return addDays(today, (repeat.w - weekday(today) + 7) % 7);
  if (repeat.kind === 'monthly') {
    const d = dayInMonth(monthOf(today), repeat.day);
    return d >= today ? d : dayInMonth(addMonths(monthOf(today), 1), repeat.day);
  }
  return today;
}

// 予約一覧の上部（HIST-20）: キャンセル予約 → 貸与・借入
export function pendingCancels(state) {
  return state.txs.filter((t) => t.cancel?.state === 'pending').sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function openParties(tx) {
  const list = (tx.lends ?? []).map((l) => ({ ...l, role: 'lend' }));
  if (tx.borrow) list.push({ ...tx.borrow, amount: tx.amount, role: 'borrow' });
  return list;
}

export function pendingLends(state) {
  return state.txs
    .filter((t) => openParties(t).some((p) => !p.done))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ベル（BELL-02）
export function bellItems(state, today) {
  const reservations = state.reservations.filter((r) => r.date && r.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const payments = dueCardPayments(state, today);
  const cancels = pendingCancels(state);
  return { reservations, payments, cancels, count: reservations.length + payments.length };
}
