// 日付の計算。日付は 'YYYY-MM-DD'、月は 'YYYY-MM' の文字列で扱う。DOM に依存しない
export const pad = (n) => String(n).padStart(2, '0');

const toKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// 1日は午前4時で変わる（COMMON-05）
export function todayKey(now = Date.now()) {
  const d = new Date(now - 4 * 3600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowTime(now = Date.now()) {
  const d = new Date(now);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isDateKey(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toKey(fromKey(v)) === v;
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

export function weekday(key) {
  return fromKey(key).getUTCDay();
}

export function monthOf(key) {
  return key.slice(0, 7);
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// その月の n 日。n が月の日数より大きいときと 'end' は月末
export function dayInMonth(month, day) {
  const last = daysInMonth(month);
  const d = day === 'end' ? last : Math.min(Number(day), last);
  return `${month}-${pad(d)}`;
}

// ---- 祝日（COMMON-04） ----

function nthMonday(y, m, n) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const day = 1 + ((8 - first) % 7) + (n - 1) * 7;
  return `${y}-${pad(m)}-${pad(day)}`;
}

const holidayCache = new Map();

export function holidaysOf(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const set = new Set();
  const add = (m, d) => set.add(`${y}-${pad(m)}-${pad(d)}`);
  add(1, 1);
  add(2, 11);
  if (y >= 2020) add(2, 23);
  add(4, 29);
  add(5, 3);
  add(5, 4);
  add(5, 5);
  if (y >= 2016) add(8, 11);
  add(11, 3);
  add(11, 23);
  set.add(nthMonday(y, 1, 2));
  set.add(nthMonday(y, 7, 3));
  set.add(nthMonday(y, 9, 3));
  set.add(nthMonday(y, 10, 2));
  const k = y - 1980;
  add(3, Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4)));
  add(9, Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4)));
  // 振替休日: 日曜の祝日の後の、祝日でない最初の日
  for (const key of [...set].sort()) {
    if (weekday(key) !== 0) continue;
    let d = addDays(key, 1);
    while (set.has(d)) d = addDays(d, 1);
    set.add(d);
  }
  // 国民の休日: 祝日に挟まれた平日
  for (const key of [...set]) {
    const mid = addDays(key, 1);
    if (!set.has(mid) && set.has(addDays(key, 2)) && weekday(mid) !== 0) set.add(mid);
  }
  holidayCache.set(y, set);
  return set;
}

export function isHoliday(key) {
  const w = weekday(key);
  return w === 0 || w === 6 || holidaysOf(Number(key.slice(0, 4))).has(key);
}

// 休日のときにずらす（'prev' 前の平日、'next' 次の平日、'none' ずらさない）
export function shiftDate(key, how) {
  if (how !== 'prev' && how !== 'next') return key;
  const step = how === 'prev' ? -1 : 1;
  let d = key;
  for (let i = 0; i < 30 && isHoliday(d); i++) d = addDays(d, step);
  return d;
}
