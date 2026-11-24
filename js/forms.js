// 記録（REC）・予約（RSV）の入力フォームと、口座・カテゴリの選択部品
import { store } from './app-store.js';
import { nowTime, weekday } from './dates.js';
import { fmtDay, t, weekName, yen } from './i18n.js';
import { amountInput } from './keypad.js';
import { activeAccounts } from './ledger.js';
import { catIcon } from './store.js';
import { field, h, icon, seg, setChildren, switchInput, toast } from './ui.js';

export const BORROW = '__borrow';

// ---- 表示の部品 ----

export function accIcon(account, size = 28) {
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.62)}px` };
  if (!account) return h('span', { class: 'acc-icon', style }, '？');
  if (account.icon?.kind === 'image') return h('span', { class: 'acc-icon', style }, h('img', { src: account.icon.value, alt: '' }));
  return h('span', { class: 'acc-icon', style }, account.icon?.value ?? '👛');
}

export function accName(id) {
  const a = store.get('accounts', id);
  if (!a) return '—';
  return a.deleted ? `${a.name}${t('common.deletedAccount')}` : a.name;
}

export function catLabel(catId, subId) {
  if (catId === '__repay') return t('cat.repay');
  const c = store.get('categories', catId);
  if (!c) return t('common.uncategorized');
  if (!subId) return c.name;
  const s = c.subs.find((x) => x.id === subId);
  return `${c.name} › ${s ? s.name : t('common.uncategorized')}`;
}

export const TYPE_ICON = { cash: 'wallet', card: 'card', saving: 'piggy' };
export const KIND_ICON = { expense: 'out', income: 'in', transfer: 'transfer', salary: 'briefcase', cancel: 'xcircle', lend: 'handout', borrow: 'handin', cardpay: 'card', adj: 'scale', refund: 'undo' };

// 口座を選ぶチップ。extra は口座の後ろに足す選択肢 [{id, label, icon}]
export function accountPicker({ types, value, onChange, extra = [], exclude = null }) {
  const list = activeAccounts(store.state, types).filter((a) => a.id !== exclude);
  const cur = store.get('accounts', value);
  if (cur && !list.includes(cur) && cur.id !== exclude) list.push(cur);
  if (!list.length && !extra.length) return h('p', { class: 'muted small' }, t('rec.noAccount'));
  return h('div', { class: 'chips' },
    list.map((a) => h('button', {
      type: 'button',
      class: `chip ${a.id === value ? 'on' : ''}`,
      'aria-pressed': a.id === value ? 'true' : 'false',
      onClick: () => onChange(a.id),
    }, accIcon(a, 22), h('span', { class: 'ellipsis' }, a.name))),
    extra.map((x) => h('button', {
      type: 'button',
      class: `chip ${x.id === value ? 'on' : ''}`,
      'aria-pressed': x.id === value ? 'true' : 'false',
      onClick: () => onChange(x.id),
    }, h('span', { class: 'acc-icon chip-sym', style: { width: '22px', height: '22px' } }, icon(x.icon, { size: 16 })), x.label)));
}

// カテゴリ → サブカテゴリ（REC-11）
export function categoryPicker({ kind, catId, subId, onChange }) {
  const root = h('div', { class: 'cat-picker' });
  const draw = () => {
    const cats = store.state.categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
    const cur = cats.find((c) => c.id === catId);
    setChildren(root,
      h('div', { class: 'chips' }, cats.map((c) => h('button', {
        type: 'button',
        class: `chip ${c.id === catId ? 'on' : ''}`,
        'aria-pressed': c.id === catId ? 'true' : 'false',
        onClick: () => {
          if (catId !== c.id) {
            catId = c.id;
            subId = null;
            onChange(catId, subId);
            draw();
          }
        },
      }, c.name))),
      cur?.subs.length ? h('div', { class: 'chips subs' }, cur.subs.map((s) => h('button', {
        type: 'button',
        class: `chip small ${s.id === subId ? 'on' : ''}`,
        'aria-pressed': s.id === subId ? 'true' : 'false',
        onClick: () => {
          subId = s.id;
          onChange(catId, subId);
          draw();
        },
      }, s.name))) : null);
  };
  draw();
  return root;
}

// カテゴリが選べているか（サブカテゴリがあるカテゴリはサブカテゴリまで）
function categoryOk(catId, subId) {
  const c = store.get('categories', catId);
  if (!c) return false;
  return !c.subs.length || c.subs.some((s) => s.id === subId);
}

export function dateTimeFields(st, onChange) {
  const date = h('input', { class: 'input', type: 'date', value: st.date, required: true, 'aria-label': t('common.date'), onChange: (e) => { if (e.target.value) st.date = e.target.value; else e.target.value = st.date; onChange(); } });
  const time = h('input', { class: 'input time', type: 'time', value: st.time ?? '', disabled: !st.withTime, 'aria-label': t('common.time'), onChange: (e) => { st.time = e.target.value || null; } });
  return h('div', { class: 'datetime' },
    date,
    h('label', { class: 'time-toggle' },
      icon('history', { size: 18 }),
      switchInput(st.withTime, (v) => {
        st.withTime = v;
        time.disabled = !v;
        if (v && !st.time) {
          st.time = nowTime();
          time.value = st.time;
        }
      }, t('field.withTime'))),
    time);
}

// ---- 記録のフォーム ----

export function newTxDraft(type = 'expense') {
  return { type, amount: null, accountId: null, toAccountId: null, borrowName: '', borrowOn: false, shop: '', catId: null, subId: null, date: store.today(), withTime: true, time: nowTime(), lends: [], id: null, reservationId: null };
}

export function draftFromTx(tx) {
  return {
    type: tx.type,
    id: tx.id,
    amount: tx.amount,
    accountId: tx.type === 'expense' && !tx.accountId ? BORROW : tx.accountId,
    toAccountId: tx.toAccountId,
    borrowName: tx.type === 'expense' ? (tx.borrow?.name ?? '') : '',
    borrowOn: tx.type === 'income' && !!tx.borrow,
    // 収入の借入では、お店の欄に借りた人を入れる
    shop: tx.type === 'income' && tx.borrow ? tx.borrow.name : (tx.shop ?? ''),
    catId: tx.catId,
    subId: tx.subId,
    date: tx.date,
    withTime: !!tx.time,
    time: tx.time,
    lends: (tx.lends ?? []).map((l) => ({ id: l.id, name: l.name, amount: l.amount, done: l.done })),
    reservationId: tx.reservationId,
    cardId: tx.cardId,
    cycle: tx.cycle,
  };
}

// ---- 予約のフォーム ----

export function newRsvDraft(type = 'expense') {
  return { id: null, type, date: store.today(), accountId: null, catId: null, subId: null, amount: null, repeat: { kind: 'none', n: 7 }, company: '', payDay: 25, shift: 'prev' };
}

export function draftFromRsv(r) {
  return { ...r, repeat: { n: 7, ...r.repeat } };
}

export function repeatLabel(r) {
  const rep = r.repeat ?? { kind: 'none' };
  if (r.type === 'salary') return r.payDay === 'end' ? t('day.everyEnd') : t('day.everyN', { n: r.payDay });
  if (rep.kind === 'days') return t('repeat.everyDays', { n: rep.n });
  if (rep.kind === 'weekly') return t('repeat.everyWeek', { w: weekName(rep.w) });
  if (rep.kind === 'monthly') return t('repeat.everyMonth', { d: rep.day });
  return '';
}

// onCategory を渡すと（記録タブの予約）、種類の切り替えを出さず、カテゴリは一覧で選んだものを表示する
export function rsvForm(st, { onDone, editing = false, onCategory = null }) {
  const root = h('div', { class: 'form rsv-form' });
  let saveBtn;
  const valid = () => {
    if (!st.accountId) return false;
    if (st.type === 'salary') return !!st.company.trim();
    if (st.repeat.kind === 'days' && !(st.repeat.n >= 1)) return false;
    return categoryOk(st.catId, st.subId);
  };
  const check = () => { if (saveBtn) saveBtn.disabled = !valid(); };
  const save = () => {
    if (!valid()) return;
    const rep = { kind: st.repeat.kind };
    if (rep.kind === 'days') rep.n = Math.max(1, Math.round(st.repeat.n));
    if (rep.kind === 'weekly') rep.w = weekday(st.date);
    if (rep.kind === 'monthly') rep.day = Number(st.date.slice(8));
    const r = store.saveReservation({ ...st, repeat: rep });
    onDone?.(r);
  };
  const draw = () => {
    const parts = [];
    if (!onCategory) parts.push(seg([['expense', t('kind.expense')], ['income', t('kind.income')], ['salary', t('kind.salary')]], st.type, (v) => {
      if (v === st.type) return;
      st.type = v;
      st.catId = null;
      st.subId = null;
      const acc = store.get('accounts', st.accountId);
      if (v !== 'expense' && acc?.type === 'card') st.accountId = null;
      draw();
    }, `wide kind-seg ${st.type === 'salary' ? 'income' : st.type}`));
    if (st.type === 'salary') {
      parts.push(field(t('field.company'), h('input', { class: 'input', value: st.company, maxlength: 40, 'aria-label': t('field.company'), onInput: (e) => { st.company = e.target.value; check(); } })));
      parts.push(field(t('field.payTo'), accountPicker({ types: ['cash', 'saving'], value: st.accountId, onChange: (id) => { st.accountId = id; draw(); } })));
      parts.push(field(t('field.payday'), daySelect(st.payDay, (v) => { st.payDay = v; })));
      parts.push(field(t('field.holiday'), shiftSeg(st.shift, (v) => { st.shift = v; draw(); })));
    } else {
      const isExp = st.type === 'expense';
      parts.push(h('div', { class: `amount-row ${st.type}` },
        h('span', { class: 'amount-kind' }, icon(KIND_ICON[st.type], { size: 22 })),
        amountInput({ value: st.amount, big: true, label: t('field.amountOptional'), placeholder: t('field.amountOptional'), onChange: (v) => { st.amount = v; } })));
      parts.push(field(t('common.date'), h('input', { class: 'input', type: 'date', value: st.date, 'aria-label': t('common.date'), onChange: (e) => { if (e.target.value) st.date = e.target.value; else e.target.value = st.date; draw(); } })));
      parts.push(field(isExp ? t('field.payFrom') : t('field.payTo'), accountPicker({ types: isExp ? ['cash', 'card', 'saving'] : ['cash', 'saving'], value: st.accountId, onChange: (id) => { st.accountId = id; draw(); } })));
      parts.push(field(t('field.category'), onCategory
        ? h('button', { type: 'button', class: 'cat-line boxed', onClick: onCategory },
          h('span', { class: 'cat-emoji' }, catIcon(store.get('categories', st.catId))),
          h('span', { class: 'grow cat-text' }, h('span', { class: 'cat-name ellipsis' }, catLabel(st.catId, st.subId))),
          icon('chevron', { size: 20 }))
        : categoryPicker({ kind: st.type, catId: st.catId, subId: st.subId, onChange: (c, s) => { st.catId = c; st.subId = s; check(); } })));
      parts.push(field(t('field.repeat'), repeatControl(st, draw)));
    }
    saveBtn = h('button', { type: 'button', class: 'btn primary block', onClick: save }, editing ? t('common.save') : t('rec.reserve'));
    parts.push(saveBtn);
    setChildren(root, parts);
    check();
  };
  draw();
  return root;
}

function repeatControl(st, redraw) {
  const r = st.repeat;
  const rows = [seg([['none', t('repeat.none')], ['days', t('repeat.days')], ['weekly', t('repeat.weekly')], ['monthly', t('repeat.monthly')]], r.kind, (v) => { r.kind = v; redraw(); }, 'wide small')];
  if (r.kind === 'days') {
    rows.push(h('div', { class: 'inline-field' },
      h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 1, value: String(r.n), 'aria-label': t('repeat.days'), onInput: (e) => { r.n = Math.floor(Number(e.target.value)); } }),
      h('span', { class: 'muted' }, t('repeat.daysUnit'))));
  }
  if (r.kind === 'weekly') rows.push(h('p', { class: 'muted small hint-line' }, icon('repeat', { size: 16 }), t('repeat.everyWeek', { w: weekName(weekday(st.date)) })));
  if (r.kind === 'monthly') rows.push(h('p', { class: 'muted small hint-line' }, icon('repeat', { size: 16 }), t('repeat.everyMonth', { d: Number(st.date.slice(8)) })));
  return h('div', { class: 'repeat' }, rows);
}

export function daySelect(value, onChange) {
  const opts = [...Array.from({ length: 28 }, (_, i) => i + 1), 'end'];
  return h('select', { class: 'input', onChange: (e) => onChange(e.target.value === 'end' ? 'end' : Number(e.target.value)) },
    opts.map((d) => h('option', { value: String(d), selected: String(d) === String(value) }, fmtDay(d))));
}

export function shiftSeg(value, onChange) {
  return seg([['prev', t('shift.prev')], ['next', t('shift.next')], ['none', t('shift.none')]], value, onChange, 'wide small');
}

export function moneyText(n, cls = '') {
  return h('span', { class: `money ${cls}` }, yen(n));
}
