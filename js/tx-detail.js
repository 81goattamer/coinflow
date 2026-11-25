// 記録の詳細画面（REC）。上に金額・日時・口座・お店、下半分に計算キーボードを置いたままにする。
// 記録タブ、予約の登録、記録の編集で使う
import { store } from './app-store.js';
import { catIcon } from './store.js';
import { t, yen } from './i18n.js';
import { amountTarget, embeddedPad, setHardwareTarget } from './keypad.js';
import { evaluate } from './calc.js';
import { BORROW, accIcon, accName, catLabel, dateTimeFields, KIND_ICON } from './forms.js';
import { activeAccounts, balances, unpaidOf } from './ledger.js';
import { h, icon, openSheet, setChildren, switchInput, toast } from './ui.js';

// 口座の一覧（残高つき）。シートと、振替の口座選択画面で使う
export function accountList({ types, value, extra = [], exclude = null, onPick }) {
  const bal = balances(store.state);
  const list = activeAccounts(store.state, types).filter((a) => a.id !== exclude);
  return h('div', { class: 'card list pick-list' },
    list.map((a) => h('button', {
      type: 'button',
      class: `pick-row ${a.id === value ? 'on' : ''}`,
      onClick: () => onPick(a.id),
    }, accIcon(a, 32), h('span', { class: 'grow ellipsis' }, a.name),
    h('span', { class: 'muted small' }, yen(a.type === 'card' ? unpaidOf(bal, a.id) : bal.get(a.id))),
    a.id === value ? icon('check', { size: 18 }) : null)),
    extra.map((x) => h('button', {
      type: 'button',
      class: `pick-row ${x.id === value ? 'on' : ''}`,
      onClick: () => onPick(x.id),
    }, h('span', { class: 'acc-icon', style: { width: '32px', height: '32px' } }, icon(x.icon, { size: 18 })), h('span', { class: 'grow' }, x.label),
    x.id === value ? icon('check', { size: 18 }) : null)),
    !list.length && !extra.length ? h('p', { class: 'muted small pad' }, t('rec.noAccount')) : null);
}

// 口座を選ぶシート
export function openAccountPicker({ title, onPick, ...rest }) {
  const sheet = openSheet({ title, content: accountList({ ...rest, onPick: (id) => { sheet.close(); onPick(id); } }) });
  return sheet;
}

