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
  if (contractMega) renderMega();
  else renderNormal();
  updateCBar();
}

function renderNormal() {
  let slots = '';
  for (let i = 0; i < 10; i++) {
    const x = contractItems[i];
    slots += x ? `<div class="slot f" style="--c:${RARITY[x.r].c}" title="${x.name}">${x.ic}</div>` : '<div class="slot"></div>';
  }
  $('slots').innerHTML = slots;

  const n = contractItems.length;
  const first = contractItems[0];
  const avgFloat = n ? sum(contractItems, (x) => x.float) / n : 0;
  $('cRar').innerHTML = first
    ? `${RARITY[first.r].n} → <b style="color:${RARITY[first.r + 1].c}">${RARITY[first.r + 1].n}</b>`
    : 'Выбери 10 предметов одной редкости';
  $('cFl').textContent = first ? avgFloat.toFixed(4).replace('.', ',') : '—';
  // Цена результата зависит от износа: он будет примерно CONTRACT_WEAR от среднего вложенного. Отсюда «≈».
  const fl = Math.min(0.9999, Math.max(1e-15, avgFloat * CONTRACT_WEAR));
  const odds = contractOutcomes().map(({ e, p }) => ({ e, p, price: itemPrice(e.base, fl, 1, false) }));
  renderForecast(odds, sum(contractItems, (x) => x.price), {
    approx: true,
    empty: 'Выбери 10 предметов одной редкости в инвентаре — тут появится, что может выпасть и с каким шансом.',
  });
  $('cGo').disabled = n !== 10 || busy;
}

/* Прогноз: «Вложено → Получишь» и самые вероятные результаты с ценой и шансом.
   odds — [{ e, p, price }]; одинаковые предметы (имя и цена) — одной строкой. */
let cOutsAll = false; // «ещё N вариантов» раскрыто
let cSum = null;      // итог для липкой полосы на телефоне
const FC_ROWS = 5;
function renderForecast(odds, value, { approx = false, empty = '', why = '', max = 10, mean: meanPct = false } = {}) {
  const n = contractItems.length;
  $('cIn').textContent = fmt(value);
  $('cIn').classList.toggle('neg', value < 0);
  $('cInN').textContent = `${n} ${plural(n, 'предмет', 'предмета', 'предметов')}`;
  const groups = new Map();
  for (const o of odds) {
    const key = o.e.name + '|' + o.price;
    const g = groups.get(key);
    if (g) g.p += o.p;
    else groups.set(key, { e: o.e, p: o.p, price: o.price });
  }
  const list = [...groups.values()].sort((a, b) => b.p - a.p || b.price - a.price);
  const a = approx ? '≈ ' : '';
  if (!list.length) {
    $('cOut').textContent = '—';
    $('cMean').innerHTML = '&nbsp;';
    $('cOuts').innerHTML = why ? `<p class="mg-why">${why}</p>` : `<p class="fc-empty">${empty}</p>`;
    $('cMore').hidden = true;
    $('cOuts').classList.remove('all');
    cSum = { n, max, value, out: '—' };
    return;
  }
  // Прогноз — без копеек от тысячи: «92 000 ₽ – 220 000 ₽» читается легче и помещается на телефоне.
  const M = (v) => (Math.abs(v) >= 1000 && Math.abs(v) < 1e6 ? NF.format(Math.round(v)) + '\u00a0₽' : fmtShort(v));
  const lo = Math.min(...list.map((o) => o.price));
  const hi = Math.max(...list.map((o) => o.price));
  const mean = sum(list, (o) => o.p * o.price);
  $('cOut').textContent = a + (lo === hi ? M(lo) : `${M(lo)} – ${M(hi)}`);
  $('cMean').textContent = `в среднем ${a}${M(mean)}` + (meanPct && value > 0 ? ` · ${fmtPct((mean / value) * 100, 0)}` : '');
  const pct = (p) => fmtPct(p * 100, p < 0.01 ? 2 : p < 0.1 ? 1 : 0);
  const top = cOutsAll ? list : list.slice(0, FC_ROWS);
  const pmax = list[0].p;
  $('cOuts').innerHTML = top.map((o) => `<div class="fr" role="listitem" style="--c:${RARITY[o.e.r].c}" title="${o.e.name} · ${a}${fmt(o.price)} · ${pct(o.p)}">` +
    `<span class="ic" aria-hidden="true">${o.e.ic}</span><span class="nm">${o.e.name}</span>` +
    `<span class="p${o.price < 0 ? ' neg' : ''}">${a}${slotMoney(o.price)}</span>` +
    `<span class="bar" aria-hidden="true"><i style="width:${(o.p / pmax) * 100}%"></i></span><span class="pc">${pct(o.p)}</span></div>`).join('');
  $('cOuts').classList.toggle('all', cOutsAll && list.length > FC_ROWS);
  const rest = list.length - FC_ROWS;
  $('cMore').hidden = rest <= 0;
  $('cMore').setAttribute('aria-expanded', cOutsAll);
  $('cMore').textContent = cOutsAll ? 'Свернуть' : `Ещё ${rest} ${plural(rest, 'вариант', 'варианта', 'вариантов')}`;
  cSum = { n, max, value, out: a + (lo === hi ? slotMoney(lo) : `${slotMoney(lo)} – ${slotMoney(hi)}`) };
}
$('cOuts').setAttribute('role', 'list');
$('cMore').onclick = () => {
  cOutsAll = !cOutsAll;
  renderContract();
};

