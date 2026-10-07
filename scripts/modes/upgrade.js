/* ==========================================================================
   Апгрейд
   ========================================================================== */
'use strict';

// Цель: предмет с ценой ближе всего к «ставка × множитель», но заметно дороже ставки.
function upgradeTarget() {
  if (!upgradeStake) return null;
  const want = upgradeStake.price * upgradeMult;
  const candidates = CATALOG.filter((e) => e.base > upgradeStake.price * 1.2);
  if (!candidates.length) return null;
  const dist = (e) => Math.abs(Math.log(e.base / want));
  return candidates.reduce((a, e) => (dist(e) < dist(a) ? e : a), candidates[0]);
}

/* Шанс чуть ниже честного: 0,9 от отношения ставки к ОЖИДАЕМОЙ цене приза, не выше UPGRADE_MAX_CHANCE
   (нижнего порога нет: раньше он делал совсем дальние цели выгоднее честного).
   Приз — свежий предмет: износ и СчётЧих™ в среднем делают его дороже базовой цены (≈ ×1,16), поэтому
   делим на это ожидание — иначе апгрейд в среднем приносил больше, чем стоил. Доплата добавляется к ставке. */
const UPGRADE_MAX_CHANCE = 0.75;
const UPGRADE_FAIR = 0.9;
// Средний множитель цены свежего предмета: износ (≈ 1,005 с редкими почти новыми) × СчётЧих™ (шанс кейса).
const prizeMult = (c) => 1.0054 * (1 + (STAT_TRAK_MULT - 1) * statTrakChance(c));
const prizeValue = (target) => target.base * prizeMult(target.c);
const upgradeChance = (target, add = 0) =>
  target ? Math.min(UPGRADE_MAX_CHANCE, Math.max(0.0001, (UPGRADE_FAIR * (upgradeStake.price + add)) / prizeValue(target))) : 0;

$('uAddMax').textContent = `До ${Math.round(UPGRADE_MAX_CHANCE * 100)}%`;

// Доплата, после которой шанс упирается в потолок: больше платить бессмысленно.
const upgradeAddCap = (target) =>
  target ? Math.max(0, Math.ceil((UPGRADE_MAX_CHANCE * prizeValue(target)) / UPGRADE_FAIR - upgradeStake.price)) : 0;

// Доплата, которая реально пойдёт в дело: не больше баланса и не выше потолка шанса.
const effectiveAdd = (target) => r2(Math.max(0, Math.min(upgradeAdd, state.bal, upgradeAddCap(target))));

$('uAddIn').oninput = (e) => {
  upgradeAdd = Math.max(0, parseFloat(e.target.value) || 0);
  renderUpgrade();
};
$$('[data-ua]', $('v-upgrade')).forEach((b) => (b.onclick = () => {
  if (busy) return;
  const target = upgradeTarget();
  const v = b.dataset.ua;
  if (v === 'max') upgradeAdd = upgradeAddCap(target);
  else upgradeAdd = upgradeStake ? r2(Math.max(0, upgradeStake.price) * +v) : 0;
  upgradeAdd = Math.min(upgradeAdd, Math.max(0, state.bal));
  $('uAddIn').value = upgradeAdd ? upgradeAdd : '';
  renderUpgrade();
  tone(700, 0.04);
}));

