/* ==========================================================================
   Инвентарь: раздел «Вещи»
   ========================================================================== */
'use strict';

// Фильтры, режим выбора и открытая карточка. limit — сколько карточек сетки показано сейчас:
// рисовать тысячи разом долго, поэтому по INV_PAGE и кнопка «Показать ещё».
const INV_PAGE = 200;
const invUi = { q: '', rar: new Set(), cs: '', sort: 'new', multi: false, sel: new Set(), open: null, limit: INV_PAGE };
const resetInvPage = () => { invUi.limit = INV_PAGE; };

$('ivCase').innerHTML = '<option value="">Все кейсы</option>' +
  ROOMS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
// Поиск — с короткой паузой: не перерисовываем на каждую букву.
let invQTimer = 0;
$('ivQ').oninput = (e) => {
  clearTimeout(invQTimer);
  invQTimer = setTimeout(() => {
    invUi.q = e.target.value.trim().toLowerCase();
    resetInvPage();
    renderInvView();
  }, 180);
};
$('ivCase').onchange = (e) => { invUi.cs = e.target.value; resetInvPage(); renderInvView(); };
$('ivSort').onchange = (e) => { invUi.sort = e.target.value; resetInvPage(); renderInvView(); };
$('ivMulti').onclick = () => {
  invUi.multi = !invUi.multi;
  if (!invUi.multi) invUi.sel.clear();
  renderInvView();
};
$('goInv').onclick = () => goSub('items');

function filteredInventory() {
  let list = state.inv.filter((x) =>
    (!invUi.q || x.name.toLowerCase().includes(invUi.q)) &&
    (!invUi.rar.size || invUi.rar.has(x.r)) &&
    (!invUi.cs || x.caseId === invUi.cs));
  switch (invUi.sort) {
    case 'new': list = list.slice().reverse(); break;
    case 'pd': list.sort((x, y) => y.price - x.price); break;
    case 'pa': list.sort((x, y) => x.price - y.price); break;
    case 'rar': list.sort((x, y) => y.r - x.r || y.price - x.price); break;
    case 'name': list.sort((x, y) => baseName(x).localeCompare(baseName(y), 'ru')); break;
  }
  return list;
}

const selectedItems = () => state.inv.filter((x) => invUi.sel.has(x.uid));
const caseName = (id) => roomById(id)?.name || '—';

// Карточка предмета в сетке. mode: 'grid' — инвентарь, 'recent' — «Последние находки».
function itemCardHTML(x, mode) {
  const inGrid = mode !== 'recent';
  const selected = invUi.sel.has(x.uid);
  const cls = ['icard',
    selected && 'sel',
    inGrid && invUi.open === x.uid && 'cur',
    x.lock && 'locked',
    inGrid && invUi.multi && 'multi'].filter(Boolean).join(' ');
  const corner = inGrid && invUi.multi && !x.lock
    ? '<span class="box"></span>'
    : x.lock ? '<span class="lk" aria-label="Закреплено">🔒</span>' : '';
  return `
    <button class="${cls}" type="button" data-u="${x.uid}" style="--c:${RARITY[x.r].c}"
      aria-pressed="${selected}" title="${x.name} · ${x.wear}">
      ${x.stat ? '<span class="st">СЧ™</span>' : ''}${corner}
      <span class="ic">${x.ic}</span>
      <span class="nm">${baseName(x)}</span>
      <span class="p${x.price < 0 ? ' neg' : ''}" title="${fmt(x.price)}">${fmtShort(x.price)}</span>
      <span class="w">${x.wear}</span>
      ${museumWants(x) ? '<span class="mus" title="Нужен музею">🏛</span>' : ''}
    </button>`;
}

