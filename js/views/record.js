// 記録タブ（REC）。上の切り替えで「記録」と「予約」。
// 記録は 種類（支出・収入・振替）→ カテゴリ → サブカテゴリ → 詳細画面（金額・日時・口座・お店）の順に進む
import { store } from '../app-store.js';
import { catIcon } from '../store.js';
import { t } from '../i18n.js';
import { closeKeypad } from '../keypad.js';
import { newRsvDraft, newTxDraft, rsvForm } from '../forms.js';
import { txDetail } from '../tx-detail.js';
import { openCategoryEditor } from './settings.js';
import { h, icon, seg, setChildren, toast } from '../ui.js';

// 画面を作り直しても入力中の内容が消えないよう、状態はここに持つ
let mode = 'record';
let kind = 'expense'; // 支出・収入・振替
let step = 'list'; // list → subs → detail
let catId = null;
let txDraft = null;
let rsvDraft = null;
let recentOpen = false;
const keep = { expense: null, income: null, transfer: null }; // 種類ごとに前回の口座を残す（REC-13）

// カテゴリを選び直している間の下書き。選んだら金額などを引き継ぐ
let pendingDraft = null;

function startDetail(c, subId) {
  if (pendingDraft && pendingDraft.type === kind) {
    txDraft = pendingDraft;
  } else {
    txDraft = newTxDraft(kind);
    const k = keep[kind];
    if (k) Object.assign(txDraft, k);
  }
  pendingDraft = null;
  if (c) Object.assign(txDraft, { catId: c.id, subId });
  step = 'detail';
}

function cats() {
  return store.state.categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
}

// 最近使ったカテゴリ（新しい順に5つまで）
function recent() {
  const seen = new Set();
  const out = [];
  const list = store.state.txs.filter((x) => x.type === kind && x.catId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const x of list) {
    const key = `${x.catId}/${x.subId ?? ''}`;
    const c = store.get('categories', x.catId);
    if (seen.has(key) || !c || (x.subId && !c.subs.some((s) => s.id === x.subId))) continue;
    seen.add(key);
    out.push({ c, subId: x.subId });
    if (out.length >= 5) break;
  }
  return out;
}

export function renderRecord(root) {
  if (mode === 'record' && step === 'detail' && txDraft) return renderDetail(root);
  const top = h('header', { class: 'page-head' },
    seg([['record', t('rec.record')], ['reserve', t('rec.reserve')]], mode, (v) => {
      mode = v;
      closeKeypad();
      renderRecord(root);
    }, 'wide top-seg'));
  if (mode === 'reserve') {
    rsvDraft ??= newRsvDraft();
    setChildren(root, top, h('div', { class: 'card pad-card' }, rsvForm(rsvDraft, { onDone: () => {
      closeKeypad();
      rsvDraft = newRsvDraft(rsvDraft.type);
      toast(t('rec.reserved'));
    } })), h('div', { class: 'bottom-space' }));
    return;
  }
  if (step === 'subs') {
    const c = store.get('categories', catId);
    if (c) return renderSubs(root, c);
    step = 'list';
  }
  const kindSeg = h('div', { class: 'kind-pills' }, ['expense', 'income', 'transfer'].map((k) => h('button', {
    type: 'button',
    class: `kind-pill ${k} ${k === kind ? 'on' : ''}`,
    'aria-pressed': k === kind ? 'true' : 'false',
    onClick: () => {
      kind = k;
      // 振替はカテゴリがないので、すぐ詳細画面へ
      if (k === 'transfer') startDetail(null, null);
      renderRecord(root);
    },
  }, t(`kind.${k}`))));
  const rows = recent();
  const catRow = (c, subId = undefined) => h('button', {
    type: 'button',
    class: 'cat-line',
    onClick: () => {
      if (subId !== undefined || !c.subs.length) startDetail(c, subId ?? null);
      else {
        catId = c.id;
        step = 'subs';
      }
      renderRecord(root);
    },
  },
  h('span', { class: 'cat-emoji' }, catIcon(c)),
  h('span', { class: 'grow cat-text' },
    h('span', { class: 'cat-name ellipsis' }, subId !== undefined && subId ? `${c.name} › ${c.subs.find((s) => s.id === subId)?.name ?? ''}` : c.name),
    subId === undefined && c.subs.length ? h('span', { class: 'cat-subs ellipsis' }, c.subs.map((s) => s.name).join(', ')) : null),
  icon('chevron', { size: 20 }));

  setChildren(root,
    top,
    kindSeg,
    rows.length ? h('section', { class: 'cat-section' },
      h('button', { type: 'button', class: 'cat-section-head', 'aria-expanded': recentOpen ? 'true' : 'false', onClick: () => { recentOpen = !recentOpen; renderRecord(root); } },
        t('rec.recent'), icon(recentOpen ? 'up' : 'down', { size: 20 })),
      recentOpen ? rows.map((r) => catRow(r.c, r.subId)) : null) : null,
    h('section', { class: 'cat-section' },
      h('h2', { class: 'cat-section-head static' }, t('rec.all')),
      cats().map((c) => catRow(c))),
    h('div', { class: 'bottom-space' }));
}

