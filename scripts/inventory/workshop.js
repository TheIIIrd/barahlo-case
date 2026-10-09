/* ==========================================================================
   Мастерская
   ========================================================================== */
'use strict';

let bench = []; // предметы на верстаке
const BENCH_MAX = 10;
// Сколько видов показано в «Что положить» (по LIST_PAGE, дальше — «Показать ещё»); сбрасывается входом в Мастерскую.
let benchPickLimit = LIST_PAGE;

// Какой экземпляр класть на верстак из стопки xs: не закреплённый; сначала не занятый в контракте или
// апгрейде, из них — самый дешёвый.
function benchNext(xs) {
  const busyElsewhere = elsewhereItems();
  return xs.filter((x) => !x.lock && !bench.includes(x))
    .sort((a, b) => busyElsewhere.has(a) - busyElsewhere.has(b) || a.price - b.price)[0] || null;
}

// Рецепт, который точно совпадает с набором предметов.
function matchRecipe(list) {
  const counts = {};
  for (const it of list) {
    const k = itemKey(it);
    if (!k) return null;
    counts[k] = (counts[k] || 0) + 1;
  }
  return RECIPES.find((r) =>
    Object.keys(counts).length === r.keys.length && r.keys.every((x) => counts[x.k] === x.q)) || null;
}

// Набор — часть какого-то рецепта (для подсказки «чего-то не хватает»).
function isPartialRecipe(list) {
  if (!list.length) return false;
  const counts = {};
  for (const it of list) {
    const k = itemKey(it);
    if (!k) return false;
    counts[k] = (counts[k] || 0) + 1;
  }
  return RECIPES.some((r) => Object.entries(counts).every(([k, q]) => {
    const need = r.keys.find((y) => y.k === k);
    return need && q <= need.q;
  }));
}

const ownedCount = (key) => state.inv.filter((x) => itemKey(x) === key).length;

// Поделка нужна рецепту Кузни: «· ⚒️ Кузне: К♥ Король Борщ» (карту называем, только если её рецепт уже виден).
function forgeUse(name) {
  const card = CRAFT_FOR_CARD.get(name);
  if (!card) return '';
  const seen = cardKnown(card.id) || recipeOpen(card);
  return ` · <span class="forge-use" title="Эта поделка нужна для карты в Кузне">⚒️ нужна Кузне${seen ? ': ' + cardTitle(card) : ''}</span>`;
}

/* Массовая сборка: все известные рецепты выбранной редкости подряд, пока хватает
   незакреплённых ингредиентов. Берутся самые дешёвые экземпляры. */
const BATCH_MAX = 200;
let craftRarity = null;

// Незакреплённые предметы по ключу «кейс|индекс», от дешёвых к дорогим. То, что лежит в контракте или
// на ставке апгрейда, не берём: одно действие не должно съедать показанное в другом.
const elsewhereItems = () => new Set([...contractItems, upgradeStake].filter(Boolean));
function craftIndex() {
  const idx = new Map();
  const away = elsewhereItems();
  for (const it of state.inv) {
    const k = !it.lock && !away.has(it) && itemKey(it);
    if (!k) continue;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(it);
  }
  for (const list of idx.values()) list.sort((a, b) => a.price - b.price);
  return idx;
}

// План сборки: [[рецепт, предметы], …]. Ничего не меняет, только считает.
function planBatch(rarity, idx = craftIndex()) {
  const taken = new Map();
  const left = (k) => (idx.get(k)?.length || 0) - (taken.get(k) || 0);
  const recipes = RECIPES.filter((r) => state.recipes[r.id] && r.out[0] === rarity);
  // Сколько каждого ключа нужно рецепту целиком (на случай, если ингредиент указан дважды).
  const need = new Map(recipes.map((r) => {
    const m = new Map();
    for (const x of r.keys) m.set(x.k, (m.get(x.k) || 0) + x.q);
    return [r, m];
  }));
  const plan = [];
  let progress = true;
  while (progress && plan.length < BATCH_MAX) {
    progress = false;
    for (const r of recipes) {
      if (plan.length >= BATCH_MAX || ![...need.get(r)].every(([k, q]) => left(k) >= q)) continue;
      const use = [];
      for (const x of r.keys) {
        const from = taken.get(x.k) || 0;
        use.push(...idx.get(x.k).slice(from, from + x.q));
        taken.set(x.k, from + x.q);
      }
      plan.push([r, use]);
      progress = true;
    }
  }
  return plan;
}