// st は下書き（forms.js の newTxDraft / draftFromTx）
export function txDetail(st, { title, onBack, onDone, onCategory, editing = false }) {
  const root = h('div', { class: 'tx-detail' });
  const amountText = h('span', { class: 'detail-amount-text' });
  const main = amountTarget({ value: st.amount, text: amountText, onChange: (v) => { st.amount = v; updateMax?.(); } });
  main.editing = true;
  main.show();
  let target = main;
  const isExp = st.type === 'expense';
  const isInc = st.type === 'income';
  const isTr = st.type === 'transfer';

  // OK は数字の入力を終えてキーボードを引っ込めるだけ。金額の欄を押すとまた出る
  const showPad = (on) => root.classList.toggle('pad-off', !on);
  const setTarget = (tg) => {
    showPad(true);
    if (target !== tg && target !== main) target.commit();
    if (target !== main) target.editing = false;
    target = tg;
    tg.editing = true;
    root.querySelectorAll('.lend-amount.editing').forEach((n) => n.classList.remove('editing'));
    tg.el?.classList.add('editing');
    tg.show();
  };

  const accTypes = isExp ? ['cash', 'card', 'saving'] : ['cash', 'saving'];
  const pickFrom = () => openAccountPicker({
    types: accTypes,
    value: st.accountId,
    exclude: isTr ? st.toAccountId : null,
    extra: isExp ? [{ id: BORROW, label: t('kind.borrow'), icon: 'handin' }] : [],
    title: isInc ? t('key.pickTo') : t('key.pickFrom'),
    onPick: (id) => { st.accountId = id; draw(); },
  });
  const pickTo = () => openAccountPicker({
    types: ['cash', 'saving'], value: st.toAccountId, exclude: st.accountId, title: t('field.to'),
    onPick: (id) => { st.toAccountId = id; draw(); },
  });

  const doneNumber = () => {
    if (target !== main) {
      target.commit();
      setTarget(main);
    }
    main.commit();
    showPad(false);
  };
  const save = () => {
    if (target !== main) {
      target.commit();
      setTarget(main);
    }
    const v = main.commit();
    if (!(v > 0)) {
      toast(t('rec.needAmount'));
      return;
    }
    if (st.type === 'cardpay') return finish();
    if (!st.accountId) return pickFrom();
    if (isTr) {
      if (!st.toAccountId || st.toAccountId === st.accountId) return pickTo();
      return finish();
    }
    if (isExp && st.accountId === BORROW && !st.borrowName.trim()) return focusField('.borrow-name');
    if (isInc && st.borrowOn && !st.shop.trim()) return focusField('.shop-input');
    const c = store.get('categories', st.catId);
    if (!c || (c.subs.length && !c.subs.some((s) => s.id === st.subId))) {
      onCategory?.();
      return undefined;
    }
    if (isExp) {
      const sum = st.lends.reduce((s, l) => s + (l.name.trim() && l.amount > 0 ? l.amount : 0), 0);
      if (sum > st.amount) {
        toast(t('lend.over'));
        return undefined;
      }
      if (st.pointsOn && st.points > st.amount) {
        toast(t('points.over'));
        return undefined;
      }
    }
    return finish();
  };
  const focusField = (sel) => {
    const el = root.querySelector(sel);
    el?.focus();
    el?.classList.add('need');
    toast(t('common.required'));
  };
  const finish = () => {
    const borrowName = isExp && st.accountId === BORROW ? st.borrowName : isInc && st.borrowOn ? st.shop : '';
    const tx = store.saveTx({
      id: st.id,
      type: st.type,
      amount: st.amount,
      date: st.date,
      time: st.withTime ? st.time : null,
      accountId: st.accountId === BORROW ? null : st.accountId,
      toAccountId: st.toAccountId,
      catId: st.catId,
      subId: st.subId,
      name: st.name,
      shop: isInc && st.borrowOn ? '' : st.shop,
      points: isExp && st.pointsOn ? st.points ?? 0 : 0,
      borrowName,
      lends: st.lends,
      reservationId: st.reservationId,
      cardId: st.cardId,
      cycle: st.cycle,
    });
    onDone?.(tx);
  };

  const row = (ic, body, onClick, cls = '') => h(onClick ? 'button' : 'div', { type: onClick ? 'button' : null, class: `drow ${cls}`, onClick },
    h('span', { class: 'drow-icon' }, ic), h('span', { class: 'grow drow-body' }, body), onClick ? icon('chevron', { size: 18 }) : null);

  const accountRow = (id, placeholder, onClick) => {
    if (id === BORROW) return row(icon('handin', { size: 22 }), t('kind.borrow'), onClick);
    const a = store.get('accounts', id);
    return row(a ? accIcon(a, 28) : icon('wallet', { size: 22 }), a ? accName(id) : h('span', { class: 'muted' }, placeholder), onClick, a ? '' : 'empty');
  };

  const body = h('div', { class: 'detail-scroll' });
  const draw = () => {
    const parts = [];
    parts.push(h('div', { class: `drow amount-drow ${st.type}`, onClick: () => setTarget(main) },
      h('span', { class: 'currency' }, h('span', { class: 'yen' }, '¥'), h('span', { class: 'jpy' }, 'JPY')),
      amountText));
    parts.push(row(icon('calendar', { size: 22 }), dateTimeFields(st, () => {})));
    if (!isTr && st.type !== 'cardpay') {
      const c = store.get('categories', st.catId);
      parts.push(row(h('span', { class: 'emoji-icon' }, c ? catIcon(c) : '🏷️'), c ? catLabel(st.catId, st.subId) : h('span', { class: 'muted' }, t('cat.choose')), onCategory));
    }
    if (isTr) {
      parts.push(accountRow(st.accountId, t('key.pickFrom'), pickFrom));
      parts.push(accountRow(st.toAccountId, t('key.pickTo'), pickTo));
    } else if (st.type !== 'cardpay') {
      parts.push(accountRow(st.accountId, isInc ? t('key.pickTo') : t('key.pickFrom'), pickFrom));
    }
    if (isExp && st.accountId === BORROW) {
      parts.push(row(icon('user', { size: 22 }), h('input', {
        class: 'dinput borrow-name', value: st.borrowName, maxlength: 30, placeholder: t('field.payer'), 'aria-label': t('field.payer'),
        onInput: (e) => { st.borrowName = e.target.value; e.target.classList.remove('need'); },
      })));
    }
    if (isExp || isInc) {
      parts.push(row(icon('tag', { size: 22 }), h('input', {
        class: 'dinput name-input', value: st.name, maxlength: 40, placeholder: t('field.txName'), 'aria-label': t('field.txName'),
        onInput: (e) => { st.name = e.target.value; },
      })));
      const salary = isInc && store.isSalaryCategory(st.catId);
      const [ic, ph] = isInc && st.borrowOn ? ['user', t('field.lender')] : salary ? ['building', t('field.companyShort')] : ['store', t('field.shop')];
      parts.push(row(icon(ic, { size: 22 }), h('input', {
        class: 'dinput shop-input', value: st.shop, maxlength: 40, placeholder: ph, 'aria-label': ph,
        onInput: (e) => { st.shop = e.target.value; e.target.classList.remove('need'); },
      })));
    }
    if (isInc) {
      parts.push(h('label', { class: 'drow' }, h('span', { class: 'drow-icon' }, icon('handin', { size: 22 })),
        h('span', { class: 'grow drow-body' }, t('field.borrowSwitch')),
        switchInput(st.borrowOn, (v) => { st.borrowOn = v; draw(); }, t('field.borrowSwitch'))));
    }
    if (isExp) parts.push(pointRows());
    if (isExp) parts.push(lendRows());
    setChildren(body, parts);
    if (target !== main && !body.contains(target.el)) setTarget(main);
  };

  // ポイント利用（支出だけ）。入れた金額が上限
  let pointTarget = null;
  let maxLabel = null;
  const updateMax = () => { if (maxLabel) maxLabel.textContent = st.amount > 0 ? t('points.max', { amt: yen(st.amount) }) : ''; };
  const pointRows = () => {
    const out = [h('label', { class: 'drow' }, h('span', { class: 'drow-icon' }, icon('gift', { size: 22 })),
      h('span', { class: 'grow drow-body' }, t('points.use')),
      switchInput(st.pointsOn, (v) => { st.pointsOn = v; draw(); if (v && pointTarget) setTarget(pointTarget); }, t('points.use')))];
    pointTarget = null;
    maxLabel = h('span', { class: 'grow muted small' });
    updateMax();
    if (st.pointsOn) {
      const text = h('span', { class: 'amount-text' });
      const btn = h('button', { type: 'button', class: 'amount-field lend-amount point-amount', 'aria-label': t('points.amount') }, text);
      const tg = amountTarget({ value: st.points, text, onChange: (v) => { st.points = v; } });
      // 上限は支出の金額
      const clamp = () => {
        const v = evaluate(tg.expr);
        if (st.amount > 0 && v > st.amount) {
          tg.set(st.amount);
          st.points = st.amount;
        }
      };
      const press = tg.press.bind(tg);
      tg.press = (k) => { press(k); clamp(); };
      tg.el = btn;
      btn.addEventListener('click', () => setTarget(tg));
      pointTarget = tg;
      out.push(h('div', { class: 'point-row' },
        maxLabel,
        btn));
    }
    return h('div', { class: 'points' }, out);
  };

  const lendRows = () => h('div', { class: 'lends' },
    st.lends.map((l) => {
      const text = h('span', { class: 'amount-text' });
      const btn = h('button', { type: 'button', class: 'amount-field lend-amount', 'aria-label': t('common.amount') }, text);
      const tg = amountTarget({ value: l.amount, text, onChange: (v) => { l.amount = v; } });
      tg.el = btn;
      btn.addEventListener('click', () => setTarget(tg));
      return h('div', { class: `lend-row ${l.done ? 'done' : ''}` },
        icon('handout', { size: 20 }),
        h('input', { class: 'input', value: l.name, maxlength: 30, placeholder: t('field.lendName'), 'aria-label': t('field.lendName'), onInput: (e) => { l.name = e.target.value; } }),
        btn,
        h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': t('common.delete'), onClick: () => { st.lends = st.lends.filter((x) => x !== l); draw(); } }, icon('close', { size: 18 })));
    }),
    h('button', { type: 'button', class: 'text-btn left', onClick: () => { st.lends.push({ id: undefined, name: '', amount: null }); draw(); } },
      h('span', { class: 'inline-icon' }, icon('plus', { size: 18 })), t('field.lendAdd')));

  const left = h('button', { type: 'button', class: 'key side pick', 'data-key': 'pick', onClick: () => (isTr && st.accountId ? pickTo() : pickFrom()) },
    icon('wallet', { size: 26 }), h('span', {}, isInc ? t('key.pickTo') : t('key.pickFrom')));
  const pad = st.type === 'cardpay'
    ? embeddedPad({ getTarget: () => target, onOk: doneNumber, left: h('span', {}) })
    : embeddedPad({ getTarget: () => target, onOk: doneNumber, left });

  setChildren(root,
    h('header', { class: 'detail-head-bar' },
      onBack ? h('button', { type: 'button', class: 'back-pill', onClick: onBack }, icon('back', { size: 22 }), t('common.back')) : h('span', { class: 'back-space' }),
      h('h2', { class: 'detail-title' }, h('span', { class: `title-kind k-${st.type}` }, icon(KIND_ICON[st.type], { size: 16 })), title),
      h('button', { type: 'button', class: 'save-pill', onClick: () => save() }, editing ? t('rec.editDone') : t('rec.register'))),
    body,
    pad);
  draw();

  // 文字の入力中は計算キーボードを隠し、端末のキーボードに場所を譲る
  root.addEventListener('focusin', (e) => { if (e.target.matches('input:not([type="checkbox"]), textarea')) root.classList.add('typing'); });
  root.addEventListener('focusout', () => setTimeout(() => {
    if (!root.contains(document.activeElement) || !document.activeElement.matches('input:not([type="checkbox"]), textarea')) root.classList.remove('typing');
  }, 0));
  setHardwareTarget((k) => {
    if (!document.body.contains(root)) return false;
    if (k === 'close') return false;
    if (k === 'ok') {
      if (root.classList.contains('pad-off')) save();
      else doneNumber();
    }
    else target.press(k);
    return true;
  });
  root.save = save;
  root.editing = editing;
  return root;
}

// 記録の編集・予約の登録で、カテゴリを選び直すシート
export function openCategoryChooser(st, onDone) {
  let picked = { catId: st.catId, subId: st.subId };
  const kind = st.type === 'income' ? 'income' : 'expense';
  const cats = store.state.categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
  const root = h('div', { class: 'card list' });
  const drawList = (cat = null) => {
    if (!cat) {
      setChildren(root, cats.map((c) => h('button', { type: 'button', class: 'cat-row-btn', onClick: () => {
        if (c.subs.length) drawList(c);
        else { picked = { catId: c.id, subId: null }; done(); }
      } }, h('span', { class: 'cat-emoji' }, catIcon(c)), h('span', { class: 'grow ellipsis' }, c.name), icon('chevron', { size: 18 }))));
      return;
    }
    setChildren(root,
      h('button', { type: 'button', class: 'cat-row-btn back', onClick: () => drawList() }, icon('back', { size: 18 }), h('span', { class: 'grow' }, t('rec.subsOf', { name: cat.name }))),
      cat.subs.map((s) => h('button', { type: 'button', class: 'cat-row-btn', onClick: () => { picked = { catId: cat.id, subId: s.id }; done(); } },
        h('span', { class: 'cat-emoji' }, catIcon(cat)), h('span', { class: 'grow ellipsis' }, s.name), icon('chevron', { size: 18 }))));
  };
  const done = () => {
    st.catId = picked.catId;
    st.subId = picked.subId;
    sheet.close();
    onDone();
  };
  drawList();
  const sheet = openSheet({ title: t('field.category'), content: root });
}
