/* ==========================================================================
   Кузня: карты из предметов, колесо удачи, упорство
   ========================================================================== */
'use strict';

const FORGE_MAX = 95;            // выше этого шанса не поднять ничем
const FORGE_FAIL_STEP = 5;       // упорство: +5% к рецепту за каждую неудачу подряд
const FORGE_ADD_STEPS = [5, 10, 20]; // доплата, процентных пунктов
const FORGE_ADD_PRICE = 0.10;    // 1 п.п. доплаты стоит 10% от цены предметов-ингредиентов…
const FORGE_ADD_FLOOR = 0.05;    // …но не меньше 5% цены самого дешёвого кейса масти
const FORGE_TOP_STEP = 1.5;      // самый большой шаг доплаты дороже: каждый п.п. в полтора раза
const FORGE_BURN = [0.3, 0.6];   // при неудаче сгорает от 30 до 60% предметов; карты и остальное возвращаются
const FORGE_MULTS = [1, 2, 3, 5]; // мультикрафт: сколько попыток одной карты за раз
const FORGE_RING_COLORS = ['#ffb02e', '#5eb3ff', '#c39bff', '#f2f4f8', '#ff6b9a']; // стрелки колец по порядку

let forgeCardId = CARDS[0].id;   // карта на наковальне
let forgeSuit = SUITS[0].id;     // какая масть открыта в списке рецептов
let forgeAdd = 0;                // выбранная доплата, п.п.
let forgeMult = 1;               // сколько попыток за раз (мультикрафт)
let forgeNeedleAngle = 0;

// Требование рецепта с учётом мультикрафта: на каждую попытку — свой набор.
const needOf = (q, mult = forgeMult) => q.n * mult;

/* Ручной выбор на наковальне. pinned[i] — предметы, которые игрок сам положил в i-е требование
   рецепта; skip — убранные им: вместо них Кузня берёт следующие подходящие. Действует только для
   карты card и сбрасывается при смене карты и после ковки. */
let forgeSel = { card: null, pinned: {}, skip: new Set() };
let forgeTab = -1; // какое требование открыто в «Что можно положить» (-1 — выбрать само)
function resetForgeSel() {
  forgeSel = { card: forgeCardId, pinned: {}, skip: new Set() };
  forgeTab = -1;
}

// Рецепт открыт: двойки–четвёрки — сразу, остальные — когда младшая карта масти уже была в коллекции.
function recipeOpen(card) {
  return card.rank < 3 || cardKnown(card.suit.id + RANK_IDS[card.rank - 1]);
}

// Предмет, нужный особому рецепту, игрок уже видел: он есть в инвентаре или в музее. Поделку — ещё и если
// её рецепт уже открыт в книге Мастерской.
function itemSeen(name) {
  const e = CATALOG_BY_NAME.get(name);
  if (e.c === CRAFT_ROOM && state.recipes[RECIPES[e.i].id]) return true;
  return !!state.museum[museumKey(e.c.id, e.i)] || state.inv.some((x) => x.caseId === e.c.id && idxOf(x) === e.i);
}

function fitsNeed(it, q, suit) {
  if (it.special || it.lock) return false;
  if (q.item) {
    const e = CATALOG_BY_NAME.get(q.item);
    return it.caseId === e.c.id && idxOf(it) === e.i;
  }
  return it.r === q.r && suit.cases.includes(it.caseId);
}

/* План ковки: какие предметы пойдут в дело и чего не хватает. mult — сколько попыток за раз: каждой
   нужен свой полный набор. Берём самые дешёвые; лучший экземпляр для музея, именные предметы других
   рецептов и занятые на верстаке, в контракте и в апгрейде не трогаем без нужды.
   sets[k] — набор k-й попытки: по q.n предметов каждого требования и его стоимость. */
function forgePlan(card, mult = forgeMult) {
  const rec = CARD_RECIPES.get(card.id);
  const taken = takenItems();
  const used = new Set();
  const sel = forgeSel.card === card.id ? forgeSel : null;
  const rows = rec.need.map((q, i) => {
    const need = needOf(q, mult);
    if (q.card) return { q, need, have: Math.min(cardCount(q.card), need), items: [], pinned: [], blocked: 0 };
    const free = (it) => !taken.has(it) && !used.has(it) && fitsNeed(it, q, card.suit);
    // Сначала то, что игрок положил сам (если оно всё ещё в инвентаре и подходит), потом — автоподбор.
    const pinned = sel ? (sel.pinned[i] || []).filter((it) => state.inv.includes(it) && free(it)).slice(0, need) : [];
    pinned.forEach((x) => used.add(x));
    const pool = state.inv.filter((it) => free(it) && !(sel && sel.skip.has(it)));
    const keep = new Set();
    const best = new Map();
    for (const x of pool) {
      if (!museumWants(x)) continue;
      const k = itemKey(x);
      if (!best.has(k) || x.float < best.get(k).float) best.set(k, x);
    }
    best.forEach((x) => keep.add(x));
    // Именной предмет чужого рецепта в «кучу» идёт последним: он нужен старшей карте.
    const named = (x) => !q.item && FORGE_NAMED_SET.has(baseName(x));
    pool.sort((a, b) => named(a) - named(b) || keep.has(a) - keep.has(b) || a.price - b.price);
    const items = [...pinned, ...pool.slice(0, need - pinned.length)];
    items.forEach((x) => used.add(x));
    // Есть подходящие, но закреплённые или занятые на верстаке, в контракте, в апгрейде — подскажем.
    const blocked = items.length < need
      ? state.inv.filter((it) => !used.has(it) && (it.lock || taken.has(it)) && fitsNeed(Object.assign({}, it, { lock: false }), q, card.suit)).length
      : 0;
    return { q, need, have: items.length, items, pinned, blocked };
  });
  const items = rows.flatMap((r) => r.items);
  const sets = [];
  for (let k = 0; k < mult; k++) {
    const its = rows.flatMap((r) => r.items.slice(k * r.q.n, (k + 1) * r.q.n));
    sets.push({ items: its, value: sum(its, (x) => Math.max(0, x.price)) });
  }
  return { rec, mult, rows, items, sets, ok: rows.every((r) => r.have >= r.need), value: sum(items, (x) => Math.max(0, x.price)) };
}

