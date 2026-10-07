/* ==========================================================================
   Рулетка и открытие
   ========================================================================== */
'use strict';

const reelCardHTML = (it) =>
  `<div class="card" style="--c:${RARITY[it.r].c}"><span class="ic">${it.ic}</span><span class="t">${it.name}</span></div>`;

// Лёгкая карточка для ленты рулетки (без цены и износа).
function stub(c, i) {
  const x = c.items[i];
  return { r: x[0], ic: x[1], name: x[2] };
}

// ×100: сетка 10×10 закрытых коробок вместо лент.
const boxGridHTML = () => '<div class="bx"><span class="ic"></span></div>'.repeat(100);

function renderIdleReels(n) {
  const box = $('reels');
  box.classList.toggle('compact', n > 1 && n < 100);
  box.classList.toggle('x20', n === 20);
  box.classList.toggle('boxgrid', n === 100);
  box.classList.remove('opening');
  if (n === 100) {
    box.innerHTML = boxGridHTML();
    return;
  }
  const weights = chancesOf(currentCase);
  let html = '';
  for (let k = 0; k < n; k++) {
    const strip = Array.from({ length: 30 }, () => stub(currentCase, roll(currentCase, weights)));
    html += `<div class="reel-wrap"><div class="marker"></div><div class="reel">${strip.map(reelCardHTML).join('')}</div></div>`;
  }
  box.innerHTML = html;
  $$('.reel', box).forEach((r) => (r.style.transform = `translateX(${-Math.floor(rnd() * 600)}px)`));
}

// Легенда редкостей и содержимое кейса с текущими шансами (с удачей и баффом).
function renderContents() {
  const c = currentCase;
  const luck = Math.round(levelLuck() * 100);
  $('legend').innerHTML = RARITY.map((r) => `<span><i style="--c:${r.c}"></i>${r.n}</span>`).join('') +
    (luck ? `<span class="luck" title="Удача растёт с уровнем: «${RARITY[LUCK_FROM].n}» и выше выпадает чаще">🍀 удача +${luck}%</span>` : '');
  const chances = chancesOf(c);
  $('contents').innerHTML = c.items.map((x, i) => `
    <div class="mini" style="--c:${RARITY[x[0]].c}">
      <span class="ic">${x[1]}</span>
      <span class="nm">${x[2]}</span>
      <span class="pp${x[4] < 0 ? ' neg' : ''}">≈ ${fmtShort(x[4])}</span>
      <span class="ch">${fmtPct(chances[i])}</span>
    </div>`).join('');
  renderBuffNote();
}

function renderArena() {
  const c = currentCase;
  $('caseTitle').textContent = 'Кейс «' + c.name + '»';
  $('caseSub').textContent = c.desc;
  $$('.seg button').forEach((b) => (b.disabled = c.free && +b.dataset.n > FREE_MAX));
  renderContents();
  renderIdleReels(openCount);
  updateOpenButton();
}

function setCount(n) {
  openCount = n;
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.n === n));
  if (!busy) renderIdleReels(n);
  updateOpenButton();
}
$$('.seg button').forEach((b) => (b.onclick = () => {
  if (!busy) setCount(+b.dataset.n);
}));

// Сколько подарочных кейсов уйдёт на это открытие.
const giftsToUse = () => (currentCase.free ? 0 : Math.min(state.tokens[currentCase.id] || 0, openCount));

/* Кнопка открытия всегда одного размера (styles/arena.css), чтобы не уезжать из-под пальца.
   Сумма в подсказке — полностью, а если не влезает — коротко: «1,2 трлн ₽».
   Длинная надпись на узком экране — чуть мельче. */
let openHint = '';
function fitOpenHint() {
  const txt = $('openTxt');
  txt.classList.remove('tight');
  if (txt.scrollWidth > txt.clientWidth + 1) txt.classList.add('tight');
  const el = $('openPrice');
  if (typeof openHint === 'string') { el.textContent = openHint; return; }
  el.textContent = openHint(fmt);
  if (el.scrollWidth > el.clientWidth + 1) el.textContent = openHint(fmtShort);
}
addEventListener('resize', fitOpenHint);

