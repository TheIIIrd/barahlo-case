/* ==========================================================================
   Контракт обмена: 10 предметов → 1 классом выше
   ========================================================================== */
'use strict';

/* Кейс, из которого предмет x «тянет» результат контракта: его собственный, если там есть следующая
   редкость. Иначе (поделка Мастерской, ключи из бесплатных «Карманов») — кейс, где предметы той же
   редкости ближе всего по цене к самому x. Раньше такие предметы открывали результат из всего каталога,
   вплоть до «Чёрной дыры». */
function contractSourceCase(x) {
  const next = x.r + 1;
  const own = CASES.find((c) => c.id === x.caseId);
  if (own && !own.free && own.items.some((it) => it[0] === next)) return own;
  const fits = CASES.filter((c) => !c.free && c.items.some((it) => it[0] === x.r) && c.items.some((it) => it[0] === next));
  const avg = (c) => sum(c.items.filter((it) => it[0] === x.r), (it) => it[4]) / c.items.filter((it) => it[0] === x.r).length;
  const dist = (c) => Math.abs(Math.log(Math.max(0.01, avg(c)) / Math.max(0.01, x.base || x.price)));
  return fits.reduce((a, c) => (dist(c) < dist(a) ? c : a), fits[0]);
}

/* Возможные результаты с шансами: каждый из 10 предметов даёт 1/10 шанса своему кейсу, внутри кейса
   предметы следующей редкости равновероятны. Так 9 дешёвых + 1 дорогой дают дорогой кейс в 10% случаев,
   а не в половине. [{ e, p }] */
function contractOutcomes() {
  if (!contractItems.length) return [];
  const next = contractItems[0].r + 1;
  const odds = new Map();
  for (const x of contractItems) {
    const c = contractSourceCase(x);
    if (!c) continue;
    const pool = CATALOG.filter((e) => e.c === c && e.r === next);
    pool.forEach((e) => odds.set(e, (odds.get(e) || 0) + 1 / contractItems.length / pool.length));
  }
  return [...odds].map(([e, p]) => ({ e, p }));
}

function renderContract() {
  contractItems = contractItems.filter((x) => state.inv.includes(x));
  $('slots').removeAttribute('aria-hidden');
  renderMegaSwitch();
  // Закреплённое после добавления в контракт из него выпадает: закреплённое не сжигаем.
  contractItems = contractItems.filter((x) => !x.lock);
  if (contractMega) { renderMega(); return; }
  let slots = '';
  for (let i = 0; i < 10; i++) {
    const x = contractItems[i];
    slots += x ? `<div class="slot f" style="--c:${RARITY[x.r].c}" title="${x.name}">${x.ic}</div>` : '<div class="slot"></div>';
  }
  $('slots').innerHTML = slots;

  const first = contractItems[0];
  $('cRar').textContent = first ? `${RARITY[first.r].n} → ${RARITY[first.r + 1].n}` : '—';
  $('cIn').textContent = fmt(sum(contractItems, (x) => x.price));
  $('cFl').textContent = first ? (sum(contractItems, (x) => x.float) / contractItems.length).toFixed(4) : '—';
  $('cOuts').innerHTML = contractOutcomes().sort((a, b) => b.p - a.p)
    .map(({ e, p }) => `<span role="img" style="--c:${RARITY[e.r].c}" title="${e.name} · ≈ ${fmt(e.base)} · ${fmtPct(p * 100, 1)}" aria-label="${e.name}, шанс ${fmtPct(p * 100, 1)}">${e.ic}</span>`).join('');
  $('cGo').disabled = contractItems.length !== 10 || busy;
}

/* ===== Мегаконтракт =====
   До 100 предметов любой редкости → один предмет ценой обычно от 0,5× до 2× вложенного. Цена результата —
   ровно базовая цена выпавшего предмета (износ подобран под неё, без СчётЧих™), поэтому средний возврат
   не выше 0,9 вложенного (0,8, если нацелить на один кейс): ровно столько, если в каталоге есть предметы
   и дешевле, и дороже среднего, и меньше — на огромных суммах, где каталог беднеет. */
const megaValue = () => r2(sum(contractItems, (x) => x.price));