// На сколько попыток за раз хватает предметов и карт (из FORGE_MULTS).
function forgeMaxMult(card) {
  for (let k = FORGE_MULTS.length - 1; k > 0; k--) if (forgePlan(card, FORGE_MULTS[k]).ok) return FORGE_MULTS[k];
  return 1;
}

// Шанс в процентах: база рецепта + упорство + бонус за собранные масти + доплата, не выше FORGE_MAX.
const forgeBase = (card) => CARD_RECIPES.get(card.id).chance + (state.forgeFails[card.id] || 0) * FORGE_FAIL_STEP + forgeBonus();
const forgeChance = (card, add = 0) => Math.min(FORGE_MAX, forgeBase(card) + add);
// Цена 1 п.п. доплаты для набора стоимостью value: 10% от неё, но не меньше 5% самого дешёвого кейса масти.
const forgeFloor = (card) => Math.min(...card.suit.cases.map((id) => roomById(id).price)) * FORGE_ADD_FLOOR;
const forgePointPrice = (card, value, step) =>
  r2(Math.max(value * FORGE_ADD_PRICE, forgeFloor(card)) * (step === FORGE_ADD_STEPS[FORGE_ADD_STEPS.length - 1] ? FORGE_TOP_STEP : 1));
// Доплата, которая реально пойдёт в дело: выше FORGE_MAX шанс не поднимается.
const forgeAddUsed = (card, add, base = forgeBase(card)) => Math.max(0, Math.min(add, FORGE_MAX - base));

/* Серия попыток: шансы, доплата и исход каждой. Упорство растёт после каждой неудачи и в самой серии,
   удача его сбрасывает. Исходы решаются здесь же (rolls) — или без них, чтобы посчитать цену заранее:
   lo — если всё время везёт (упорство не растёт), hi — если не везёт (доплата упирается в потолок). */
function forgeSeries(card, plan, step, rolls) {
  const rec = CARD_RECIPES.get(card.id);
  let fails = state.forgeFails[card.id] || 0;
  const out = [];
  plan.sets.forEach((set, k) => {
    const base = rec.chance + fails * FORGE_FAIL_STEP + forgeBonus();
    const add = forgeAddUsed(card, step, base);
    const chance = Math.min(FORGE_MAX, base + add);
    const cost = r2(add * forgePointPrice(card, set.value, step));
    const win = rolls ? rolls[k] * 100 < chance : true;
    out.push({ k, set, base, add, chance, cost, win, fails });
    fails = win ? 0 : fails + 1;
  });
  return out;
}
// Цена доплаты за всю серию: точная для одной попытки, для нескольких — от и до (зависит от удачи).
function forgeCost(card, plan, step) {
  if (!step) return { lo: 0, hi: 0 };
  const lucky = forgeSeries(card, plan, step, plan.sets.map(() => 0));
  const unlucky = forgeSeries(card, plan, step, plan.sets.map(() => 1));
  const tot = (xs) => r2(sum(xs, (x) => x.cost));
  return { lo: Math.min(tot(lucky), tot(unlucky)), hi: Math.max(tot(lucky), tot(unlucky)) };
}

// Короткая подпись требования: «Хлам», «Оливье с первого января», «❓ загадка», «10♥ Повар из столовой».
function needLabel(q, card) {
  if (q.card) return cardTitle(CARD_BY_ID.get(q.card));
  if (q.item) return itemSeen(q.item) ? q.item : '❓ ' + (CARD_RECIPES.get(card.id).riddle[q.item] || 'особый предмет');
  return RARITY[q.r].n;
}
// Пояснение к требованию: откуда брать.
function needWhere(q, card) {
  if (q.card) return 'карта из коллекции — уйдёт в дело при успехе, при неудаче останется';
  if (isCraftNeed(q)) return itemSeen(q.item) ? 'поделка Мастерской: подойдёт любой экземпляр, с любым износом' : 'загадка: эту поделку ты ещё не собирал — её делают на верстаке Мастерской';
  if (q.item) return itemSeen(q.item) ? 'особый предмет: подойдёт любой экземпляр, с любым износом' : 'загадка: этот предмет ещё не попадался';
  return `редкость «${RARITY[q.r].n}» из кейсов масти ${card.suit.sym} ${card.suit.name}: ` +
    card.suit.cases.map((id) => roomById(id).name).join(', ');
}
const needColor = (q) => (q.card ? cardColor(CARD_BY_ID.get(q.card))
  : RARITY[q.item ? CATALOG_BY_NAME.get(q.item).r : q.r].c);

