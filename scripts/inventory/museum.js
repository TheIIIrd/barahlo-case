/* ==========================================================================
   Музей барахла
   ========================================================================== */
'use strict';

const museumCount = () => Object.keys(state.museum).length;
const museumAllDone = () => ROOMS.every((c) => state.museumDone[c.id]);
const roomHave = (c) => c.items.filter((_, i) => state.museum[museumKey(c.id, i)]).length;
const roomHalf = (c) => roomHave(c) * 2 >= c.items.length;

// Уровень зала: 0 — меньше половины, 1 — половина, 2 — собран целиком.
const roomLevel = (c) => (state.museumDone[c.id] ? 2 : roomHalf(c) ? 1 : 0);

// Что дают половина и полный зал.
function roomPerks(c) {
  if (c.craft) return ['поделки вдвое чаще выходят со СчётЧих™', 'поделки выходят вдвое менее изношенными'];
  if (c.free) return [`заряд копится за ${FREE_COOLDOWNS[1] / 1000} с вместо ${FREE_COOLDOWNS[0] / 1000}`,
    `заряд за ${FREE_COOLDOWNS[2] / 1000} с и СчётЧих™ вдвое чаще`];
  return [`кейс дешевле на ${Math.round(MUSEUM_DISCOUNT[1] * 100)}%`, `кейс дешевле на ${Math.round(MUSEUM_DISCOUNT[2] * 100)}% и СчётЧих™ из него вдвое чаще`];
}

// Нужен ли предмет музею: места нет или там экспонат с бо́льшим износом.
function museumWants(it) {
  const i = idxOf(it);
  if (i < 0) return false;
  const ex = state.museum[museumKey(it.caseId, i)];
  return !ex || it.float < ex.float;
}

const buyPrice = (c, i) => r2(Math.max(Math.abs(c.items[i][4]), 1) * MUSEUM_MARKUP[c.items[i][0]]);

let museumHall = null;

// Проверить, набрал ли зал половину или собран целиком. silent — без праздника (при массовой сдаче).
function checkRoom(c, silent) {
  const [halfPerk, fullPerk] = roomPerks(c);
  const title = c.craft ? 'Зал поделок' : `Зал «${c.name}»`;

  if (roomHalf(c) && !state.museumHalf[c.id]) {
    state.museumHalf[c.id] = true;
    addXP(30);
    if (!silent && roomHave(c) < c.items.length) {
      fanfare(4);
      toast(`${title} собран наполовину! Теперь ${halfPerk}.`, 4200, { important: true });
    }
  }

  const full = roomHave(c) === c.items.length;
  if (!full || state.museumDone[c.id]) return;
  state.museumDone[c.id] = true;
  addXP(80);
  if (silent) return;
  fanfare(6);
  burst(innerWidth / 2, innerHeight * 0.35, ['#ffd23f', '#ffffff', '#ffb02e', c.color], 260);
  toast(museumAllDone()
    ? `Музей собран целиком! Ты Хранитель Барахла. Все кейсы дешевле ещё на ${Math.round(MUSEUM_ALL_DISCOUNT * 100)}%.`
    : `${title} собран целиком! Теперь ${fullPerk}.`, 4800, { important: true });
}

function flashExhibit(key) {
  const el = document.querySelector(`.ex[data-k="${key}"]`);
  if (el) replay(el, 'flash');
}

// Сдать предмет. Если в музее уже есть такой, но потрёпаннее, старый возвращается в инвентарь.
function donate(it, fromCard) {
  if (busy || !state.inv.includes(it)) return;
  if (it.lock) { toast('Закреплённое не сдаётся в Музей — сначала открепи.'); return; }
  const i = idxOf(it);
  if (i < 0) { toast('Этот предмет Музею не нужен. Съешь его.'); return; }
  const key = museumKey(it.caseId, i);
  const old = state.museum[key];
  if (old && it.float >= old.float) {
    toast(`В Музее уже экспонат лучше: износ ${fmtWear(old.float)}.`, 3000);
    return;
  }

  removeItem(it);
  state.museum[key] = it;
  if (old) {
    state.inv.push(old);
    toast(`Экспонат заменён. Старый (износ ${fmtWear(old.float)}) вернулся в инвентарь.`, 3000);
  } else {
    toast(`«${baseName(it)}» теперь в Музее. Посетители в восторге.`);
  }
  tone(1000, 0.12, 'triangle', 0.07);
  checkRoom(roomById(it.caseId));
  museumHall = it.caseId;
  if (fromCard) invUi.open = null;
  save();
  renderAll();
  flashExhibit(key);
}

