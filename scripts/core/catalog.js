/* ==========================================================================
   Каталог: кейсы, Мастерская, поиск предметов
   ========================================================================== */
'use strict';

// Все предметы всех кейсов (без поделок) — для контракта и апгрейда.
const CATALOG = [];
CASES.forEach((c) =>
  c.items.forEach((x, i) => CATALOG.push({ c, i, r: x[0], ic: x[1], name: x[2], base: x[4] })),
);
// Рецепты (Мастерской и Кузни) ищут предметы по названию — одинаковые названия в разных кейсах их путают.
{
  const seen = new Set();
  for (const e of CATALOG) {
    if (seen.has(e.name)) console.warn('Повтор названия в каталоге: ' + e.name);
    seen.add(e.name);
  }
}

// Мастерская ведёт себя как «кейс» с поделками: так музей и инвентарь работают с ней одинаково.
const CRAFT_ROOM = {
  id: 'craft', name: 'Мастерская', desc: 'Поделки с верстака', ic: '🔨', color: '#b07a3a',
  craft: true, items: RECIPES.map((r) => r.out),
};

// Ключ предмета «кейс|индекс»: по нему музей хранит экспонаты, а рецепты — ингредиенты.
function museumKey(caseId, i) {
  return caseId + '|' + i;
}

// Ингредиенты рецептов переводим из названий в ключи «кейс|индекс».
RECIPES.forEach((r) => {
  r.keys = r.in.map(([name, qty]) => {
    for (const c of CASES) {
      const i = c.items.findIndex((x) => x[2] === name);
      if (i >= 0) return { k: museumKey(c.id, i), c, i, q: qty, name, ic: c.items[i][1] };
    }
    throw new Error('В рецепте неизвестный предмет: ' + name);
  });
});

// Залы музея: все кейсы плюс Мастерская.
const ROOMS = [...CASES, CRAFT_ROOM];
const roomById = (id) => ROOMS.find((c) => c.id === id);
const MUSEUM_TOTAL = sum(ROOMS, (c) => c.items.length);