function renderInvView() {
  const all = state.inv;
  const total = sum(all, (x) => x.price);
  $('tabInvN').textContent = all.length;
  $('subItemsN').textContent = all.length;

  // Плитки сверху.
  $('tN').textContent = all.length;
  $('tNs').textContent = all.length
    ? `${new Set(all.map((x) => x.name)).size} разных · ${all.filter((x) => x.lock).length} закреплено`
    : 'пока пусто';
  $('tV').textContent = fmtShort(total);
  $('tV').title = fmt(total);
  $('tV').className = 'v' + (total < 0 ? ' neg' : '');
  const best = all.reduce((a, x) => (!a || x.price > a.price ? x : a), null);
  $('tB').textContent = best ? best.ic + ' ' + fmtShort(best.price) : '—';
  $('tBs').textContent = best ? best.name : '—';
  const negatives = all.filter((x) => x.price < 0);
  $('tM').textContent = negatives.length;
  $('tM').className = 'v' + (negatives.length ? ' neg' : '');
  $('tMs').textContent = negatives.length
    ? 'выбросить стоит ' + fmt(Math.abs(sum(negatives, (x) => x.price)))
    : 'мусора с доплатой нет';

  // Фильтр по редкости.
  const byRarity = RARITY.map(() => 0);
  all.forEach((x) => byRarity[x.r]++);
  $('ivChips').innerHTML = RARITY.map((r, i) => `
    <button class="chip" type="button" data-r="${i}" style="--c:${r.c}" aria-pressed="${invUi.rar.has(i)}">
      <i></i>${r.n}<b>${byRarity[i]}</b>
    </button>`).join('');
  $$('.chip', $('ivChips')).forEach((b) => (b.onclick = () => {
    const r = +b.dataset.r;
    if (invUi.rar.has(r)) invUi.rar.delete(r);
    else invUi.rar.add(r);
    resetInvPage();
    renderInvView();
  }));
  $('ivMulti').setAttribute('aria-pressed', invUi.multi);

  // Сетка и карточка — только когда раздел «Вещи» на экране: на большом инвентаре это самое дорогое.
  if (!subVisible('items')) {
    renderBulkBar();
    renderRecent();
    return;
  }
  const list = filteredInventory();
  const grid = $('inv2');
  const shown = list.slice(0, invUi.limit);
  const rest = list.length - shown.length;
  if (!all.length) grid.innerHTML = '<span class="empty">Пусто. Даже носка нет. Открой кейс, чтобы это исправить.</span>';
  else if (!list.length) grid.innerHTML = '<span class="empty">Под фильтр ничего не подходит.</span>';
  else {
    grid.innerHTML = shown.map((x) => itemCardHTML(x, 'grid')).join('') + (rest > 0
      ? `<button class="btn more" type="button" id="ivMore">Показать ещё ${Math.min(INV_PAGE, rest)} · всего ${list.length}</button>`
      : '');
  }
  if ($('ivMore')) $('ivMore').onclick = () => { invUi.limit += INV_PAGE; renderInvView(); };

  renderBulkBar();
  renderItemCard();
  renderRecent();
}

// Нажатие на карточку в сетке: меняем только её класс и панели, сетку целиком не перерисовываем.
$('inv2').onclick = (e) => {
  const b = e.target.closest('.icard');
  if (!b) return;
  const it = state.inv.find((x) => x.uid === +b.dataset.u);
  if (!it) return;
  if (invUi.multi) {
    if (it.lock) { toast('Предмет закреплён. Сначала открепи его.'); return; }
    if (invUi.sel.has(it.uid)) invUi.sel.delete(it.uid);
    else invUi.sel.add(it.uid);
    b.classList.toggle('sel', invUi.sel.has(it.uid));
    b.setAttribute('aria-pressed', invUi.sel.has(it.uid));
    renderBulkBar();
    tone(800, 0.03);
    return;
  }
  $('inv2').querySelector('.icard.cur')?.classList.remove('cur');
  b.classList.add('cur');
  invUi.open = it.uid;
  $('detail').classList.add('show');
  renderItemCard();
  // С клавиатуры — сразу к действиям карточки (на телефоне она внизу, после всей сетки).
  if (e.detail === 0) $('dtSell')?.focus({ preventScroll: true });
  tone(650, 0.03);
};

// Закрыть карточку предмета и вернуть фокус на этот предмет в сетке. Ищем по uid: сетку могли
// перерисовать, пока карточка была открыта (закрепили, продали соседей).
function closeItemCardView() {
  const uid = invUi.open;
  closeItemCard();
  renderItemCard();
  $('inv2').querySelector(`.icard[data-u="${uid}"]`)?.focus({ preventScroll: true });
}