function renderUpgrade() {
  if (upgradeStake && !state.inv.includes(upgradeStake)) upgradeStake = null;
  const stakeBox = $('uStake');
  const targetBox = $('uTarget');

  if (upgradeStake) {
    stakeBox.className = 'uslot f';
    stakeBox.style.setProperty('--c', RARITY[upgradeStake.r].c);
    stakeBox.innerHTML = `<span class="k">Ставка</span><span class="ic">${upgradeStake.ic}</span><span class="nm">${upgradeStake.name}</span><span class="pr">${fmt(upgradeStake.price)}</span>`;
  } else {
    stakeBox.className = 'uslot';
    stakeBox.innerHTML = '<span class="k">Ставка</span><span class="empty">Выбери предмет в инвентаре ниже</span>';
  }

  const target = upgradeTarget();
  const add = effectiveAdd(target);
  const base = upgradeChance(target);
  const chance = upgradeChance(target, add);
  if (target) {
    targetBox.className = 'uslot f';
    targetBox.style.setProperty('--c', RARITY[target.r].c);
    targetBox.innerHTML = `<span class="k">Цель · ${target.c.name}</span><span class="ic">${target.ic}</span><span class="nm">${target.name}</span><span class="pr">≈ ${fmt(target.base)}</span>`;
  } else {
    targetBox.className = 'uslot';
    targetBox.innerHTML = `<span class="k">Цель</span><span class="empty">${upgradeStake ? 'Дороже уже некуда. Ты на вершине барахла.' : 'Появится после выбора ставки'}</span>`;
  }

  upgradeShown = { add, chance };
  $('wheel').style.setProperty('--ch', chance * 100 + '%');
  $('uPct').innerHTML = target
    ? `${fmtPct(chance * 100, chance < 0.01 ? 2 : chance < 0.1 ? 1 : 0)}<small>шанс успеха</small>`
    : '—<small>шанс</small>';
  $('mults').innerHTML = UPGRADE_MULTS
    .map((m) => `<button class="btn${m === upgradeMult ? ' primary' : ''}" type="button" data-m="${m}">×${m}</button>`).join('');
  $$('button', $('mults')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    upgradeMult = +b.dataset.m;
    renderUpgrade();
    tone(700, 0.04);
  }));
  $('uGo').disabled = !target || busy;

  // Доплата: поле не трогаем, пока в нём печатают.
  if (document.activeElement !== $('uAddIn')) $('uAddIn').value = upgradeAdd ? upgradeAdd : '';
  const pct = (x) => fmtPct(x * 100, x < 0.01 ? 2 : x < 0.1 ? 1 : 0);
  let hint = '';
  if (target && add > 0) {
    hint = `Шанс ${pct(base)} → <b>${pct(chance)}</b> за ${fmt(add)}`;
    if (upgradeAdd > add + 0.001) hint += add < upgradeAddCap(target) ? ' · больше нет на балансе' : ` · выше ${pct(UPGRADE_MAX_CHANCE)} не поднять`;
  } else if (target && upgradeAdd > 0 && state.bal <= 0) {
    hint = 'На балансе нет денег для доплаты';
  } else if (target) {
    hint = `Максимум шанса ${pct(UPGRADE_MAX_CHANCE)} — при доплате ${fmt(upgradeAddCap(target))}`;
  }
  $('uAddHint').innerHTML = hint;
}

let needleAngle = 0;

// Что видит игрок на экране: крутим только с этой доплатой и этим шансом.
let upgradeShown = { add: 0, chance: 0 };

$('uGo').onclick = async () => {
  const target = upgradeTarget();
  if (!target || busy) return;
  // Баланс успел измениться (заём, возврат долга), а экран — нет: сначала показываем новые цифры.
  if (Math.abs(effectiveAdd(target) - upgradeShown.add) > 0.001 || Math.abs(upgradeChance(target, effectiveAdd(target)) - upgradeShown.chance) > 1e-9) {
    renderUpgrade();
    toast('Баланс изменился — проверь доплату и шанс и жми ещё раз.');
    return;
  }
  busy = true;
  $('uGo').disabled = true;

  // Исход решается сразу, ставка и доплата уходят до анимации — перезагрузкой не отменить.
  const add = effectiveAdd(target);
  const chance = upgradeChance(target, add);
  const win = rnd() < chance;
  const stake = upgradeStake;
  const mult = upgradeMult;
  removeItem(stake);
  if (add > 0) setBal(-add);
  upgradeAdd = 0;
  state.upgrades++;
  const prize = win ? makeItem(target.c, target.i) : null;
  state.pending = prize ? [prize] : [];
  holdXP(12);
  save();
  renderPicker();

  // Стрелка останавливается в зелёном секторе при выигрыше и в красном при проигрыше.
  const landing = win
    ? rnd() * chance * 360 * 0.94 + chance * 360 * 0.03
    : chance * 360 + (rnd() * 0.94 + 0.03) * (1 - chance) * 360;
  needleAngle = Math.ceil(needleAngle / 360) * 360 + 360 * 6 + landing;
  $('needle').style.transform = `rotate(${needleAngle}deg)`;
  let ticks = 0;
  const ticker = setInterval(() => tone(900 - ticks++ * 15, 0.02, 'square', 0.03), 90);
  await sleep(reducedMotion ? 100 : 4300);
  clearInterval(ticker);
  releaseXP();

  if (win) {
    trackBest(prize);
    renderStats();
    renderInventory();
    showDrop(prize, `Апгрейд ×${mult} удался!`, () => {
      busy = false;
      renderUpgrade();
    });
  } else {
    sad();
    shake();
    toast(`Апгрейд провален. «${baseName(stake)}» сгорает синим пламенем${add > 0 ? `, доплата ${fmt(add)} вместе с ним` : ''}.`, 3200);
    busy = false;
    renderUpgrade();
    renderInventory();
    renderStats();
  }
};
