/* ==========================================================================
   Предметы: шансы, цена, создание
   ========================================================================== */
'use strict';

const baseName = (it) => it.name.replace(STAT_TRAK, '');

// Удача от уровня: прибавка к весу хороших редкостей. 10-й ≈ +2%, 20-й ≈ +5%, 30-й — +10%,
// 40-й — +15%, 50-й и выше — +20%. До 30-го кривая плавно разгоняется и на стыке идёт ровно по LUCK_STEP.
function levelLuck() {
  const lvl = state.lvl;
  const luck = lvl <= 30
    ? LUCK_AT_30 * Math.pow((lvl - 1) / 29, LUCK_CURVE)
    : LUCK_AT_30 + (lvl - 30) * LUCK_STEP;
  return Math.min(LUCK_MAX, Math.max(0, luck));
}

// Сколько мс осталось баффу кейса (0 — баффа нет): меньшее из «по часам» и «по секундомеру».
function buffLeft(c) {
  const b = state.buffs[c.id];
  return b ? Math.max(0, Math.min(b.left, b.until - Date.now(), BUFF_MS)) : 0;
}

// Вес редкости r в кейсе c с учётом удачи и баффа.
function rarityWeight(c, r) {
  let w = RARITY[r].w;
  if (r >= LUCK_FROM) w *= 1 + levelLuck();
  if (r >= BUFF_FROM && buffLeft(c) > 0) w *= BUFF_MULT;
  return w;
}

// Шанс выпадения предмета i из кейса c, в процентах.
function chanceOf(c, i) {
  const r = c.items[i][0];
  const sameRarity = c.items.filter((x) => x[0] === r).length;
  const present = [...new Set(c.items.map((x) => x[0]))];
  const totalWeight = sum(present, (k) => rarityWeight(c, k));
  return (rarityWeight(c, r) / sameRarity / totalWeight) * 100;
}

// Шансы всех предметов кейса разом: для серии бросков считаем один раз.
const chancesOf = (c) => c.items.map((_, i) => chanceOf(c, i));

function roll(c, weights = chancesOf(c)) {
  let x = rnd() * sum(weights, (w) => w);
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

// Множитель цены от износа. Ниже 0,01 предмет резко дорожает.
function floatMult(fl) {
  const linear = 1.25 - fl * 0.5;
  const rare = fl < 0.01 ? 1 + (-Math.log10(Math.max(fl, 1e-15)) - 2) : 1;
  return linear * rare;
}

function itemPrice(base, fl, noise, stat) {
  const p = r2(base * floatMult(fl) * noise * (stat ? STAT_TRAK_MULT : 1));
  return base > 0 ? Math.max(0.01, p) : p;
}

function makeItem(c, i, fl) {
  const [r, ic, name, lore, base] = c.items[i];
  if (fl === undefined) fl = rnd();
  const stat = rnd() < statTrakChance(c);
  const noise = 0.85 + rnd() * 0.3;
  return {
    uid: state.uid++, r, ic, name: (stat ? STAT_TRAK : '') + name, lore, base,
    caseId: c.id, idx: i, stat, noise, float: fl, t: Date.now(),
    wear: wearOf(fl), price: itemPrice(base, fl, noise, stat),
  };
}

// Индекс предмета в его кейсе. У старых сохранений idx нет — ищем по названию.
function idxOf(it) {
  if (it.special) return -1;
  if (typeof it.idx === 'number') return it.idx;
  const c = roomById(it.caseId);
  const name = baseName(it).replace('Чек на 0.5 ₽', 'Чек на 0,5 ₽'); // предмет переименован в 1.4.0
  return c ? c.items.findIndex((x) => x[2] === name) : -1;
}
const itemKey = (it) => {
  const i = idxOf(it);
  return i < 0 ? null : museumKey(it.caseId, i);
};

function trackBest(it) {
  state.rc[it.r]++;
  if (!state.best || it.price > state.best.price) state.best = { name: it.name, price: it.price };
}

// Убрать предмет из инвентаря и из всех мест, где он мог быть выбран.
function removeItem(it) {
  const i = state.inv.indexOf(it);
  if (i >= 0) state.inv.splice(i, 1);
  invUi.sel.delete(it.uid);
  if (invUi.open === it.uid) invUi.open = null;
  contractItems = contractItems.filter((x) => x !== it);
  if (upgradeStake === it) upgradeStake = null;
}
