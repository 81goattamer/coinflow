// 記録タブ（REC）。上の切り替えで「記録」と「予約」
import { store } from '../app-store.js';
import { t } from '../i18n.js';
import { closeKeypad } from '../keypad.js';
import { newRsvDraft, newTxDraft, rsvForm, txForm } from '../forms.js';
import { h, seg, setChildren, toast } from '../ui.js';

// 画面を作り直しても入力中の内容が消えないよう、下書きはここに持つ
let mode = 'record';
let txDraft = null;
let rsvDraft = null;

export function renderRecord(root) {
  txDraft ??= newTxDraft();
  rsvDraft ??= newRsvDraft();
  // 日付が変わったまま開きっぱなしのときに、今日の日付に合わせる
  if (txDraft.amount == null && !txDraft.id && txDraft.date < store.today()) txDraft.date = store.today();
  const body = mode === 'record'
    ? txForm(txDraft, { onDone: () => {
      closeKeypad();
      // 種類と口座は残す（REC-13）
      const keep = { type: txDraft.type, accountId: txDraft.accountId, toAccountId: txDraft.toAccountId };
      txDraft = Object.assign(newTxDraft(), keep);
      toast(t('rec.saved'));
    } })
    : rsvForm(rsvDraft, { onDone: () => {
      closeKeypad();
      rsvDraft = newRsvDraft(rsvDraft.type);
      toast(t('rec.reserved'));
    } });
  setChildren(root,
    h('header', { class: 'page-head' },
      seg([['record', t('rec.record')], ['reserve', t('rec.reserve')]], mode, (v) => {
        mode = v;
        closeKeypad();
        renderRecord(root);
      }, 'wide top-seg')),
    h('div', { class: 'card pad-card' }, body),
    h('div', { class: 'bottom-space' }));
}
