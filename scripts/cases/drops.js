/* ==========================================================================
   Окна выпадения
   ========================================================================== */
'use strict';

const MODALS = ['drop', 'multi', 'granny', 'ask', 'elsewhere', 'forgeRes'];
const anyModalOpen = () => MODALS.some((id) => !$(id).hidden);

// Пока открыто окно, страница под ним неактивна: ни мышью, ни Tab до неё не добраться.
const syncInert = () => { $('wrap').inert = anyModalOpen(); };

/* Пока окно «вылетает», а карточки улова «выпрыгивают», они на миг крупнее своего места —
   и на ПК то появлялись, то пропадали полосы прокрутки. На время анимации прокрутку прячем,
   но только там, где всё и так помещается: нужная полоса прокрутки остаётся на месте. */
const MODAL_IN_MS = 550;                       // @keyframes dropin у .mbox
const CARD_POP_MS = 400;                       // @keyframes pop у карточек улова
const calmUntil = new WeakMap();
function calmScroll(modal, ms) {
  const until = performance.now() + ms;
  if ((calmUntil.get(modal) || 0) >= until) return;
  calmUntil.set(modal, until);
  const box = modal.querySelector('.mbox');
  const cs = getComputedStyle(modal);
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  modal.classList.toggle('calm', !box || box.offsetHeight + pad <= modal.clientHeight);
  $$('.multi-grid', modal).forEach((g) => {
    const last = g.lastElementChild;
    g.classList.toggle('calm', !last || last.offsetTop + last.offsetHeight <= g.clientHeight);
  });
  setTimeout(() => {
    if (calmUntil.get(modal) !== until) return;
    modal.classList.remove('calm');
    $$('.multi-grid.calm', modal).forEach((g) => g.classList.remove('calm'));
  }, ms);
}

/* Фокус: окно забирает его на свою главную кнопку, а после закрытия возвращаем туда, где он был
   до окна (обычно — кнопка «Открыть»), а не в начало страницы. */
let focusBeforeModal = null;
document.addEventListener('focusin', (e) => {
  // Поля ввода не запоминаем: на телефоне фокус в поле после закрытия окна открыл бы клавиатуру.
  if (!e.target.closest('.modal') && !e.target.matches('input, select, textarea')) focusBeforeModal = e.target;
});

MODALS.forEach((id) => new MutationObserver(() => {
  syncInert();
  if (!$(id).hidden) calmScroll($(id), MODAL_IN_MS + 50);
  else if (!anyModalOpen() && (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('.modal')) &&
    focusBeforeModal && focusBeforeModal.isConnected && !focusBeforeModal.disabled) {
    focusBeforeModal.focus({ preventScroll: true });
  }
}).observe($(id), { attributes: true, attributeFilter: ['hidden'] }));

// Окно одного предмета. after() вызывается после «Забрать» или «Продать».
function showDrop(it, context, after) {
  const R = RARITY[it.r];
  const box = $('dropbox');
  box.style.setProperty('--c', R.c);

  $('dCtx').textContent = context || '';
  $('dRar').textContent = R.n;
  $('dIc').textContent = it.ic;
  $('dName').innerHTML = baseName(it) + (it.stat ? `<span class="stat-badge">СчётЧих™ ×${STAT_TRAK_MULT}</span>` : '');
  $('dLore').textContent = it.lore + (it.price < 0 ? ' Отрицательная стоимость: чтобы избавиться, придётся доплатить.' : '');
  $('dWear').textContent = it.wear;
  $('dPrice').textContent = Math.abs(it.price) >= 1e9 ? fmtShort(it.price) : fmt(it.price);
  $('dPrice').title = fmt(it.price);
  $('dPrice').classList.toggle('neg', it.price < 0);
  $('dFloat').textContent = '· ' + fmtFloat(it.float);
  $('dFloatMark').style.left = it.float * 100 + '%';
  $('dKeep').textContent = it.price < 0 ? 'Оставить себе (зачем?)' : 'Забрать в инвентарь';
  $('dSell').textContent = sellLabel(it.price, 'Продать', 'Выбросить');
  $('dSell').disabled = !canPay(it.price);

  $('drop').hidden = false;
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';

  const r = box.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 130, [R.hex, '#ffffff', R.hex, '#ffb02e'], [30, 40, 60, 90, 140, 220, 400][it.r]);
  if (it.r >= 4) shake();
  if (it.r === 6) {
    setTimeout(() => burst(innerWidth * 0.2, innerHeight * 0.3, ['#ffd23f', '#fff3b0'], 200), 250);
    setTimeout(() => burst(innerWidth * 0.8, innerHeight * 0.3, ['#ffd23f', '#fff3b0'], 200), 450);
  }
  fanfare(it.r);

  let closed = false; // защита от двойного нажатия
  const finish = (keep) => {
    if (closed) return;
    if (!keep && !canPay(it.price)) { noMoney(it.price); return; }
    closed = true;
    $('drop').hidden = true;
    state.pending = [];
    if (keep) {
      state.inv.push(it);
    } else {
      state.earn += it.price;
      setBal(it.price);
      toast(it.price < 0 ? `Выброшено. Утилизация стоила ${fmt(-it.price)}` : `Продано за ${fmt(it.price)}`);
    }
    renderStats();
    renderInventory();
    if (after) after();
  };
  $('dKeep').onclick = () => finish(true);
  $('dSell').onclick = () => finish(false);
  $('dKeep').focus({ preventScroll: true });
}

