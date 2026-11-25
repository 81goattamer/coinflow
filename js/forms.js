// 記録（REC）・予約（RSV）の入力フォームと、口座・カテゴリの選択部品
import { store } from './app-store.js';
import { isDateKey, nowTime, weekday } from './dates.js';
import { fmtDate, fmtDay, t, weekName, yen } from './i18n.js';
import { amountInput } from './keypad.js';
import { activeAccounts, firstRepeatDate } from './ledger.js';
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
  if (catId === '__points') return t('cat.points');
  const c = store.get('categories', catId);
  if (!c) return t('common.uncategorized');
  if (!subId) return c.name;
  const s = c.subs.find((x) => x.id === subId);
  return `${c.name} › ${s ? s.name : t('common.uncategorized')}`;
}

// 記録の見出し。名前を付けていればその名前、なければカテゴリ
export function txLabel(tx) {
  return tx.name || catLabel(tx.catId, tx.subId);
}

export const TYPE_ICON = { cash: 'wallet', card: 'card', saving: 'piggy' };
export const KIND_ICON = { expense: 'out', income: 'in', transfer: 'transfer', salary: 'briefcase', cancel: 'xcircle', lend: 'handout', borrow: 'handin', cardpay: 'card', adj: 'scale', refund: 'undo', points: 'gift' };

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

export function dateTimeFields(st, onChange, { dateOnly = false } = {}) {
  const date = h('input', { class: 'input', type: 'date', value: st.date, required: true, 'aria-label': t('common.date'), onChange: (e) => { if (e.target.value) st.date = e.target.value; else e.target.value = st.date; onChange(); } });
  if (dateOnly) return date;
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
  return { type, amount: null, accountId: null, toAccountId: null, borrowName: '', borrowOn: false, name: '', shop: '', pointsOn: false, points: null, catId: null, subId: null, date: store.today(), withTime: true, time: nowTime(), lends: [], id: null, reservationId: null };
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
    name: tx.name ?? '',
    // 収入の借入では、お店の欄に借りた人を入れる
    shop: tx.type === 'income' && tx.borrow ? tx.borrow.name : (tx.shop ?? ''),
    pointsOn: tx.type === 'expense' && (tx.points ?? 0) > 0,
    points: tx.type === 'expense' && tx.points ? tx.points : null,
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
  return { id: null, type, date: store.today(), name: '', accountId: null, catId: null, subId: null, amount: null, repeat: repeatDraft({ kind: 'none' }), company: '', payDay: 25, shift: 'prev' };
}

export function draftFromRsv(r) {
  return { ...r, name: r.name ?? '', date: r.date ?? store.today(), repeat: repeatDraft(r.repeat) };
}

// 繰り返しの入力用。選び直しても困らないよう、使っていない項目にも初めの値を入れておく
function repeatDraft(repeat) {
  const today = store.today();
  return { n: 7, w: weekday(today), day: Number(today.slice(8)), ...repeat };
}

// 保存する形（使う項目だけ）
function repeatOf(st) {
  const { kind, n, w, day } = st.repeat;
  if (kind === 'days') return { kind, n: Math.max(1, Math.round(n)) };
  if (kind === 'weekly') return { kind, w };
  if (kind === 'monthly') return { kind, day };
  return { kind };
}

// 毎週・毎月の次の日。繰り返しを変えていない編集では、今の回の日付のまま
function repeatDate(st) {
  const rep = repeatOf(st);
  const old = st.id ? store.get('reservations', st.id) : null;
  if (old?.repeat && isDateKey(old.date) && JSON.stringify(repeatOf(old)) === JSON.stringify(rep)) return old.date;
  return firstRepeatDate(rep, store.today());
}

