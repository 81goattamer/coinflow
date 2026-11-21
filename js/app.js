import { store } from './app-store.js';
import { detectLang, setLang, t } from './i18n.js';
import { initKeyboard } from './keyboard.js';
import { closeKeypad } from './keypad.js';
import { bellItems, dueCardPayments } from './ledger.js';
import { openPaySheet } from './sheets.js';
import { closeAllSheets, h, icon, refreshSheets, toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderRecord } from './views/record.js';
import { renderHistory } from './views/history.js';
import { renderAnalysis } from './views/analysis.js';
import { renderSettings } from './views/settings.js';

// 左から ホーム・記録・履歴・分析・設定（COMMON-01）
const TABS = [
  { id: 'home', icon: 'home', render: renderHome },
  { id: 'record', icon: 'pencil', render: renderRecord },
  { id: 'history', icon: 'history', render: renderHistory },
  { id: 'analysis', icon: 'chart', render: renderAnalysis },
  { id: 'settings', icon: 'gear', render: renderSettings },
];

// 起動時は記録タブ（COMMON-02）
let current = 'record';

const viewEl = document.querySelector('#view');
const navEl = document.querySelector('#nav');
const scroller = document.querySelector('#scroller');

function goTab(id) {
  closeKeypad();
  if (id === current) {
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  current = id;
  closeAllSheets();
  render();
  scroller.scrollTo(0, 0);
}

function renderNav() {
  const count = bellItems(store.state, store.today()).count;
  navEl.replaceChildren(...TABS.map((tab) => h('button', {
    type: 'button',
    class: `tab ${tab.id === current ? 'on' : ''}`,
    'aria-current': tab.id === current ? 'page' : null,
    onClick: () => goTab(tab.id),
  }, h('span', { class: 'tab-icon' }, icon(tab.icon, { size: 24 }), tab.id === 'home' && count ? h('span', { class: 'nav-badge' }, count) : null), h('span', {}, t(`tab.${tab.id}`)))));
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const dark = theme === 'dark' || (theme === 'auto' && m.media.includes('dark'));
    m.content = dark ? '#000000' : '#f2f2f7';
  });
}

function render() {
  const st = store.state.settings;
  setLang(st.language === 'auto' ? detectLang() : st.language);
  applyTheme(st.theme);
  const y = scroller.scrollTop;
  TABS.find((x) => x.id === current).render(viewEl);
  renderNav();
  scroller.scrollTop = y;
}

// 変更は1回の操作が終わってからまとめて反映する
let pending = false;
store.subscribe(() => {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    render();
    refreshSheets();
  });
});

store.repo.onError = () => toast(t('storage.error'));
initKeyboard();
render();

// 支払日が来たカードの確認を、1件ずつ順に出す（CARD-01）。「あとで」を押したカードはこの回は出さない
let payQueueRunning = false;
function askPayments() {
  if (payQueueRunning) return;
  const later = new Set();
  const next = () => {
    const due = dueCardPayments(store.state, store.today()).find((x) => !later.has(x.account.id));
    if (!due) {
      payQueueRunning = false;
      return;
    }
    payQueueRunning = true;
    const sheet = openPaySheet(due.account.id, { onDone: (paid) => {
      if (!paid) later.add(due.account.id);
      setTimeout(next, 250);
    } });
    if (!sheet) {
      later.add(due.account.id);
      next();
    }
  };
  next();
}
askPayments();

// 新しい版の確認（COMMON-11）。公開中の version.js と、今動いている版を比べる
async function checkUpdate() {
  if (location.protocol === 'file:' || document.querySelector('.update-bar')) return;
  try {
    const res = await fetch(`./version.js?t=${Date.now()}`, { cache: 'no-store' });
    const latest = /APP_VERSION\s*=\s*'([^']+)'/.exec(await res.text())?.[1];
    if (res.ok && latest && latest !== self.APP_VERSION) {
      document.body.append(h('button', { type: 'button', class: 'update-bar', onClick: () => location.reload() },
        icon('download', { size: 18 }), t('update.available')));
    }
  } catch {
    // オフラインなら何もしない
  }
}
checkUpdate();

// 画面に戻ったら日付が変わっているかもしれないので描き直し、支払いと新しい版を確かめる
let lastDay = store.today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (store.today() !== lastDay) {
    lastDay = store.today();
    render();
    askPayments();
  }
  checkUpdate();
});

navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