/* ===== Мегаконтракт =====
   До 100 предметов любой редкости → один предмет ценой обычно от 0,5× до 2× вложенного. Цена результата —
   ровно базовая цена выпавшего предмета (износ подобран под неё, без СчётЧих™), поэтому средний возврат
   не выше 0,9 вложенного (0,8, если нацелить на один кейс): ровно столько, если в каталоге есть предметы
   и дешевле, и дороже среднего, и меньше — на огромных суммах, где каталог беднеет. */
const megaValue = () => r2(sum(contractItems, (x) => x.price));

// Шансы результатов при вложенных value: [{ e, p }] или { why } — почему подписать нельзя.
function megaOdds(value, target = megaTarget) {
  const n = contractItems.length;
  if (n < MEGA_MIN) return { why: `Нужно от ${MEGA_MIN} предметов, сейчас ${n}.` };
  if (value <= 0) return { why: 'Вложено не больше нуля — за такое барахло ничего не дадут.' };
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
    return { why: target ? 'В этом кейсе нет подходящих по цене предметов — вложи больше или выбери другой кейс.' : 'Подходящих по цене предметов нет.' };
  }
  const avg = (xs) => sum(xs, price) / xs.length;
  const q = above.length ? Math.min(1, Math.max(0, (want - avg(below)) / (avg(above) - avg(below)))) : 0;
  const odds = [...below.map((e) => ({ e, p: (1 - q) / below.length })), ...above.map((e) => ({ e, p: q / above.length }))];
  return { odds, k, mean: sum(odds, (o) => o.p * price(o.e)) };
}

// Можно ли нацелить мегаконтракт на кейс c при текущем вложении.
const megaTargetOk = (c, value) => !megaOdds(value, c.id).why;

// Пояснение обоих режимов — четыре плитки-факта: на телефоне всегда два ряда, на компьютере один.
// Обе четвёрки лежат в одной клетке сетки (видна одна) — высота не меняется при переключении рубильника.
const contractHow = (mode, facts) => `<div class="cm-${mode}">` + facts.map(([ic, html, title]) =>
  `<div class="hw" title="${title}"><span class="i" aria-hidden="true">${ic}</span><span>${html}</span></div>`).join('') + '</div>';
const pct0 = (x) => fmtPct(x * 100, 0);
$('cLead').innerHTML = contractHow('n', [
  ['📦', '<b>10</b> одной редкости', '10 предметов одной редкости, кроме ★'],
  ['⬆️', '<b>на класс</b> выше', 'Результат на класс выше, чаще из кейса, откуда вложено больше'],
  ['✨', 'износ <b>лучше</b>', 'Износ результата лучше среднего у вложенных'],
  ['🗑️', 'с минусом <b>берут</b>', 'Предметы с минусом тоже можно вложить — отличный способ от них избавиться'],
]) + contractHow('m', [
  ['📦', `<b>${MEGA_MIN}–${MEGA_MAX}</b> любых`, `От ${MEGA_MIN} до ${MEGA_MAX} предметов любой редкости, кроме закреплённых`],
  ['🎲', `цена <b>${pct0(MEGA_RANGE[0])}–${pct0(MEGA_RANGE[1])}</b>`, `Один предмет ценой обычно ${pct0(MEGA_RANGE[0])}–${pct0(MEGA_RANGE[1])} вложенного`],
  ['⚖️', `в среднем <b>${pct0(MEGA_RETURN)}</b>`, `В среднем возвращается ${pct0(MEGA_RETURN)} вложенного, ${pct0(MEGA_TARGET_RETURN)} — если выбрать кейс`],
  ['➖', 'минус <b>в вычет</b>', 'Предметы с минусом уменьшают вложенное'],
]);
$('cTarget').parentElement.title = `Нацелить на один кейс: так проще добрать экспонаты для Музея и особые предметы для Кузни, но в среднем вернётся ${fmtPct(MEGA_TARGET_RETURN * 100, 0)}`;
$('cMegaSub').textContent = `${MEGA_MIN}–${MEGA_MAX} предметов любой редкости → 1 по стоимости`;