// Панель массовой продажи.
function renderBulkBar() {
  const sel = selectedItems();
  const bar = $('bulk');
  // В режиме выбора панель всегда внизу экрана, даже пока ничего не выбрано.
  bar.hidden = !sel.length && !invUi.multi;
  $('bulkMega').disabled = busy || !sel.some((x) => !x.lock);
  if (!sel.length) {
    $('bulkInfo').textContent = 'Отметь предметы или нажми «Быстрый выбор»';
    $('bulkSell').textContent = 'Продать';
    $('bulkSell').disabled = true;
    return;
  }
  const v = sum(sel, (x) => x.price);
  $('bulkInfo').innerHTML = `Выбрано <b>${sel.length}</b> · ${v >= 0 ? 'получишь' : 'доплатишь'} ` +
    `<b class="${v >= 0 ? 'pos' : 'neg'}" title="${fmt(Math.abs(v))}">${fmtShort(Math.abs(v))}</b>`;
  $('bulkSell').textContent = !canPay(v)
    ? 'Не хватает на утилизацию'
    : v >= 0 ? `Продать ${sel.length} шт.` : `Выбросить ${sel.length} шт.`;
  $('bulkSell').disabled = busy || !canPay(v);
}

// Карточка выбранного предмета (справа на компьютере, шторка снизу на телефоне).
function renderItemCard() {
  const card = $('detail');
  const it = state.inv.find((x) => x.uid === invUi.open);
  if (!it) {
    card.classList.remove('show');
    card.style.removeProperty('--c');
    card.innerHTML = '<div class="emptyd"><span class="ic">🔍</span>Нажми на предмет, чтобы рассмотреть его, продать или закрепить.</div>';
    return;
  }
  const R = RARITY[it.r];
  card.style.setProperty('--c', R.c);
  const when = it.t
    ? new Date(it.t).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'давно';
  const sellText = sellLabel(it.price, 'Продать', 'Выбросить');

  card.innerHTML = `
    <button class="btn sm close" type="button" id="dClose">Закрыть</button>
    <div class="hero"><div class="rays"></div><span class="ic">${it.ic}</span></div>
    <div class="rar">${R.n}</div>
    <h3>${baseName(it)}${it.stat ? `<span class="stat-badge">СчётЧих™ ×${STAT_TRAK_MULT}</span>` : ''}</h3>
    <p class="lore">${it.lore || ''}</p>
    <div class="acts">
      ${museumButtonHTML(it)}
      <button class="btn primary wide" type="button" id="dtSell" ${canPay(it.price) ? '' : 'disabled'}>${sellText}</button>
      <button class="btn" type="button" id="dtLock">${it.lock ? 'Открепить' : '🔒 Закрепить'}</button>
      <button class="btn" type="button" id="dtUp" ${it.price <= 0 ? 'disabled' : ''}>На апгрейд</button>
      <button class="btn wide" type="button" id="dtCon" ${it.r >= 6 && !contractMega ? 'disabled' : ''}>${contractMega ? '⚡ В мегаконтракт' : 'Добавить в контракт'}</button>
    </div>
    <div class="specs">
      <div><div class="k">Цена</div><div class="v ${it.price < 0 ? 'neg' : ''}">${fmt(it.price)}</div></div>
      <div><div class="k">Состояние</div><div class="v">${it.wear}</div></div>
      <div><div class="k">Из кейса</div><div class="v">${caseName(it.caseId)}</div></div>
      <div><div class="k">Получено</div><div class="v">${when}</div></div>
      <div style="grid-column:1/-1">
        <div class="k">Износ · ${fmtFloat(it.float)}</div>
        <div class="floatbar"><i style="left:${it.float * 100}%"></i></div>
      </div>
    </div>
    <p class="note">${it.lock
      ? 'Закреплённый предмет не попадёт в массовую продажу. Бабушку замок не остановит.'
      : 'Закрепи ценное, чтобы случайно не продать его вместе с хламом.'}</p>
    ${restoreBlockHTML(it)}`;

  $('dClose').onclick = closeItemCardView;
  $('dtSell').onclick = (e) => sellItems([it], $('inv2').querySelector(`.icard[data-u="${it.uid}"]`) || e.target);
  if ($('dtResto')) $('dtResto').onclick = () => restore(it);
  if ($('dtMus')) $('dtMus').onclick = () => donate(it, true);
  $('dtLock').onclick = () => {
    it.lock = !it.lock;
    invUi.sel.delete(it.uid);
    save();
    renderInvView();
    tone(it.lock ? 900 : 500, 0.05);
  };
  $('dtUp').onclick = () => {
    upgradeStake = it;
    invUi.open = null;
    goTab('upgrade');
    renderUpgrade();
    renderPicker();
  };
  $('dtCon').onclick = () => {
    if (contractMega) {
      if (it.lock) { toast('Закреплённое в мегаконтракт не кладём — сначала открепи.'); return; }
      if (contractItems.length >= MEGA_MAX && !contractItems.includes(it)) { toast(`В мегаконтракте уже ${MEGA_MAX} предметов.`); return; }
      if (!contractItems.includes(it)) contractItems.push(it);
      invUi.open = null;
      goTab('contract');
      renderContract();
      renderPicker();
      return;
    }
    if (it.lock) { toast('Закреплённое в контракт не кладём — сначала открепи.'); return; }
    if (contractItems.length && contractItems[0].r !== it.r) {
      toast(`В контракте уже «${RARITY[contractItems[0].r].n}». Очисти его или выбери такую же редкость.`);
      return;
    }
    if (contractItems.length >= 10) { toast('В контракте уже 10 предметов.'); return; }
    if (!contractItems.includes(it)) contractItems.push(it);
    invUi.open = null;
    goTab('contract');
    renderContract();
    renderPicker();
  };
}