export function repeatLabel(r) {
  const rep = r.repeat ?? { kind: 'none' };
  if (r.type === 'salary') return r.payDay === 'end' ? t('day.everyEnd') : t('day.everyN', { n: r.payDay });
  if (rep.kind === 'days') return t('repeat.everyDays', { n: rep.n });
  if (rep.kind === 'weekly') return t('repeat.everyWeek', { w: weekName(rep.w) });
  if (rep.kind === 'monthly') return rep.day === 'end' ? t('day.everyEnd') : t('repeat.everyMonth', { d: rep.day });
  if (rep.kind === 'irregular') return t('repeat.irregular');
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
    const fixed = st.type !== 'salary' && ['weekly', 'monthly'].includes(st.repeat.kind);
    const r = store.saveReservation({ ...st, repeat: repeatOf(st), date: fixed ? repeatDate(st) : st.date });
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
      const kind = st.repeat.kind;
      // 不定期では、金額と日付は支払うたびに入れるので出さない
      parts.push(field(t('field.repeat'), repeatControl(st, draw, check)));
      if (kind !== 'irregular') {
        parts.push(h('div', { class: `amount-row ${st.type}` },
          h('span', { class: 'amount-kind' }, icon(KIND_ICON[st.type], { size: 22 })),
          amountInput({ value: st.amount, big: true, label: t('field.amountOptional'), placeholder: t('field.amountOptional'), onChange: (v) => { st.amount = v; } })));
      }
      parts.push(field(t('field.txName'), h('input', { class: 'input rsv-name', value: st.name, maxlength: 40, 'aria-label': t('field.txName'), onInput: (e) => { st.name = e.target.value; } })));
      if (kind === 'none' || kind === 'days') parts.push(field(t(kind === 'days' ? 'repeat.start' : 'common.date'), h('input', { class: 'input', type: 'date', value: st.date, 'aria-label': t('common.date'), onChange: (e) => { if (e.target.value) st.date = e.target.value; else e.target.value = st.date; draw(); } })));
      parts.push(field(isExp ? t('field.payFrom') : t('field.payTo'), accountPicker({ types: isExp ? ['cash', 'card', 'saving'] : ['cash', 'saving'], value: st.accountId, onChange: (id) => { st.accountId = id; draw(); } })));
      parts.push(field(t('field.category'), onCategory
        ? h('button', { type: 'button', class: 'cat-line boxed', onClick: onCategory },
          h('span', { class: 'cat-emoji' }, catIcon(store.get('categories', st.catId))),
          h('span', { class: 'grow cat-text' }, h('span', { class: 'cat-name ellipsis' }, catLabel(st.catId, st.subId))),
          icon('chevron', { size: 20 }))
        : categoryPicker({ kind: st.type, catId: st.catId, subId: st.subId, onChange: (c, s) => { st.catId = c; st.subId = s; check(); } })));
    }
    saveBtn = h('button', { type: 'button', class: 'btn primary block', onClick: save }, editing ? t('common.save') : t('rec.reserve'));
    parts.push(saveBtn);
    setChildren(root, parts);
    check();
  };
  draw();
  return root;
}

// なし／定期（n日毎・毎週・毎月）／不定期
function repeatControl(st, redraw, check) {
  const r = st.repeat;
  const regular = r.kind !== 'none' && r.kind !== 'irregular';
  const pick = (kind) => { r.kind = kind; redraw(); };
  const rows = [seg([['none', t('repeat.none')], ['regular', t('repeat.regular')], ['irregular', t('repeat.irregular')]], regular ? 'regular' : r.kind, (v) => {
    if (v === 'regular') {
      if (!regular) pick('monthly');
    } else if (v !== r.kind) pick(v);
  }, 'wide')];
  if (regular) {
    rows.push(seg([['days', t('repeat.days')], ['weekly', t('repeat.weekly')], ['monthly', t('repeat.monthly')]], r.kind, pick, 'wide small'));
    if (r.kind === 'days') {
      rows.push(h('div', { class: 'inline-field' },
        h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 1, value: String(r.n), 'aria-label': t('repeat.days'), onInput: (e) => { r.n = Math.floor(Number(e.target.value)); check(); } }),
        h('span', { class: 'muted' }, t('repeat.daysUnit'))));
    } else {
      const next = h('span', {});
      const showNext = () => { next.textContent = t('repeat.next', { date: fmtDate(repeatDate(st)) }); };
      rows.push(r.kind === 'weekly'
        ? seg(t('week').split(',').map((name, w) => [w, name]), r.w, (w) => { r.w = w; redraw(); }, 'wide small week-seg')
        : daySelect(r.day, (d) => { r.day = d; showNext(); }, 31));
      showNext();
      rows.push(h('p', { class: 'muted small hint-line' }, icon('calendar', { size: 16 }), next));
    }
  }
  if (r.kind === 'irregular') rows.push(h('p', { class: 'muted small hint-line' }, icon('history', { size: 16 }), t('repeat.irregularHint')));
  return h('div', { class: 'repeat' }, rows);
}

export function daySelect(value, onChange, last = 28) {
  const opts = [...Array.from({ length: last }, (_, i) => i + 1), 'end'];
  return h('select', { class: 'input', onChange: (e) => onChange(e.target.value === 'end' ? 'end' : Number(e.target.value)) },
    opts.map((d) => h('option', { value: String(d), selected: String(d) === String(value) }, fmtDay(d))));
}

export function shiftSeg(value, onChange) {
  return seg([['prev', t('shift.prev')], ['next', t('shift.next')], ['none', t('shift.none')]], value, onChange, 'wide small');
}

export function moneyText(n, cls = '') {
  return h('span', { class: `money ${cls}` }, yen(n));
}
