// 記録タブ（REC・RSV）。上の切り替えで「記録」と「予約」。
// 記録: 種類（支出・収入）→ カテゴリ → サブカテゴリ → 詳細画面（金額・日時・口座・お店）
//       振替 → 出金元 → 入金先 → 詳細画面
// 予約: 種類（支出・収入）→ カテゴリ → サブカテゴリ → 予約の入力。給与はそのまま予約の入力へ
import { store } from '../app-store.js';
import { catIcon } from '../store.js';
import { t } from '../i18n.js';
import { closeKeypad } from '../keypad.js';
import { accIcon, newRsvDraft, newTxDraft, rsvForm } from '../forms.js';
import { accountList, txDetail } from '../tx-detail.js';
import { openCategoryEditor } from './settings.js';
import { h, icon, seg, setChildren, toast } from '../ui.js';

// 画面を作り直しても入力中の内容が消えないよう、状態はここに持つ
let mode = 'record';
const S = {
  record: { kind: 'expense', step: 'list', catId: null, recentOpen: false },
  reserve: { kind: 'expense', step: 'list', catId: null, recentOpen: false },
};
const KINDS = { record: ['expense', 'income', 'transfer'], reserve: ['expense', 'income', 'salary'] };
let txDraft = null;
let rsvDraft = null;
const keep = { expense: null, income: null, transfer: null }; // 種類ごとに前回の口座を残す（REC-13）

// カテゴリを選び直している間の下書き。選んだら金額などを引き継ぐ
let pendingDraft = null;
let pendingRsv = null;

const TR_TYPES = ['cash', 'saving'];

function startDetail(c, subId) {
  const s = S.record;
  if (pendingDraft && pendingDraft.type === s.kind) {
    txDraft = pendingDraft;
  } else {
    txDraft = newTxDraft(s.kind);
    const k = keep[s.kind];
    if (k) Object.assign(txDraft, k);
  }
  pendingDraft = null;
  if (c) Object.assign(txDraft, { catId: c.id, subId });
  s.step = 'detail';
}

function startRsv(c, subId) {
  const s = S.reserve;
  if (pendingRsv && pendingRsv.type === s.kind) rsvDraft = pendingRsv;
  else rsvDraft = newRsvDraft(s.kind);
  pendingRsv = null;
  if (c) Object.assign(rsvDraft, { catId: c.id, subId });
  s.step = 'detail';
}

// 振替: 出金元を選ぶところから始める
function startTransfer() {
  txDraft = newTxDraft('transfer');
  S.record.step = 'from';
}

function cats(kind) {
  return store.state.categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
}

// 最近使ったカテゴリ（新しい順に5つまで）。予約では予約から探す
function recent() {
  const s = S[mode];
  const seen = new Set();
  const out = [];
  const src = mode === 'record' ? store.state.txs : store.state.reservations;
  const list = src.filter((x) => x.type === s.kind && x.catId).sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));
  for (const x of list) {
    const key = `${x.catId}/${x.subId ?? ''}`;
    const c = store.get('categories', x.catId);
    if (seen.has(key) || !c || (x.subId && !c.subs.some((sb) => sb.id === x.subId))) continue;
    seen.add(key);
    out.push({ c, subId: x.subId });
    if (out.length >= 5) break;
  }
  return out;
}

