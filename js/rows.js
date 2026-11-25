// 履歴の1行（HIST-10、LEND-05、CXL-04）。履歴タブと口座の明細で使う
import { store } from './app-store.js';
import { t, yen } from './i18n.js';
import { KIND_ICON, accName, catLabel, txLabel } from './forms.js';
import { rowAmountFor } from './ledger.js';
import { h, icon } from './ui.js';

// 記録の下に書く状態
export function statusLines(tx) {
  const lines = [];
  const lends = tx.lends ?? [];
  if (lends.length) {
    const got = lends.filter((l) => l.done).reduce((s, l) => s + l.amount, 0);
    const waiting = lends.filter((l) => !l.done).map((l) => l.name);
    if (!waiting.length) lines.push({ text: t('lend.collected', { amt: yen(got) }), done: true });
    else if (got) lines.push({ text: `${t('lend.collected', { amt: yen(got) })}（${t('lend.pendingNames', { names: waiting.join('、') })}）` });
    else lines.push({ text: t('lend.pendingNames', { names: waiting.join('、') }) });
  }
  if (tx.borrow) {
    const who = tx.type === 'income' ? t('lend.borrowFrom', { name: tx.borrow.name }) : t('lend.paidBy', { name: tx.borrow.name });
    lines.push({ text: `${who} · ${tx.borrow.done ? t('lend.returned') : t('lend.notReturned')}`, done: tx.borrow.done });
  }
  if (tx.cancel?.state === 'pending') lines.push({ text: t('hist.cancelPending'), warn: true });
  if (tx.cancel?.state === 'done') lines.push({ text: `${t('hist.cancelled')} · ${t('hist.refunded', { amt: yen(tx.cancel.refund) })}`, done: true });
  return lines;
}

function txTitle(tx) {
  if (tx.type === 'transfer') return t('kind.transfer');
  if (tx.type === 'cardpay') return t('kind.cardpay');
  return txLabel(tx);
}

function txSub(tx) {
  if (tx.type === 'transfer') return `${accName(tx.accountId)} → ${accName(tx.toAccountId)}`;
  if (tx.type === 'cardpay') return `${accName(tx.accountId)} → ${accName(tx.cardId)}`;
  const acc = tx.type === 'expense' && !tx.accountId ? t('kind.borrow') : accName(tx.accountId);
  // 名前を付けた記録は、見出しが名前になるのでカテゴリをこちらに出す
  return [tx.name ? catLabel(tx.catId, tx.subId) : '', tx.shop, acc].filter(Boolean).join(' · ');
}

// accountId を渡すと、その口座から見た増減で金額を出す
export function rowView(row, { onClick, accountId = null } = {}) {
  let kind;
  let title;
  let sub;
  let amount;
  let cls;
  const tx = row.tx;
  switch (row.kind) {
    case 'adj':
      kind = 'adj';
      title = t('kind.adj');
      sub = accName(row.adj.accountId);
      amount = row.adj.diff;
      cls = 'neutral';
      break;
    case 'lend':
      kind = 'lend';
      title = t('lend.from', { name: row.party.name });
      sub = `${accName(row.party.accountId)} · ${txTitle(tx)}`;
      amount = row.party.amount;
      cls = 'plus';
      break;
    case 'borrow':
      kind = 'borrow';
      title = t('lend.to', { name: row.party.name });
      sub = `${accName(row.party.accountId)} · ${txTitle(tx)}`;
      amount = -tx.amount;
      cls = 'minus';
      break;
    case 'points':
      kind = 'points';
      title = t('kind.points');
      sub = `${tx.accountId ? accName(tx.accountId) : t('kind.borrow')} · ${txTitle(tx)}`;
      amount = tx.points;
      cls = 'plus';
      break;
    case 'refund':
      kind = 'refund';
      title = t('kind.refund');
      sub = `${tx.cancel.to === 'month' ? accName(tx.accountId) : accName(tx.cancel.accountId)} · ${txTitle(tx)}`;
      amount = tx.cancel.refund;
      cls = 'plus';
      break;
    default:
      kind = tx.type;
      title = txTitle(tx);
      sub = txSub(tx);
      amount = tx.type === 'income' ? tx.amount : tx.type === 'expense' || tx.type === 'cardpay' ? -tx.amount : tx.amount;
      cls = tx.type === 'income' ? 'plus' : tx.type === 'transfer' ? 'neutral' : 'minus';
  }
  if (accountId) {
    amount = rowAmountFor(row, accountId);
    cls = amount > 0 ? 'plus' : 'minus';
  }
  const lines = row.kind === 'tx' ? statusLines(tx) : [];
  const cancelled = row.kind === 'tx' && tx.cancel?.state === 'done';
  return h('button', { type: 'button', class: `hist-row ${cancelled ? 'cancelled' : ''}`, onClick },
    h('span', { class: `kind-icon k-${kind}` }, icon(KIND_ICON[kind], { size: 18 })),
    h('span', { class: 'grow hist-main' },
      h('span', { class: 'hist-title ellipsis' }, title),
      h('span', { class: 'hist-sub ellipsis' }, row.time ? `${row.time} · ${sub}` : sub),
      lines.map((l) => h('span', { class: `hist-status ${l.done ? 'done' : ''} ${l.warn ? 'warn' : ''}` }, l.done ? icon('check', { size: 13 }) : null, l.text))),
    h('span', { class: `hist-amount ${cls}` }, yen(amount, { sign: cls === 'plus' })));
}

export function txById(id) {
  return store.get('txs', id);
}
