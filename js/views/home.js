// ホーム（HOME）
import { store } from '../app-store.js';
import { fmtDate, t, yen } from '../i18n.js';
import { accIcon } from '../forms.js';
import { TYPE_ORDER, activeAccounts, balances, bellItems, cardStatus, totalBalance } from '../ledger.js';
import { openAccountDetail, openAccountForm, openBell } from '../sheets.js';
import { addIcon, empty, h, icon, setChildren } from '../ui.js';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function renderHome(root) {
  const state = store.state;
  const today = store.today();
  const bal = balances(state);
  const bell = bellItems(state, today);
  const accounts = activeAccounts(state);
  const total = totalBalance(state, bal);

  const cards = TYPE_ORDER.flatMap((type) => accounts.filter((a) => a.type === type)).map((a) => {
    let body;
    if (a.type === 'card') {
      const s = cardStatus(state, a, today, bal);
      body = [
        h('span', { class: 'acc-amount' }, yen(s.unpaid)),
        h('span', { class: 'acc-next' }, s.payDate ? `${t('home.next', { date: fmtDate(s.payDate, { year: false, week: false }) })} ${yen(s.amount)}` : ''),
      ];
    } else {
      body = [h('span', { class: `acc-amount ${bal.get(a.id) < 0 ? 'neg' : ''}` }, yen(bal.get(a.id)))];
    }
    return h('button', { type: 'button', class: `acc-card t-${a.type}`, onClick: () => openAccountDetail(a.id) },
      h('span', { class: 'acc-head' }, accIcon(a, 26), h('span', { class: 'acc-name ellipsis' }, a.name)),
      body);
  });

  setChildren(root,
    h('header', { class: 'home-head' },
      h('div', { class: 'grow' },
        h('div', { class: 'total-label' }, t('home.total')),
        h('div', { class: `total ${total < 0 ? 'neg' : ''}` }, yen(total))),
      h('button', { type: 'button', class: 'icon-btn bell-btn', 'aria-label': `${t('home.bell')}${bell.count ? ` (${bell.count})` : ''}`, onClick: openBell },
        icon('bell', { size: 24 }),
        bell.count ? h('span', { class: 'badge' }, bell.count > 99 ? '99+' : bell.count) : null)),
    !isStandalone() && !state.settings.installHintClosed
      ? h('div', { class: 'install-hint' }, icon('download', { size: 18 }), h('span', { class: 'grow small' }, t('home.installHint')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.close'), onClick: () => store.setSettings({ installHintClosed: true }) }, icon('close', { size: 18 })))
      : null,
    cards.length ? h('div', { class: 'acc-grid' }, cards) : empty(t('home.empty'), 'wallet'),
    h('div', { class: 'fab-space' }),
    h('button', { type: 'button', class: 'fab', 'aria-label': t('home.addAccount'), title: t('home.addAccount'), onClick: () => openAccountForm() }, addIcon('wallet')));
}
