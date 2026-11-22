// シート: 口座の追加・設定・明細、記録の編集、予約の登録、カードの支払い、キャンセル確定、貸与・借入、ベル
import { store } from './app-store.js';
import { fmtDate, t, yen } from './i18n.js';
import { amountInput, closeKeypad } from './keypad.js';
import {
  TYPE_ICON, accIcon, accName, accountPicker, catLabel, daySelect, draftFromRsv, draftFromTx, newTxDraft, repeatLabel, rsvForm, shiftSeg,
} from './forms.js';
import { openCategoryChooser, txDetail } from './tx-detail.js';
import { balances, bellItems, cardStatus, historyRows, openParties, rowTouches, unpaidCycles, unpaidOf } from './ledger.js';
import { rowView, statusLines } from './rows.js';
import {
  actionMenu, confirmDialog, empty, field, h, icon, iconButton, openSheet, seg, setChildren, switchInput, toast,
} from './ui.js';

const EMOJIS = ['👛', '💴', '💳', '🏦', '🐷', '💰', '🪙', '💵', '🏧', '📱', '🛒', '🍙', '☕', '🚃', '🎮', '🎁', '🏠', '✈️', '⭐', '🍀', '🐱', '🐶', '🌸', '🔵', '🟢', '🟠', '🔴', '🟣'];

// ---- 口座の追加・設定（ACC） ----

function resizeImage(file, size = 160) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

export function openAccountForm(account = null) {
  const editing = !!account;
  const bal = balances(store.state);
  const current = account ? (account.type === 'card' ? unpaidOf(bal, account.id) : bal.get(account.id)) : null;
  const st = {
    type: account?.type ?? 'cash',
    name: account?.name ?? '',
    memo: account?.memo ?? '',
    icon: account?.icon ?? null,
    amount: editing ? current : null,
    showAdj: true,
    card: { closingDay: 15, payDay: 10, payMonths: 1, debitId: null, shift: 'next', ...(account?.card ?? {}) },
  };
  const root = h('div', { class: 'form' });
  let saveBtn;
  const debits = () => store.state.accounts.filter((a) => !a.deleted && a.type !== 'card');
  const valid = () => {
    if (!st.name.trim()) return false;
    if (!editing && st.amount == null) return false;
    if (st.type === 'card' && !store.get('accounts', st.card.debitId)) return false;
    return true;
  };
  const check = () => { if (saveBtn) saveBtn.disabled = !valid(); };
  const defIcon = () => ({ kind: 'emoji', value: st.type === 'card' ? '💳' : st.type === 'saving' ? '🐷' : '👛' });
  const draw = () => {
    const ic = st.icon ?? defIcon();
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        st.icon = { kind: 'image', value: await resizeImage(f) };
        draw();
      } catch {
        toast(t('acc.photoError'));
      }
    } });
    const parts = [];
    if (!editing) {
      parts.push(seg(['cash', 'card', 'saving'].map((k) => [k, t(`type.${k}`)]), st.type, (v) => { st.type = v; draw(); }, 'wide'));
    }
    parts.push(field(t('acc.icon'),
      h('div', { class: 'icon-pick' },
        h('span', { class: 'icon-preview' }, accIcon({ icon: ic }, 56)),
        h('div', { class: 'emoji-grid' },
          EMOJIS.map((e) => h('button', { type: 'button', class: `emoji ${ic.kind === 'emoji' && ic.value === e ? 'on' : ''}`, 'aria-label': e, onClick: () => { st.icon = { kind: 'emoji', value: e }; draw(); } }, e)),
          h('button', { type: 'button', class: `emoji photo ${ic.kind === 'image' ? 'on' : ''}`, 'aria-label': t('acc.photo'), title: t('acc.photo'), onClick: () => fileIn.click() }, icon('image', { size: 20 })))),
      fileIn));
    parts.push(field(t('common.name'), h('input', { class: 'input', value: st.name, maxlength: 30, 'aria-label': t('common.name'), onInput: (e) => { st.name = e.target.value; check(); } })));
    parts.push(field(t('acc.memo'), h('input', { class: 'input', value: st.memo, maxlength: 80, 'aria-label': t('acc.memo'), onInput: (e) => { st.memo = e.target.value; } })));
    const amountLabel = editing ? (st.type === 'card' ? t('acc.currentUnpaid') : t('acc.current')) : (st.type === 'card' ? t('card.initialUnpaid') : t('acc.initial'));
    parts.push(field(amountLabel, amountInput({ value: st.amount, label: amountLabel, onChange: (v) => { st.amount = v; check(); } })));
    if (editing) {
      parts.push(h('label', { class: 'toggle-row' }, icon('scale', { size: 20 }), h('span', { class: 'grow small' }, t('acc.showAdj')), switchInput(st.showAdj, (v) => { st.showAdj = v; }, t('acc.showAdj'))));
    }
    if (st.type === 'card') {
      const c = st.card;
      if (!debits().length) parts.push(h('p', { class: 'error' }, t('card.noDebit')));
      parts.push(h('div', { class: 'grid2' },
        field(t('card.closing'), daySelect(c.closingDay, (v) => { c.closingDay = v; })),
        field(t('card.payDay'), daySelect(c.payDay, (v) => { c.payDay = v; }))));
      parts.push(field(t('card.payMonths'), seg([[1, t('card.next1')], [2, t('card.next2')]], c.payMonths, (v) => { c.payMonths = v; draw(); }, 'wide small')));
      parts.push(field(t('field.holiday'), shiftSeg(c.shift, (v) => { c.shift = v; draw(); })));
      parts.push(field(t('card.debit'), accountPicker({ types: ['cash', 'saving'], value: c.debitId, onChange: (id) => { c.debitId = id; draw(); } })));
    }
    saveBtn = h('button', { type: 'button', class: 'btn primary block', onClick: save }, editing ? t('common.save') : t('common.add'));
    parts.push(saveBtn);
    if (editing) {
      parts.push(h('button', { type: 'button', class: 'btn danger block', onClick: remove }, icon('trash', { size: 18 }), t('common.delete')));
    }
    setChildren(root, parts);
    check();
  };
  const save = () => {
    if (!valid()) return;
    const card = st.type === 'card' ? { closingDay: st.card.closingDay, payDay: st.card.payDay, payMonths: st.card.payMonths, debitId: st.card.debitId, shift: st.card.shift } : null;
    if (editing) {
      store.updateAccount(account.id, { name: st.name, memo: st.memo, icon: st.icon ?? defIcon(), ...(card ? { card } : {}) });
      if (st.amount != null && st.amount !== current) {
        const diff = st.type === 'card' ? current - st.amount : st.amount - current;
        store.adjustBalance(account.id, diff, st.showAdj);
      }
      toast(t('rec.updated'));
    } else {
      store.addAccount({ type: st.type, name: st.name, memo: st.memo, icon: st.icon ?? defIcon(), initial: st.amount, card });
    }
    sheet.close();
  };
  const remove = async () => {
    if (!(await confirmDialog({ message: t('acc.deleteAsk', { name: account.name }), okLabel: t('common.delete'), danger: true }))) return;
    store.deleteAccount(account.id);
    toast(t('acc.deleted'));
    sheet.close();
  };
  draw();
  const sheet = openSheet({ title: editing ? t('acc.edit') : t('acc.new'), content: root, full: true });
  return sheet;
}