function renderBatch() {
  const knownRarities = [...new Set(RECIPES.filter((r) => state.recipes[r.id]).map((r) => r.out[0]))].sort((a, b) => a - b);
  $('batch').hidden = !knownRarities.length;
  if (!knownRarities.length) return;
  const idx = craftIndex();
  const counts = Object.fromEntries(knownRarities.map((r) => [r, planBatch(r, idx).length]));
  if (!knownRarities.includes(craftRarity)) craftRarity = knownRarities.find((r) => counts[r]) ?? knownRarities[0];
  const n = counts[craftRarity];
  $('batch').innerHTML = `
    <div class="chips">${knownRarities.map((r) => `
      <button class="chip" type="button" data-br="${r}" aria-pressed="${r === craftRarity}" style="--c:${RARITY[r].c}">
        <i></i>${RARITY[r].n}<b>${counts[r]}</b></button>`).join('')}</div>
    <button class="btn${n ? ' primary' : ''}" type="button" id="batchGo" ${n && !busy ? '' : 'disabled'}>
      ${n ? `Собрать всё: ${n} ${plural(n, 'поделка', 'поделки', 'поделок')}` : 'Нечего собирать'}</button>`;
  $$('[data-br]', $('batch')).forEach((b) => (b.onclick = () => {
    craftRarity = +b.dataset.br;
    const fk = focusKey($('batch'));
    renderBatch();
    restoreFocus(fk);
    tone(650, 0.03);
  }));
  $('batchGo').onclick = batchCraft;
}

// Поделка из набора предметов: износ — средний по набору, у полного зала мастерской вдвое меньше.
function craftResult(recipe, list) {
  const avgFloat = sum(list, (x) => x.float) / list.length;
  const wearK = state.museumDone[CRAFT_ROOM.id] ? 0.5 : 1;
  return makeItem(CRAFT_ROOM, RECIPES.indexOf(recipe), Math.min(0.9999, Math.max(1e-15, avgFloat * (0.8 + rnd() * 0.3) * wearK)));
}

async function batchCraft() {
  if (busy || craftRarity == null) return;
  const plan = planBatch(craftRarity);
  if (!plan.length) { toast('Не из чего собирать: не хватает незакреплённых ингредиентов.'); return; }

  busy = true;
  const results = plan.map(([r, use]) => craftResult(r, use));
  const used = sum(plan, ([, use]) => use.length);
  const spentValue = sum(plan, ([, use]) => sum(use, (x) => x.price));
  plan.forEach(([, use]) => use.forEach(removeItem));
  bench = bench.filter((x) => state.inv.includes(x));
  state.crafts += results.length;
  results.forEach(trackBest);
  state.pending = results.slice();
  holdXP(10 * results.length);
  save();
  renderCraft();

  replay($('bench'), 'shake');
  for (let i = 0; i < 4; i++) {
    tone(300 + i * 120, 0.06, 'square', 0.05);
    await sleep(70);
  }
  releaseXP();
  showMulti(results, {
    sorted: results.length > 20,
    title: `Мастерская: ${results.length} ${plural(results.length, 'поделка', 'поделки', 'поделок')}`,
    sub: `Ушло ${used} ${plural(used, 'предмет', 'предмета', 'предметов')} на ${fmtShort(spentValue)} · получилось на ${fmtShort(sum(results, (x) => x.price))}`,
    after: renderAll,
  });
}