export function renderRecord(root) {
  const s = S[mode];
  if (mode === 'record') {
    if (s.step === 'detail' && txDraft) return renderDetail(root);
    if ((s.step === 'from' || s.step === 'to') && txDraft) return renderTransferPick(root);
  } else if (s.step === 'detail' && rsvDraft) {
    return renderRsvDetail(root);
  }
  if (s.step === 'subs') {
    const c = store.get('categories', s.catId);
    if (c) return renderSubs(root, c);
  }
  s.step = 'list';
  const top = h('header', { class: 'page-head' },
    seg([['record', t('rec.record')], ['reserve', t('rec.reserve')]], mode, (v) => {
      mode = v;
      closeKeypad();
      renderRecord(root);
    }, 'wide top-seg'));
  const kindSeg = h('div', { class: 'kind-pills' }, KINDS[mode].map((k) => h('button', {
    type: 'button',
    class: `kind-pill ${k} ${k === s.kind ? 'on' : ''}`,
    'aria-pressed': k === s.kind ? 'true' : 'false',
    onClick: () => {
      // 振替と給与（予約）はカテゴリがないので、すぐ次へ
      if (k === 'transfer') startTransfer();
      else {
        s.kind = k;
        if (k === 'salary') startRsv(null, null);
      }
      renderRecord(root);
    },
  }, t(`kind.${k}`))));
  const pick = (c, subId) => (mode === 'record' ? startDetail(c, subId) : startRsv(c, subId));
  const rows = recent();
  const catRow = (c, subId = undefined) => h('button', {
    type: 'button',
    class: 'cat-line',
    onClick: () => {
      if (subId !== undefined || !c.subs.length) pick(c, subId ?? null);
      else {
        s.catId = c.id;
        s.step = 'subs';
      }
      renderRecord(root);
    },
  },
  h('span', { class: 'cat-emoji' }, catIcon(c)),
  h('span', { class: 'grow cat-text' },
    h('span', { class: 'cat-name ellipsis' }, subId !== undefined && subId ? `${c.name} › ${c.subs.find((x) => x.id === subId)?.name ?? ''}` : c.name),
    subId === undefined && c.subs.length ? h('span', { class: 'cat-subs ellipsis' }, c.subs.map((x) => x.name).join(', ')) : null),
  icon('chevron', { size: 20 }));

  setChildren(root,
    top,
    kindSeg,
    rows.length ? h('section', { class: 'cat-section' },
      h('button', { type: 'button', class: 'cat-section-head', 'aria-expanded': s.recentOpen ? 'true' : 'false', onClick: () => { s.recentOpen = !s.recentOpen; renderRecord(root); } },
        t('rec.recent'), icon(s.recentOpen ? 'up' : 'down', { size: 20 })),
      s.recentOpen ? rows.map((r) => catRow(r.c, r.subId)) : null) : null,
    h('section', { class: 'cat-section' },
      h('h2', { class: 'cat-section-head static' }, t('rec.all')),
      cats(s.kind).map((c) => catRow(c))),
    h('div', { class: 'bottom-space' }));
}

function subHead(title, onBack) {
  return h('header', { class: 'detail-head-bar sub-head' },
    h('button', { type: 'button', class: 'back-pill', onClick: onBack }, icon('back', { size: 22 }), t('common.back')),
    h('h2', { class: 'detail-title' }, title),
    h('span', { class: 'back-space' }));
}

function renderSubs(root, c) {
  const s = S[mode];
  const back = () => { s.step = 'list'; renderRecord(root); };
  const pick = (subId) => (mode === 'record' ? startDetail(c, subId) : startRsv(c, subId));
  setChildren(root,
    subHead(t('rec.subsOf', { name: c.name }), back),
    h('section', { class: 'cat-section' },
      c.subs.map((sb) => h('button', { type: 'button', class: 'cat-line', onClick: () => { pick(sb.id); renderRecord(root); } },
        h('span', { class: 'cat-emoji' }, catIcon(c)),
        h('span', { class: 'grow cat-text' }, h('span', { class: 'cat-name ellipsis' }, sb.name)),
        icon('chevron', { size: 20 }))),
      h('button', { type: 'button', class: 'cat-line settings-line', onClick: () => openCategoryEditor(c.id) },
        h('span', { class: 'cat-emoji muted' }, icon('gear', { size: 22 })),
        h('span', { class: 'grow cat-text' }, h('span', { class: 'cat-name' }, t('rec.subSettings'))),
        icon('chevron', { size: 20 }))),
    h('div', { class: 'bottom-space' }));
}

