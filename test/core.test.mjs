import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, pressKey } from '../js/calc.js';
import { isHoliday, shiftDate, todayKey, dayInMonth, holidaysOf } from '../js/dates.js';
import { Store } from '../js/store.js';
import { analyze, balances, bellItems, cardStatus, cycleOfDate, historyRows, itemPayments, orphanPlanned, payDateOf, startCycle, totalBalance, unpaidOf } from '../js/ledger.js';

const at = (s) => new Date(s).getTime();
function setup(start = '2026-11-21T12:00:00') {
  const clock = { t: at(start) };
  const st = new Store({ now: () => clock.t });
  return { st, clock };
}

test('calculator keeps precedence and rounds to yen', () => {
  assert.equal(evaluate('1200+300×2'), 1800);
  assert.equal(evaluate('1000÷3'), 333);
  assert.equal(evaluate('500−'), 500);
  assert.equal(evaluate('5÷0'), null);
  assert.equal(evaluate(''), null);
  let e = '';
  for (const k of ['0', '0', '5', '+', '×', '00', '2']) e = pressKey(e, k);
  assert.equal(e, '5×2');
  assert.equal(evaluate(e), 10);
  assert.equal(pressKey('12', '⌫'), '1');
});

test('day changes at 4am', () => {
  assert.equal(todayKey(at('2026-11-22T03:59:00')), '2026-11-21');
  assert.equal(todayKey(at('2026-11-22T04:00:00')), '2026-11-22');
});

test('japanese holidays', () => {
  const h = holidaysOf(2026);
  for (const d of ['2026-01-01', '2026-01-12', '2026-03-20', '2026-05-06', '2026-07-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23']) {
    assert.ok(h.has(d), d);
  }
  assert.ok(isHoliday('2026-11-21')); // 土曜
  assert.ok(!isHoliday('2026-11-24'));
  assert.equal(shiftDate('2026-05-03', 'next'), '2026-05-07');
  assert.equal(shiftDate('2026-05-03', 'prev'), '2026-05-01');
  assert.equal(shiftDate('2026-05-03', 'none'), '2026-05-03');
  assert.equal(dayInMonth('2026-02', 31), '2026-02-28');
});

function bank(st) {
  const cash = st.addAccount({ type: 'cash', name: '銀行', initial: 100000 });
  const save = st.addAccount({ type: 'saving', name: '貯金', initial: 50000 });
  const card = st.addAccount({ type: 'card', name: 'カード', initial: 3000, card: { closingDay: 15, payDay: 10, payMonths: 1, debitId: cash.id, shift: 'next' } });
  return { cash, save, card };
}

test('total balance subtracts unpaid of cards debited from cash', () => {
  const { st } = setup();
  const { cash, save, card } = bank(st);
  st.saveTx({ type: 'expense', amount: 2000, date: '2026-11-21', accountId: card.id });
  st.saveTx({ type: 'expense', amount: 1000, date: '2026-11-21', accountId: cash.id });
  st.saveTx({ type: 'transfer', amount: 5000, date: '2026-11-21', accountId: cash.id, toAccountId: save.id });
  const bal = balances(st.state);
  assert.equal(bal.get(cash.id), 94000);
  assert.equal(unpaidOf(bal, card.id), 5000);
  assert.equal(totalBalance(st.state), 89000);
  st.updateAccount(card.id, { card: { debitId: save.id } });
  assert.equal(totalBalance(st.state), 94000);
  st.deleteAccount(cash.id);
  assert.equal(totalBalance(st.state), 0);
});

test('card cycles: closing 15th, paid next month 10th, shifted to weekday', () => {
  const { st, clock } = setup();
  const { cash, card } = bank(st);
  const c = card.card;
  assert.equal(cycleOfDate(c, '2026-11-15'), '2026-11');
  assert.equal(cycleOfDate(c, '2026-11-16'), '2026-12');
  assert.equal(payDateOf(c, '2026-11'), '2026-12-10');
  assert.equal(payDateOf(c, '2026-12'), '2027-01-12'); // 1/10 は日曜、1/11 は成人の日
  assert.equal(startCycle(c), '2026-11');
  st.saveTx({ type: 'expense', amount: 2000, date: '2026-11-22', accountId: card.id });
  let s = cardStatus(st.state, card, '2026-11-21');
  assert.deepEqual([s.cycle, s.amount, s.unpaid, s.due], ['2026-11', 3000, 5000, false]);
  s = cardStatus(st.state, card, '2026-12-10');
  assert.equal(s.due, true);
  assert.equal(bellItems(st.state, '2026-12-10').count, 1);
  clock.t = at('2026-12-10T09:00:00');
  st.payCard(card.id, s.cycle, 2800, s.payDate);
  const bal = balances(st.state);
  assert.equal(bal.get(cash.id), 97200);
  assert.equal(unpaidOf(bal, card.id), 2200);
  s = cardStatus(st.state, card, '2026-12-10');
  assert.deepEqual([s.cycle, s.amount, s.due], ['2026-12', 2200, false]);
});

