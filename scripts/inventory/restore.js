/* ==========================================================================
   Реставрация
   ========================================================================== */
'use strict';

const restoreCost = (it) => r2(Math.max(10, Math.abs(it.base) * 0.3) * Math.pow(3, it.resto || 0));

function restoreBlockHTML(it) {
  if (it.price <= 0 || it.special) return '';
  const cost = restoreCost(it);
  const noMoneyNow = state.bal < cost;
  return `
    <div class="resto">
      <div class="rh"><b>🖌 Реставрация</b><span>попыток: ${it.resto || 0}</span></div>
      <div class="rrow">
        <div><div class="k">Стоимость</div><div class="v">${fmtShort(cost)}</div></div>
        <div><div class="k">Шанс успеха</div><div class="v">${Math.round(RESTO_CHANCE * 100)}%</div></div>
      </div>
      <button class="btn" type="button" id="dtResto" ${noMoneyNow || busy ? 'disabled' : ''}>${noMoneyNow ? 'Не хватает на реставрацию' : 'Реставрировать'}</button>
      <div class="note" style="margin:0">При успехе износ падает в 1,5–4 раза, при неудаче реставратор чихает и износ растёт. Каждая попытка втрое дороже. Чем ниже износ, тем дороже предмет: на «Музейном» ×2, на «Атомарно чистом» ×5 и больше.</div>
    </div>`;
}

async function restore(it) {
  if (busy || !state.inv.includes(it)) return;
  const cost = restoreCost(it);
  if (state.bal < cost) { sad(); return; }

  busy = true;
  setBal(-cost);
  state.restos++;
  state.restoSpent = r2(state.restoSpent + cost);

  const success = rnd() < RESTO_CHANCE;
  const oldFloat = it.float;
  const oldPrice = it.price;
  // У предметов из старых сохранений нет noise — восстанавливаем его из цены.
  if (typeof it.noise !== 'number') {
    it.noise = Math.max(0.5, Math.min(1.5, it.price / (it.base * floatMult(oldFloat) * (it.stat ? STAT_TRAK_MULT : 1)) || 1));
  }
  it.float = success
    ? Math.max(1e-15, oldFloat * (0.25 + rnd() * 0.42))
    : Math.min(0.9999, oldFloat * 1.6 + 0.02);
  it.wear = wearOf(it.float);
  it.price = itemPrice(it.base, it.float, it.noise, it.stat);
  it.resto = (it.resto || 0) + 1;
  holdXP(6); // опыт — вместе с исходом, до анимации: перезагрузка его не потеряет
  save();

  const card = $('detail');
  card.classList.add('resting');
  const ticker = setInterval(() => tone(1400 + rnd() * 600, 0.03, 'triangle', 0.03), 110);
  await sleep(900);
  clearInterval(ticker);
  card.classList.remove('resting');
  busy = false;
  releaseXP();
  renderAll();

  const hero = document.querySelector('#detail .hero');
  if (success) {
    fanfare(3);
    if (hero) {
      const r = hero.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, ['#ffffff', '#5fe08a', '#ffd23f'], 90);
    }
    floatText(hero, `Износ ${fmtWear(oldFloat)} → ${fmtWear(it.float)}`, 'var(--good)');
    toast(`Отреставрировано до состояния «${it.wear}». Цена ${fmtShort(oldPrice)} → ${fmtShort(it.price)}.`, 3200);
  } else {
    sad();
    shake();
    floatText(hero, 'Апчхи!', 'var(--bad)');
    toast(`Реставратор чихнул. Износ вырос до ${fmtWear(it.float)}.`, 3200);
  }
}