// «Последние находки» под рулеткой.
function renderRecent() {
  const box = $('recent');
  const last = state.inv.slice(-12).reverse();
  $('goInv').textContent = state.inv.length ? `Весь инвентарь · ${state.inv.length} шт.` : 'Весь инвентарь';
  box.innerHTML = last.length
    ? last.map((x) => itemCardHTML(x, 'recent')).join('')
    : '<span class="empty">Здесь появится то, что выпадет из кейсов.</span>';
  $$('.icard', box).forEach((b) => (b.onclick = () => {
    invUi.multi = false;
    invUi.sel.clear();
    invUi.open = +b.dataset.u;
    goSub('items');
    $('detail').classList.add('show');
  }));
}

// Продажа (или утилизация, если сумма отрицательная).
async function sellItems(list, sourceEl) {
  if (busy) return;
  list = list.filter((x) => state.inv.includes(x));
  if (!list.length) return;
  const v = r2(sum(list, (x) => x.price));
  if (!canPay(v)) { noMoney(v); return; }

  busy = true;
  list.forEach((x) => $('inv2').querySelector(`.icard[data-u="${x.uid}"]`)?.classList.add('gone'));
  floatText(sourceEl, (v >= 0 ? '+' : '−') + fmt(Math.abs(v)), v >= 0 ? 'var(--good)' : 'var(--bad)');
  tone(v >= 0 ? 1200 : 300, 0.1, 'sine', 0.07);
  if (list.length > 5 && v > 0) setTimeout(() => tone(1500, 0.12, 'sine', 0.06), 90);
  await sleep(list.length > 1 ? 300 : 200);

  list.forEach(removeItem);
  state.earn += v;
  busy = false;
  setBal(v);
  renderAll();

  const one = list[0].name;
  if (list.length === 1) toast(v < 0 ? `Выброшено: ${one}. Утилизация ${fmt(-v)}` : `Продано: ${one} за ${fmt(v)}`);
  else toast(v < 0 ? `Выброшено ${list.length} шт. Доплата ${fmt(-v)}` : `Продано ${list.length} шт. за ${fmt(v)}`);
}
$('bulkSell').onclick = (e) => sellItems(selectedItems(), e.target);
// Выбранное — в мегаконтракт: включаем рубильник и переходим в «Контракт».
$('bulkMega').onclick = () => {
  if (busy) return;
  const sel = selectedItems();
  const taken = new Set([...bench, upgradeStake].filter(Boolean)); // то, что уже в контракте, — оставляем
  const ok = sel.filter((x) => !x.lock && !taken.has(x));
  if (!contractMega) contractItems = [];
  contractMega = true;
  const room = MEGA_MAX - contractItems.length;
  const add = ok.filter((x) => !contractItems.includes(x)).slice(0, Math.max(0, room));
  contractItems.push(...add);
  const left = ok.filter((x) => !contractItems.includes(x)).length;
  invUi.sel.clear();
  invUi.multi = false;
  goTab('contract');
  renderContract();
  renderPicker();
  const skipped = [sel.length - ok.length && `закреплённых или занятых: ${sel.length - ok.length}`, left > 0 && `не влезло: ${left}`].filter(Boolean);
  toast(`В мегаконтракте ${contractItems.length} из ${MEGA_MAX}.${skipped.length ? ' Не взяты — ' + skipped.join(', ') + '.' : ''}`);
};
$('bulkClear').onclick = () => {
  // Ничего не выбрано — «Отмена» выключает режим выбора, иначе — снимает выбор.
  if (!invUi.sel.size) invUi.multi = false;
  invUi.sel.clear();
  renderInvView();
};

