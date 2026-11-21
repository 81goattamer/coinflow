// 設定タブ（SET）。iPhone の設定アプリのようなリスト型
import { store } from '../app-store.js';
import { t } from '../i18n.js';
import { TYPE_ICON, accIcon } from '../forms.js';
import { TYPE_ORDER } from '../ledger.js';
import { openAccountForm } from '../sheets.js';
import {
  actionMenu, confirmDialog, downloadFile, empty, h, icon, iconButton, openSheet, promptDialog, seg, setChildren, toast,
} from '../ui.js';

function group(title, ...rows) {
  return h('section', { class: 'group' }, title ? h('h2', { class: 'group-label' }, title) : null, h('div', { class: 'card list' }, rows));
}

function row(iconName, label, control) {
  return h('div', { class: 'set-row' }, h('span', { class: 'set-icon' }, icon(iconName, { size: 18 })), h('span', { class: 'grow' }, label), control);
}

function navRow(iconName, label, onClick, value = '') {
  return h('button', { type: 'button', class: 'set-row nav', onClick },
    h('span', { class: 'set-icon' }, icon(iconName, { size: 18 })),
    h('span', { class: 'grow' }, label),
    value !== '' ? h('span', { class: 'muted' }, value) : null,
    icon('chevron', { size: 18 }));
}

export function renderSettings(root) {
  const st = store.state.settings;
  const live = store.state.accounts.filter((a) => !a.deleted).length;
  const deleted = store.state.accounts.filter((a) => a.deleted).length;
  setChildren(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('settings.title'))),
    group(t('settings.general'),
      row('globe', t('settings.lang'), seg([['auto', t('settings.auto')], ['ja', '日本語'], ['en', 'English']], st.language, (v) => store.setSettings({ language: v }), 'small')),
      row('moon', t('settings.theme'), seg([['auto', t('settings.auto')], ['light', t('settings.light')], ['dark', t('settings.dark')]], st.theme, (v) => store.setSettings({ theme: v }), 'small'))),
    group(t('settings.money'),
      navRow('wallet', t('settings.accounts'), openAccounts, live),
      navRow('trash', t('settings.deleted'), openDeleted, deleted),
      navRow('tag', t('settings.categories'), openCategories)),
    group(t('settings.data'), navRow('download', t('settings.backup'), openBackup)),
    h('p', { class: 'muted small pad' }, t('settings.storageNote')),
    h('p', { class: 'muted small center' }, `Coin Flow v${self.APP_VERSION}`));
}

// ---- 口座の一覧（SET-02、ACC-24） ----

function openAccounts() {
  openSheet({
    title: t('settings.accounts'),
    full: true,
    headerRight: () => iconButton('plus', t('acc.new'), () => openAccountForm()),
    render: () => {
      const live = store.state.accounts.filter((a) => !a.deleted);
      if (!live.length) return empty(t('home.empty'), 'wallet');
      return h('div', {}, TYPE_ORDER.map((type) => {
        const list = live.filter((a) => a.type === type).sort((a, b) => a.order - b.order);
        if (!list.length) return null;
        return h('section', { class: 'group' },
          h('h3', { class: 'group-label with-icon' }, icon(TYPE_ICON[type], { size: 16 }), t(`type.${type}`)),
          h('div', { class: 'card list' }, list.map((a, i) => h('div', { class: 'manage-row' },
            h('button', { type: 'button', class: 'grow manage-name', onClick: () => openAccountForm(a) }, accIcon(a, 26), h('span', { class: 'ellipsis' }, a.name)),
            iconButton('up', t('common.up'), () => store.moveAccount(a.id, -1), i === 0 ? 'ghost' : ''),
            iconButton('down', t('common.down'), () => store.moveAccount(a.id, 1), i === list.length - 1 ? 'ghost' : '')))));
      }));
    },
  });
}

// ---- 削除済みの口座（SET-03、ACC-31） ----

function openDeleted() {
  openSheet({
    title: t('settings.deleted'),
    render: () => {
      const list = store.state.accounts.filter((a) => a.deleted);
      if (!list.length) return empty(t('settings.noDeleted'), 'trash');
      return h('div', { class: 'card list' }, list.map((a) => h('div', { class: 'manage-row' },
        accIcon(a, 26),
        h('span', { class: 'grow ellipsis' }, a.name),
        h('button', { type: 'button', class: 'text-btn', onClick: () => { store.restoreAccount(a.id); toast(t('acc.restored')); } }, icon('undo', { size: 16 }), t('common.restore')))));
    },
  });
}