function updateOpenButton() {
  let label = openCount > 1 ? `ОТКРЫТЬ ×${openCount}` : 'ОТКРЫТЬ КЕЙС';
  let hint;
  let disabled = busy;

  if (currentCase.free) {
    const charges = freeCharges();
    const next = freeNext();
    hint = `заряды ${charges}/${FREE_MAX}` + (next ? ` · +1 через ${Math.ceil(next / 1000)} с` : ' · полный');
    if (charges < openCount) {
      disabled = true;
      if (!busy) label = charges ? `ЗАРЯДОВ: ${charges} ИЗ ${openCount}` : 'ЖДИ ' + Math.ceil(next / 1000) + ' С';
    }
  } else {
    const gifts = giftsToUse();
    const paid = openCount - gifts;
    const cost = r2(casePrice(currentCase) * paid);
    if (!gifts) hint = (f) => 'за ' + f(cost);
    else if (paid) hint = (f) => `${gifts} 🎁 + ${paid} за ${f(cost)}`;
    else hint = gifts > 1 ? `${gifts} подарочных 🎁` : 'подарочный кейс 🎁';
    if (state.bal < cost) {
      disabled = true;
      if (!busy) label = 'НЕ ХВАТАЕТ ДЕНЕГ';
    }
  }
  $('openTxt').textContent = label;
  openHint = hint;
  fitOpenHint();
  $('open').disabled = disabled;
}

// Копим заряды бесплатного кейса: обновляем плашку на кейсе и таймер на кнопке (раз в 500 мс, из main.js).
function tickCases() {
  const before = state.freeStore;
  freeCharges();
  if (state.freeStore !== before) {
    renderCases();
    if (!document.hidden) save();
  }
  if (currentCase.free && !busy && tab === 'cases') updateOpenButton();
  tickBuffs();
}

// Прокрутка одной ленты до карточки winIndex.
async function spinReel(wrap, strip, winIndex, duration, withTicks) {
  const reel = wrap.querySelector('.reel');
  reel.innerHTML = strip.map(reelCardHTML).join('');
  reel.style.transform = 'translateX(0)';
  const cardW = reel.children[0].getBoundingClientRect().width;
  const step = cardW + (parseFloat(getComputedStyle(reel).gap) || 6);
  const viewW = wrap.clientWidth;
  const target = winIndex * step + cardW / 2 - viewW / 2 + (rnd() - 0.5) * cardW * 0.8;
  const t0 = performance.now();
  let lastTick = -1;

  await new Promise((done) => {
    function frame(t) {
      const p = Math.min((t - t0) / duration, 1);
      const x = target * (1 - Math.pow(1 - p, 4.2));
      reel.style.transform = `translateX(${-x}px)`;
      if (withTicks) {
        const idx = Math.floor((x + viewW / 2) / step);
        if (idx !== lastTick) {
          lastTick = idx;
          tone(1400 - p * 700, 0.025, 'square', 0.035);
        }
      }
      if (p < 1) requestAnimationFrame(frame);
      else done();
    }
    requestAnimationFrame(frame);
  });
  reel.children[winIndex].classList.add('win');
}

