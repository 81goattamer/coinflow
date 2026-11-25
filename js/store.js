// データの層。メモリ上の state を変え、変わった行だけ保存先に書く。DOM に依存しないので Node でもテストできる
import { isDateKey, nowTime, todayKey } from './dates.js';
import { firstRepeatDate, firstSalaryMonth, nextReservation, salaryDate } from './ledger.js';

export const APP_NAME = 'CoinFlow';
export const SCHEMA_VERSION = 1;
export const TABLES = ['accounts', 'txs', 'adjustments', 'reservations', 'categories'];
export const SETTINGS_ID = 'app';

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultSettings() {
  return { id: SETTINGS_ID, language: 'auto', theme: 'auto', installHintClosed: false };
}

// 初期のカテゴリ（SET-05）。名前は日本語と英語を持ち、作るときの言語で決める
const DEFAULT_CATS = {
  expense: [
    ['食費|Food', ['食料品|Groceries', '外食|Dining out', 'カフェ|Cafe'], '🍽️'],
    ['日用品|Daily goods', [], '🧴'],
    ['交通|Transport', ['電車|Train', 'バス|Bus', 'タクシー|Taxi'], '🚃'],
    ['住まい|Housing', ['家賃|Rent', '光熱費|Utilities', '通信|Phone & internet'], '🏠'],
    ['趣味・娯楽|Hobbies', [], '🎵'],
    ['交際費|Social', [], '🍻'],
    ['衣服・美容|Clothing & beauty', [], '👕'],
    ['医療|Medical', [], '🏥'],
    ['教育|Education', [], '📚'],
    ['その他|Other', [], '📦'],
  ],
  income: [
    ['給与|Salary', [], '💼'],
    ['副業|Side job', [], '💻'],
    ['臨時収入|Extra income', [], '🎁'],
    ['その他|Other', [], '📦'],
  ],
};
// 初めからあるカテゴリのアイコン（名前から引く。アイコンを持たない古いデータにも使う）
const DEFAULT_ICONS = Object.fromEntries(Object.values(DEFAULT_CATS).flat().flatMap(([name, , ic]) => name.split('|').map((n) => [n, ic])));
export const CAT_ICON_DEFAULT = '🏷️';
export function catIcon(cat) {
  return cat?.icon || DEFAULT_ICONS[cat?.name] || CAT_ICON_DEFAULT;
}
export const SALARY_NAMES = ['給与', 'Salary'];

export function defaultCategories(lang = 'ja') {
  const pick = (s) => s.split('|')[lang === 'en' ? 1 : 0];
  const out = [];
  for (const kind of ['expense', 'income']) {
    DEFAULT_CATS[kind].forEach(([name, subs, ic], i) => {
      out.push({ id: uid(), kind, name: pick(name), icon: ic, subs: subs.map((s) => ({ id: uid(), name: pick(s) })), order: i });
    });
  }
  return out;
}

export function memoryRepo() {
  return { tables: {}, write() {}, onError: null };
}

const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const pos = (v) => Math.max(0, int(v));
const str = (v) => (typeof v === 'string' ? v : '');
const strOrNull = (v) => (typeof v === 'string' && v ? v : null);
const timeOrNull = (v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);

export class Store {
  constructor({ repo = memoryRepo(), now = () => Date.now(), lang = 'ja' } = {}) {
    this.repo = repo;
    this.now = now;
    this.listeners = new Set();
    const t = repo.tables ?? {};
    this.state = Object.fromEntries(TABLES.map((n) => [n, [...(t[n] ?? [])]]));
    this.state.settings = { ...defaultSettings(), ...(t.settings?.[0] ?? {}) };
    // 初めて開いたときは初期のカテゴリを入れる
    if (!t.settings?.length && !this.state.categories.length) {
      for (const c of defaultCategories(lang)) this.put('categories', c);
      this.write([{ table: 'settings', type: 'put', row: this.state.settings }]);
    }
  }

  // ---- 基本 ----

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  write(ops) {
    try {
      this.repo.write(ops);
    } catch (e) {
      this.repo.onError?.(e);
    }
  }

  iso() {
    return new Date(this.now()).toISOString();
  }

  today() {
    return todayKey(this.now());
  }

  get(table, id) {
    return this.state[table].find((x) => x.id === id) ?? null;
  }