// Перерисовка Мастерской заменяет кнопки — фокус возвращаем на ту же стопку или плитку.
function renderCraft() {
  const fk = focusKey($('sub-craft'));
  renderCraftNow();
  restoreFocus(fk);
}
function renderCraftNow() {
  // Закрепили уже на верстаке — убираем с верстака (как в контракте): закреплённое не сжигаем.
  bench = bench.filter((x) => state.inv.includes(x) && !x.lock);
  const known = RECIPES.filter((r) => state.recipes[r.id]).length;
  $('subCraftN').textContent = known + '/' + RECIPES.length;
  $('rcpN').textContent = `открыто ${known} из ${RECIPES.length}`;
  if (!subVisible('craft')) return;

  // Верстак: одинаковые предметы — одной стопкой с числом. Нажатие снимает один предмет из стопки.
  const stacks = new Map();
  for (const x of bench) {
    const k = itemKey(x);
    if (!stacks.has(k)) stacks.set(k, []);
    stacks.get(k).push(x);
  }
  $('bSlots').innerHTML = [...stacks].map(([k, xs]) => {
    const x = xs[0];
    const total = sum(xs, (y) => y.price);
    const n = xs.length;
    return `<button type="button" class="bstack${n > 1 ? ' many' : ''}" data-k="${k}" style="--c:${RARITY[x.r].c}"
        title="${baseName(x)}${n > 1 ? ' ×' + n : ''} · ${fmt(total)} — нажми, чтобы убрать${n > 1 ? ' один' : ''}"
        aria-label="${baseName(x)}: ${n} шт., ${fmt(total)} — нажми, чтобы убрать один">
      ${n > 1 ? `<span class="q" aria-hidden="true">×${n}</span>` : ''}<span class="ic">${x.ic}</span><span class="nm">${baseName(x)}</span>
      <span class="p${total < 0 ? ' neg' : ''}">${slotMoney(total)}</span></button>`;
  }).join('') + (bench.length < BENCH_MAX ? '<div class="bstack add" aria-hidden="true">+</div>' : '');
  $$('.bstack[data-k]', $('bSlots')).forEach((el) => (el.onclick = () => {
    if (busy) return;
    const xs = stacks.get(el.dataset.k);
    bench.splice(bench.lastIndexOf(xs[xs.length - 1]), 1);
    tone(500, 0.03);
    renderCraft();
  }));
  $('bCap').innerHTML = `<span class="pips" aria-hidden="true">${Array.from({ length: BENCH_MAX }, (_, i) => `<i${i < bench.length ? ' class="on"' : ''}></i>`).join('')}</span>
    <span><b>${bench.length}</b> из ${BENCH_MAX}</span>`;

  const match = matchRecipe(bench);
  if (!bench.length) $('bInfo').innerHTML = 'Положи предметы снизу. Если рецепта нет — ничего не пропадёт.';
  else if (match) $('bInfo').innerHTML = state.recipes[match.id] ? `Получится: <b>${match.out[2]}</b>` : '<b>Что-то получается…</b> Нажми «Собрать».';
  else if (isPartialRecipe(bench)) $('bInfo').innerHTML = 'Кажется, чего-то не хватает…';
  else $('bInfo').innerHTML = 'Такой рецепт неизвестен. Но попробовать можно.';
  $('bGo').disabled = !bench.length || busy;

  // Что можно положить: тоже стопками — плитка на вид, новые сверху. Нажатие кладёт следующий по очереди
  // экземпляр (benchNext). Закреплённые не берём: если свободных нет, плитка тусклая.
  // Порядок видов — по самому новому экземпляру во всём инвентаре, вместе с верстаком: положил предмет —
  // плитка остаётся на месте (и не уезжает за «Показать ещё»), а вид, целиком лежащий на верстаке, — тусклый «×0».
  const groups = new Map();
  const onBench = new Set(bench);
  for (const x of state.inv.slice().reverse()) {
    const k = itemKey(x);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    if (!onBench.has(x)) groups.get(k).push(x);
  }
  const avail = sum([...groups.values()], (xs) => xs.length);
  const kindsLeft = [...groups.values()].filter((xs) => xs.length).length;
  $('bPickN').textContent = avail ? `${avail} ${plural(avail, 'предмет', 'предмета', 'предметов')} · ${kindsLeft} ${plural(kindsLeft, 'вид', 'вида', 'видов')}` : '';
  const full = bench.length >= BENCH_MAX;
  const kinds = [...groups];
  const sample = new Map(); // вид целиком на верстаке — плитку рисуем по экземпляру с верстака
  for (const x of bench) sample.set(itemKey(x), sample.get(itemKey(x)) || x);
  $('bPick').innerHTML = groups.size
    ? kinds.slice(0, benchPickLimit).map(([k, xs], j) => {
      if (!xs.length) {
        const y = sample.get(k);
        return `
      <button class="inv-item dim" type="button" data-pk="${k}" aria-disabled="true" style="--c:${RARITY[y.r].c};${j > 8 ? 'animation:none' : ''}"
        title="${baseName(y)} — все уже на верстаке"><span class="qn">×0</span><span class="ic">${y.ic}</span>${baseName(y)}
        <span class="p off"><span class="word">на верстаке</span></span></button>`;
      }
      const free = xs.filter((x) => !x.lock);
      const locked = xs.length - free.length;
      const next = benchNext(xs);
      const x = next || xs[0];
      const prices = (free.length ? free : xs).map((y) => y.price);
      const lo = Math.min(...prices);
      const from = Math.max(...prices) > lo ? 'от ' : ''; // «от» — только если цены разные
      const price = (from ? '<span class="word">от </span>' : '') + slotMoney(lo); // «от» — слово, не моноширинным
      return `
      <button class="inv-item${full || !free.length ? ' dim' : ''}" type="button" data-pk="${k}"${full || !free.length ? ' aria-disabled="true"' : ''}
        style="--c:${RARITY[x.r].c};${j > 8 ? 'animation:none' : ''}"
        title="${baseName(x)} · ${from}${fmt(lo)} · свободно ${free.length}${locked ? ` · закреплено ${locked}` : ''}${free.length ? ' — нажми, чтобы положить' : ''}">
        ${locked ? `<span class="st" style="background:var(--muted)">🔒${locked > 1 || free.length ? locked : ''}</span>` : ''}
        ${free.length > 1 ? `<span class="qn">×${free.length}</span>` : ''}
        <span class="ic">${x.ic}</span>${baseName(x)}
        <span class="p${lo < 0 ? ' neg' : ''}">${price}</span>
      </button>`;
    }).join('') + moreButtonHTML('bpMore', kinds.length - benchPickLimit, LIST_PAGE, kinds.length)
    : '<span class="empty">Инвентарь пуст. Открой пару кейсов.</span>';
  if ($('bpMore')) {
    $('bpMore').onclick = () => {
      const from = benchPickLimit;
      benchPickLimit += LIST_PAGE;
      showMore('bpMore', renderCraft, $('bPick'), '.inv-item', from);
    };
  }
  $$('.inv-item', $('bPick')).forEach((b) => (b.onclick = () => {
    if (busy) return;
    if (bench.length >= BENCH_MAX) { toast(`На верстаке максимум ${BENCH_MAX} предметов.`); return; }
    const xs = groups.get(b.dataset.pk) || [];
    const it = benchNext(xs);
    if (!it) { toast(xs.length ? 'Закреплённое не кладётся на верстак — сначала открепи в инвентаре.' : 'Все такие уже на верстаке.'); return; }
    claimItem(it, 'bench'); // свободных нет — берём из контракта или апгрейда, предупредив
    bench.push(it);
    tone(800, 0.03);
    renderCraft();
  }));

  // Книга рецептов.
  $('recipes').innerHTML = RECIPES.map((r, ri) => {
    const [rar, ic, name, , base] = r.out;
    const parts = r.keys.map((x) => ({ x, have: ownedCount(x.k) }));
    const ready = parts.every((p) => p.have >= p.x.q);
    if (state.recipes[r.id]) {
      return `
        <div class="rcp" style="--c:${RARITY[rar].c}">
          <span class="out">${ic}</span>
          <div>
            <div class="nm">${name}</div>
            <div class="ings">${parts.map((p) =>
              `<span class="ing${p.have >= p.x.q ? ' ok' : ''}">${p.x.ic} ${p.x.name} <small>есть ${p.have} · нужно ${p.x.q}</small></span>`).join('')}</div>
            <div class="meta">${RARITY[rar].n} · ≈ ${fmtShort(base)}${forgeUse(name)}</div>
          </div>
          <button class="btn${ready ? ' primary' : ''}" type="button" data-auto="${ri}" ${ready && !busy ? '' : 'disabled'}>Собрать</button>
        </div>`;
    }
    const typesOwned = parts.filter((p) => p.have >= p.x.q).length;
    return `
      <div class="rcp unk${ready ? ' hot' : ''}" style="--c:${RARITY[rar].c}">
        <span class="out">${ic}</span>
        <div>
          <div class="nm">??? <span class="rcp-rar">${RARITY[rar].n}</span></div>
          <div class="hint">${r.hint}</div>
          <div class="meta">ингредиентов: ${sum(r.keys, (x) => x.q)} · у тебя есть ${typesOwned} из ${r.keys.length} ${plural(r.keys.length, 'вида', 'видов', 'видов')}${ready ? ' · ✅ всё есть' : ''}</div>
        </div>
      </div>`;
  }).join('');
  $$('[data-auto]', $('recipes')).forEach((b) => (b.onclick = () => autoCraft(RECIPES[+b.dataset.auto])));
  renderBatch();
}
$('bClear').onclick = () => { bench = []; renderCraft(); };
$('bGo').onclick = () => doCraft(bench.slice());

