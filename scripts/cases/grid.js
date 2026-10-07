/* ==========================================================================
   Кейсы: цены, заряды, сетка кейсов
   ========================================================================== */
'use strict';

// Цена с учётом скидок музея: за половину или весь зал кейса и ещё за весь музей.
function casePrice(c) {
  if (c.free) return 0;
  const k = 1 - MUSEUM_DISCOUNT[roomLevel(c)] - (museumAllDone() ? MUSEUM_ALL_DISCOUNT : 0);
  return r2(c.price * k);
}

const caseDiscount = (c) => (c.free ? 0 : Math.round((1 - casePrice(c) / c.price) * 100));

// Шанс СчётЧих™: вдвое выше за полный зал кейса (у мастерской — уже за половину).
function statTrakChance(c) {
  const boosted = roomLevel(c) >= (c.craft ? 1 : 2);
  return STAT_TRAK_CHANCE * (boosted ? 2 : 1);
}

// Заряд бесплатного кейса копится быстрее, чем полнее его зал в музее.
const freeCooldown = () => FREE_COOLDOWNS[roomLevel(CASES.find((c) => c.free))];

// Заряды бесплатного кейса: +1 каждые freeCooldown() мс, не больше FREE_MAX.
function freeCharges() {
  const now = Date.now();
  // Часы перевели назад или сохранение пришло с устройства, где часы спешат: отсчёт с «сейчас».
  if (state.freeTick == null || state.freeTick > now) {
    state.freeTick = now;
    if (typeof state.freeStore !== 'number') state.freeStore = 1;
  }
  if (state.freeStore >= FREE_MAX) {
    state.freeTick = now;
    return state.freeStore;
  }
  const cooldown = freeCooldown();
  const gained = Math.floor((now - state.freeTick) / cooldown);
  if (gained > 0) {
    state.freeStore = Math.min(FREE_MAX, state.freeStore + gained);
    state.freeTick = state.freeStore >= FREE_MAX ? now : state.freeTick + gained * cooldown;
  }
  return state.freeStore;
}

function freeNext() {
  return state.freeStore >= FREE_MAX ? 0 : Math.max(0, freeCooldown() - (Date.now() - state.freeTick));
}

// Иконка кейса: картонная коробка с наклейкой цвета кейса.
function caseIconHTML(c) {
  const cls = `ico ico-box${c.tier ? ' elite' : ''}`;
  return `<div class="${cls}" style="--cc:${c.color}"><span class="stk"><span class="e">${c.ic}</span></span></div>`;
}

function caseTagHTML(c) {
  const gifts = state.tokens[c.id] || 0;
  if (gifts) return `<span class="tag gift">🎁×${gifts}</span>`;
  if (c.free) return `<span class="tag">FREE ×${freeCharges()}</span>`;
  if (c.tier) return `<span class="tag elite">${ELITE_LABELS[c.tier]}</span>`;
  if (caseDiscount(c)) return `<span class="tag done">🏛 −${caseDiscount(c)}%</span>`;
  if (c.price >= 1000) return '<span class="tag lux">VIP</span>';
  return '';
}

function renderCases() {
  $('cases').innerHTML = CASES.map((c) => {
    const price = casePrice(c);
    const discounted = !c.free && price < c.price;
    const priceHTML = c.free
      ? 'Бесплатно'
      : (discounted && !c.tier ? '<s>' + fmtShort(c.price) + '</s>' : '') + fmtShort(price);
    const left = buffLeft(c);
    return `
      <button class="case${c.tier ? ' tier' : ''}${left ? ' buffed' : ''}" type="button" data-id="${c.id}"
        aria-pressed="${c === currentCase}" style="--cc:${c.color}"
        title="${c.name} · ${c.free ? 'бесплатно' : fmt(price)}${left ? ' · бафф: редкие ×' + BUFF_MULT : ''}">
        ${caseIconHTML(c)}
        <div><div class="nm">${c.name}</div><div class="pr">${priceHTML}</div></div>
        ${caseTagHTML(c)}
        ${left ? `<span class="bf" data-bf="${c.id}">🔥 ${fmtLeft(left)}</span>` : ''}
      </button>`;
  }).join('');

  $$('.case', $('cases')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    currentCase = roomById(b.dataset.id);
    if (currentCase.free && openCount > FREE_MAX) setCount(FREE_MAX);
    renderCases();
    renderArena();
    tone(600, 0.05);
  }));
}

/* Временный бафф: после платного ×20 (шанс BUFF_CHANCE_20) или ×100 (BUFF_CHANCE_100) до BUFF_CASES
   кейсов на BUFF_MS получают редкие ×BUFF_MULT. Кандидаты — платные кейсы дешевле открытого и один
   следующий по цене. Повторный бафф продлевает срок, а не копится. */

const fmtLeft = (ms) => {
  const t = Math.ceil(ms / 1000);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
};

// Кандидаты на бафф после открытия кейса opened: все платные дешевле него и один следующий дороже.
function buffPool(opened) {
  const paid = CASES.filter((c) => !c.free).sort((a, b) => a.price - b.price);
  const cheaper = paid.filter((c) => c.price < opened.price);
  const next = paid.find((c) => c.price > opened.price);
  return next ? [...cheaper, next] : cheaper;
}

function grantBuffs(opened) {
  const pool = buffPool(opened);
  const picked = [];
  while (picked.length < BUFF_CASES && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const until = Date.now() + BUFF_MS;
  picked.forEach((c) => (state.buffs[c.id] = { until, left: BUFF_MS }));
  return picked;
}

// Тик баффов: секундомер (performance.now не зависит от часов системы) уменьшает остаток,
// истёкшие снимаются, таймеры на плитках и в арене обновляются. Сохраняем раз в 5 секунд.
let buffClock = performance.now();
let buffSaved = 0;
function tickBuffs() {
  const now = performance.now();
  const dt = now - buffClock;
  buffClock = now;
  let expired = false;
  for (const [id, b] of Object.entries(state.buffs)) {
    b.left -= dt;
    const c = CASES.find((x) => x.id === id);
    if (!c || buffLeft(c) <= 0) {
      delete state.buffs[id];
      expired = true;
    }
  }
  if (expired) {
    if (!document.hidden) save();
    renderCases();
    renderContents();
    renderMuseum();
    return;
  }
  if (Object.keys(state.buffs).length && now - buffSaved > 5000 && !document.hidden) {
    buffSaved = now;
    save();
  }
  $$('[data-bf]', $('cases')).forEach((el) => {
    el.textContent = '🔥 ' + fmtLeft(buffLeft(roomById(el.dataset.bf)));
  });
  renderBuffNote();
}

function renderBuffNote() {
  const left = buffLeft(currentCase);
  $('caseBuff').hidden = !left;
  if (left) $('caseBuff').textContent = `🔥 Бафф: редкие выпадают в ${BUFF_MULT} раз чаще · ещё ${fmtLeft(left)}`;
}