// Шансы результатов при вложенных value: [{ e, p }] или { why } — почему подписать нельзя.
function megaOdds(value, target = megaTarget) {
  const n = contractItems.length;
  if (n < MEGA_MIN) return { why: `Нужно от ${MEGA_MIN} предметов, сейчас ${n}` };
  if (value <= 0) return { why: 'Вложено не больше нуля — за такое барахло ничего не дадут' };
  const k = target ? MEGA_TARGET_RETURN : MEGA_RETURN;
  const want = k * value;
  // Пределы цены результата: обычные, а если в них нет ни одного предмета дешевле среднего — шире.
  // Без предметов дешевле среднего честный средний возврат не собрать — такой контракт не предлагаем.
  // Цена результата — базовая, округлённая до копейки (так её и получит предмет); по ней же и считаем.
  const price = (e) => r2(e.base);
  let cands = [];
  let below = [];
  for (const [lo, hi] of [MEGA_RANGE, ...MEGA_WIDER]) {
    cands = CATALOG.filter((e) => price(e) >= 0.01 && (!target || e.c.id === target) && price(e) >= lo * value && price(e) <= hi * value);
    below = cands.filter((e) => price(e) < want);
    if (below.length) break;
  }
  const above = cands.filter((e) => price(e) >= want);
  if (!below.length) {
    return { why: target ? 'В этом кейсе нет подходящих по цене предметов — вложи больше или выбери другой кейс' : 'Подходящих по цене предметов нет' };
  }
  const avg = (xs) => sum(xs, price) / xs.length;
  const q = above.length ? Math.min(1, Math.max(0, (want - avg(below)) / (avg(above) - avg(below)))) : 0;
  const odds = [...below.map((e) => ({ e, p: (1 - q) / below.length })), ...above.map((e) => ({ e, p: q / above.length }))];
  return { odds, k, mean: sum(odds, (o) => o.p * price(o.e)) };
}

// Можно ли нацелить мегаконтракт на кейс c при текущем вложении.
const megaTargetOk = (c, value) => !megaOdds(value, c.id).why;

function renderMegaSwitch() {
  $('cMega').setAttribute('aria-checked', contractMega);
  $('v-contract').classList.toggle('mega', contractMega);
  $('cTitle').innerHTML = contractMega
    ? `⚡ Мегаконтракт <small>до ${MEGA_MAX} предметов любой редкости → 1 по стоимости</small>`
    : 'Контракт обмена <small>10 предметов → 1 классом выше</small>';
  $('cLead').textContent = contractMega
    ? `Сложи от ${MEGA_MIN} до ${MEGA_MAX} предметов любой редкости. Взамен — один предмет ценой обычно от ${fmtPct(MEGA_RANGE[0] * 100, 0)} до ${fmtPct(MEGA_RANGE[1] * 100, 0)} вложенного, в среднем ${fmtPct(MEGA_RETURN * 100, 0)}. Предметы с минусом уменьшают вложенное. Можно нацелить на один кейс — так проще добрать музей и именные предметы для Кузни, но в среднем выйдет ${fmtPct(MEGA_TARGET_RETURN * 100, 0)}.`
    : 'Выбери в инвентаре 10 предметов одной редкости. Взамен получишь один предмет следующей редкости из тех же кейсов — чем больше вложено из кейса, тем вероятнее результат из него. Износ результата заметно лучше среднего вложенного. Заодно отличный способ избавиться от вещей с отрицательной ценой.';
  $('cInfo').hidden = contractMega;
  $('cMegaInfo').hidden = !contractMega;
  $('cAuto').textContent = contractMega ? 'Добавить дешёвое' : 'Автозаполнить дешёвым';
  $('cGo').textContent = contractMega ? '⚡ Подписать мегаконтракт' : 'Подписать контракт';
}