// ---- 口座の明細（HOME-04） ----

export function openAccountDetail(id) {
  return openSheet({
    title: accName(id),
    full: true,
    headerRight: () => iconButton('gear', t('acc.edit'), () => {
      const a = store.get('accounts', id);
      if (a) openAccountForm(a);
    }),
    render: (api) => {
      const a = store.get('accounts', id);
      if (!a) return empty(t('acc.detailEmpty'));
      api.setTitle(a.name);
      const bal = balances(store.state);
      const head = [];
      if (a.type === 'card') {
        const s = cardStatus(store.state, a, store.today(), bal);
        head.push(h('div', { class: 'detail-head' },
          accIcon(a, 44),
          h('div', { class: 'grow' },
            h('div', { class: 'muted small' }, t('home.unpaid')),
            h('div', { class: 'detail-amount' }, yen(s.unpaid)),
            s.payDate ? h('div', { class: 'muted small' }, `${t('home.next', { date: fmtDate(s.payDate, { year: false }) })} · ${yen(s.amount)}`) : null,
            h('div', { class: 'muted small' }, `${t('card.debit')}: ${accName(a.card.debitId)}`))));
      } else {
        head.push(h('div', { class: 'detail-head' },
          accIcon(a, 44),
          h('div', { class: 'grow' },
            h('div', { class: 'muted small' }, t(`type.${a.type}`)),
            h('div', { class: 'detail-amount' }, yen(bal.get(a.id))))));
      }
      if (a.memo) head.push(h('p', { class: 'muted small memo' }, a.memo));
      const rows = historyRows(store.state).filter((r) => rowTouches(r, id));
      return h('div', {}, head, rows.length
        ? h('div', { class: 'card list' }, rows.map((r) => rowView(r, { accountId: id, onClick: () => openRowMenu(r) })))
        : empty(t('acc.detailEmpty'), TYPE_ICON[a.type]));
    },
  });
}

