// 計算キーボード（COMMON-03）。並びは
//   7 8 9 ÷ / 4 5 6 × / 1 2 3 − / 00 0 C + / [左のボタン] [OK] [⌫]
// 入力中は式のまま表示し、OK で計算して確定する。小数は扱わない（OV-05）。
// 記録の詳細画面ではキーボードを画面の下半分に置いたままにし（embeddedPad）、
// ほかの金額欄（amountInput）では押したときだけ画面の下に出す。
import { evaluate, hasOperator, pressKey } from './calc.js';
import { t, yen } from './i18n.js';
import { h, icon } from './ui.js';

const ROWS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['00', '0', 'C', '+'],
];
const KEY_MAP = { Backspace: '⌫', Enter: 'ok', Escape: 'close', '*': '×', '/': '÷', '-': '−', '+': '+', c: 'C', C: 'C', Delete: 'C' };

// キーの並び。left は左下のボタン（要素）
export function keyGrid({ onKey, left }) {
  const grid = h('div', { class: 'keys' },
    ROWS.flat().map((k) => h('button', {
      type: 'button',
      class: `key ${'+−×÷'.includes(k) ? 'op' : ''} ${k === 'C' ? 'fn' : ''}`,
      'aria-label': k,
      'data-key': k,
      onClick: () => onKey(k),
    }, k)),
    left,
    h('button', { type: 'button', class: 'key ok', 'data-key': 'ok', onClick: () => onKey('ok') }, 'OK'),
    h('button', { type: 'button', class: 'key bs', 'data-key': '⌫', 'aria-label': '⌫', onClick: () => onKey('⌫') }, icon('backspace', { size: 30 })));
  // キーを押してもフォーカスや選択が動かないようにする
  grid.addEventListener('pointerdown', (e) => e.preventDefault());
  return grid;
}

// 金額を入れる先（式・値・表示）。text は表示する要素
export function amountTarget({ value = null, text, onChange, placeholder = '0' }) {
  const tg = {
    expr: value == null ? '' : String(value),
    value,
    editing: false,
    show() {
      const showExpr = tg.editing && tg.expr !== '' && (hasOperator(tg.expr) || tg.expr !== String(tg.value));
      text.textContent = showExpr ? tg.expr : tg.editing && tg.expr === '' ? placeholder : tg.value == null ? placeholder : yen(tg.value);
      text.classList.toggle('placeholder', showExpr ? false : tg.editing ? tg.expr === '' : tg.value == null);
      text.classList.toggle('expr', showExpr && hasOperator(tg.expr));
    },
    press(k) {
      tg.expr = pressKey(tg.expr, k);
      tg.show();
      // 確定前でも、保存ボタンを押せるかが分かるよう今の値を伝える
      onChange?.(evaluate(tg.expr));
    },
    commit() {
      const v = evaluate(tg.expr);
      tg.value = v;
      tg.expr = v == null ? '' : String(v);
      tg.show();
      onChange?.(v);
      return v;
    },
    set(v) {
      tg.value = v;
      tg.expr = v == null ? '' : String(v);
      tg.show();
    },
  };
  tg.show();
  return tg;
}

// ---- 画面に置いたままのキーボード（記録の詳細画面） ----

// target を差し替えながら使う。onOk(target) は OK を押したとき
export function embeddedPad({ getTarget, onOk, left }) {
  const pad = h('div', { class: 'keypad embedded' }, keyGrid({
    left,
    onKey: (k) => {
      const tg = getTarget();
      if (!tg) return;
      if (k === 'ok') onOk(tg);
      else tg.press(k);
    },
  }));
  return pad;
}

// ---- 押したときだけ出るキーボード（ほかの金額欄） ----

let pad = null;
let active = null; // 今キーボードにつながっている入力欄
let closing = null; // 外を押して、指を離したら閉じる入力欄
let keysBound = false;

function ensurePad() {
  if (pad) return pad;
  pad = h('div', { class: 'keypad floating', role: 'group', 'aria-label': t('common.amount') }, keyGrid({
    left: h('button', { type: 'button', class: 'key side', 'data-key': 'close', 'aria-label': t('common.close'), onClick: () => closeKeypad() }, icon('down', { size: 26 })),
    onKey: (k) => {
      if (!active) return;
      if (k === 'ok') closeKeypad();
      else active.target.press(k);
    },
  }));
  document.body.append(pad);
  // その場で閉じると画面の高さが変わって押したボタンがずれ、押せなくなる。
  // そのため押したときは値だけ確定し、指を離して click が終わってから閉じる
  document.addEventListener('pointerdown', (e) => {
    if (!active || pad.contains(e.target) || active.el.contains(e.target)) return;
    active.target.commit();
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
  return pad;
}

// 外付けのキーボードからも入れられるようにする（どちらのキーボードにも効く）
let hardwareTarget = null;
export function setHardwareTarget(fn) {
  hardwareTarget = fn;
}
function bindKeys() {
  if (keysBound) return;
  keysBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea, select')) return;
    const k = /^[0-9]$/.test(e.key) ? e.key : KEY_MAP[e.key];
    if (!k) return;
    if (active) {
      e.preventDefault();
      if (k === 'ok' || k === 'close') closeKeypad();
      else active.target.press(k);
    } else if (hardwareTarget) {
      const handled = hardwareTarget(k);
      if (handled) e.preventDefault();
    }
  });
}
bindKeys();

function setPadHeight(px) {
  document.documentElement.style.setProperty('--pad', `${px}px`);
}

export function closeKeypad() {
  if (!active) return;
  const a = active;
  active = null;
  a.el.classList.remove('editing');
  a.target.editing = false;
  a.target.commit();
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
  field.target.editing = true;
  field.target.show();
  pad.classList.add('show');
  requestAnimationFrame(() => {
    // キーボードの上端から画面の下までを縮める（タブバーの上に出すため、その分も含む）
    setPadHeight(pad.offsetHeight + (parseFloat(getComputedStyle(pad).bottom) || 0));
    requestAnimationFrame(() => field.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });
}

// 金額の入力欄。value は整数か null。値が変わるたびに onChange(value) を呼ぶ
export function amountInput({ value = null, onChange, label = t('common.amount'), big = false, placeholder = '0', autoOpen = false }) {
  const text = h('span', { class: 'amount-text' });
  const el = h('button', { type: 'button', class: `amount-field ${big ? 'big' : ''}`, 'aria-label': label }, text);
  const field = { el, target: amountTarget({ value, text, onChange, placeholder }) };
  el.addEventListener('click', () => openKeypad(field));
  el.setValue = (v) => field.target.set(v);
  el.getValue = () => (active === field ? evaluate(field.target.expr) : field.target.value);
  if (autoOpen) setTimeout(() => { if (document.body.contains(el)) openKeypad(field); }, 50);
  return el;
}