// Слоты наковальни: по стопке на требование рецепта (сколько набрано и на какую сумму), в конце — будущая
// карта. Нажатие на стопку открывает её вкладку в «Что можно положить».
function renderSlots(card, plan) {
  const parts = plan.rows.map((r, ri) => {
    const label = needLabel(r.q, card);
    const short = r.have < r.need;
    const stack = r.need > 1 ? ' stack' : '';
    if (r.q.card) {
      return `<button type="button" class="fslot card${stack}${short ? ' short' : ''}" data-row="${ri}" style="--c:${needColor(r.q)}"
          title="${label} — нужно ${r.need}, в коллекции ×${cardCount(r.q.card)}" aria-label="Карта ${label}: ${r.have} из ${r.need}"${ri === forgeTab ? ' aria-current="true"' : ''}>
        ${cardHTML(CARD_BY_ID.get(r.q.card), { size: 'xs', attrs: 'aria-hidden="true"' })}<span class="n" aria-hidden="true">${r.have}/${r.need}</span></button>`;
    }
    const x = r.items[0];
    const ic = x ? x.ic : r.q.item ? (itemSeen(r.q.item) ? CATALOG_BY_NAME.get(r.q.item).ic : '❓') : '?';
    const total = sum(r.items, (y) => y.price);
    return `<button type="button" class="fslot${stack}${x ? '' : ' empty'}${short ? ' short' : ''}${ri === forgeTab ? ' cur' : ''}" data-row="${ri}" style="--c:${needColor(r.q)}"
        title="${label}: ${r.have} из ${r.need}${r.items.length ? ' · ' + fmt(total) : ''} — нажми, чтобы выбрать предметы" aria-label="${label}: ${r.have} из ${r.need}${r.items.length ? ', ' + fmt(total) : ''}"${ri === forgeTab ? ' aria-current="true"' : ''}>
      ${r.pinned.length ? '<span class="pin">✋</span>' : ''}${isCraftNeed(r.q) ? '<span class="cft" title="Поделка Мастерской">🔨</span>' : ''}<span class="ic">${ic}</span>
      <span class="n">${r.have}/${r.need}</span>${r.items.length ? `<span class="p${total < 0 ? ' neg' : ''}">${slotMoney(total)}</span>` : ''}</button>`;
  });
  $('fSlots').classList.toggle('tight', plan.rows.length >= 5); // пять требований (с поделкой) — слоты поуже
  $('fSlots').innerHTML = parts.join('<span class="fop" aria-hidden="true">+</span>') +
    `<span class="fop" aria-hidden="true">→</span><div class="fslot out" aria-hidden="true">${cardHTML(card, { size: 'xs' })}${plan.mult > 1 ? `<span class="n">×${plan.mult}</span>` : ''}</div>`;
  $$('button.fslot', $('fSlots')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeTab = +b.dataset.row;
    renderAnvil();
    $('fPickBox').scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    tone(600, 0.03);
  }));
}

/* «Где взять» недостающее: кейсы масти, где эта редкость или этот предмет падает, сколько примерно
   открыть и во что это обойдётся. Загадку не раскрываем — только масть. */
function whereHTML(card, row) {
  const q = row.q;
  const miss = row.need - row.have;
  if (miss <= 0) return '';
  if (q.card) {
    const c = CARD_BY_ID.get(q.card);
    return `<div class="fwhere"><b>Где взять:</b> выковать ${cardTitle(c)} в Кузне${miss > 1 ? ` (ещё ${miss})` : ''}.
      <button type="button" class="btn sm" data-wcard="${c.id}">⚒️ К рецепту</button></div>`;
  }
  if (isCraftNeed(q)) {
    const rcp = RECIPES[CATALOG_BY_NAME.get(q.item).i];
    const how = state.recipes[rcp.id]
      ? `собрать в Мастерской «${rcp.out[2]}»: ${rcp.keys.map((x) => `${x.ic} ${x.name}${x.q > 1 ? ' ×' + x.q : ''}`).join(' + ')}`
      : 'загадка — это поделка Мастерской. Рецепт откроется, когда соберёшь её на верстаке впервые';
    return `<div class="fwhere"><b>Где взять:</b> ${how}.
      <button type="button" class="btn sm" data-wcraft="1">🔨 В Мастерскую</button></div>`;
  }
  if (q.item && !itemSeen(q.item)) {
    return `<div class="fwhere"><b>Где взять:</b> загадка — этот предмет падает в одном из кейсов масти ${card.suit.sym} ${card.suit.name}.</div>`;
  }
  // Шанс получить нужное за одно открытие кейса c (с удачей и баффом, как в самом кейсе).
  const perOpen = (c) => sum(c.items.map((x, i) => [x, i]).filter(([x]) => (q.item ? x[2] === q.item : x[0] === q.r)), ([, i]) => chanceOf(c, i)) / 100;
  const opts = card.suit.cases.map(roomById).map((c) => ({ c, p: perOpen(c) })).filter((o) => o.p > 0)
    .map((o) => ({ ...o, opens: Math.ceil(miss / o.p), cost: Math.ceil(miss / o.p) * casePrice(o.c) }))
    .sort((a, b) => a.cost - b.cost).slice(0, 3);
  return `<div class="fwhere"><b>Где взять ещё ${miss}:</b>` + opts.map((o) => `
    <div class="fw-row"><span class="fw-ic" style="--cc:${o.c.color}">${o.c.ic}</span>
      <span class="fw-t">${o.c.name}<small>${fmtPct(o.p * 100, o.p < 0.01 ? 2 : 1)} за открытие · ≈ ${o.opens} ${plural(o.opens, 'открытие', 'открытия', 'открытий')} · ~${fmtShort(o.cost)}</small></span>
      <button type="button" class="btn sm" data-wcase="${o.c.id}">К кейсу →</button></div>`).join('') + '</div>';
}