// ---- 記録を押したとき（HIST-13、CXL-01） ----

export function openRowMenu(row) {
  if (row.kind === 'adj') {
    actionMenu(t('kind.adj'), [{ label: t('common.delete'), icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog({ message: t('hist.deleteAsk'), okLabel: t('common.delete'), danger: true })) store.del('adjustments', row.adj.id) ?? store.done();
    } }]);
    return;
  }
  if (row.kind !== 'tx') {
    openParties(row.tx).length && row.kind !== 'refund' ? openPartySheet(row.tx.id) : openTxMenu(row.tx);
    return;
  }
  openTxMenu(row.tx);
}

export function openTxMenu(tx) {
  const acc = store.get('accounts', tx.accountId);
  const canCancel = tx.type === 'expense' && acc?.type === 'card' && !tx.cancel;
  actionMenu(`${fmtDate(tx.date)} · ${yen(tx.amount)}`, [
    { label: t('common.edit'), icon: 'edit', onClick: () => openTxEdit(tx.id) },
    openParties(tx).length ? { label: t('kind.lend') + ' / ' + t('kind.borrow'), icon: 'handout', onClick: () => openPartySheet(tx.id) } : null,
    tx.cancel?.state === 'pending' ? { label: t('cxl.confirm'), icon: 'xcircle', onClick: () => openCancelSheet(tx.id) } : null,
    canCancel ? { label: t('hist.cancelDelete'), desc: t('hist.cancelDeleteDesc'), icon: 'xcircle', onClick: () => { store.requestCancel(tx.id); toast(t('hist.cancelPending')); } } : null,
    { label: t('common.delete'), icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog({ message: t('hist.deleteAsk'), okLabel: t('common.delete'), danger: true })) store.deleteTx(tx.id);
    } },
  ]);
}

export function openTxEdit(id) {
  const tx = store.get('txs', id);
  if (!tx) return;
  const st = draftFromTx(tx);
  openDetailSheet(st, {
    title: t('hist.editTx'),
    editing: true,
    onDone: () => toast(t('rec.updated')),
  });
}

// 記録の詳細画面をシートで開く（編集・予約の登録）
function openDetailSheet(st, { title, editing = false, onDone }) {
  let sheet;
  const mount = () => {
    const el = txDetail(st, {
      title,
      editing,
      onBack: () => sheet.close(),
      onCategory: () => openCategoryChooser(st, mount),
      onDone: (tx) => { sheet.close(); onDone?.(tx); },
    });
    sheet.body.replaceChildren(el);
  };
  sheet = openSheet({ title: '', full: true, bodyClass: 'detail-body' });
  sheet.body.closest('.sheet').classList.add('detail-sheet');
  mount();
}

// ---- 予約の登録（HIST-22） ----

export function openRegisterSheet(rsvId) {
  const r = store.get('reservations', rsvId);
  if (!r) return;
  const st = newTxDraft(r.type === 'salary' ? 'income' : r.type);
  Object.assign(st, { amount: r.amount, accountId: r.accountId, catId: r.catId, subId: r.subId, date: r.date, withTime: false, time: null, reservationId: r.id });
  // 給与は、お店の欄に会社名を入れる
  if (r.type === 'salary') Object.assign(st, { catId: store.salaryCategory().id, subId: null, shop: r.company });
  openDetailSheet(st, {
    title: r.type === 'salary' ? `${t('kind.salary')} · ${r.company}` : t(`rec.detail.${st.type}`),
    onDone: () => {
      store.advanceReservation(r.id);
      toast(t('rec.saved'));
    },
  });
}

export function openRsvEdit(id) {
  const r = store.get('reservations', id);
  if (!r) return;
  const sheet = openSheet({
    title: t('hist.editRsv'),
    full: true,
    content: rsvForm(draftFromRsv(r), { editing: true, onDone: () => { closeKeypad(); sheet.close(); toast(t('rec.updated')); } }),
  });
}

export function rsvTitle(r) {
  if (r.type === 'salary') return `${t('kind.salary')} · ${r.company}`;
  return catLabel(r.catId, r.subId);
}

export function rsvSub(r) {
  return [accName(r.accountId), repeatLabel(r)].filter(Boolean).join(' · ');
}

// ---- カードの支払い（CARD-01〜03） ----