function renderMegaSwitch() {
  $('cMega').setAttribute('aria-checked', contractMega);
  $('v-contract').classList.toggle('mega', contractMega);
}

function renderMega() {
  const n = contractItems.length;
  $('slots').setAttribute('aria-hidden', 'true'); // сто значков читать вслух незачем: количество — в «Предметов»
  $('slots').innerHTML = n
    ? contractItems.map((x) => `<div class="slot f" style="--c:${RARITY[x.r].c}" title="${x.name} · ${fmt(x.price)}">${x.ic}</div>`).join('') +
      (n < MEGA_MAX ? '<div class="slot more" aria-hidden="true">+</div>' : '')
    : `<div class="mg-empty">Сюда лягут от ${MEGA_MIN} до ${MEGA_MAX} предметов. Выбери их в инвентаре или нажми кнопки в ряду «Добавить».</div>`;
  const value = megaValue();
  $('mgN').textContent = `${n} / ${MEGA_MAX}`;
  // Состав по стоимости: доля каждой редкости во вложенном (минусовые не рисуем).
  const byR = RARITY.map(() => 0);
  contractItems.forEach((x) => { if (x.price > 0) byR[x.r] += x.price; });
  const tot = sum(byR, (v) => v);
  $('mgMix').innerHTML = tot > 0 ? byR.map((v, r) => (v ? `<i style="--c:${RARITY[r].c};width:${(v / tot) * 100}%"></i>` : '')).join('') : '';
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
  // Цена результата мегаконтракта — ровно базовая (см. signMega), поэтому без «≈».
  renderForecast(res.why ? [] : res.odds.map((o) => ({ e: o.e, p: o.p, price: r2(o.e.base) })), value, { why: res.why, max: MEGA_MAX, mean: true });
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
  renderContractFill(); // ряд чипов лёгкий: «Дешёвое» (#cAuto) сразу в видимом ряду
  // Список выбора и инвентарь — большие (сотни плиток): перерисовываем их, когда нож уже поехал. Иначе на
  // телефоне он замирал на 0,2–0,3 с и трогался рывком. Два кадра — чтобы движение успело начаться.
  const stamp = ++knifeStamp;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (stamp !== knifeStamp) return; // щёлкнули ещё раз — перерисует следующий щелчок
    renderPicker();
    renderInventory();
  }));
};
let knifeStamp = 0;

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
  cOutsAll = false;
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
  if (taken) toast(`В контракт попало нужное Музею: ${taken} ${plural(taken, 'предмет', 'предмета', 'предметов')} — других такой редкости не хватило.`, 3200);
}