async function openCases() {
  if (busy) return;
  const c = currentCase;
  const gifts = giftsToUse();
  const paid = openCount - gifts;
  const cost = r2(casePrice(c) * paid);
  if (c.free ? freeCharges() < openCount : state.bal < cost) return;

  busy = true;
  updateOpenButton();

  // Списываем сразу: заряды, подарки или деньги.
  if (c.free) {
    state.freeStore -= openCount;
  } else {
    if (gifts) state.tokens[c.id] -= gifts;
    if (paid) {
      setBal(-cost);
      state.spent += cost;
    }
  }
  state.opened += openCount;
  renderCases();

  const reels = $('reels');
  const fast = $('fast').checked;
  const weights = chancesOf(c); // шансы на момент открытия: удача и бафф уже учтены
  const won = Array.from({ length: openCount }, () => makeItem(c, roll(c, weights)));
  const buffChance = c.free ? 0 : openCount >= 100 ? BUFF_CHANCE_100 : openCount >= 20 ? BUFF_CHANCE_20 : 0;
  const buffed = buffChance && rnd() < buffChance ? grantBuffs(c) : [];
  if (buffed.length) {
    renderCases();
    renderContents();
  }

  // Выпавшее, бафф, статистику и опыт сохраняем до анимации: перезагрузка страницы ничего не съест.
  // Опыт начисляем после анимации (там же поздравление с уровнем), а до неё он лежит в pendingXp.
  state.pending = won.slice();
  won.forEach(trackBest);
  state.pendingXp = sum(won, itemXP);
  save();

  if (openCount === 100) {
    await boxWave(won, fast);
  } else {
    if (reels.children.length !== openCount || reels.classList.contains('boxgrid')) renderIdleReels(openCount);
    const spins = $$('.reel-wrap', reels).map((wrap, k) => {
      const it = won[k];
      const strip = Array.from({ length: 60 }, (_, i) => (i === 50 ? it : stub(c, roll(c, weights))));
      // Иногда легендарка встаёт сразу за выигрышем — «чуть-чуть не хватило».
      if (rnd() < 0.3) {
        const legend = c.items.findIndex((x) => x[0] === 6);
        if (legend >= 0) strip[51] = stub(c, legend);
      }
      const stagger = openCount > 1 ? k * (fast ? (openCount >= 20 ? 25 : 60) : (openCount >= 20 ? 90 : 180)) : 0;
      const duration = reducedMotion ? 300 : (fast ? SPIN_FAST_MS : SPIN_MS) + stagger;
      return spinReel(wrap, strip, 50, duration, k === 0);
    });
    await Promise.all(spins);
  }

  await sleep(fast ? 150 : 450);
  releaseXP();

  if (openCount === 1) {
    showDrop(won[0], '', () => {
      busy = false;
      updateOpenButton();
    });
  } else {
    // Бафф объявляем в самом окне улова: тост перекрыл бы кнопки и поздравление с уровнем.
    const mins = BUFF_MS / 60000;
    const note = buffed.length
      ? `<span class="mbuff">🔥 Бафф на ${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}: ${buffed.map((x) => '«' + x.name + '»').join(', ')} — редкие ×${BUFF_MULT}</span>`
      : '';
    showMulti(won, { cost, sorted: openCount === 100, note });
    if (buffed.length) renderMuseum();
  }
}

// ×100: коробки вскрываются диагональной волной, редкие вспыхивают своим цветом.
async function boxWave(won, fast) {
  const grid = $('reels');
  grid.classList.remove('opening');
  grid.innerHTML = boxGridHTML();
  const step = reducedMotion ? 0 : fast ? 22 : 70;
  $$('.bx', grid).forEach((cell, i) => {
    const it = won[i];
    cell.style.setProperty('--c', RARITY[it.r].c);
    cell.style.setProperty('--d', ((Math.floor(i / 10) + (i % 10)) * step) + 'ms');
    cell.title = `${it.name} · ${fmt(it.price)}`;
    cell.querySelector('.ic').textContent = it.ic;
    if (it.r >= 5) cell.classList.add('hot');
  });
  void grid.offsetWidth; // закрытые коробки успевают отрисоваться до старта волны
  grid.classList.add('opening');
  for (let d = 0; d < 19; d++) setTimeout(() => tone(500 + d * 40, 0.02, 'square', 0.03), d * step);
  await sleep(18 * step + 420);
}
$('open').onclick = openCases;