function renderMega() {
  const n = contractItems.length;
  $('slots').setAttribute('aria-hidden', 'true'); // сто значков читать вслух незачем: количество — в «Предметов»
  $('slots').innerHTML = contractItems.map((x) => `<div class="slot f" style="--c:${RARITY[x.r].c}" title="${x.name} · ${fmt(x.price)}">${x.ic}</div>`).join('') +
    (n < MEGA_MAX ? '<div class="slot more" aria-hidden="true">+</div>' : '');
  const value = megaValue();
  $('mgN').textContent = `${n} / ${MEGA_MAX}`;
  $('mgIn').textContent = fmt(value);
  $('mgIn').classList.toggle('neg', value < 0);
  // Кейс-цель: только те, где при таком вложении есть честный набор результатов.
  if (megaTarget && !megaTargetOk(roomById(megaTarget), value)) megaTarget = '';
  // В подписи — настоящий средний возврат: на огромных суммах каталог беднеет, и он бывает ниже обещанного.
  const meanPct = (t, k) => {
    const o = megaOdds(value, t);
    return fmtPct(o.why || value <= 0 ? k * 100 : (o.mean / value) * 100, 0);
  };
  $('cTarget').innerHTML = `<option value="">любого · в среднем ${meanPct('', MEGA_RETURN)}</option>` +
    CASES.filter((c) => !c.free).map((c) => {
      const ok = n >= MEGA_MIN && megaTargetOk(c, value);
      return `<option value="${c.id}"${c.id === megaTarget ? ' selected' : ''}${ok ? '' : ' disabled'}>${c.name}${ok ? ` · ${meanPct(c.id, MEGA_TARGET_RETURN)}` : ''}</option>`;
    }).join('');
  const res = megaOdds(value);
  if (res.why) {
    $('mgOut').textContent = '—';
    $('cOuts').innerHTML = `<p class="mg-why">${res.why}</p>`;
  } else {
    const lo = Math.min(...res.odds.map((o) => o.e.base));
    const hi = Math.max(...res.odds.map((o) => o.e.base));
    $('mgOut').textContent = `${fmtShort(lo)} – ${fmtShort(hi)} · в среднем ${fmtShort(res.mean)}`;
    // Возможные результаты: самые вероятные, по редкости.
    const top = res.odds.slice().sort((a, b) => b.p - a.p || b.e.r - a.e.r).slice(0, 14);
    $('cOuts').innerHTML = top.map((o) => `<span role="img" style="--c:${RARITY[o.e.r].c}" title="${o.e.name} · ${fmt(o.e.base)} · ${fmtPct(o.p * 100, o.p < 0.01 ? 2 : 1)}" aria-label="${o.e.name}, ${fmt(o.e.base)}, шанс ${fmtPct(o.p * 100, o.p < 0.01 ? 2 : 1)}">${o.e.ic}</span>`).join('') +
      (res.odds.length > top.length ? `<span class="more" title="Всего возможных результатов: ${res.odds.length}">+${res.odds.length - top.length}</span>` : '');
  }
  $('cGo').disabled = busy || !!res.why;
}

$('cTarget').onchange = (e) => {
  if (busy) { e.target.value = megaTarget; return; }
  megaTarget = e.target.value;
  renderContract();
  tone(600, 0.03);
};

// Рубильник. Обычный контракт вмещает только 10 предметов одной редкости — лишнее при переключении снимаем.
$('cMega').onclick = () => {
  if (busy) return;
  contractMega = !contractMega;
  if (!contractMega) {
    const r = contractItems[0] && contractItems[0].r;
    if (contractItems.length > 10 || contractItems.some((x) => x.r !== r || x.r >= 6)) {
      contractItems = [];
      toast('Контракт очищен: обычный берёт только 10 предметов одной редкости.');
    }
  }
  const b = $('cMega').getBoundingClientRect();
  if (contractMega) {
    burst(b.left + b.width * 0.62, b.top + b.height / 2, ['#ffd23f', '#ffffff', '#5eb3ff'], 26);
    tone(140, 0.12, 'sawtooth', 0.06);
    setTimeout(() => tone(1800, 0.05, 'square', 0.03), 60);
  } else {
    tone(420, 0.06, 'square', 0.04);
  }
  renderContract();
  renderPicker();
  renderInventory();
};

/* Быстро в мегаконтракт: дешёвые (как автозаполнение контракта — без закреплённых, лучший экземпляр
   для музея в последнюю очередь), дубликаты (всё, кроме лучшего экземпляра), с минусом или по редкости. */
function megaAdd(list) {
  const room = MEGA_MAX - contractItems.length;
  const taken = takenItems(); // верстак, апгрейд и то, что уже в контракте, — не трогаем
  const add = list.filter((x) => !x.lock && !taken.has(x)).slice(0, Math.max(0, room));
  if (!add.length) {
    toast(room <= 0 ? `В мегаконтракте уже ${MEGA_MAX} предметов.` : 'Подходящих незакреплённых предметов нет.');
    return;
  }
  contractItems.push(...add);
  renderContract();
  renderPicker();
  renderInventory();
  tone(900, 0.05);
}
function megaFill(kind) {
  if (busy) return;
  const inContract = new Set(contractItems);
  const free = state.inv.filter((x) => !x.lock && !inContract.has(x));
  const freeSet = new Set(free);
  // Лучший экземпляр каждого предмета и сколько всего копий — за один проход.
  const best = new Map();
  const copies = new Map();
  for (const x of state.inv) {
    const k = itemKey(x);
    if (!k) continue;
    copies.set(k, (copies.get(k) || 0) + 1);
    if (freeSet.has(x) && (!best.has(k) || x.float < best.get(k).float)) best.set(k, x);
  }
  // Последний экземпляр и лучший для музея идут в самую последнюю очередь.
  const keep = new Set([...best.values()].filter((x) => museumWants(x) || copies.get(itemKey(x)) === 1));
  const byPrice = (a, b) => a.price - b.price;
  const keepLast = (xs) => [...xs.filter((x) => !keep.has(x)).sort(byPrice), ...xs.filter((x) => keep.has(x)).sort(byPrice)];
  let list;
  // Минусовые — только своей кнопкой «С минусом»: иначе «дешёвое» съело бы вложенное в ноль.
  if (kind === 'neg') list = free.filter((x) => x.price < 0).sort(byPrice);
  else if (kind === 'dup') list = free.filter((x) => x.price >= 0 && itemKey(x) && best.get(itemKey(x)) !== x).sort(byPrice);
  else if (kind === 'cheap') list = keepLast(free.filter((x) => x.price >= 0));
  else list = keepLast(free.filter((x) => x.r === +kind && x.price >= 0));
  megaAdd(list);
}