  put(table, row) {
    const list = this.state[table];
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
    this.write([{ table, type: 'put', row }]);
    return row;
  }

  del(table, id) {
    this.state[table] = this.state[table].filter((x) => x.id !== id);
    this.write([{ table, type: 'delete', id }]);
  }

  done(v) {
    this.emit();
    return v;
  }

  setSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.write([{ table: 'settings', type: 'put', row: this.state.settings }]);
    return this.done();
  }

  // ---- 口座（ACC） ----

  addAccount({ type, name, memo = '', icon, initial = 0, card = null }) {
    const order = Math.max(-1, ...this.state.accounts.map((a) => a.order)) + 1;
    const row = {
      id: uid(),
      type,
      name: str(name).trim(),
      memo: str(memo).trim(),
      icon: icon ?? { kind: 'emoji', value: type === 'card' ? '💳' : type === 'saving' ? '🐷' : '👛' },
      initial: type === 'card' ? pos(initial) : int(initial),
      order,
      deleted: false,
      card: type === 'card' ? { ...card, startDate: card?.startDate ?? this.today() } : null,
      createdAt: this.iso(),
      updatedAt: this.iso(),
    };
    return this.done(this.put('accounts', row));
  }

  updateAccount(id, patch) {
    const a = this.get('accounts', id);
    if (!a) return null;
    const row = { ...a, ...patch, updatedAt: this.iso() };
    if (patch.name != null) row.name = str(patch.name).trim();
    if (patch.memo != null) row.memo = str(patch.memo).trim();
    if (a.type === 'card' && patch.card) row.card = { ...a.card, ...patch.card };
    return this.done(this.put('accounts', row));
  }

  // 今の残高を入れて差をバイアス値として残す（ACC-22）。diff は残高の増減
  adjustBalance(accountId, diff, show) {
    if (!diff) return null;
    return this.done(this.put('adjustments', {
      id: uid(), accountId, diff: int(diff), date: this.today(), time: nowTime(this.now()), show: !!show, createdAt: this.iso(),
    }));
  }

  deleteAccount(id) {
    return this.updateAccount(id, { deleted: true });
  }

  restoreAccount(id) {
    return this.updateAccount(id, { deleted: false });
  }

  // 同じ種類の中で1つ上（-1）か下（+1）と入れ替える
  moveAccount(id, dir) {
    const a = this.get('accounts', id);
    const same = this.state.accounts.filter((x) => x.type === a.type && !x.deleted).sort((x, y) => x.order - y.order);
    const i = same.findIndex((x) => x.id === id);
    const b = same[i + dir];
    if (!b) return;
    const [oa, ob] = [a.order, b.order];
    this.put('accounts', { ...a, order: ob });
    this.put('accounts', { ...b, order: oa });
    this.done();
  }

  // ---- 取引 ----

  // 新しく作るときは id なし。編集では元の状態（完了・キャンセル）を引き継ぐ
  saveTx(input) {
    const old = input.id ? this.get('txs', input.id) : null;
    const type = input.type;
    const tx = {
      id: old?.id ?? uid(),
      type,
      amount: pos(input.amount),
      date: isDateKey(input.date) ? input.date : this.today(),
      time: timeOrNull(input.time),
      accountId: strOrNull(input.accountId),
      toAccountId: type === 'transfer' ? strOrNull(input.toAccountId) : null,
      cardId: strOrNull(input.cardId ?? old?.cardId),
      cycle: strOrNull(input.cycle ?? old?.cycle),
      catId: type === 'expense' || type === 'income' ? strOrNull(input.catId) : null,
      subId: type === 'expense' || type === 'income' ? strOrNull(input.subId) : null,
      // 任意の名前（支出・収入だけ）
      name: type === 'expense' || type === 'income' ? str(input.name).trim() : '',
      shop: type === 'expense' || type === 'income' ? str(input.shop).trim() : '',
      // ポイント利用（支出だけ）。金額を超えない
      points: type === 'expense' ? Math.min(pos(input.points ?? 0) || 0, pos(input.amount)) : 0,
      borrow: null,
      lends: [],
      cancel: old?.cancel ?? null,
      reservationId: input.reservationId ?? old?.reservationId ?? null,
      createdAt: old?.createdAt ?? this.iso(),
      updatedAt: this.iso(),
    };
    if (input.borrowName && (type === 'income' || (type === 'expense' && !tx.accountId))) {
      const ob = old?.borrow;
      tx.borrow = { id: ob?.id ?? uid(), name: str(input.borrowName).trim(), done: ob?.done ?? false, accountId: ob?.accountId ?? null, doneDate: ob?.doneDate ?? null, doneTime: ob?.doneTime ?? null };
    }
    if (type === 'expense') {
      tx.lends = (input.lends ?? []).filter((l) => str(l.name).trim() && pos(l.amount) > 0).map((l) => {
        const ol = old?.lends?.find((x) => x.id === l.id);
        return { id: l.id ?? uid(), name: str(l.name).trim(), amount: pos(l.amount), done: ol?.done ?? false, accountId: ol?.accountId ?? null, doneDate: ol?.doneDate ?? null, doneTime: ol?.doneTime ?? null };
      });
    }
    return this.done(this.put('txs', tx));
  }

  deleteTx(id) {
    this.del('txs', id);
    return this.done();
  }

  // 貸与・借入の1人分を完了する（LEND-04）。partyId が 'borrow' のときは借入
  settleParty(txId, partyId, accountId) {
    const tx = this.get('txs', txId);
    if (!tx) return;
    const stamp = { done: true, accountId, doneDate: this.today(), doneTime: nowTime(this.now()) };
    const next = { ...tx, updatedAt: this.iso() };
    if (partyId === 'borrow') next.borrow = { ...tx.borrow, ...stamp };
    else next.lends = tx.lends.map((l) => (l.id === partyId ? { ...l, ...stamp } : l));
    this.put('txs', next);
    this.done();
  }

  unsettleParty(txId, partyId) {
    const tx = this.get('txs', txId);
    if (!tx) return;
    const clear = { done: false, accountId: null, doneDate: null, doneTime: null };
    const next = { ...tx, updatedAt: this.iso() };
    if (partyId === 'borrow') next.borrow = { ...tx.borrow, ...clear };
    else next.lends = tx.lends.map((l) => (l.id === partyId ? { ...l, ...clear } : l));
    this.put('txs', next);
    this.done();
  }

  // ---- キャンセル（CXL） ----

  requestCancel(id) {
    const tx = this.get('txs', id);
    if (!tx) return;
    this.put('txs', { ...tx, cancel: { state: 'pending', refund: 0, to: null, cycle: null, accountId: null, doneDate: null, doneTime: null }, updatedAt: this.iso() });
    this.done();
  }

  withdrawCancel(id) {
    const tx = this.get('txs', id);
    if (!tx) return;
    this.put('txs', { ...tx, cancel: null, updatedAt: this.iso() });
    this.done();
  }

  confirmCancel(id, { refund, to, cycle = null, accountId = null }) {
    const tx = this.get('txs', id);
    if (!tx) return;
    const amount = Math.min(tx.amount, Math.max(1, pos(refund)));
    this.put('txs', {
      ...tx,
      cancel: { state: 'done', refund: amount, to, cycle: to === 'month' ? cycle : null, accountId: to === 'account' ? accountId : null, doneDate: this.today(), doneTime: nowTime(this.now()) },
      updatedAt: this.iso(),
    });
    this.done();
  }

  // ---- カードの支払い（CARD-03） ----

  payCard(cardId, cycle, amount, date, accountId = null) {
    const card = this.get('accounts', cardId);
    if (!card) return null;
    return this.saveTx({ type: 'cardpay', amount, date, time: null, accountId: accountId ?? card.card.debitId, cardId, cycle });
  }

  // ---- 予約（RSV） ----

  saveReservation(input) {
    const old = input.id ? this.get('reservations', input.id) : null;
    const today = this.today();
    const row = {
      id: old?.id ?? uid(),
      type: input.type,
      accountId: strOrNull(input.accountId),
      catId: strOrNull(input.catId),
      subId: strOrNull(input.subId),
      amount: input.type === 'salary' || input.amount == null || input.amount === '' ? null : pos(input.amount),
      repeat: input.type === 'salary' ? { kind: 'monthly' } : (input.repeat ?? { kind: 'none' }),
      company: input.type === 'salary' ? str(input.company).trim() : '',
      payDay: input.type === 'salary' ? input.payDay : null,
      shift: input.type === 'salary' ? input.shift : null,
      month: null,
      date: isDateKey(input.date) ? input.date : today,
      createdAt: old?.createdAt ?? this.iso(),
      updatedAt: this.iso(),
    };
    if (row.type === 'salary') {
      row.catId = this.salaryCategory().id;
      row.subId = null;
      row.month = old && old.payDay === row.payDay && old.shift === row.shift ? old.month : firstSalaryMonth(row, today);
      row.date = salaryDate(row, row.month);
    } else if (!isDateKey(input.date)) {
      row.date = firstRepeatDate(row.repeat, today);
    }
    return this.done(this.put('reservations', row));
  }

  deleteReservation(id) {
    this.del('reservations', id);
    return this.done();
  }

  // 登録・スキップしたら次の回へ（HIST-24）
  advanceReservation(id) {
    const r = this.get('reservations', id);
    if (!r) return;
    const next = nextReservation(r);
    if (next) this.put('reservations', { ...next, updatedAt: this.iso() });
    else this.del('reservations', id);
    this.done();
  }

  // ---- カテゴリ（SET-01） ----

  isSalaryCategory(id) {
    const c = this.get('categories', id);
    return !!c && c.kind === 'income' && SALARY_NAMES.includes(c.name);
  }

  salaryCategory() {
    const found = this.state.categories.find((c) => c.kind === 'income' && SALARY_NAMES.includes(c.name));
    if (found) return found;
    return this.put('categories', { id: uid(), kind: 'income', name: SALARY_NAMES[0], icon: '💼', subs: [], order: -1 });
  }

  addCategory(kind, name) {
    const order = Math.max(-1, ...this.state.categories.filter((c) => c.kind === kind).map((c) => c.order)) + 1;
    return this.done(this.put('categories', { id: uid(), kind, name: str(name).trim(), icon: CAT_ICON_DEFAULT, subs: [], order }));
  }

  setCategoryIcon(id, value) {
    const c = this.get('categories', id);
    if (c) this.put('categories', { ...c, icon: value });
    this.done();
  }

  renameCategory(id, name) {
    const c = this.get('categories', id);
    if (c) this.put('categories', { ...c, name: str(name).trim() });
    this.done();
  }

  deleteCategory(id) {
    this.del('categories', id);
    this.done();
  }

  addSub(catId, name) {
    const c = this.get('categories', catId);
    if (c) this.put('categories', { ...c, subs: [...c.subs, { id: uid(), name: str(name).trim() }] });
    this.done();
  }

  renameSub(catId, subId, name) {
    const c = this.get('categories', catId);
    if (c) this.put('categories', { ...c, subs: c.subs.map((s) => (s.id === subId ? { ...s, name: str(name).trim() } : s)) });
    this.done();
  }

  deleteSub(catId, subId) {
    const c = this.get('categories', catId);
    if (c) this.put('categories', { ...c, subs: c.subs.filter((s) => s.id !== subId) });
    this.done();
  }

  // ---- バックアップ（COMMON-20〜） ----

  exportData() {
    const data = Object.fromEntries(TABLES.map((n) => [n, this.state[n]]));
    data.settings = this.state.settings;
    return { app: APP_NAME, schemaVersion: SCHEMA_VERSION, exportedAt: this.iso(), data };
  }

  parseBackup(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('invalid');
    }
    if (raw?.app !== APP_NAME || !raw.data || typeof raw.data !== 'object') throw new Error('invalid');
    if (!(raw.schemaVersion <= SCHEMA_VERSION)) throw new Error('newer');
    const out = {};
    for (const n of TABLES) {
      out[n] = (Array.isArray(raw.data[n]) ? raw.data[n] : []).filter((x) => x && typeof x.id === 'string');
    }
    out.settings = raw.data.settings && typeof raw.data.settings === 'object' ? raw.data.settings : null;
    return out;
  }

  importOverwrite(data) {
    const ops = [];
    for (const n of TABLES) {
      this.state[n] = [...data[n]];
      ops.push({ table: n, type: 'clear' }, ...data[n].map((row) => ({ table: n, type: 'put', row })));
    }
    if (data.settings) {
      this.state.settings = { ...defaultSettings(), ...data.settings, id: SETTINGS_ID };
      ops.push({ table: 'settings', type: 'put', row: this.state.settings });
    }
    this.write(ops);
    this.done();
  }

  importMerge(data) {
    for (const n of TABLES) for (const row of data[n]) this.put(n, row);
    this.done();
  }
}
