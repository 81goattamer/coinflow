// 分析タブ（ANA）。月の支出・収入の合計、カテゴリ別の円グラフ、日別の棒グラフ
import { store } from '../app-store.js';
import { addMonths, daysInMonth, monthOf } from '../dates.js';
import { fmtMonth, t, yen } from '../i18n.js';
import { REPAY_CAT, analyze } from '../ledger.js';
import { catLabel } from '../forms.js';
import { empty, h, iconButton, seg, setChildren } from '../ui.js';

let month = null;
let kind = 'expense';
const SLOTS = 7; // 色を付けるカテゴリの数。それ以外は灰色の「その他」にまとめる

const ns = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of kids) if (c) el.append(c);
  return el;
}

export function renderAnalysis(root) {
  month ??= monthOf(store.today());
  const a = analyze(store.live, month);
  const diff = a.income - a.expense;

  setChildren(root,
    h('header', { class: 'page-head month-nav' },
      iconButton('back', t('ana.prev'), () => { month = addMonths(month, -1); renderAnalysis(root); }),
      h('h1', { class: 'grow center month-title' }, fmtMonth(month)),
      iconButton('chevron', t('ana.next'), () => { month = addMonths(month, 1); renderAnalysis(root); })),
    h('div', { class: 'tiles' },
      tile(t('ana.expense'), yen(a.expense), 'expense'),
      tile(t('ana.income'), yen(a.income), 'income'),
      tile(t('ana.diff'), yen(diff, { sign: true }), diff < 0 ? 'neg' : 'diff')),
    seg([['expense', t('ana.expense')], ['income', t('ana.income')]], kind, (v) => { kind = v; renderAnalysis(root); }, `wide kind-seg ${kind}`),
    a[kind] > 0 ? [categoryCard(a), dayCard(a)] : empty(t('ana.empty'), 'chart'));
}

function tile(label, value, cls) {
  return h('div', { class: `tile card ${cls}` }, h('span', { class: 'tile-label' }, label), h('span', { class: 'tile-value' }, value));
}

// カテゴリ別（色はカテゴリの並び順で決め、金額の順位では変えない）
function categoryCard(a) {
  const cats = kind === 'expense' ? a.expCats : a.incCats;
  const ordered = store.state.categories.filter((c) => c.kind === kind).sort((x, y) => x.order - y.order);
  const slotOf = new Map(ordered.slice(0, SLOTS).map((c, i) => [c.id, i + 1]));
  const items = [...cats.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v, slot: slotOf.get(id) ?? 0, label: id === REPAY_CAT ? t('cat.repay') : catLabel(id) }))
    .sort((x, y) => y.v - x.v);
  const total = items.reduce((s, x) => s + x.v, 0);
  // 円グラフ: 色の付いたカテゴリ＋灰色の「その他」
  const slices = items.filter((x) => x.slot);
  const rest = items.filter((x) => !x.slot).reduce((s, x) => s + x.v, 0);
  if (rest) slices.push({ id: '__rest', v: rest, slot: 0, label: t('ana.other') });
  const readout = h('div', { class: 'chart-readout' }, yen(total));
  const R = 70;
  const r = 44;
  const pie = svg('svg', { viewBox: '0 0 160 160', width: 160, height: 160, class: 'donut', role: 'img', 'aria-label': t('ana.byCategory') });
  let ang = -Math.PI / 2;
  const pt = (rad, a2) => `${80 + rad * Math.cos(a2)} ${80 + rad * Math.sin(a2)}`;
  for (const s of slices) {
    const sweep = (s.v / total) * Math.PI * 2;
    const end = ang + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const d = slices.length === 1
      ? `M ${pt(R, ang)} A ${R} ${R} 0 1 1 ${pt(R, ang + Math.PI)} A ${R} ${R} 0 1 1 ${pt(R, ang)} M ${pt(r, ang)} A ${r} ${r} 0 1 0 ${pt(r, ang + Math.PI)} A ${r} ${r} 0 1 0 ${pt(r, ang)} Z`
      : `M ${pt(R, ang)} A ${R} ${R} 0 ${large} 1 ${pt(R, end)} L ${pt(r, end)} A ${r} ${r} 0 ${large} 0 ${pt(r, ang)} Z`;
    const path = svg('path', { d, class: `donut-seg s${s.slot}`, 'fill-rule': 'evenodd', tabindex: '0' });
    const show = () => { readout.textContent = `${s.label} · ${yen(s.v)} · ${Math.round((s.v / total) * 100)}%`; };
    path.addEventListener('pointerenter', show);
    path.addEventListener('click', show);
    path.addEventListener('focus', show);
    pie.append(path);
    ang = end;
  }
  return h('section', { class: 'card chart-card' },
    h('h2', { class: 'chart-title' }, t('ana.byCategory')),
    readout,
    h('div', { class: 'share' }, pie,
      h('div', { class: 'legend' }, items.map((x) => h('div', { class: 'legend-row' },
        h('span', { class: `dot s${x.slot}` }),
        h('span', { class: 'grow ellipsis' }, x.label),
        h('span', { class: 'legend-amt' }, yen(x.v)),
        h('span', { class: 'legend-pct' }, `${Math.round((x.v / total) * 100)}%`))))));
}

// 日別の棒グラフ（1系列なので凡例はなし。見出しが系列名）
function dayCard(a) {
  const days = daysInMonth(month);
  const vals = (kind === 'expense' ? a.expDays : a.incDays).slice(1, days + 1);
  const max = Math.max(...vals, 1);
  const W = 320;
  const H = 150;
  const top = 10;
  const bottom = 18;
  const left = 4;
  const bw = (W - left * 2) / days;
  const readout = h('div', { class: 'chart-readout' }, '');
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': t('ana.byDay') });
  chart.append(svg('line', { x1: left, x2: W - left, y1: H - bottom, y2: H - bottom, class: 'grid' }));
  vals.forEach((v, i) => {
    const x = left + i * bw;
    const g = svg('g', { class: 'bar-col' });
    if (v > 0) {
      const bh = Math.max(2, ((H - top - bottom) * v) / max);
      const w = Math.max(2, bw - 2);
      const rad = Math.min(3, w / 2);
      const y = H - bottom - bh;
      // 上の端だけ丸める
      g.append(svg('path', { class: `bar ${kind}`, d: `M ${x + 1} ${H - bottom} V ${y + rad} Q ${x + 1} ${y} ${x + 1 + rad} ${y} H ${x + 1 + w - rad} Q ${x + 1 + w} ${y} ${x + 1 + w} ${y + rad} V ${H - bottom} Z` }));
    }
    if (i === 0 || (i + 1) % 5 === 0) g.append(svg('text', { x: x + bw / 2, y: H - 4, class: 'axis', 'text-anchor': 'middle' }, document.createTextNode(String(i + 1))));
    const hit = svg('rect', { x, y: 0, width: bw, height: H, class: 'hit' });
    const show = () => {
      readout.textContent = t('ana.dayValue', { d: i + 1, amt: yen(v) });
      chart.querySelectorAll('.bar-col.on').forEach((n) => n.classList.remove('on'));
      g.classList.add('on');
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('click', show);
    g.append(hit);
    chart.append(g);
  });
  return h('section', { class: 'card chart-card' }, h('h2', { class: 'chart-title' }, t('ana.byDay')), readout, chart);
}