// «Что можно положить»: вкладка на каждое требование-предмет и все подходящие предметы инвентаря.
const PICK_LIMIT = 120;
function renderPick(card, plan) {
  const rows = plan.rows.map((r, i) => ({ r, i }));
  $('fPickBox').hidden = !recipeOpen(card);
  if ($('fPickBox').hidden) return;
  if (!rows.some(({ i }) => i === forgeTab)) {
    const miss = rows.find(({ r }) => r.have < r.need && !r.q.card) || rows.find(({ r }) => r.have < r.need);
    forgeTab = (miss || rows.find(({ r }) => !r.q.card) || rows[0]).i;
  }
  $('fPickTabs').innerHTML = rows.map(({ r, i }) => `<button type="button" class="chip" data-need="${i}" aria-pressed="${i === forgeTab}" style="--c:${needColor(r.q)}">
    <i></i>${needLabel(r.q, card)} <b>${r.have}/${r.need}</b></button>`).join('');
  $$('[data-need]', $('fPickTabs')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeTab = +b.dataset.need;
    renderAnvil();
    tone(600, 0.03);
  }));

  const row = plan.rows[forgeTab];
  const q = row.q;
  $('fPickHelp').textContent = needWhere(q, card);
  $('fWhere').innerHTML = whereHTML(card, row);
  $$('[data-wcase]', $('fWhere')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    currentCase = roomById(b.dataset.wcase);
    goTab('cases');
    renderCases();
    renderArena();
  }));
  $$('[data-wcraft]', $('fWhere')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    goTab('inventory');
    setSub('craft');
  }));
  $$('[data-wcard]', $('fWhere')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeCardId = b.dataset.wcard;
    forgeAdd = 0;
    forgeMult = 1;
    resetForgeSel();
    renderForge();
    $('fName').scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }));
  $('fPickReset').hidden = !(forgeSel.card === card.id && (forgeSel.skip.size || Object.values(forgeSel.pinned).some((p) => p.length)));
  if (q.card) {
    $('fPick').innerHTML = '';
    $('fPickNote').textContent = '';
    return;
  }
  if (q.item && !itemSeen(q.item)) {
    $('fPick').innerHTML = '';
    $('fPickNote').textContent = ''; // загадка — на вкладке, где искать — в «Где взять»
    return;
  }
  const taken = takenItems();
  const inRow = new Set(row.items);
  const elsewhere = new Set(plan.items.filter((x) => !inRow.has(x)));
  // Все подходящие, включая закреплённые и занятые — их показываем приглушёнными, с причиной.
  const all = state.inv.filter((it) => !it.special && fitsNeed(it.lock ? Object.assign({}, it, { lock: false }) : it, q, card.suit));
  const why = (x) => (x.lock ? 'закреплён' : taken.has(x) ? 'занят: верстак, контракт или апгрейд' : elsewhere.has(x) ? 'уже лежит в другом слоте' : '');
  const namedFor = (x) => !q.item && FORGE_NAMED_SET.has(baseName(x));
  all.sort((a, b) => inRow.has(b) - inRow.has(a) || !!why(a) - !!why(b) || a.price - b.price);
  $('fPick').innerHTML = all.slice(0, PICK_LIMIT).map((x) => {
    const off = why(x);
    const on = inRow.has(x);
    return `<button type="button" class="inv-item${on ? ' sel' : ''}${off ? ' dim' : ''}" style="--c:${RARITY[x.r].c}" data-uid="${x.uid}"${off ? ` data-why="${off}"` : ''}
        title="${x.name} · ${x.wear} · ${fmt(x.price)}${off ? ' — ' + off : on ? ' — в Кузне, нажми, чтобы убрать' : ' — нажми, чтобы положить'}${namedFor(x) ? ' · нужен по особому рецепту, Кузня берёт его последним' : ''}"${off ? ' aria-disabled="true"' : ''}>
      ${x.lock ? '<span class="st" style="background:var(--muted)">🔒</span>' : namedFor(x) ? '<span class="st nm">🔎</span>' : x.stat ? '<span class="st">ST</span>' : ''}
      <span class="ic">${x.ic}</span>${baseName(x)}<span class="p${x.price < 0 ? ' neg' : ''}">${fmt(x.price)}</span></button>`;
  }).join('');
  $$('.inv-item', $('fPick')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    if (b.classList.contains('dim')) { toast('Этот предмет не взять: ' + (b.dataset.why || 'он занят') + '.'); return; }
    forgeToggle(forgeTab, +b.dataset.uid);
  }));
  const more = all.length - PICK_LIMIT;
  $('fPickNote').textContent = !all.length ? (isCraftNeed(q) ? 'Такой поделки в инвентаре нет — собери её в Мастерской.' : 'В инвентаре таких предметов нет — открывай кейсы этой масти.')
    : more > 0 ? `Показаны первые ${PICK_LIMIT} — ещё ${more} подходят. Сначала идут выбранные и самые дешёвые.`
    : row.pinned.length || forgeSel.skip.size ? 'Нажми на выбранный предмет, чтобы Кузня взяла другой.' : 'Кузня выбрала самые дешёвые. Нажми на другой предмет, чтобы положить его.';
}