// Окно улова. cost — сколько потрачено; sorted — лучшие сверху (для ×100);
// title/sub — свои заголовок и подпись; after() — что сделать после закрытия.
function showMulti(won, { cost = 0, sorted = false, title = '', sub = '', note = '', after = null } = {}) {
  const best = won.reduce((a, x) => (x.r > a.r || (x.r === a.r && x.price > a.price) ? x : a), won[0]);
  const R = RARITY[best.r];
  const box = $('multibox');
  const total = sum(won, (x) => x.price);
  const many = won.length > 20;
  // Больше 20 предметов — одинаковые собираем в одну карточку «×N» с общей ценой, лучшие сверху.
  let shown;
  if (many) {
    const groups = new Map();
    for (const x of won) {
      const k = `${x.caseId}|${x.idx}|${x.stat ? 1 : 0}`;
      if (!groups.has(k)) groups.set(k, { x, n: 0, price: 0 });
      const g = groups.get(k);
      g.n++;
      g.price += x.price;
    }
    shown = [...groups.values()].sort((a, b) => b.x.r - a.x.r || b.price - a.price);
  } else {
    shown = (sorted ? won.slice().sort((a, b) => b.r - a.r || b.price - a.price) : won).map((x) => ({ x, n: 1, price: x.price }));
  }
  box.style.setProperty('--c', R.c);

  $('mTitle').textContent = title || `Улов: ${won.length} ${plural(won.length, 'предмет', 'предмета', 'предметов')}`;
  const counts = RARITY.map((r, k) => [r, won.filter((x) => x.r === k).length]).filter(([, n]) => n).reverse();
  $('mSub').innerHTML = (sub || `Лучший: <b>${best.name}</b> · всего на ${fmtShort(total)} при затратах ${fmtShort(cost)}`) +
    (many ? '<span class="mcount">' + counts.map(([r, n]) => `<span style="--c:${r.c}"><i></i>${n}</span>`).join('') + '</span>' : '') + note;
  const step = shown.length > 1 ? MULTI_CASCADE_MS / (shown.length - 1) : 0;
  $('mGrid').innerHTML = shown.map(({ x, n, price }, i) => `
    <div style="--c:${RARITY[x.r].c};animation-delay:${Math.round(i * step)}ms" title="${x.name}${n > 1 ? ' ×' + n : ''} · ${fmt(price)}">
      ${n > 1 ? `<span class="cnt">×${n}</span>` : ''}
      <span class="ic">${x.ic}</span><span class="nm">${x.name}</span>
      <span class="p${price < 0 ? ' neg' : ''}">${fmtShort(price)}</span>
    </div>`).join('');
  $('mGrid').scrollTop = 0;
  $('mSell').textContent = sellLabel(total, 'Продать всё', 'Выбросить всё');
  $('mSell').disabled = !canPay(total);

  $('multi').hidden = false;
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  calmScroll($('multi'), Math.max(MODAL_IN_MS, MULTI_CASCADE_MS + CARD_POP_MS) + 100);

  const r = box.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 60, [R.hex, '#ffffff', '#ffb02e'], [60, 80, 110, 150, 200, 300, 450][best.r]);
  if (best.r >= 4) shake();
  fanfare(best.r);

  let closed = false;
  const finish = (keep) => {
    if (closed) return;
    if (!keep && !canPay(total)) { noMoney(total); return; }
    closed = true;
    $('multi').hidden = true;
    state.pending = [];
    if (keep) {
      state.inv.push(...won);
    } else {
      state.earn += total;
      setBal(total);
      toast('Улов продан за ' + fmt(total));
    }
    busy = false;
    save();
    renderStats();
    renderInventory();
    updateOpenButton();
    if (after) after();
  };
  $('mKeep').onclick = () => finish(true);
  $('mSell').onclick = () => finish(false);
  $('mKeep').focus({ preventScroll: true });
}
