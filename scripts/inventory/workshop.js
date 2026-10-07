/* ==========================================================================
   Мастерская
   ========================================================================== */
'use strict';

let bench = []; // предметы на верстаке

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

/* Массовая сборка: все известные рецепты выбранной редкости подряд, пока хватает
   незакреплённых ингредиентов. Берутся самые дешёвые экземпляры. */
const BATCH_MAX = 200;
let craftRarity = null;

// Незакреплённые предметы по ключу «кейс|индекс», от дешёвых к дорогим.
function craftIndex() {
  const idx = new Map();
  for (const it of state.inv) {
    const k = !it.lock && itemKey(it);
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
    renderBatch();
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

function renderCraft() {
  bench = bench.filter((x) => state.inv.includes(x));
  const known = RECIPES.filter((r) => state.recipes[r.id]).length;
  $('subCraftN').textContent = known + '/' + RECIPES.length;
  $('rcpN').textContent = `открыто ${known} из ${RECIPES.length}`;
  if (!subVisible('craft')) return;

  // Верстак.
  let slots = '';
  for (let i = 0; i < 10; i++) {
    const x = bench[i];
    slots += x
      ? `<div class="slot f" data-i="${i}" style="--c:${RARITY[x.r].c}" title="${x.name} · убрать">${x.ic}</div>`
      : '<div class="slot"></div>';
  }
  $('bSlots').innerHTML = slots;
  $$('.slot.f', $('bSlots')).forEach((el) => (el.onclick = () => {
    bench.splice(+el.dataset.i, 1);
    tone(500, 0.03);
    renderCraft();
  }));

  const match = matchRecipe(bench);
  if (!bench.length) $('bInfo').innerHTML = 'Положи предметы снизу. Можно экспериментировать: если рецепта нет, ничего не пропадёт.';
  else if (match) $('bInfo').innerHTML = state.recipes[match.id] ? `Получится: <b>${match.out[2]}</b>` : '<b>Что-то получается…</b> Жми «Собрать».';
  else if (isPartialRecipe(bench)) $('bInfo').innerHTML = 'Кажется, чего-то не хватает…';
  else $('bInfo').innerHTML = 'Такой рецепт мне неизвестен. Но попробовать можно.';
  $('bGo').disabled = !bench.length || busy;

  // Что можно положить.
  const available = state.inv.filter((x) => !bench.includes(x) && itemKey(x)).reverse();
  $('bPickN').textContent = available.length ? `${available.length} шт.` : '';
  $('bPick').innerHTML = available.length
    ? available.map((x, k) => `
      <button class="inv-item${bench.length >= 10 || x.lock ? ' dim' : ''}" type="button" data-u="${x.uid}"
        style="--c:${RARITY[x.r].c};${k > 8 ? 'animation:none' : ''}" title="${x.name} · ${x.wear}">
        ${x.lock ? '<span class="st" style="background:var(--muted)">🔒</span>' : ''}
        <span class="ic">${x.ic}</span>${baseName(x)}
        <span class="p${x.price < 0 ? ' neg' : ''}">${fmtShort(x.price)}</span>
      </button>`).join('')
    : '<span class="empty">Инвентарь пуст. Открой пару кейсов.</span>';
  $$('.inv-item', $('bPick')).forEach((b) => (b.onclick = () => {
    if (bench.length >= 10) { toast('На верстаке максимум 10 предметов.'); return; }
    const it = state.inv.find((x) => x.uid === +b.dataset.u);
    if (it && it.lock) { toast('Закреплённое на верстак не кладём — сначала открепи в инвентаре.'); return; }
    if (it && !bench.includes(it)) {
      bench.push(it);
      tone(800, 0.03);
      renderCraft();
    }
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
            <div class="meta">${RARITY[rar].n} · ≈ ${fmtShort(base)}</div>
          </div>
          <button class="btn${ready ? ' primary' : ''}" type="button" data-auto="${ri}" ${ready && !busy ? '' : 'disabled'}>Собрать</button>
        </div>`;
    }
    const typesOwned = parts.filter((p) => p.have >= p.x.q).length;
    return `
      <div class="rcp unk${ready ? ' hot' : ''}" style="--c:${RARITY[rar].c}">
        <span class="out">${ic}</span>
        <div>
          <div class="nm">??? <span style="color:color-mix(in srgb, var(--c) 70%, #fff);font-weight:600;font-size:11px">${RARITY[rar].n}</span></div>
          <div class="hint">${r.hint}</div>
          <div class="meta">ингредиентов: ${sum(r.keys, (x) => x.q)} · у тебя есть ${typesOwned} из ${r.keys.length} ${plural(r.keys.length, 'вида', 'видов', 'видов')}${ready ? ' · 🔥 всё есть!' : ''}</div>
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
  for (const x of r.keys) {
    const found = state.inv
      .filter((y) => itemKey(y) === x.k && !use.includes(y))
      .sort((a, b) => (!!a.lock - !!b.lock) || (a.price - b.price))
      .slice(0, x.q);
    if (found.length < x.q) { toast('Не хватает ингредиентов.'); return; }
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
  bench = [];
  state.recipes[recipe.id] = true;
  state.crafts++;
  state.pending = [result];
  trackBest(result);
  holdXP(firstTime ? 40 : 10);
  save();

  $$('.slot', $('bSlots')).forEach((s, i) => {
    s.style.animationDelay = i * 40 + 'ms';
    if (s.classList.contains('f')) s.classList.add('suck');
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