$('fPickReset').onclick = () => {
  if (busy) return;
  const tabNow = forgeTab;
  resetForgeSel();
  forgeTab = tabNow;
  renderForge();
  tone(600, 0.03);
};

// Положить предмет в требование row или убрать оттуда (тогда Кузня возьмёт следующий подходящий).
function forgeToggle(row, uid) {
  const card = CARD_BY_ID.get(forgeCardId);
  if (forgeSel.card !== card.id) forgeSel = { card: card.id, pinned: {}, skip: new Set() }; // открытую вкладку не трогаем
  const it = state.inv.find((x) => x.uid === uid);
  if (!it) return;
  const r = forgePlan(card).rows[row];
  const pins = forgeSel.pinned[row] || (forgeSel.pinned[row] = []);
  if (r.items.includes(it)) {
    const k = pins.indexOf(it);
    if (k >= 0) pins.splice(k, 1);
    forgeSel.skip.add(it);
    tone(500, 0.03);
  } else {
    forgeSel.skip.delete(it);
    // Слотов не хватает — освобождаем место: сначала от автоподбора, потом от самого раннего ручного.
    if (r.items.length >= r.need) {
      const auto = r.items.filter((x) => !pins.includes(x));
      forgeSel.skip.add(auto.length ? auto[auto.length - 1] : pins.shift());
    }
    pins.push(it);
    tone(760, 0.04);
  }
  renderForge();
}

// Короткий статус рецепта для списка.
function recipeStatus(card, plan) {
  if (!recipeOpen(card)) {
    const prev = CARD_BY_ID.get(card.suit.id + RANK_IDS[card.rank - 1]);
    return { cls: 'lock', text: `🔒 Сначала выкуй ${cardTitle(prev)}` };
  }
  if (plan.ok) return { cls: 'ok', text: '✅ Можно ковать' };
  const miss = plan.rows.filter((r) => r.have < r.need);
  const r = miss[0];
  const more = miss.length > 1 ? ` и ещё ${miss.length - 1}` : '';
  return { cls: 'miss', text: `Не хватает: ${needLabel(r.q, card)} ×${r.need - r.have}${more}` };
}

function renderForge() {
  const fk = focusKey($('v-cards'));
  renderForgeNow();
  restoreFocus(fk);
}
function renderForgeNow() {
  // Масти
  $('fSuits').innerHTML = SUITS.map((s) => {
    const n = CARDS.filter((c) => c.suit === s && cardKnown(c.id)).length;
    return `<button type="button" class="chip" data-suit="${s.id}" aria-pressed="${s.id === forgeSuit}" style="--c:${s.color}">
      <span class="sym">${s.sym}</span> ${s.name} <b>${n}/${CARDS_PER_SUIT}</b></button>`;
  }).join('');
  $$('[data-suit]', $('fSuits')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeSuit = b.dataset.suit;
    renderForge();
    tone(600, 0.03);
  }));

  // Список рецептов масти
  $('fList').innerHTML = CARDS.filter((c) => c.suit.id === forgeSuit).map((card) => {
    const open = recipeOpen(card);
    const plan = open ? forgePlan(card, 1) : null;
    const st = recipeStatus(card, plan);
    const n = cardCount(card.id);
    return `<button type="button" class="frec ${st.cls}${card.id === forgeCardId ? ' sel' : ''}" data-card="${card.id}"${card.id === forgeCardId ? ' aria-current="true"' : ''}>
      ${cardKnown(card.id) || open ? cardHTML(card, { size: 'xs', attrs: 'aria-hidden="true"' }) : cardBackHTML(card, { size: 'xs', attrs: 'aria-hidden="true"' })}
      <span class="fr-t"><b>${RANKS[card.rank]}${card.suit.sym} ${open || cardKnown(card.id) ? card.name : '???'}</b>
        <small>${st.text}${n ? ` · в коллекции ×${n}` : ''}</small></span>
      <span class="fr-p">${open ? forgeChance(card) + '%' : ''}</span>
    </button>`;
  }).join('');
  $$('.frec', $('fList')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeCardId = b.dataset.card;
    forgeAdd = 0;
    forgeMult = 1;
    resetForgeSel();
    renderForge();
    tone(700, 0.03);
  }));

  renderAnvil();
}