// 振替の口座選択（出金元 → 入金先）
function renderTransferPick(root) {
  const s = S.record;
  const isFrom = s.step === 'from';
  const k = keep.transfer;
  const back = () => {
    if (isFrom) {
      txDraft = null;
      s.step = 'list';
    } else {
      s.step = 'from';
    }
    renderRecord(root);
  };
  const from = store.get('accounts', txDraft.accountId);
  setChildren(root,
    subHead(t(isFrom ? 'rec.chooseFrom' : 'rec.chooseTo'), back),
    !isFrom && from ? h('div', { class: 'tr-from' }, accIcon(from, 28), h('span', { class: 'grow ellipsis' }, from.name), icon('transfer', { size: 20 })) : null,
    accountList({
      types: TR_TYPES,
      value: isFrom ? (txDraft.accountId ?? k?.accountId) : (txDraft.toAccountId ?? (k?.accountId === txDraft.accountId ? k?.toAccountId : null)),
      exclude: isFrom ? null : txDraft.accountId,
      onPick: (id) => {
        if (isFrom) {
          txDraft.accountId = id;
          if (txDraft.toAccountId === id) txDraft.toAccountId = null;
          s.step = 'to';
        } else {
          txDraft.toAccountId = id;
          s.step = 'detail';
        }
        renderRecord(root);
      },
    }),
    h('div', { class: 'bottom-space' }));
}

function renderDetail(root) {
  const s = S.record;
  // 日付が変わったまま開きっぱなしのときに、今日の日付に合わせる
  if (txDraft.amount == null && txDraft.date < store.today()) txDraft.date = store.today();
  const isTr = txDraft.type === 'transfer';
  const back = () => {
    if (isTr) {
      s.step = 'to';
    } else {
      s.step = store.get('categories', txDraft.catId)?.subs.length ? 'subs' : 'list';
      s.catId = txDraft.catId;
      txDraft = null;
    }
    renderRecord(root);
  };
  const page = h('div', { class: 'rec-page' }, txDetail(txDraft, {
    title: t(`rec.detail.${txDraft.type}`),
    onBack: back,
    onCategory: () => {
      // カテゴリを選び直す: 一覧に戻る（入力した金額などは残す）
      pendingDraft = txDraft;
      s.step = 'list';
      s.kind = txDraft.type;
      txDraft = null;
      renderRecord(root);
    },
    onDone: () => {
      keep[txDraft.type] = { accountId: txDraft.accountId, toAccountId: txDraft.toAccountId };
      txDraft = null;
      s.step = 'list';
      toast(t('rec.saved'));
    },
  }));
  setChildren(root, page);
}

// 予約の入力（カテゴリは一覧で選んだもの）
function renderRsvDetail(root) {
  const s = S.reserve;
  const isSalary = rsvDraft.type === 'salary';
  const back = () => {
    closeKeypad();
    if (isSalary) {
      s.kind = 'expense';
      s.step = 'list';
    } else {
      s.step = store.get('categories', rsvDraft.catId)?.subs.length ? 'subs' : 'list';
      s.catId = rsvDraft.catId;
    }
    rsvDraft = null;
    renderRecord(root);
  };
  setChildren(root,
    subHead(t(`rec.rsv.${rsvDraft.type}`), back),
    h('div', { class: 'card pad-card' }, rsvForm(rsvDraft, {
      onCategory: () => {
        closeKeypad();
        pendingRsv = rsvDraft;
        s.step = 'list';
        rsvDraft = null;
        renderRecord(root);
      },
      onDone: () => {
        closeKeypad();
        if (isSalary) s.kind = 'expense';
        rsvDraft = null;
        s.step = 'list';
        toast(t('rec.reserved'));
      },
    })),
    h('div', { class: 'bottom-space' }));
}
