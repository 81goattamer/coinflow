// 画面の部品（DOM 生成、アイコン、シート、確認、メニュー、トースト）
import { t } from './i18n.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function setChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const ICONS = {
  home: 'M3 10.5L12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  chart: 'M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  card: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 10h20M6 15h4',
  piggy: 'M19 10c0-3.3-3.1-6-7-6S5 6.7 5 10c0 1.6.7 3 1.9 4.1L7 18h3v-2h4v2h3l.3-3.2c.6-.5 1-1 1.3-1.8H21v-3zM3 9c0 1 .8 1.5 2 1.5M15.5 9h.01',
  plus: 'M12 5v14M5 12h14',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  close: 'M18 6L6 18M6 6l12 12',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M20 6L9 17l-5-5',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  transfer: 'M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  briefcase: 'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 13h18',
  xcircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  handout: 'M7 11l5-5 5 5M12 6v12M5 21h14',
  handin: 'M7 13l5 5 5-5M12 18V6M5 3h14',
  minus: 'M5 12h14',
  out: 'M12 19V5M5 12l7-7 7 7',
  in: 'M12 5v14M19 12l-7 7-7-7',
  scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  backspace: 'M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9.5l-5 5M12 9.5l5 5',
  store: 'M3 9l1.5-5h15L21 9M3 9h18M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8M10 20v-5h4v5',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  building: 'M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 7h3M8 11h3M8 15h3',
  keyboard: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
};

export function icon(name, { size = 22 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  svg.classList.add('icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

// 追加ボタンのマーク: 下のマークの右上に、塗った丸の中を地の色で抜いた＋（COMMON-10）
export function addIcon(name, size = 26) {
  return h('span', { class: 'add-icon', style: { width: `${size}px`, height: `${size}px` } },
    icon(name, { size }),
    h('span', { class: 'add-badge' }, icon('plus', { size: 10 })));
}

export function iconButton(name, label, onClick, cls = '') {
  return h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onClick }, icon(name));
}

// ---- シート（下から出るパネル） ----

const openSheets = [];

// render を渡すとデータが変わるたびに作り直す。content を渡すと作り直さない（入力中のフォーム）
export function openSheet({ title, render, content, full = false, onClose, headerRight, bodyClass = '' }) {
  const body = h('div', { class: `sheet-body ${bodyClass}` });
  const titleEl = h('h2', { class: 'sheet-title' }, title ?? '');
  const right = h('div', { class: 'sheet-head-right' });
  const sheet = h('div', { class: `sheet ${full ? 'full' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-head' }, iconButton('close', t('common.close'), () => api.close()), titleEl, right),
    body);
  const backdrop = h('div', { class: 'backdrop', onClick: (e) => { if (e.target === backdrop) api.close(); } }, sheet);
  const api = {
    body,
    closed: false,
    setTitle(s) { titleEl.textContent = s; },
    refresh() {
      if (api.closed) return;
      right.replaceChildren(headerRight ? headerRight(api) ?? '' : '');
      if (!render) return;
      const y = body.scrollTop;
      const el = render(api);
      if (api.closed) return;
      body.replaceChildren(el);
      body.scrollTop = y;
    },
    close() {
      if (api.closed) return;
      api.closed = true;
      openSheets.splice(openSheets.indexOf(api), 1);
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 200);
      onClose?.();
      document.dispatchEvent(new Event('sheetclose'));
    },
  };
  openSheets.push(api);
  document.body.append(backdrop);
  if (content) body.append(typeof content === 'function' ? content(api) : content);
  api.refresh();
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return api;
}

export function refreshSheets() {
  for (const s of [...openSheets]) s.refresh();
}

export function closeAllSheets() {
  for (const s of [...openSheets]) s.close();
}

export function hasOpenSheet() {
  return openSheets.length > 0;
}

export function confirmDialog({ message, okLabel = t('common.ok'), danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      sheet.close();
      resolve(v);
    };
    const sheet = openSheet({
      title: '',
      onClose: () => finish(false),
      content: h('div', { class: 'confirm' },
        h('p', { class: 'confirm-msg' }, message),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onClick: () => finish(false) }, t('common.cancel')),
          h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => finish(true) }, okLabel))),
    });
  });
}

// 名前を1つ入れるダイアログ
export function promptDialog({ title, label, value = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'input', value, 'aria-label': label, placeholder: label, maxlength: 40 });
    const ok = h('button', { type: 'button', class: 'btn primary block', disabled: !value.trim(), onClick: () => finish(input.value.trim()) }, t('common.save'));
    input.addEventListener('input', () => { ok.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) finish(input.value.trim()); });
    const finish = (v) => {
      if (done) return;
      done = true;
      sheet.close();
      resolve(v);
    };
    const sheet = openSheet({ title, onClose: () => finish(null), content: h('div', { class: 'form' }, input, ok) });
    setTimeout(() => input.focus(), 250);
  });
}

export function actionMenu(title, items) {
  const sheet = openSheet({
    title,
    content: h('div', { class: 'menu' },
      items.filter(Boolean).map((it) => h('button', {
        type: 'button',
        class: `menu-item ${it.desc ? 'tall' : ''} ${it.danger ? 'danger' : ''}`,
        onClick: () => { sheet.close(); it.onClick(); },
      }, it.icon && icon(it.icon), it.desc ? h('span', {}, h('strong', {}, it.label), h('small', {}, it.desc)) : it.label))),
  });
  return sheet;
}

let toastTimer = null;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

export function empty(text, iconName = 'wallet') {
  return h('div', { class: 'empty' }, icon(iconName, { size: 40 }), h('p', {}, text));
}

// 切り替えボタン（セグメント）
export function seg(options, value, onChange, cls = '') {
  return h('div', { class: `seg ${cls}`, role: 'tablist' },
    options.map(([v, label]) => h('button', {
      type: 'button',
      role: 'tab',
      class: v === value ? 'on' : '',
      'aria-selected': v === value ? 'true' : 'false',
      onClick: () => onChange(v),
    }, label)));
}

export function field(label, ...control) {
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), ...control);
}

export function switchInput(checked, onChange, label) {
  return h('input', { type: 'checkbox', class: 'switch', checked, 'aria-label': label, onChange: (e) => onChange(e.target.checked) });
}

export function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