// Перерисовка наковальни — с возвратом фокуса на ту же кнопку (×N, доплата, стопка, вкладка).
function renderAnvil() {
  const fk = focusKey($('v-cards'));
  renderAnvilNow();
  restoreFocus(fk);
}
function renderAnvilNow() {
  const card = CARD_BY_ID.get(forgeCardId);
  const open = recipeOpen(card);
  const plan = forgePlan(card);
  $('fCard').innerHTML = open || cardKnown(card.id) ? cardHTML(card, { count: cardCount(card.id) }) : cardBackHTML(card);
  $('fName').innerHTML = `${cardTitle(card)} <small>${{ base: 'обычный рецепт', ladder: 'лесенка', special: 'особый рецепт' }[plan.rec.kind]}</small>`;

  renderSlots(card, plan);
  renderPick(card, plan);

  // Мультикрафт: сколько попыток за раз. Больше, чем хватает предметов, выбрать можно — слоты покажут нехватку.
  const maxMult = open ? forgeMaxMult(card) : 1;
  $('fMult').innerHTML = '<span class="lbl">Попыток:</span><span class="seg" role="group" aria-label="Попыток за раз">' + FORGE_MULTS.map((m) =>
    `<button type="button" data-fmult="${m}" aria-pressed="${m === forgeMult}" title="${m > maxMult ? `Предметов хватает на ×${maxMult}` : m === 1 ? 'Одна попытка' : `${m} попытки одной карты разом, у каждой — свой набор предметов`}"${m > maxMult ? ' class="short"' : ''}>×${m}</button>`).join('') + '</span>' +
    (open ? `<span class="lbl fm-max">${maxMult > 1 ? `хватает на ×${maxMult}` : 'хватает на одну'}</span>` : '');
  $$('[data-fmult]', $('fMult')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeMult = +b.dataset.fmult;
    renderAnvil();
    tone(650, 0.03);
  }));

  // Шанс и доплата. Цена доплаты — за всю серию; у серии она может зависеть от удачи (упорство).
  const steps = [0, ...FORGE_ADD_STEPS];
  const costOf = (p) => forgeCost(card, plan, p);
  // Выбранная доплата бесполезна (шанс упёрся в потолок) или не по карману — сбрасываем.
  if (forgeAdd && (forgeAddUsed(card, forgeAdd) <= 0 || costOf(forgeAdd).hi > state.bal)) forgeAdd = 0;
  // Выбранный шаг упёрся в потолок (например, упорство выросло) — подсвечиваем тот, что реально работает.
  for (let k = steps.indexOf(forgeAdd); k > 0 && forgeAddUsed(card, steps[k]) <= forgeAddUsed(card, steps[k - 1]); k--) forgeAdd = steps[k - 1];
  const add = forgeAddUsed(card, forgeAdd);
  const chance = forgeChance(card, add);
  const series = forgeSeries(card, plan, forgeAdd);
  renderWheel(open ? series.map(() => chance) : [0], plan.mult);
  $('fPct').innerHTML = !open ? '—<small>рецепт закрыт</small>'
    : plan.mult > 1 ? `×${plan.mult}<small>шанс ${chance}%</small>` : `${chance}%<small>шанс успеха</small>`;
  const money = (c) => (c.lo === c.hi ? fmtShort(c.hi) : 'до ' + fmtShort(c.hi));
  $('fAdd').innerHTML = steps.map((p, k) => {
    const cost = costOf(p);
    // Шаг бесполезен, если шанс уже упёрся в потолок на предыдущем, или на него нет денег.
    const capped = k > 0 && forgeAddUsed(card, p) <= forgeAddUsed(card, steps[k - 1]);
    const off = capped || (k > 0 && cost.hi > state.bal);
    return `<button type="button" class="btn${p === forgeAdd ? ' primary' : ''}" data-fadd="${p}"${off ? ' disabled' : ''}>
      ${p ? `+${p}% <small>${capped ? 'потолок' : money(cost)}</small>` : 'Без доплаты'}</button>`;
  }).join('');
  $$('[data-fadd]', $('fAdd')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    forgeAdd = +b.dataset.fadd;
    renderAnvil();
    tone(700, 0.04);
  }));
  const fails = state.forgeFails[card.id] || 0;
  // Из чего сложился шанс — значками, как «🍀 удача» у кнопки открытия кейса.
  const bits = [`<span title="Базовый шанс этой карты: чем старше карта, тем он ниже">🎯 шанс ${plan.rec.chance}%</span>`];
  if (fails) bits.push(`<span class="up" title="После каждой неудачи подряд следующая попытка удачнее">💪 упорство +${Math.min(fails * FORGE_FAIL_STEP, FORGE_MAX)}%</span>`);
  if (forgeBonus()) bits.push(`<span class="up" title="+${FORGE_SUIT_BONUS}% за каждую собранную масть">🃏 масти +${forgeBonus()}%</span>`);
  if (add) {
    const c = costOf(forgeAdd);
    bits.push(`<span class="pay" title="Доплата сгорает и при неудаче${plan.mult > 1 ? '; у серии цена зависит от удачи: упорство может упереть шанс в потолок' : ''}">💰 доплата +${add}%${plan.mult > 1 ? ` ×${plan.mult}` : ''} · ${money(c)}</span>`);
  }
  if (chance >= FORGE_MAX) bits.push(`<span class="cap" title="Выше шанс не поднимается ничем">🔝 максимум ${FORGE_MAX}%</span>`);
  const burn = `${Math.round(FORGE_BURN[0] * 100)}–${Math.round(FORGE_BURN[1] * 100)}%`;
  $('fHint').innerHTML = open
    ? `<span class="fchance">${bits.join('')}</span>` +
      (plan.mult > 1
        ? `<span class="fburn">🔁 Кольца останавливаются по очереди: неудача добавляет следующим +${FORGE_FAIL_STEP}%, удача сбрасывает упорство. 🔥 Неудачная попытка сжигает свою доплату и ${burn} своего набора</span>`
        : `<span class="fburn">🔥 Не повезёт — сгорят доплата и ${burn} предметов, карты останутся</span>`)
    : recipeStatus(card, forgePlan(card, 1)).text;

  const go = $('fGo');
  go.disabled = busy || !open || !plan.ok;
  go.textContent = plan.mult > 1 ? `⚒️ Ковать ×${plan.mult}` : fails ? '⚒️ Ковать ещё раз' : '⚒️ Ковать';
}

