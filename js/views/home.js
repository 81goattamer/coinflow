// ホーム（HOME）
import { store } from '../app-store.js';
import { fmtDate, t, yen } from '../i18n.js';
import { TYPE_ICON, accIcon } from '../forms.js';
import { TYPE_ORDER, activeAccounts, balances, bellItems, cardStatus, totalBalance, unpaidOf } from '../ledger.js';
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

  const cardOf = (a) => {
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
  };
  // 種類ごと（資金・クレジットカード・貯金）に分けて並べる。見出しの右は合計
  const groups = TYPE_ORDER.map((type) => {
    const list = accounts.filter((a) => a.type === type);
    if (!list.length) return null;
    const sum = type === 'card' ? list.reduce((s, a) => s + unpaidOf(bal, a.id), 0) : list.reduce((s, a) => s + bal.get(a.id), 0);
    return h('section', { class: 'acc-group' },
      h('h2', { class: 'acc-group-head' }, icon(TYPE_ICON[type], { size: 18 }), h('span', { class: 'grow' }, t(`type.${type}`)), h('span', { class: 'acc-group-sum' }, yen(sum))),
      h('div', { class: 'acc-grid' }, list.map(cardOf)));
  }).filter(Boolean);

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
    groups.length ? groups : empty(t('home.empty'), 'wallet'),
    h('div', { class: 'fab-space' }),
    h('button', { type: 'button', class: 'fab', 'aria-label': t('home.addAccount'), title: t('home.addAccount'), onClick: () => openAccountForm() }, addIcon('wallet')));
}