test('zero-amount cycles are skipped', () => {
  const { st } = setup();
  const { card } = bank(st);
  st.adjustBalance(card.id, 3000, false);
  const s = cardStatus(st.state, card, '2027-03-01');
  assert.equal(s.due, false);
  assert.equal(s.amount, 0);
});

test('cancel: pending keeps unpaid; month refund lowers that cycle; analysis lowers original month', () => {
  const { st, clock } = setup();
  const { cash, card } = bank(st);
  const tx = st.saveTx({ type: 'expense', amount: 4000, date: '2026-11-20', accountId: card.id, catId: 'c1' });
  st.requestCancel(tx.id);
  assert.equal(unpaidOf(balances(st.state), card.id), 7000);
  clock.t = at('2026-12-02T12:00:00');
  st.confirmCancel(tx.id, { refund: 1500, to: 'month', cycle: '2026-11' });
  assert.equal(unpaidOf(balances(st.state), card.id), 5500);
  assert.equal(cardStatus(st.state, card, '2026-12-02').amount, 1500); // 11月の回 = 登録時の 3000 − 返金 1500（4000 の利用は12月の回）
  assert.equal(analyze(st.state, '2026-11').expense, 2500);
  const rows = historyRows(st.state);
  assert.equal(rows[0].kind, 'refund');
  assert.equal(rows[0].date, '2026-12-02');
  const tx2 = st.saveTx({ type: 'expense', amount: 1000, date: '2026-12-02', accountId: card.id });
  st.requestCancel(tx2.id);
  st.confirmCancel(tx2.id, { refund: 1000, to: 'account', accountId: cash.id });
  assert.equal(balances(st.state).get(cash.id), 101000);
  const tx3 = st.saveTx({ type: 'expense', amount: 500, date: '2026-12-02', accountId: card.id });
  st.requestCancel(tx3.id);
  st.withdrawCancel(tx3.id);
  assert.equal(st.get('txs', tx3.id).cancel, null);
});

test('lends and borrows', () => {
  const { st, clock } = setup();
  const { cash } = bank(st);
  const tx = st.saveTx({ type: 'expense', amount: 9000, date: '2026-11-21', accountId: cash.id, lends: [{ name: '山田', amount: 3000 }, { name: '田中', amount: 3000 }] });
  clock.t = at('2026-12-05T12:00:00');
  st.settleParty(tx.id, st.get('txs', tx.id).lends[0].id, cash.id);
  assert.equal(balances(st.state).get(cash.id), 94000);
  assert.equal(analyze(st.state, '2026-11').expense, 6000);
  assert.equal(analyze(st.state, '2026-12').income, 0);
  const b = st.saveTx({ type: 'expense', amount: 1200, date: '2026-12-05', accountId: null, borrowName: '佐藤' });
  assert.equal(analyze(st.state, '2026-12').expense, 1200);
  st.settleParty(b.id, 'borrow', cash.id);
  assert.equal(balances(st.state).get(cash.id), 92800);
  assert.equal(analyze(st.state, '2026-12').expense, 1200);
  const inc = st.saveTx({ type: 'income', amount: 5000, date: '2026-12-05', accountId: cash.id, borrowName: '鈴木' });
  st.settleParty(inc.id, 'borrow', cash.id);
  const a = analyze(st.state, '2026-12');
  assert.equal(a.income, 5000);
  assert.equal(a.expense, 6200);
  st.saveTx({ ...st.get('txs', tx.id), lends: st.get('txs', tx.id).lends });
  assert.equal(st.get('txs', tx.id).lends[0].done, true);
});