// ---- カテゴリ（SET-01） ----

let catKind = 'expense';

function openCategories() {
  openSheet({
    title: t('settings.categories'),
    full: true,
    render: (api) => {
      const cats = store.state.categories.filter((c) => c.kind === catKind).sort((a, b) => a.order - b.order);
      return h('div', {},
        seg([['expense', t('kind.expense')], ['income', t('kind.income')]], catKind, (v) => { catKind = v; api.refresh(); }, `wide kind-seg ${catKind}`),
        cats.map((c) => h('section', { class: 'card list cat-block' },
          h('div', { class: 'manage-row cat-row' },
            icon('tag', { size: 18 }),
            h('span', { class: 'grow strong ellipsis' }, c.name),
            iconButton('more', t('common.more'), () => actionMenu(c.name, [
              { label: t('cat.addSub'), icon: 'plus', onClick: async () => { const n = await promptDialog({ title: t('cat.addSub'), label: t('cat.subName') }); if (n) store.addSub(c.id, n); } },
              { label: t('cat.rename'), icon: 'edit', onClick: async () => { const n = await promptDialog({ title: t('cat.rename'), label: t('cat.name'), value: c.name }); if (n) store.renameCategory(c.id, n); } },
              { label: t('common.delete'), icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ message: t('cat.deleteAsk', { name: c.name }), okLabel: t('common.delete'), danger: true })) store.deleteCategory(c.id); } },
            ]), 'row-more')),
          c.subs.map((s) => h('div', { class: 'manage-row sub-row' },
            h('span', { class: 'grow ellipsis' }, s.name),
            iconButton('more', t('common.more'), () => actionMenu(s.name, [
              { label: t('cat.rename'), icon: 'edit', onClick: async () => { const n = await promptDialog({ title: t('cat.rename'), label: t('cat.subName'), value: s.name }); if (n) store.renameSub(c.id, s.id, n); } },
              { label: t('common.delete'), icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ message: t('cat.deleteAsk', { name: s.name }), okLabel: t('common.delete'), danger: true })) store.deleteSub(c.id, s.id); } },
            ]), 'row-more'))))),
        h('button', { type: 'button', class: 'btn block', onClick: async () => { const n = await promptDialog({ title: t('cat.add'), label: t('cat.name') }); if (n) store.addCategory(catKind, n); } },
          icon('plus', { size: 18 }), t('cat.add')));
    },
  });
}

// ---- バックアップと復元（SET-04） ----

function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function openBackup() {
  const item = (iconName, label, desc, onClick, cls = '') => h('button', { type: 'button', class: `menu-item tall ${cls}`, onClick },
    icon(iconName), h('span', {}, h('strong', {}, label), desc ? h('small', {}, desc) : null));
  openSheet({
    title: t('backup.title'),
    content: h('div', { class: 'menu' },
      item('download', t('backup.export'), t('backup.exportDesc'), () => {
        downloadFile(`CoinFlow-backup-${stamp()}.json`, new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' }));
        toast(t('backup.exported'));
      }),
      item('upload', t('backup.import'), null, importBackup)),
  });
}

function importBackup() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let data;
    try {
      data = store.parseBackup(await file.text());
    } catch (e) {
      toast(t(e.message === 'newer' ? 'backup.newer' : 'backup.error'));
      return;
    }
    const sheet = openSheet({
      title: t('backup.chooseMode'),
      content: h('div', { class: 'menu' },
        h('button', { type: 'button', class: 'menu-item tall', onClick: () => { sheet.close(); store.importMerge(data); toast(t('backup.done')); } },
          icon('layers'), h('span', {}, h('strong', {}, t('backup.merge')), h('small', {}, t('backup.mergeDesc')))),
        h('button', { type: 'button', class: 'menu-item tall danger', onClick: async () => {
          sheet.close();
          if (await confirmDialog({ message: t('backup.overwriteWarn'), okLabel: t('backup.overwrite'), danger: true })) {
            store.importOverwrite(data);
            toast(t('backup.done'));
          }
        } }, icon('download'), h('span', {}, h('strong', {}, t('backup.overwrite')), h('small', {}, t('backup.overwriteDesc'))))),
    });
  });
  document.body.append(input);
  input.click();
}