// Быстрый выбор: всё по фильтру (а не только показанные 200), дешевле N, дубликаты, с минусом.
$$('[data-qs]', $('sub-items')).forEach((b) => (b.onclick = () => {
  const mode = b.dataset.qs;
  // Поиск ещё не применился (пауза после ввода) — применяем сразу, чтобы выбор шёл по тому, что в поле.
  const q = $('ivQ').value.trim().toLowerCase();
  if (q !== invUi.q) {
    clearTimeout(invQTimer);
    invUi.q = q;
    resetInvPage();
  }
  if (mode === 'none') { invUi.sel.clear(); renderInvView(); return; }

  const visible = filteredInventory().filter((x) => !x.lock);
  let chosen = [];
  if (mode === 'all') chosen = visible;
  else if (mode === 'cheap') {
    const limit = parseFloat($('qsCheap').value) || 0;
    chosen = visible.filter((x) => x.price < limit);
  } else if (mode === 'neg') chosen = visible.filter((x) => x.price < 0);
  else if (mode === 'dup') {
    // Из одинаковых оставляем самый дорогой, остальные — в выбор.
    const groups = {};
    visible.forEach((x) => (groups[x.caseId + '|' + baseName(x)] ||= []).push(x));
    Object.values(groups).forEach((g) => {
      if (g.length > 1) chosen.push(...g.sort((a, c) => c.price - a.price).slice(1));
    });
  }

  invUi.multi = true;
  invUi.sel = new Set(chosen.map((x) => x.uid));
  if (!chosen.length) {
    toast(mode === 'dup' ? 'Дубликатов нет. Коллекция уникальна.'
      : mode === 'neg' ? 'Предметов с минусом нет.' : 'Под условие ничего не подходит.');
  }
  renderInvView();
}));

// Сброс прогресса: нужно нажать дважды за 3 секунды.
let resetArmedAt = 0;
$('resetAll').onclick = () => {
  if (busy) return;
  if (crash.state !== 'idle') { toast('Дождись конца раунда «Курса огурцов».'); return; }
  const btn = $('resetAll');
  if (Date.now() - resetArmedAt > 3000) {
    resetArmedAt = Date.now();
    btn.textContent = 'Точно? Нажми ещё раз';
    setTimeout(() => (btn.textContent = 'Начать жизнь заново'), 3000);
    return;
  }
  resetArmedAt = 0; // следующий сброс — снова с подтверждением
  // «Вернуть прежнее» спасёт, если нажал сгоряча. Нетронутую игру не копируем: затёрли бы настоящую копию.
  if (!isFreshGame()) backupCurrent();
  state = freshState();
  contractItems = [];
  upgradeStake = null;
  invUi.sel.clear();
  invUi.open = null;
  save();
  btn.textContent = 'Начать жизнь заново';
  renderAll();
  renderSaves();
  toast('Новая жизнь. Старые носки забыты. Передумаешь — «Вернуть прежнее» под аналитикой.', 3600);
};

function renderInventory() {
  renderPicker();
  renderInvView();
}