// Собрать известный рецепт из самых дешёвых подходящих предметов.
function autoCraft(r) {
  const use = [];
  const away = elsewhereItems();
  for (const x of r.keys) {
    const found = state.inv
      .filter((y) => itemKey(y) === x.k && !use.includes(y) && !away.has(y))
      .sort((a, b) => (!!a.lock - !!b.lock) || (a.price - b.price))
      .slice(0, x.q);
    if (found.length < x.q) {
      toast(state.inv.some((y) => itemKey(y) === x.k && away.has(y))
        ? 'Не хватает свободных ингредиентов: часть лежит в контракте или на апгрейде.' : 'Не хватает ингредиентов.', 3200);
      return;
    }
    use.push(...found);
  }
  if (use.some((x) => x.lock)) {
    toast('Для рецепта нужен закреплённый предмет. Открепи его в инвентаре, если не жалко.', 3600);
    return;
  }
  doCraft(use);
}

async function doCraft(list) {
  list = [...new Set(list)].filter((x) => state.inv.includes(x));
  if (busy || !list.length) return;
  // Закрепили уже на верстаке — не сжигаем.
  if (list.some((x) => x.lock)) { toast('На верстаке закреплённый предмет — открепи его или убери с верстака.', 3600); return; }

  const recipe = matchRecipe(list);
  if (!recipe) {
    replay($('bench'), 'shake');
    sad();
    toast(isPartialRecipe(list) ? 'Почти! Чего-то не хватает.' : pick([
      'Ничего не вышло. Это просто куча барахла.',
      'Реставратор посмотрел, вздохнул и ушёл.',
      'Бабушка сказала, что так не делается.',
    ]), 2800);
    return;
  }

  busy = true;
  const firstTime = !state.recipes[recipe.id];
  const result = craftResult(recipe, list);

  list.forEach(removeItem);
  bench = bench.filter((x) => !list.includes(x)); // собрали из книги — чужое на верстаке остаётся
  state.recipes[recipe.id] = true;
  state.crafts++;
  state.pending = [result];
  trackBest(result);
  holdXP(firstTime ? 40 : 10);
  save();

  const usedKeys = new Set(list.map(itemKey));
  $$('.bstack[data-k]', $('bSlots')).filter((s) => usedKeys.has(s.dataset.k)).forEach((s, i) => {
    s.style.animationDelay = i * 40 + 'ms';
    s.classList.add('suck');
  });
  for (let i = 0; i < 4; i++) {
    tone(300 + i * 120, 0.06, 'square', 0.05);
    await sleep(90);
  }
  await sleep(450);
  releaseXP();
  if (firstTime) setTimeout(() => toast(`Новый рецепт: «${recipe.out[2]}»! Он записан в книгу.`, 4000, { important: true }), 900);
  renderAll();
  showDrop(result, firstTime ? 'Новый рецепт!' : 'Мастерская', () => {
    busy = false;
    renderAll();
  });
}
