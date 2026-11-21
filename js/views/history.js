// 履歴タブ（HIST）。上の切り替えで「履歴」と「予約」
import { store } from '../app-store.js';
import { fmtDate, t, yen } from '../i18n.js';
import { accName, catLabel } from '../forms.js';
import { historyRows, pendingCancels, pendingLends, openParties } from '../ledger.js';
import { rowView } from '../rows.js';
import {
  openCancelSheet, openPartySheet, openRegisterSheet, openRowMenu, openRsvEdit, rsvSub, rsvTitle, withdrawCancel,
} from '../sheets.js';
import { actionMenu, confirmDialog, empty, h, icon, iconButton, seg, setChildren, toast } from '../ui.js';

let mode = 'history';
const filters = new Set(['expense', 'income', 'transfer']);

export function setHistoryMode(m) {
  mode = m;
}

export function renderHistory(root) {
  setChildren(root,
    h('header', { class: 'page-head' },
      seg([['history', t('hist.history')], ['reserve', t('hist.reserve')]], mode, (v) => { mode = v; renderHistory(root); }, 'wide top-seg')),
    mode === 'history' ? historyList(root) : reserveList());
}

function historyList(root) {
  const chips = h('div', { class: 'filter-bar' }, ['expense', 'income', 'transfer'].map((k) => h('button', {
    type: 'button',
    class: `filter-chip f-${k} ${filters.has(k) ? 'on' : ''}`,
    'aria-pressed': filters.has(k) ? 'true' : 'false',
    onClick: () => {
      if (filters.has(k)) filters.delete(k);
      else filters.add(k);
      renderHistory(root);
    },
  }, filters.has(k) ? icon('check', { size: 14 }) : null, t(`kind.${k}`))));
  const rows = historyRows(store.state).filter((r) => r.filter === null || filters.has(r.filter));
  if (!rows.length) return [chips, empty(t('hist.empty'), 'history')];
  // 日ごとにまとめる
  const days = [];
  for (const r of rows) {
    if (days.at(-1)?.date !== r.date) days.push({ date: r.date, rows: [] });
    days.at(-1).rows.push(r);
  }
  return [chips, days.map((d) => {
    const spent = d.rows.reduce((s, r) => s + (r.kind === 'tx' && r.tx.type === 'expense' ? r.tx.amount : 0), 0);
    return h('section', { class: 'day' },
      h('h2', { class: 'day-head' }, h('span', { class: 'grow' }, fmtDate(d.date)), spent ? h('span', { class: 'day-total' }, t('hist.dayTotal', { amt: yen(spent) })) : null),
      h('div', { class: 'card list' }, d.rows.map((r) => rowView(r, { onClick: () => openRowMenu(r) }))));
  })];
}

// 予約（HIST-20〜25）: キャンセル予約 → 貸与・借入 → 日付順の予約
function reserveList() {
  const today = store.today();
  const cancels = pendingCancels(store.state);
  const lends = pendingLends(store.state);
  const rsvs = [...store.state.reservations].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!cancels.length && !lends.length && !rsvs.length) return empty(t('hist.rsvEmpty'), 'calendar');

  const cancelRows = cancels.map((tx) => h('div', { class: 'rsv-row' },
    h('span', { class: 'kind-icon k-cancel' }, icon('xcircle', { size: 18 })),
    h('span', { class: 'grow hist-main' },
      h('span', { class: 'hist-title ellipsis' }, catLabel(tx.catId, tx.subId)),
      h('span', { class: 'hist-sub ellipsis' }, `${fmtDate(tx.date, { year: false })} · ${accName(tx.accountId)} · ${yen(tx.amount)}`),
      h('span', { class: 'rsv-actions' },
        h('button', { type: 'button', class: 'mini-btn primary', onClick: () => openCancelSheet(tx.id) }, t('cxl.confirm')),
        h('button', { type: 'button', class: 'mini-btn', onClick: () => withdrawCancel(tx.id) }, t('cxl.withdraw'))))));

  const lendRows = lends.map((tx) => {
    const parties = openParties(tx);
    const role = parties.some((p) => p.role === 'lend') ? 'lend' : 'borrow';
    return h('button', { type: 'button', class: 'rsv-row', onClick: () => openPartySheet(tx.id) },
      h('span', { class: `kind-icon k-${role}` }, icon(role === 'lend' ? 'handout' : 'handin', { size: 18 })),
      h('span', { class: 'grow hist-main' },
        h('span', { class: 'hist-title ellipsis' }, tx.type === 'income' ? t('kind.borrow') : catLabel(tx.catId, tx.subId)),
        h('span', { class: 'hist-sub ellipsis' }, `${fmtDate(tx.date, { year: false })} · ${yen(tx.amount)}`),
        h('span', { class: 'party-dots' }, parties.map((p) => h('span', { class: `party-dot ${p.done ? 'done' : ''}` }, p.done ? icon('check', { size: 12 }) : null, p.name)))),
      icon('chevron', { size: 18 }));
  });

  const rsvRows = rsvs.map((r) => {
    const due = r.date <= today;
    return h('div', { class: `rsv-row ${due ? 'due' : ''}` },
      h('span', { class: `kind-icon k-${r.type}` }, icon(r.type === 'salary' ? 'briefcase' : r.type === 'income' ? 'in' : 'out', { size: 18 })),
      h('span', { class: 'grow hist-main' },
        h('span', { class: 'hist-title ellipsis' }, rsvTitle(r)),
        h('span', { class: 'hist-sub ellipsis' }, `${fmtDate(r.date)} · ${rsvSub(r)}`),
        due ? h('span', { class: 'rsv-actions' },
          h('button', { type: 'button', class: 'mini-btn primary', onClick: () => openRegisterSheet(r.id) }, t('hist.register')),
          h('button', { type: 'button', class: 'mini-btn', onClick: () => { store.advanceReservation(r.id); toast(t('hist.skipped')); } }, icon('skip', { size: 14 }), t('hist.skip'))) : null),
      h('span', { class: 'hist-amount' }, r.amount != null ? yen(r.amount) : '—'),
      iconButton('more', t('common.more'), () => actionMenu(rsvTitle(r), [
        { label: t('common.edit'), icon: 'edit', onClick: () => openRsvEdit(r.id) },
        { label: t('common.delete'), icon: 'trash', danger: true, onClick: async () => {
          if (await confirmDialog({ message: t('hist.rsvDeleteAsk'), okLabel: t('common.delete'), danger: true })) store.deleteReservation(r.id);
        } },
      ]), 'row-more'));
  });

  return [
    cancelRows.length || lendRows.length ? h('div', { class: 'card list top-pending' }, cancelRows, lendRows) : null,
    rsvRows.length ? h('div', { class: 'card list' }, rsvRows) : null,
  ];
}
