/* ==========================================================================
   Уровни
   ========================================================================== */
'use strict';

// Опыт до следующего уровня: 90 × уровень^1,65.
const xpNeed = (lvl) => Math.round(90 * Math.pow(lvl, 1.65));
const LVL_SANE = 100000; // выше — только испорченное сохранение

// Опыт за предмет растёт с его ценой плавно (по порядку величины), без раннего потолка:
// копеечный хлам ≈ 3, предмет за 1 000 ₽ ≈ 13, за миллион ≈ 23, дальше не больше 23.
const itemXP = (it) => 2.5 + Math.min(20.5, 3.5 * Math.log10(1 + Math.abs(it.price)));
const titleOf = (lvl) =>
  TITLES[Math.min(lvl - 1, TITLES.length - 1)] +
  (lvl > TITLES.length ? ' ' + '★'.repeat(Math.min(lvl - TITLES.length, 5)) : '');

function giftCase(lvl) {
  const pool = CASES.filter((c) => !c.free && c.price <= 40 + lvl * lvl * 12);
  return pool[Math.floor(rnd() * pool.length)] || CASES[1];
}

/* Опыт за действие с анимацией: сначала откладываем в state.pendingXp (он сохраняется вместе с исходом
   и переживёт перезагрузку — loadState его зачислит), после анимации — зачисляем. */
function holdXP(n) {
  state.pendingXp = (state.pendingXp || 0) + Math.max(1, Math.round(n));
}
function releaseXP() {
  const n = state.pendingXp || 0;
  state.pendingXp = 0;
  if (n > 0) addXP(n);
}

function addXP(n) {
  state.xp += Math.max(1, Math.round(n));
  levelUp();
}

// Новые уровни за накопленный опыт: подарки и одно поздравление. Зовётся и после загрузки — опыт
// за открытие, прерванное перезагрузкой, мог уже дотянуть до уровня.
function levelUp() {
  const from = state.lvl;
  const gifts = [];
  for (let guard = 0; state.xp >= xpNeed(state.lvl) && guard < 1000; guard++) { // не больше 1000 уровней за раз
    state.xp -= xpNeed(state.lvl);
    state.lvl++;
    const gift = giftCase(state.lvl);
    state.tokens[gift.id] = (state.tokens[gift.id] || 0) + 1;
    gifts.push(gift);
  }
  renderLevel();
  if (gifts.length) {
    // Одно поздравление на все новые уровни сразу (×100 может дать несколько).
    const lvl = state.lvl;
    const luck = Math.round(levelLuck() * 100);
    const text = gifts.length === 1
      ? `Уровень ${lvl}: «${titleOf(lvl)}». Подарок: кейс «${gifts[0].name}»`
      : `Уровни ${from + 1}–${lvl}: «${titleOf(lvl)}». Подарки: ${gifts.length} ${plural(gifts.length, 'кейс', 'кейса', 'кейсов')}`;
    setTimeout(() => {
      toast(text + (luck ? ` · удача +${luck}%` : ''), 4500, { important: true });
      fanfare(4);
      const r = $('lvl').getBoundingClientRect();
      burst(r.left + 20, r.top + 20, ['#ffb02e', '#ffd23f', '#ffffff'], 120);
    }, 400);
    renderCases();
    renderContents();
    updateOpenButton();
  }
  save();
}

function renderLevel() {
  $('lvlN').textContent = state.lvl;
  $('lvlT').textContent = titleOf(state.lvl);
  $('lvlX').textContent = `${state.xp} / ${xpNeed(state.lvl)} XP`;
  $('lvlRing').style.setProperty('--p', (state.xp / xpNeed(state.lvl)) * 100 + '%');
  const luck = Math.round(levelLuck() * 100);
  $('lvl').title = 'Уровень растёт за открытия, контракты, апгрейды и краш' +
    (luck ? `. Удача +${luck}%: «${RARITY[LUCK_FROM].n}» и выше выпадает чаще` : '. С каждым уровнем растёт удача');
}
