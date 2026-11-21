// 金額の入力欄と計算キーボード（COMMON-03）。
// 入力欄を押すと画面の下半分にキーボードを出し、その高さを --pad に入れてスクロール領域とシートを縮める（style.css）。
// 入力中は式のまま表示し、＝・完了・キーボードの外を押したときに計算して確定する。
import { evaluate, hasOperator, pressKey } from './calc.js';
import { t, yen } from './i18n.js';
import { h, icon } from './ui.js';

const KEYS = [
  ['C', '⌫', '÷', '×'],
  ['7', '8', '9', '−'],
  ['4', '5', '6', '+'],
  ['1', '2', '3', '='],
  ['0', '00', 'done'],
];

let pad = null;
let active = null; // 今キーボードにつながっている入力欄
let closing = null; // 外を押して、指を離したら閉じる入力欄

function ensurePad() {
  if (pad) return pad;
  pad = h('div', { class: 'keypad', role: 'group', 'aria-label': t('common.amount') },
    KEYS.flat().map((k) => h('button', {
      type: 'button',
      class: `key ${'+−×÷='.includes(k) ? 'op' : ''} ${k === 'done' ? 'done' : ''} ${k === 'C' || k === '⌫' ? 'fn' : ''}`,
      'aria-label': k === 'done' ? t('key.done') : k,
      'data-key': k,
      onClick: () => press(k),
    }, k === 'done' ? icon('down', { size: 24 }) : k === '⌫' ? h('span', { class: 'bs' }, '⌫') : k)));
  // キーを押してもフォーカスや選択が動かないようにする
  pad.addEventListener('pointerdown', (e) => e.preventDefault());
  document.body.append(pad);
  // キーボードの外を押したら確定して閉じる。押したのが別の金額欄なら、その欄の click で開き直す
  // その場で閉じると画面の高さが変わって押したボタンがずれ、押せなくなる。
  // そのため押したときは値だけ確定し、指を離して click が終わってから閉じる
  document.addEventListener('pointerdown', (e) => {
    if (!active || pad.contains(e.target) || active.el.contains(e.target)) return;
    active.commit();
    closing = active;
  }, true);
  document.addEventListener('pointerup', () => {
    if (!closing) return;
    const f = closing;
    closing = null;
    setTimeout(() => { if (active === f) closeKeypad(); }, 0);
  }, true);
  document.addEventListener('sheetclose', () => {
    if (active && !document.body.contains(active.el)) closeKeypad();
  });
  // 外付けのキーボードからも入れられるようにする
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    const map = { Backspace: '⌫', Escape: 'done', Enter: 'done', '*': '×', '/': '÷', '-': '−', '+': '+', '=': '=' };
    const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
    if (k) {
      e.preventDefault();
      press(k);
    }
  });
  return pad;
}

function press(k) {
  if (!active) return;
  if (k === 'done') {
    closeKeypad();
    return;
  }
  if (k === '=') {
    active.commit();
    return;
  }
  active.expr = pressKey(active.expr, k);
  active.show();
  // 確定前でも、保存ボタンを押せるかが分かるよう今の値を伝える
  active.onChange?.(evaluate(active.expr));
}

function setPadHeight(px) {
  document.documentElement.style.setProperty('--pad', `${px}px`);
}

export function closeKeypad() {
  if (!active) return;
  const a = active;
  active = null;
  a.el.classList.remove('editing');
  a.commit();
  pad?.classList.remove('show');
  setPadHeight(0);
}

function openKeypad(field) {
  if (active === field) return;
  if (active) closeKeypad();
  ensurePad();
  document.activeElement?.blur?.();
  active = field;
  field.el.classList.add('editing');
  pad.classList.add('show');
  requestAnimationFrame(() => {
    // キーボードの上端から画面の下までを縮める（タブバーの上に出すため、その分も含む）
    setPadHeight(pad.offsetHeight + (parseFloat(getComputedStyle(pad).bottom) || 0));
    requestAnimationFrame(() => field.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });
}

// 金額の入力欄。value は整数か null。確定するたびに onChange(value) を呼ぶ
export function amountInput({ value = null, onChange, label = t('common.amount'), big = false, placeholder = '0', autoOpen = false }) {
  const text = h('span', { class: 'amount-text' });
  const el = h('button', { type: 'button', class: `amount-field ${big ? 'big' : ''}`, 'aria-label': label }, text);
  const field = {
    el,
    onChange,
    expr: value == null ? '' : String(value),
    value,
    show() {
      const editing = active === field;
      if (editing && (field.expr === '' || hasOperator(field.expr) || field.expr !== String(field.value))) {
        text.textContent = field.expr || placeholder;
        text.classList.toggle('placeholder', !field.expr);
        el.classList.toggle('expr', hasOperator(field.expr));
        return;
      }
      el.classList.remove('expr');
      text.textContent = field.value == null ? placeholder : yen(field.value);
      text.classList.toggle('placeholder', field.value == null);
    },
    commit() {
      const v = evaluate(field.expr);
      field.value = v;
      field.expr = v == null ? '' : String(v);
      field.show();
      onChange?.(v);
    },
  };
  el.addEventListener('click', () => openKeypad(field));
  el.setValue = (v) => {
    field.value = v;
    field.expr = v == null ? '' : String(v);
    field.show();
  };
  el.getValue = () => (active === field ? evaluate(field.expr) : field.value);
  field.show();
  if (autoOpen) setTimeout(() => { if (document.body.contains(el)) openKeypad(field); }, 50);
  return el;
}