export function openPaySheet(cardId, { onDone } = {}) {
  const a = store.get('accounts', cardId);
  if (!a) return null;
  const s = cardStatus(store.state, a, store.today());
  if (!s.due) {
    onDone?.();
    return null;
  }
  let amount = s.amount;
  let done = false;
  const btn = h('button', { type: 'button', class: 'btn primary', disabled: !(amount > 0), onClick: () => {
    if (!(amount > 0)) return;
    done = true;
    closeKeypad();
    store.payCard(a.id, s.cycle, amount, s.payDate);
    toast(t('card.paid'));
    sheet.close();
  } }, icon('check', { size: 18 }), t('card.payConfirm'));
  const sheet = openSheet({
    title: t('card.payTitle'),
    onClose: () => onDone?.(done),
    content: h('div', { class: 'form' },
      h('div', { class: 'pay-flow' },
        h('span', { class: 'pay-acc' }, accIcon(a, 36), h('span', { class: 'small ellipsis' }, a.name)),
        icon('back', { size: 20 }),
        h('span', { class: 'pay-acc' }, accIcon(store.get('accounts', a.card.debitId), 36), h('span', { class: 'small ellipsis' }, accName(a.card.debitId)))),
      h('p', { class: 'muted small center' }, t('card.payAsk', { date: fmtDate(s.payDate) })),
      h('div', { class: 'amount-row expense' }, h('span', { class: 'amount-kind' }, icon('card', { size: 22 })),
        amountInput({ value: amount, big: true, onChange: (v) => { amount = v; btn.disabled = !(v > 0); } })),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onClick: () => sheet.close() }, t('common.later')), btn)),
  });
  return sheet;
}

// ---- キャンセル確定（CXL-02〜04） ----

export function openCancelSheet(txId) {
  const tx = store.get('txs', txId);
  const card = store.get('accounts', tx?.accountId);
  if (!tx || !card) return;
  const cycles = unpaidCycles(store.state, card, store.today());
  const st = { to: 'month', cycle: cycles[0]?.cycle ?? null, accountId: null, partial: false, refund: tx.amount };
  const root = h('div', { class: 'form' });
  let btn;
  const valid = () => (st.to === 'month' ? !!st.cycle : !!store.get('accounts', st.accountId)) && st.refund >= 1 && st.refund <= tx.amount;
  const check = () => { if (btn) btn.disabled = !valid(); };
  const draw = () => {
    btn = h('button', { type: 'button', class: 'btn primary block', onClick: () => {
      if (!valid()) return;
      closeKeypad();
      store.confirmCancel(tx.id, { refund: st.refund, to: st.to, cycle: st.cycle, accountId: st.accountId });
      toast(t('cxl.done'));
      sheet.close();
    } }, t('cxl.confirm'));
    setChildren(root,
      h('div', { class: 'card list' }, rowView({ kind: 'tx', tx, date: tx.date, time: tx.time })),
      seg([['month', t('cxl.toMonth')], ['account', t('cxl.toAccount')]], st.to, (v) => { st.to = v; draw(); }, 'wide'),
      st.to === 'month'
        ? h('div', { class: 'chips' }, cycles.map((c) => h('button', { type: 'button', class: `chip ${c.cycle === st.cycle ? 'on' : ''}`, onClick: () => { st.cycle = c.cycle; draw(); } }, icon('calendar', { size: 16 }), t('cxl.payOn', { date: fmtDate(c.payDate, { week: false }) }))))
        : accountPicker({ types: ['cash', 'saving'], value: st.accountId, onChange: (id) => { st.accountId = id; draw(); } }),
      st.partial
        ? field(t('cxl.refund'), amountInput({ value: null, autoOpen: true, onChange: (v) => { st.refund = v ?? 0; check(); } }))
        : h('div', { class: 'refund-full' }, h('span', { class: 'grow' }, `${t('cxl.full')} ${yen(tx.amount)}`),
          h('button', { type: 'button', class: 'text-btn', onClick: () => { st.partial = true; st.refund = 0; draw(); } }, t('cxl.partial'))),
      btn);
    check();
  };
  draw();
  const sheet = openSheet({ title: t('cxl.confirm'), content: root });
}

export async function withdrawCancel(txId) {
  if (await confirmDialog({ message: t('cxl.withdrawAsk'), okLabel: t('cxl.withdraw') })) store.withdrawCancel(txId);
}

// ---- 貸与・借入の相手（LEND-04） ----