/* Колесо. Одна попытка — как раньше: зелёный сектор и стрелка. Серия — кольца, по одному на попытку,
   у каждого своя зелёная дуга (шанс) и своя стрелка своего цвета; внешнее кольцо — первая попытка. */
function renderWheel(chances, mult) {
  const w = $('fWheel');
  const multi = mult > 1;
  w.classList.toggle('multi', multi);
  w.style.setProperty('--ch', (multi ? 0 : chances[0]) + '%');
  w.style.setProperty('--rings', multi ? mult : 0);
  w.classList.toggle('thin', mult >= 5);
  const have = $$('.fring', w);
  have.forEach((r) => r.classList.remove('won', 'lost')); // итоги прошлой серии не переносим
  if (!multi || have.length !== mult) {
    $$('.fring, .fneedle', w).forEach((x) => x.remove());
    if (!multi) return;
    // Стрелка — соседний элемент кольца, а не вложенный: кольцо обрезано маской, стрелку она бы съела.
    const html = chances.map((c, k) => `<div class="fring" style="--k:${k}"></div><div class="fneedle" style="--k:${k};--nc:${FORGE_RING_COLORS[k]}"></div>`).join('');
    w.insertAdjacentHTML('afterbegin', html);
  }
  $$('.fring', w).forEach((r, k) => r.style.setProperty('--ch', chances[k] + '%'));
}

// Куда остановить стрелку: в зелёный сектор при удаче, в красный — при неудаче (не у самой границы).
const forgeLanding = (chance, win) => {
  const p = chance / 100;
  return win ? rnd() * p * 360 * 0.94 + p * 360 * 0.03 : p * 360 + (rnd() * 0.94 + 0.03) * (1 - p) * 360;
};
const ringAngles = [];

