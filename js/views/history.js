// 履歴タブ（HIST）。上の切り替えで「履歴」と「予約」
import { store } from '../app-store.js';
import { fmtDate, t, yen } from '../i18n.js';
import { accName, txLabel } from '../forms.js';
import { historyRows, isIrregular, itemPayments, openParties, orphanPlanned, pendingCancels, pendingLends } from '../ledger.js';
import { rowView } from '../rows.js';
import {
  openCancelSheet, openItem, openPartySheet, openPlannedMenu, openRegisterSheet, openRowMenu, openRsvEdit, plannedRow, rsvSub, rsvTitle, withdrawCancel,
} from '../sheets.js';
import { actionMenu, confirmDialog, empty, h, icon, iconButton, seg, setChildren, toast } from '../ui.js';

let mode = 'history';
const filters = new Set(['expense', 'income', 'transfer']);
const openGroups = new Set(); // 開いている見出し（不定期・給与）

export function setHistoryMode(m) {
  mode = m;
}

export function renderHistory(root) {
  setChildren(root,
    h('header', { class: 'page-head' },
      seg([['history', t('hist.history')], ['reserve', t('hist.reserve')]], mode, (v) => { mode = v; renderHistory(root); }, 'wide top-seg')),
    mode === 'history' ? historyList(root) : reserveList(root));
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
  const rows = historyRows(store.live).filter((r) => r.filter === null || filters.has(r.filter));
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

// 予約（HIST-20〜25）: 不定期・給与（押すと一覧が開く） → キャンセル予約 → 貸与・借入 → 日付順の予約
function reserveList(root) {
  const today = store.today();
  const cancels = pendingCancels(store.live);
  const lends = pendingLends(store.live);
  const items = store.state.reservations.filter(isIrregular).sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1));
  const orphans = orphanPlanned(store.state, today);
  const rsvs = store.state.reservations.filter((r) => !isIrregular(r)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!items.length && !orphans.length && !cancels.length && !lends.length && !rsvs.length) return empty(t('hist.rsvEmpty'), 'calendar');

  // 不定期の項目。押すと専用のページを開く
  const itemRows = items.map((r) => {
    const next = itemPayments(store.state, r.id, today).planned[0];
    return h('button', { type: 'button', class: 'rsv-row item-row', onClick: () => openItem(r.id) },
      h('span', { class: `kind-icon k-${r.type}` }, icon(r.type === 'income' ? 'in' : 'out', { size: 18 })),
      h('span', { class: 'grow hist-main' },
        h('span', { class: 'hist-title ellipsis' }, rsvTitle(r)),
        h('span', { class: 'hist-sub ellipsis' }, rsvSub(r)),
        next ? h('span', { class: 'hist-status' }, t('item.next', { date: fmtDate(next.date, { year: false }), amt: yen(next.amount) })) : null),
      icon('chevron', { size: 18 }));
  });

  const cancelRows = cancels.map((tx) => h('div', { class: 'rsv-row' },
    h('span', { class: 'kind-icon k-cancel' }, icon('xcircle', { size: 18 })),
    h('span', { class: 'grow hist-main' },
      h('span', { class: 'hist-title ellipsis' }, txLabel(tx)),
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
        h('span', { class: 'hist-title ellipsis' }, tx.type === 'income' ? tx.name || t('kind.borrow') : txLabel(tx)),
        h('span', { class: 'hist-sub ellipsis' }, `${fmtDate(tx.date, { year: false })} · ${yen(tx.amount)}`),
        h('span', { class: 'party-dots' }, parties.map((p) => h('span', { class: `party-dot ${p.done ? 'done' : ''}` }, p.done ? icon('check', { size: 12 }) : null, p.name)))),
      icon('chevron', { size: 18 }));
  });

  const rsvRow = (r) => {
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
  };
  const salaries = rsvs.filter((r) => r.type === 'salary');
  const rsvRows = rsvs.filter((r) => r.type !== 'salary').map(rsvRow);

  // 見出しを押すと、その一覧が開く。日付が来たものがあれば件数を赤丸で出す
  const group = (id, ic, label, names, rows, due = 0) => {
    if (!rows.length) return null;
    const open = openGroups.has(id);
    return h('div', { class: 'card list rsv-group' },
      h('button', { type: 'button', class: 'rsv-row rsv-group-head', 'aria-expanded': open ? 'true' : 'false', onClick: () => {
        if (open) openGroups.delete(id);
        else openGroups.add(id);
        renderHistory(root);
      } },
      h('span', { class: `kind-icon k-${id}` }, icon(ic, { size: 18 })),
      h('span', { class: 'grow hist-main' },
        h('span', { class: 'hist-title ellipsis' }, label),
        open ? null : h('span', { class: 'hist-sub ellipsis' }, names.join(t('common.listSep')))),
      due ? h('span', { class: 'due-badge' }, due) : null,
      h('span', { class: 'muted' }, rows.length),
      icon(open ? 'up' : 'down', { size: 20 })),
      open ? rows : null);
  };

  return [
    // 不定期の最後は、項目を削除したあとに残った支払日前の支払い
    group('irregular', 'history', t('repeat.irregular'), [...items.map(rsvTitle), ...orphans.map(txLabel)],
      [...itemRows, ...orphans.map((tx) => plannedRow(tx, () => openPlannedMenu(tx)))]),
    group('salary', 'briefcase', t('kind.salary'), salaries.map((r) => r.company), salaries.map(rsvRow), salaries.filter((r) => r.date <= today).length),
    cancelRows.length || lendRows.length ? h('div', { class: 'card list top-pending' }, cancelRows, lendRows) : null,
    rsvRows.length ? h('div', { class: 'card list' }, rsvRows) : null,
  ];
}