export function openPartySheet(txId) {
  openSheet({
    title: `${t('kind.lend')} / ${t('kind.borrow')}`,
    render: () => {
      const tx = store.get('txs', txId);
      if (!tx) return empty(t('hist.rsvEmpty'));
      return h('div', {},
        h('div', { class: 'card list' }, rowView({ kind: 'tx', tx, date: tx.date, time: tx.time }, { onClick: () => openTxMenu(tx) })),
        h('div', { class: 'card list party-list' }, openParties(tx).map((p) => h('button', {
          type: 'button',
          class: `party-row ${p.done ? 'done' : ''}`,
          onClick: () => (p.done ? undoParty(tx, p) : settleParty(tx, p)),
        },
        h('span', { class: `check ${p.done ? 'on' : ''}` }, p.done ? icon('check', { size: 14 }) : null),
        h('span', { class: `kind-icon k-${p.role}` }, icon(p.role === 'lend' ? 'handout' : 'handin', { size: 16 })),
        h('span', { class: 'grow' }, h('span', { class: 'block' }, p.name), p.done ? h('span', { class: 'hist-sub' }, `${fmtDate(p.doneDate, { year: false })} · ${accName(p.accountId)}`) : null),
        h('span', { class: 'hist-amount' }, yen(p.amount))))));
    },
  });
}

function settleParty(tx, p) {
  const st = { accountId: null };
  const root = h('div', { class: 'form' });
  const draw = () => setChildren(root,
    h('p', { class: 'confirm-msg' }, `${p.name} · ${yen(p.amount)}`),
    field(p.role === 'lend' ? t('lend.chooseIn') : t('lend.chooseOut'), accountPicker({ types: ['cash', 'saving'], value: st.accountId, onChange: (id) => { st.accountId = id; draw(); } })),
    h('button', { type: 'button', class: 'btn primary block', disabled: !st.accountId, onClick: () => {
      store.settleParty(tx.id, p.role === 'borrow' ? 'borrow' : p.id, st.accountId);
      sheet.close();
    } }, icon('check', { size: 18 }), t('lend.done')));
  draw();
  const sheet = openSheet({ title: p.role === 'lend' ? t('kind.lend') : t('kind.borrow'), content: root });
}

async function undoParty(tx, p) {
  if (await confirmDialog({ message: t('lend.undoAsk', { name: p.name }), okLabel: t('lend.undo') })) {
    store.unsettleParty(tx.id, p.role === 'borrow' ? 'borrow' : p.id);
  }
}

// ---- ベル（BELL-02） ----

export function openBell() {
  openSheet({
    title: t('bell.title'),
    full: true,
    render: () => {
      const b = bellItems(store.state, store.today());
      if (!b.reservations.length && !b.payments.length && !b.cancels.length) return empty(t('bell.empty'), 'bell');
      const group = (title, rows) => (rows.length ? h('section', { class: 'group' }, h('h3', { class: 'group-label' }, title), h('div', { class: 'card list' }, rows)) : null);
      return h('div', {},
        group(t('bell.payments'), b.payments.map(({ account, status }) => h('button', { type: 'button', class: 'hist-row', onClick: () => openPaySheet(account.id) },
          h('span', { class: 'kind-icon k-cardpay' }, icon('card', { size: 18 })),
          h('span', { class: 'grow hist-main' }, h('span', { class: 'hist-title ellipsis' }, account.name), h('span', { class: 'hist-sub' }, fmtDate(status.payDate))),
          h('span', { class: 'hist-amount minus' }, yen(status.amount))))),
        group(t('bell.reservations'), b.reservations.map((r) => h('button', { type: 'button', class: 'hist-row', onClick: () => openRegisterSheet(r.id) },
          h('span', { class: `kind-icon k-${r.type}` }, icon(r.type === 'salary' ? 'briefcase' : r.type === 'income' ? 'in' : 'out', { size: 18 })),
          h('span', { class: 'grow hist-main' }, h('span', { class: 'hist-title ellipsis' }, rsvTitle(r)), h('span', { class: 'hist-sub' }, `${fmtDate(r.date)} · ${accName(r.accountId)}`)),
          h('span', { class: 'hist-amount' }, r.amount != null ? yen(r.amount) : '—')))),
        group(t('bell.cancels'), b.cancels.map((tx) => h('button', { type: 'button', class: 'hist-row', onClick: () => openCancelSheet(tx.id) },
          h('span', { class: 'kind-icon k-cancel' }, icon('xcircle', { size: 18 })),
          h('span', { class: 'grow hist-main' }, h('span', { class: 'hist-title ellipsis' }, catLabel(tx.catId, tx.subId)), h('span', { class: 'hist-sub' }, `${fmtDate(tx.date)} · ${accName(tx.accountId)}`)),
          h('span', { class: 'hist-amount' }, yen(tx.amount))))));
    },
  });
}

export { statusLines };