$('fGo').onclick = async () => {
  const card = CARD_BY_ID.get(forgeCardId);
  if (busy || !recipeOpen(card)) return;
  const plan = forgePlan(card);
  if (!plan.ok) return;
  if (forgeCost(card, plan, forgeAdd).hi > state.bal) { toast('Не хватает денег на доплату.'); return; }
  busy = true;
  $('fGo').disabled = true;

  // Исходы всей серии решаются сразу и сразу записываются — перезагрузкой не отменить и не потерять.
  const series = forgeSeries(card, plan, forgeAdd, plan.sets.map(() => rnd()));
  const cost = r2(sum(series, (a) => a.cost));
  if (cost > 0) setBal(-cost);
  for (const a of series) {
    if (a.win) {
      a.set.items.forEach(removeItem);
      for (const q of plan.rec.need) {
        if (!q.card) continue;
        state.cards[q.card] = cardCount(q.card) - q.n;
        if (state.cards[q.card] <= 0) delete state.cards[q.card];
      }
      state.cards[card.id] = cardCount(card.id) + 1;
      state.cardsEver[card.id] = true;
      delete state.forgeFails[card.id];
      state.forged++;
    } else {
      const pool = a.set.items.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const share = FORGE_BURN[0] + rnd() * (FORGE_BURN[1] - FORGE_BURN[0]);
      a.burned = pool.slice(0, Math.max(1, Math.round(pool.length * share)));
      a.burned.forEach(removeItem);
      state.forgeFails[card.id] = (state.forgeFails[card.id] || 0) + 1;
      state.forgeLost++;
    }
  }
  const mult = plan.mult;
  const wins = series.filter((a) => a.win).length;
  holdXP(sum(series, (a) => (a.win ? 6 + card.rank * 2 : 3)));
  forgeAdd = 0;
  resetForgeSel();
  save(); // исход уже записан; инвентарь и статистику перерисуем после колеса — не раскрывать результат заранее

  if (mult === 1) {
    const a = series[0];
    forgeNeedleAngle = Math.ceil(forgeNeedleAngle / 360) * 360 + 360 * 6 + forgeLanding(a.chance, a.win);
    $('fNeedle').style.transform = `rotate(${forgeNeedleAngle}deg)`;
    let ticks = 0;
    const ticker = setInterval(() => tone(820 - ticks++ * 12, 0.02, 'square', 0.03), 90);
    await sleep(reducedMotion ? 100 : 4300);
    clearInterval(ticker);
  } else {
    // Все стрелки крутятся разом и останавливаются по очереди, снаружи внутрь. Когда кольцо остановилось,
    // у следующих дуга меняется на их настоящий шанс (упорство после неудачи, сброс после удачи).
    renderWheel(series.map((a, k) => (k === 0 ? a.chance : series[0].chance)), mult);
    const rings = $$('.fring', $('fWheel'));
    const first = reducedMotion ? 150 : 2600;
    const gap = reducedMotion ? 80 : 650;
    rings.forEach((r, k) => {
      const a = series[k];
      ringAngles[k] = Math.ceil((ringAngles[k] || 0) / 360) * 360 + 360 * (5 + k) + forgeLanding(a.chance, a.win);
      const nd = r.nextElementSibling;
      nd.style.transitionDuration = first + k * gap + 'ms';
      nd.style.transform = `rotate(${ringAngles[k]}deg)`;
    });
    let ticks = 0;
    const ticker = setInterval(() => tone(820 - (ticks++ % 40) * 10, 0.02, 'square', 0.025), 110);
    await sleep(first);
    for (let k = 0; k < mult; k++) {
      const a = series[k];
      rings[k].classList.add(a.win ? 'won' : 'lost');
      tone(a.win ? 880 : 220, 0.08, a.win ? 'triangle' : 'sawtooth', 0.05);
      if (k + 1 < mult) rings.slice(k + 1).forEach((r, j) => r.style.setProperty('--ch', series[k + 1].chance + '%'));
      if (k + 1 < mult) await sleep(gap);
    }
    clearInterval(ticker);
    await sleep(reducedMotion ? 50 : 500);
  }
  releaseXP();
  busy = false;
  renderInventory();
  renderStats();
  renderCards();

  const burnedAll = series.flatMap((a) => a.burned || []);
  if (wins) {
    const box = $('fCard');
    replay(box, 'forged');
    const r = box.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, [card.suit.color, RARITY[RANK_RARITY[card.rank]].hex, '#ffffff'], 80 + card.rank * 20);
    fanfare(RANK_RARITY[card.rank]);
  } else {
    sad();
    shake();
  }
  if (mult > 1) { showForgeResult(card, series, cost); return; }
  if (document.activeElement === document.body) $('fGo').focus({ preventScroll: true }); // кнопка была выключена на время ковки
  const a = series[0];
  if (a.win) {
    toast(`Выкована карта ${cardTitle(card)}!${cardCount(card.id) > 1 ? ` Теперь их ×${cardCount(card.id)}.` : ''}`, 3200, { important: card.rank >= 9 });
  } else {
    const names = burnedAll.map((x) => x.name);
    toast(`Не выковалось. Сгорело: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` и ещё ${names.length - 3}` : ''}` +
      `${cost > 0 ? `, доплата ${fmt(cost)}` : ''}.` +
      (a.chance < FORGE_MAX ? ` Упорство: +${FORGE_FAIL_STEP}% к следующей попытке.` : ''), 4200);
  }
};

// Итог серии: окно со строкой на каждую попытку.
function showForgeResult(card, series, cost) {
  const wins = series.filter((a) => a.win).length;
  $('frTitle').textContent = wins ? `Выковано ${wins} из ${series.length}` : `Ни одной из ${series.length}`;
  $('frSub').textContent = `${cardTitle(card)}${wins ? ` · теперь в коллекции ×${cardCount(card.id)}` : ''}${cost > 0 ? ` · доплата ${fmt(cost)}` : ''}`;
  $('frIc').innerHTML = cardHTML(card, { size: 'xs' });
  $('frList').innerHTML = series.map((a) => {
    const names = (a.burned || []).map((x) => x.name);
    return `<li style="--nc:${FORGE_RING_COLORS[a.k]}"><i aria-hidden="true"></i><b>${a.win ? '✅ Выковано' : '❌ Не вышло'}</b>
      <span>шанс ${a.chance}%${a.cost ? ` · доплата ${fmtShort(a.cost)}` : ''}${a.win ? ' · предметы ушли в дело' : ` · сгорело ${names.length}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` и ещё ${names.length - 2}` : ''}`}</span></li>`;
  }).join('');
  $('forgeRes').hidden = false;
  $('frOk').focus({ preventScroll: true });
}
$('frOk').onclick = () => { $('forgeRes').hidden = true; };