// Быстрое заполнение — ряд чипов над «Выбором из инвентаря»: «Дешёвое» и по редкостям (у мега ещё дубликаты
// и минусовые). Ряды обоих режимов лежат в одной клетке сетки (виден один) — при переключении рубильника
// высота ряда не меняется. Чипы скрытого ряда выключены: на них не попасть ни мышью, ни Tab-ом.
function renderContractFill() {
  // Считаем ровно то, что кнопки возьмут: без закреплённых, без лежащего на верстаке и на ставке апгрейда.
  const elsewhere = new Set([...bench, upgradeStake].filter(Boolean));
  const mc = [0, 0, 0, 0, 0, 0, 0];
  let neg = 0;
  state.inv.forEach((x) => { if (!x.lock && !contractItems.includes(x) && !elsewhere.has(x)) { if (x.price < 0) neg++; else mc[x.r]++; } });
  const full = !contractMega || contractItems.length >= MEGA_MAX || busy;
  // id="cAuto" — у «Дешёвого» в ряду текущего режима (рубильник перерисовывает ряд сразу).
  const auto = (mine, on, title) => `<button class="chip auto" type="button" data-auto${mine ? ' id="cAuto"' : ''} ${on && !busy ? '' : 'disabled'} title="${title}">Дешёвое</button>`;
  const mega = '<div class="cm-m"><span class="lbl">Добавить:</span>' +
    auto(contractMega, contractMega && contractItems.length < MEGA_MAX, 'Самые дешёвые незакреплённые, пока есть место (без предметов с минусом)') +
    `<button class="chip" type="button" data-mf="dup" ${full ? 'disabled' : ''} title="Все копии, кроме лучшей (без предметов с минусом — для них своя кнопка)">Дубликаты</button>` +
    `<button class="chip" type="button" data-mf="neg" ${full || !neg ? 'disabled' : ''} title="Предметы с минусом">С минусом<b>${neg}</b></button>` +
    mc.map((n, r) => `<button class="chip" type="button" data-mf="${r}" style="--c:${RARITY[r].c}" ${n && !full ? '' : 'disabled'}
      title="Самые дешёвые «${RARITY[r].n}», пока есть место"><i></i>${RARITY[r].n}<b>${n}</b></button>`).join('') + '</div>';
  const counts = [0, 0, 0, 0, 0, 0];
  state.inv.forEach((x) => { if (x.r < 6 && !x.lock && !elsewhere.has(x)) counts[x.r]++; });
  const normal = '<div class="cm-n"><span class="lbl">Заполнить:</span>' +
    auto(!contractMega, !contractMega, '10 самых дешёвых самой простой редкости, где их хватает') + counts.map((n, r) => `
    <button class="chip" type="button" data-cf="${r}" style="--c:${RARITY[r].c}" ${n >= 10 && !busy && !contractMega ? '' : 'disabled'}
      title="10 самых дешёвых «${RARITY[r].n}»"><i></i>${RARITY[r].n}<b>${n}</b></button>`).join('') + '</div>';
  $('cFill').innerHTML = normal + mega;
  $$('[data-mf]', $('cFill')).forEach((b) => (b.onclick = () => megaFill(b.dataset.mf)));
  $$('[data-cf]', $('cFill')).forEach((b) => (b.onclick = () => fillContract(+b.dataset.cf)));
  $$('[data-auto]', $('cFill')).forEach((b) => (b.onclick = autoFill));
}

// «Дешёвое»: в обычном — самая простая редкость, где набирается десятка; в мега — самые дешёвые любой редкости.
function autoFill() {
  if (busy) return;
  if (contractMega) { megaFill('cheap'); return; }
  const rarity = [0, 1, 2, 3, 4, 5].find((r) => contractCandidates(r).list.length >= 10);
  if (rarity === undefined) {
    toast('Нужно хотя бы 10 незакреплённых предметов одной редкости. Открой ещё кейсов.');
    return;
  }
  fillContract(rarity);
}

/* Липкая полоса на телефоне и планшете (контракт и инвентарь там друг под другом): итог и «Подписать» под
   рукой, пока листаешь инвентарь. Прячется, когда кнопки самого контракта на экране, и когда контракт пуст. */
const CBAR_MQ = matchMedia('(max-width: 999px)');
function updateCBar() {
  // Видны ли кнопки контракта — меряем сейчас, а не ждём наблюдателя: иначе полоса мелькала при входе на вкладку.
  const r = $$('.cact')[0].getBoundingClientRect();
  const cactSeen = r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  const show = tab === 'contract' && contractItems.length > 0 && CBAR_MQ.matches && !cactSeen && !busy && !!cSum;
  // Прячем полосу с фокусом на её кнопке — фокус переходит на кнопки контракта, а не теряется.
  if (!show && $('cBar').contains(document.activeElement)) ($('cGo').disabled ? $('cClear') : $('cGo')).focus({ preventScroll: true });
  $('cBar').hidden = !show;
  document.body.classList.toggle('cbar-on', show);
  if (!show) return;
  $('cBar').classList.toggle('zap', contractMega);
  $('cBarT').innerHTML = `${cSum.n} / ${cSum.max} · вложено <b>${slotMoney(cSum.value)}</b><br>получишь <b class="g">${cSum.out}</b>`;
  $('cBarGo').disabled = $('cGo').disabled;
}
new IntersectionObserver(updateCBar).observe($$('.cact')[0]);
CBAR_MQ.addEventListener('change', updateCBar);
$('cBarGo').onclick = () => $('cGo').click();

$('cGo').onclick = async () => {
  if (busy) return;
  if (contractMega) { signMega(); return; }
  contractItems = contractItems.filter((x) => !x.lock && state.inv.includes(x));
  if (contractItems.length !== 10) { renderContract(); return; }
  busy = true;
  $('cGo').disabled = true;
  updateCBar();

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
  trackBest(result); // до сохранения: перезагрузка посреди анимации не теряет статистику
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
  cOutsAll = false;
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
  updateCBar();
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
  trackBest(result); // до сохранения: перезагрузка посреди анимации не теряет статистику
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
  cOutsAll = false;
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