function buyExhibit(c, i) {
  const key = museumKey(c.id, i);
  if (state.museum[key] || busy) return;
  const price = buyPrice(c, i);
  if (state.bal < price) {
    toast(`Не хватает: экспонат стоит ${fmt(price)}.`);
    sad();
    return;
  }
  setBal(-price);
  state.museumSpent = r2(state.museumSpent + price);
  const it = makeItem(c, i, 0.3 + rnd() * 0.5);
  it.bought = true;
  state.museum[key] = it;
  toast(pick([
    'Куплено на «Авито». Продавец сказал «торг уместен», но не уступил.',
    'Выкуплено у коллекционера. Он плакал.',
    'Перекупщик поднял цену в последний момент.',
  ]));
  tone(700, 0.1, 'sine', 0.06);
  checkRoom(c);
  save();
  renderAll();
  flashExhibit(key);
}

// Сдать всё подходящее (закреплённые не трогаем). Без cid — по всем залам.
function donateAll(cid) {
  if (busy) return;
  const rooms = cid ? [roomById(cid)] : ROOMS;
  let n = 0;
  for (const c of rooms) {
    c.items.forEach((_, i) => {
      const key = museumKey(c.id, i);
      const ex = state.museum[key];
      const best = state.inv
        .filter((x) => !x.lock && x.caseId === c.id && idxOf(x) === i && (!ex || x.float < ex.float))
        .sort((a, b) => a.float - b.float)[0];
      if (!best) return;
      removeItem(best);
      if (ex) state.inv.push(ex);
      state.museum[key] = best;
      n++;
    });
  }
  if (n) {
    tone(1000, 0.12, 'triangle', 0.07);
    toast(`В Музей ${plural(n, 'сдан', 'сдано', 'сдано')} ${n} ${plural(n, 'экспонат', 'экспоната', 'экспонатов')}. Закреплённые остались на месте.`);
  } else {
    toast('Подходящих предметов нет. Закреплённые не сдаются.');
  }
  // После итога: если зал перешёл на новый уровень, его поздравление важнее и заменит итог.
  rooms.forEach((c) => checkRoom(c, rooms.length > 1));
  save();
  renderAll();
}

function museumButtonHTML(it) {
  const i = idxOf(it);
  if (i < 0 || it.lock) return ''; // закреплённое музей не предлагает
  const ex = state.museum[museumKey(it.caseId, i)];
  if (!ex) return '<button class="btn wide" type="button" id="dtMus">🏛 Сдать в Музей</button>';
  if (it.float < ex.float) return '<button class="btn wide" type="button" id="dtMus">🏛 Заменить экспонат в Музее (износ лучше)</button>';
  return '';
}

function renderMuseum() {
  const fk = focusKey($('sub-museum'));
  renderMuseumNow();
  restoreFocus(fk);
}
function renderMuseumNow() {
  const n = museumCount();
  const exhibits = Object.values(state.museum);
  const value = sum(exhibits, (x) => x.price);
  const avgFloat = exhibits.length ? sum(exhibits, (x) => x.float) / exhibits.length : 0;
  const halves = ROOMS.filter((c) => roomLevel(c) === 1).length;
  const fulls = ROOMS.filter((c) => roomLevel(c) === 2).length;
  const discount = Math.max(...CASES.map(caseDiscount));

  $('tabMusN').textContent = n + '/' + MUSEUM_TOTAL;
  $('mN').textContent = `${n} / ${MUSEUM_TOTAL}`;
  $('mNs').textContent = n
    ? `${Math.round((n / MUSEUM_TOTAL) * 100)}% Музея · ~${(n * 37).toLocaleString('ru-RU')} посетителей в день`
    : 'сдай первый экспонат из инвентаря';
  $('mH').textContent = `${Object.keys(state.museumDone).length} / ${ROOMS.length}`;
  $('mHs').textContent = museumAllDone() ? 'ты Хранитель Барахла' : 'собери зал целиком';
  $('mV').textContent = fmtShort(value);
  $('mV').title = fmt(value);
  $('mVs').textContent = exhibits.length ? 'средний износ ' + fmtWear(avgFloat) : '—';
  $('mB').textContent = discount ? `до −${discount}%` : '0%';
  $('mBs').textContent = halves || fulls
    ? `залов целиком: ${fulls}, наполовину: ${halves}`
    : 'за половину и полный зал';

  if (!subVisible('museum')) return;

  // Список залов.
  if (!museumHall || !roomById(museumHall)) museumHall = CASES[0].id;
  $('rooms').innerHTML = ROOMS.map((c) => {
    const have = roomHave(c);
    const done = !!state.museumDone[c.id];
    const canDonate = state.inv.some((x) => x.caseId === c.id && museumWants(x));
    const status = done ? '🏛 собран'
      : canDonate ? '<b class="can" title="В инвентаре есть что сдать">+ сдать</b>'
        : roomHalf(c) ? '½ бонус' : '';
    return `
      <button class="room${done ? ' done' : ''}${c.craft ? ' craftroom' : ''}" type="button"
        data-c="${c.id}" aria-pressed="${c.id === museumHall}">
        <span class="rt"><span class="ic">${c.ic}</span><b>${c.name}</b></span>
        <span class="bar"><i style="width:${(have / c.items.length) * 100}%"></i></span>
        <span class="cnt"><span>${have}/${c.items.length}</span><span>${status}</span></span>
      </button>`;
  }).join('');
  $$('.room', $('rooms')).forEach((b) => (b.onclick = () => {
    museumHall = b.dataset.c;
    renderMuseum();
    tone(600, 0.03);
  }));

  renderHall(roomById(museumHall));
}