test('history puts untimed records first within a day', () => {
  const { st } = setup();
  const { cash } = bank(st);
  st.saveTx({ type: 'expense', amount: 1, date: '2026-11-21', time: '08:00', accountId: cash.id });
  st.saveTx({ type: 'expense', amount: 2, date: '2026-11-21', time: null, accountId: cash.id });
  st.saveTx({ type: 'expense', amount: 3, date: '2026-11-21', time: '20:00', accountId: cash.id });
  st.saveTx({ type: 'expense', amount: 4, date: '2026-11-22', time: '01:00', accountId: cash.id });
  assert.deepEqual(historyRows(st.state).map((r) => r.tx.amount), [4, 2, 3, 1]);
});

test('reservations repeat and salary shifts', () => {
  const { st } = setup();
  const { cash } = bank(st);
  const r = st.saveReservation({ type: 'expense', accountId: cash.id, date: '2026-01-31', repeat: { kind: 'monthly', day: 31 }, amount: '' });
  assert.equal(r.amount, null);
  st.advanceReservation(r.id);
  assert.equal(st.get('reservations', r.id).date, '2026-02-28');
  const s = st.saveReservation({ type: 'salary', company: 'A社', accountId: cash.id, payDay: 25, shift: 'prev' });
  assert.equal(s.date, '2026-11-25');
  st.advanceReservation(s.id);
  assert.equal(st.get('reservations', s.id).date, '2026-12-25');
  st.advanceReservation(s.id);
  assert.equal(st.get('reservations', s.id).date, '2027-01-25');
  const once = st.saveReservation({ type: 'income', accountId: cash.id, date: '2026-11-30', repeat: { kind: 'none' } });
  st.advanceReservation(once.id);
  assert.equal(st.get('reservations', once.id), null);
  const sat = st.saveReservation({ type: 'salary', company: 'B', accountId: cash.id, payDay: 'end', shift: 'prev' });
  assert.equal(sat.date, '2026-11-30');
});

test('backup round trip', () => {
  const { st } = setup();
  bank(st);
  const json = JSON.stringify(st.exportData());
  const { st: st2 } = setup();
  st2.importOverwrite(st2.parseBackup(json));
  assert.equal(st2.state.accounts.length, 3);
  assert.throws(() => st2.parseBackup(JSON.stringify({ app: 'X', data: {} })), /invalid/);
  assert.throws(() => st2.parseBackup(JSON.stringify({ app: 'CoinFlow', schemaVersion: 9, data: {} })), /newer/);
});

test('name is optional and kept for expense and income only', () => {
  const { st } = setup();
  const { cash, save } = bank(st);
  const a = st.saveTx({ type: 'expense', amount: 500, date: '2026-11-22', accountId: cash.id, name: ' ランチ ' });
  assert.equal(a.name, 'ランチ');
  assert.equal(st.saveTx({ type: 'income', amount: 500, date: '2026-11-22', accountId: cash.id, name: 'お祝い' }).name, 'お祝い');
  assert.equal(st.saveTx({ type: 'income', amount: 500, date: '2026-11-22', accountId: cash.id }).name, '');
  assert.equal(st.saveTx({ type: 'transfer', amount: 500, date: '2026-11-22', accountId: cash.id, toAccountId: save.id, name: 'x' }).name, '');
  // 編集で名前を消せる
  assert.equal(st.saveTx({ ...a, name: '' }).name, '');
});

test('shop is kept for expense and income only', () => {
  const { st } = setup();
  const { cash, save } = bank(st);
  const a = st.saveTx({ type: 'expense', amount: 500, date: '2026-11-22', accountId: cash.id, shop: ' セブン ' });
  assert.equal(a.shop, 'セブン');
  const b = st.saveTx({ type: 'transfer', amount: 500, date: '2026-11-22', accountId: cash.id, toAccountId: save.id, shop: 'x' });
  assert.equal(b.shop, '');
  const c = st.saveTx({ type: 'income', amount: 500, date: '2026-11-22', accountId: cash.id, borrowName: '鈴木', shop: '' });
  assert.equal(c.borrow.name, '鈴木');
});

test('points: expense counts in full, points count as income, account pays the difference', () => {
  const { st } = setup();
  const bank = st.addAccount({ type: 'cash', name: 'B', initial: 10000 });
  const card = st.addAccount({ type: 'card', name: 'C', initial: 0, card: { closingDay: 15, payDay: 10, payMonths: 1, debitId: bank.id, shift: 'none' } });
  st.saveTx({ type: 'expense', amount: 1000, points: 200, date: '2026-11-21', accountId: bank.id, catId: 'x' });
  st.saveTx({ type: 'expense', amount: 500, points: 900, date: '2026-11-21', accountId: card.id, catId: 'x' });
  const bal = balances(st.state);
  assert.equal(bal.get(bank.id), 9200);
  assert.equal(unpaidOf(bal, card.id) + 0, 0); // ポイントは金額までしか使えない
  const a = analyze(st.state, '2026-11');
  assert.equal(a.expense, 1500);
  assert.equal(a.income, 700);
  assert.equal(a.incCats.get('__points'), 700);
  assert.equal(historyRows(st.state).filter((r) => r.kind === 'points').length, 2);
  // 収入にはポイントをつけない
  assert.equal(st.saveTx({ type: 'income', amount: 100, points: 50, date: '2026-11-21', accountId: bank.id }).points, 0);
});