$('cClear').onclick = () => {
  contractItems = [];
  renderContract();
  renderInventory();
};

/* Автозаполнение. Берём незакреплённые предметы нужной редкости от дешёвых к дорогим.
   Лучший экземпляр каждого предмета, которого ждёт музей, откладываем в конец очереди:
   он пойдёт в контракт, только если без него десятки не набрать. */
function contractCandidates(rarity) {
  const elsewhere = new Set([...bench, upgradeStake].filter(Boolean)); // верстак и апгрейд не трогаем
  const list = state.inv.filter((x) => x.r === rarity && x.r < 6 && !x.lock && !elsewhere.has(x));
  const keep = new Set();
  const bestFor = new Map();
  for (const x of list) {
    if (!museumWants(x)) continue;
    const k = itemKey(x);
    const cur = bestFor.get(k);
    if (!cur || x.float < cur.float) bestFor.set(k, x);
  }
  bestFor.forEach((x) => keep.add(x));
  const byPrice = (a, b) => a.price - b.price;
  const list2 = [...list.filter((x) => !keep.has(x)).sort(byPrice), ...list.filter((x) => keep.has(x)).sort(byPrice)];
  return { list: list2, keep };
}

function fillContract(rarity) {
  if (busy) return;
  const { list, keep } = contractCandidates(rarity);
  if (list.length < 10) {
    toast(`Нужно 10 незакреплённых предметов «${RARITY[rarity].n}», а есть ${list.length}.`);
    return;
  }
  contractItems = list.slice(0, 10);
  renderContract();
  renderInventory();
  tone(900, 0.05);
  const taken = contractItems.filter((x) => keep.has(x)).length;
  if (taken) toast(`Без нужного музею не обошлось: ${taken} ${plural(taken, 'предмет', 'предмета', 'предметов')} с 🏛 в контракте.`, 3200);
}

// Кнопки по редкостям: сколько незакреплённых предметов каждой редкости есть.
function renderContractFill() {
  if (contractMega) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let neg = 0;
    state.inv.forEach((x) => { if (!x.lock && !contractItems.includes(x)) { if (x.price < 0) neg++; else counts[x.r]++; } });
    const full = contractItems.length >= MEGA_MAX || busy;
    $('cFill').innerHTML = '<span class="lbl">Добавить:</span>' +
      `<button class="chip" type="button" data-mf="dup" ${full ? 'disabled' : ''} title="Все копии, кроме лучшей (без минусовых — для них своя кнопка)">Дубликаты</button>` +
      `<button class="chip" type="button" data-mf="neg" ${full || !neg ? 'disabled' : ''} title="Предметы с отрицательной ценой">С минусом<b>${neg}</b></button>` +
      counts.map((n, r) => `<button class="chip" type="button" data-mf="${r}" style="--c:${RARITY[r].c}" ${n && !full ? '' : 'disabled'}
        title="Самые дешёвые «${RARITY[r].n}», пока есть место"><i></i>${RARITY[r].n}<b>${n}</b></button>`).join('');
    $$('[data-mf]', $('cFill')).forEach((b) => (b.onclick = () => megaFill(b.dataset.mf)));
    return;
  }
  const counts = [0, 0, 0, 0, 0, 0];
  state.inv.forEach((x) => { if (x.r < 6 && !x.lock) counts[x.r]++; });
  $('cFill').innerHTML = '<span class="lbl">Самыми дешёвыми:</span>' + counts.map((n, r) => `
    <button class="chip" type="button" data-cf="${r}" style="--c:${RARITY[r].c}" ${n >= 10 && !busy ? '' : 'disabled'}
      title="10 самых дешёвых «${RARITY[r].n}»"><i></i>${RARITY[r].n}<b>${n}</b></button>`).join('');
  $$('[data-cf]', $('cFill')).forEach((b) => (b.onclick = () => fillContract(+b.dataset.cf)));
}