// Выбранный зал с экспонатами.
function renderHall(c) {
  const done = !!state.museumDone[c.id];
  const have = roomHave(c);
  const level = roomLevel(c);
  const [halfPerk, fullPerk] = roomPerks(c);
  const note = c.craft && !done ? ' Экспонаты делаются в Мастерской, купить их нельзя.' : '';
  const bonus = `
    Собрано ${have} из ${c.items.length}.${note}
    <span class="perk${level >= 1 ? ' on' : ''}">${level >= 1 ? '✓' : '○'} Половина зала (${Math.ceil(c.items.length / 2)}): ${halfPerk}</span>
    <span class="perk${level >= 2 ? ' on' : ''}">${level >= 2 ? '✓' : '○'} Весь зал (${c.items.length}): ${fullPerk}</span>`;

  const exhibitsHTML = c.items.map((x, i) => {
    const key = museumKey(c.id, i);
    const ex = state.museum[key];
    const head = `<span class="plate">${RARITY[x[0]].n}</span><span class="ic">${x[1]}</span><span class="nm">${x[2]}</span>`;

    if (ex) {
      const better = state.inv
        .filter((y) => !y.lock && y.caseId === c.id && idxOf(y) === i && y.float < ex.float)
        .sort((a, b) => a.float - b.float)[0];
      const ribbon = ex.stat ? '<span class="rib" style="background:var(--accent2);color:#2a1600">СЧ™</span>'
        : ex.bought ? '<span class="rib" style="background:var(--muted)">куплен</span>' : '';
      return `
        <div class="ex filled" data-k="${key}" style="--c:${RARITY[x[0]].c}">
          ${head}${ribbon}
          <span class="meta">${ex.wear}</span>
          <span class="meta">износ ${fmtWear(ex.float)}</span>
          <span class="meta" style="color:${ex.price < 0 ? 'var(--bad)' : 'var(--good)'}">${fmtShort(ex.price)}</span>
          ${better ? `<button class="btn" type="button" data-swap="${better.uid}">Заменить (износ ${fmtWear(better.float)})</button>` : ''}
        </div>`;
    }

    const own = state.inv
      .filter((y) => !y.lock && y.caseId === c.id && idxOf(y) === i)
      .sort((a, b) => a.float - b.float);
    const meta = c.craft
      ? (state.recipes[RECIPES[i].id] ? 'рецепт известен' : 'рецепт не открыт')
      : fmtPct(chanceOf(c, i)) + ' в кейсе';
    let action;
    if (own.length) action = `<button class="btn primary" type="button" data-don="${own[0].uid}">Сдать (есть ${own.length})</button>`;
    else if (c.craft) action = '<button class="btn" type="button" data-craftgo="1">🔨 В Мастерскую</button>';
    else action = `<button class="btn" type="button" data-buy="${i}" ${state.bal < buyPrice(c, i) ? 'disabled' : ''}>Выкупить <small>${fmtShort(buyPrice(c, i))}</small></button>`;
    return `
      <div class="ex vacant" data-k="${key}" style="--c:${RARITY[x[0]].c}">
        ${head}<span class="meta">${meta}</span>${action}
      </div>`;
  }).join('');

  $('hall').innerHTML = `
    <div class="hall-top">
      <div><h3>${c.ic} ${c.craft ? 'Зал поделок' : `Зал «${c.name}»`}</h3><div class="bonus">${bonus}</div></div>
      <button class="btn" type="button" id="donAll">🏛 Сдать всё подходящее</button>
    </div>
    <div class="exhibits">${exhibitsHTML}</div>`;

  $('donAll').onclick = () => donateAll(c.id);
  $$('[data-don],[data-swap]', $('hall')).forEach((b) => (b.onclick = () => {
    const it = state.inv.find((x) => x.uid === +(b.dataset.don || b.dataset.swap));
    if (it) donate(it);
  }));
  $$('[data-buy]', $('hall')).forEach((b) => (b.onclick = () => buyExhibit(c, +b.dataset.buy)));
  $$('[data-craftgo]', $('hall')).forEach((b) => (b.onclick = () => setSub('craft')));
}