test('account type can switch between cash and saving; card paid from another account', () => {
  const { st } = setup();
  const bank = st.addAccount({ type: 'cash', name: 'B', initial: 1000 });
  const sav = st.addAccount({ type: 'saving', name: 'S', initial: 5000 });
  assert.equal(totalBalance(st.state), 1000);
  st.updateAccount(sav.id, { type: 'cash' });
  assert.equal(totalBalance(st.state), 6000);
  const card = st.addAccount({ type: 'card', name: 'C', initial: 300, card: { closingDay: 15, payDay: 10, payMonths: 1, debitId: bank.id, shift: 'none' } });
  const tx = st.payCard(card.id, '2026-12', 300, '2027-01-10', sav.id);
  assert.equal(tx.accountId, sav.id);
  assert.equal(balances(st.state).get(sav.id), 4700);
});

test('irregular items: payments apply on their date', () => {
  const { st, clock } = setup();
  const { cash, save, card } = bank(st);
  const r = st.saveReservation({ type: 'expense', name: ' 電気代 ', accountId: cash.id, catId: 'c1', date: '2026-11-21', amount: 100, repeat: { kind: 'irregular' } });
  assert.deepEqual([r.name, r.date, r.amount], ['電気代', null, null]);
  assert.equal(bellItems(st.live, '2030-01-01').reservations.length, 0);
  const tx = st.saveTx({ type: 'expense', name: r.name, amount: 5000, date: '2026-12-10', accountId: save.id, catId: 'c1', itemId: r.id });
  st.setItemAccount(r.id, save.id);
  assert.equal(st.get('reservations', r.id).accountId, save.id);
  st.saveTx({ type: 'expense', amount: 700, date: '2026-12-10', accountId: card.id, itemId: r.id });
  // 支払日の前
  clock.t = at('2026-12-10T03:59:00');
  assert.equal(balances(st.live).get(save.id), 50000);
  assert.equal(unpaidOf(balances(st.live), card.id), 3000);
  assert.equal(historyRows(st.live).length, 0);
  assert.equal(analyze(st.live, '2026-12').expense, 0);
  assert.equal(itemPayments(st.state, r.id, st.today()).planned.length, 2);
  // 支払日の当日（午前4時）から
  clock.t = at('2026-12-10T04:00:00');
  assert.equal(balances(st.live).get(save.id), 45000);
  assert.equal(unpaidOf(balances(st.live), card.id), 3700);
  assert.equal(historyRows(st.live).length, 2);
  assert.equal(analyze(st.live, '2026-12').expense, 5700);
  assert.equal(itemPayments(st.state, r.id, st.today()).paid.length, 2);
  // 編集しても項目とのつながりは残る
  assert.equal(st.saveTx({ ...tx, itemId: undefined, date: '2026-12-20' }).itemId, r.id);
  assert.equal(historyRows(st.live).length, 1);
  // 項目を削除しても支払いは残り、支払日に反映される
  st.deleteReservation(r.id);
  assert.deepEqual(orphanPlanned(st.state, st.today()).map((x) => x.id), [tx.id]);
  clock.t = at('2026-12-20T12:00:00');
  assert.equal(orphanPlanned(st.state, st.today()).length, 0);
  assert.equal(historyRows(st.live).length, 2);
  // ふつうの記録は、先の日付でもすぐ反映する
  st.saveTx({ type: 'expense', amount: 1, date: '2027-01-01', accountId: cash.id });
  assert.equal(historyRows(st.live).length, 3);
});

test('monthly on the last day', () => {
  const { st } = setup();
  const { cash } = bank(st);
  const r = st.saveReservation({ type: 'expense', accountId: cash.id, repeat: { kind: 'monthly', day: 'end' } });
  assert.equal(r.date, '2026-11-30');
  st.advanceReservation(r.id);
  assert.equal(st.get('reservations', r.id).date, '2026-12-31');
});