function renderSubs(root, c) {
  const back = () => { step = 'list'; renderRecord(root); };
  setChildren(root,
    h('header', { class: 'detail-head-bar sub-head' },
      h('button', { type: 'button', class: 'back-pill', onClick: back }, icon('back', { size: 22 }), t('common.back')),
      h('h2', { class: 'detail-title' }, t('rec.subsOf', { name: c.name })),
      h('span', { class: 'back-space' })),
    h('section', { class: 'cat-section' },
      c.subs.map((s) => h('button', { type: 'button', class: 'cat-line', onClick: () => { startDetail(c, s.id); renderRecord(root); } },
        h('span', { class: 'cat-emoji' }, catIcon(c)),
        h('span', { class: 'grow cat-text' }, h('span', { class: 'cat-name ellipsis' }, s.name)),
        icon('chevron', { size: 20 }))),
      h('button', { type: 'button', class: 'cat-line settings-line', onClick: () => openCategoryEditor(c.id) },
        h('span', { class: 'cat-emoji muted' }, icon('gear', { size: 22 })),
        h('span', { class: 'grow cat-text' }, h('span', { class: 'cat-name' }, t('rec.subSettings'))),
        icon('chevron', { size: 20 }))),
    h('div', { class: 'bottom-space' }));
}

function renderDetail(root) {
  // 日付が変わったまま開きっぱなしのときに、今日の日付に合わせる
  if (txDraft.amount == null && txDraft.date < store.today()) txDraft.date = store.today();
  const back = () => {
    step = txDraft.type !== 'transfer' && store.get('categories', txDraft.catId)?.subs.length ? 'subs' : 'list';
    catId = txDraft.catId;
    if (txDraft.type === 'transfer') kind = 'expense';
    txDraft = null;
    renderRecord(root);
  };
  const page = h('div', { class: 'rec-page' }, txDetail(txDraft, {
    title: t(`rec.detail.${txDraft.type}`),
    onBack: back,
    onCategory: () => {
      // カテゴリを選び直す: 一覧に戻る（入力した金額などは残す）
      pendingDraft = txDraft;
      step = 'list';
      kind = txDraft.type;
      txDraft = null;
      renderRecord(root);
    },
    onDone: () => {
      keep[txDraft.type] = { accountId: txDraft.accountId, toAccountId: txDraft.toAccountId };
      const wasTransfer = txDraft.type === 'transfer';
      txDraft = null;
      step = 'list';
      if (wasTransfer) kind = 'expense';
      toast(t('rec.saved'));
    },
  }));
  setChildren(root, page);
}