// «Автозаполнить дешёвым»: самая низкая редкость, где набирается десятка.
$('cAuto').onclick = () => {
  if (busy) return;
  if (contractMega) { megaFill('cheap'); return; }
  const rarity = [0, 1, 2, 3, 4, 5].find((r) => contractCandidates(r).list.length >= 10);
  if (rarity === undefined) {
    toast('Нужно хотя бы 10 незакреплённых предметов одной редкости. Открой ещё кейсов.');
    return;
  }
  fillContract(rarity);
};

$('cGo').onclick = async () => {
  if (busy) return;
  if (contractMega) { signMega(); return; }
  contractItems = contractItems.filter((x) => !x.lock && state.inv.includes(x));
  if (contractItems.length !== 10) { renderContract(); return; }
  busy = true;
  $('cGo').disabled = true;

  // Результат определяем и сохраняем до анимации.
  const outs = contractOutcomes();
  let roll = rnd();
  let outcome = outs[outs.length - 1].e;
  for (const o of outs) {
    roll -= o.p;
    if (roll < 0) { outcome = o.e; break; }
  }
  const avgFloat = sum(contractItems, (x) => x.float) / 10;
  // Результат: износ заметно лучше среднего вложенного, СчётЧих™ — как повезёт.
  const fl = Math.min(0.9999, Math.max(1e-15, avgFloat * CONTRACT_WEAR * (0.95 + rnd() * 0.1)));
  const result = makeItem(outcome.c, outcome.i, fl);
  contractItems.slice().forEach(removeItem);
  state.pending = [result];
  state.contracts++;
  holdXP(25);
  save();
  renderPicker();

  $$('.slot', $('slots')).forEach((s, i) => {
    s.style.animationDelay = i * 60 + 'ms';
    s.classList.add('suck');
  });
  for (let i = 0; i < 10; i++) {
    tone(300 + i * 70, 0.06, 'square', 0.04);
    await sleep(reducedMotion ? 10 : 60);
  }
  await sleep(reducedMotion ? 100 : 700);

  contractItems = [];
  trackBest(result);
  releaseXP();
  renderContract();
  renderInventory();
  renderStats();
  showDrop(result, 'Результат контракта', () => {
    busy = false;
    renderContract();
    renderPicker();
  });
};

// Подписать мегаконтракт: результат решается и сохраняется до анимации.
async function signMega() {
  contractItems = contractItems.filter((x) => !x.lock && state.inv.includes(x));
  const value = megaValue();
  const res = megaOdds(value);
  if (res.why) { toast(res.why); return; }
  busy = true;
  $('cGo').disabled = true;
  let x = rnd();
  let pickEntry = res.odds[res.odds.length - 1].e;
  for (const o of res.odds) {
    x -= o.p;
    if (x < 0) { pickEntry = o.e; break; }
  }
  // Цена результата — ровно базовая: износ случайный, а «шум» цены подобран под него.
  const fl = 0.15 + rnd() * 0.55;
  const result = makeItem(pickEntry.c, pickEntry.i, fl);
  result.stat = false;
  result.name = pickEntry.name;
  result.noise = 1 / floatMult(fl);
  result.price = itemPrice(result.base, fl, result.noise, false);
  const n = contractItems.length;
  contractItems.slice().forEach(removeItem);
  state.pending = [result];
  state.contracts++;
  holdXP(25 + n / 4);
  save();
  renderPicker();

  $$('.slot.f', $('slots')).forEach((el, i) => {
    el.style.animationDelay = Math.min(i * 12, 900) + 'ms';
    el.classList.add('suck');
  });
  for (let i = 0; i < 12; i++) {
    tone(260 + i * 90, 0.05, 'square', 0.035);
    await sleep(reducedMotion ? 10 : 70);
  }
  await sleep(reducedMotion ? 100 : 900);

  contractItems = [];
  trackBest(result);
  releaseXP();
  renderContract();
  renderInventory();
  renderStats();
  showDrop(result, `Мегаконтракт: вложено ${fmtShort(value)}`, () => {
    busy = false;
    renderContract();
    renderPicker();
  });
}
