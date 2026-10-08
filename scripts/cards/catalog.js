/* ==========================================================================
   Карты: каталог, рецепты Кузни, коллекция игрока
   ========================================================================== */
'use strict';

// Все 52 карты по порядку мастей и достоинств.
const CARDS = SUITS.flatMap((suit) => CARD_ROWS[suit.id].map(([ic, name, lore, cost, atk, hp, sigil], rank) => ({
  id: suit.id + RANK_IDS[rank], suit, rank, ic, name, lore, cost, atk, hp, sigil,
})));
const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
const CARDS_PER_SUIT = RANKS.length;

// Цвет рамки по достоинству — те же цвета, что у редкостей предметов.
const RANK_RARITY = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
const cardColor = (card) => RARITY[RANK_RARITY[card.rank]].c;
const cardTitle = (card) => `${RANKS[card.rank]}${card.suit.sym} ${card.name}`;

// Предмет каталога по точному названию (для особых рецептов).
// Плюс поделки Мастерской (с 1.10.0 они нужны восьми рецептам). В CATALOG их нет: оттуда берут результаты
// контрактов и мегаконтракта, а поделку можно только собрать.
const CATALOG_BY_NAME = new Map([...CATALOG, ...CRAFT_ROOM.items.map((x, i) => ({ c: CRAFT_ROOM, i, r: x[0], ic: x[1], name: x[2], base: x[4] }))]
  .map((e) => [e.name, e]));
for (const x of CRAFT_ROOM.items) {
  if (CATALOG.some((e) => e.name === x[2])) console.warn('Поделка называется как предмет кейса: ' + x[2]);
}
// Требование рецепта — поделка Мастерской (а не предмет из кейса).
const isCraftNeed = (q) => !!q.item && CATALOG_BY_NAME.get(q.item).c === CRAFT_ROOM;

/* Рецепт карты: { need, chance, kind, riddle }. need — сначала карта, именные предметы и поделка, потом
   «куча»: так именной предмет не уйдёт в кучу той же редкости. kind: base — только куча, ladder — нужна
   младшая карта, special — нужны именные предметы или поделка. Ошибку в данных ловим сразу при загрузке. */
function buildRecipe(card) {
  const named = (FORGE_NAMED[card.suit.id] || {})[card.rank] || [];
  const craft = (FORGE_CRAFTS[card.suit.id] || {})[card.rank];
  const ladder = FORGE_LADDER.includes(card.rank);
  const need = [
    ...(ladder ? [{ card: card.suit.id + RANK_IDS[card.rank - 1], n: 1 }] : []),
    ...named.map((item) => ({ item, n: 1 })),
    ...(craft ? [{ item: craft, n: 1 }] : []),
    ...FORGE_HEAPS[card.rank].map((q) => ({ r: q.r, n: q.n })),
  ];
  for (const q of need) {
    if (q.item && !CATALOG_BY_NAME.has(q.item)) throw new Error('В рецепте карты неизвестный предмет: ' + q.item);
    if (q.item && q.item !== craft && !card.suit.cases.includes(CATALOG_BY_NAME.get(q.item).c.id)) throw new Error('Именной предмет не из кейсов масти: ' + q.item);
    if (craft && q.item === craft && CATALOG_BY_NAME.get(q.item).c !== CRAFT_ROOM) throw new Error('Не поделка Мастерской: ' + q.item);
    if (q.item && !FORGE_RIDDLES[q.item]) throw new Error('Нет загадки для предмета: ' + q.item);
    if (q.card && !CARD_BY_ID.has(q.card)) throw new Error('В рецепте карты неизвестная карта: ' + q.card);
  }
  const riddle = {};
  [...named, ...(craft ? [craft] : [])].forEach((n) => (riddle[n] = FORGE_RIDDLES[n]));
  return { need, kind: named.length || craft ? 'special' : ladder ? 'ladder' : 'base', chance: FORGE_CHANCE[card.rank], riddle };
}
const CARD_RECIPES = new Map(CARDS.map((c) => [c.id, buildRecipe(c)]));
// Все именные предметы рецептов: «куча» берёт их в последнюю очередь, чтобы не съесть нужное старшей карте.
const FORGE_NAMED_SET = new Set(Object.values(FORGE_NAMED).flatMap((m) => Object.values(m).flat()));
// Какой карте нужна поделка: { название поделки: карта } — для подсказки в книге рецептов Мастерской.
const CRAFT_FOR_CARD = new Map(CARDS.flatMap((c) => {
  const name = (FORGE_CRAFTS[c.suit.id] || {})[c.rank];
  return name ? [[name, c]] : [];
}));

// Коллекция игрока: state.cards — сколько копий сейчас, state.cardsEver — какие карты были хоть раз.
const cardCount = (id) => state.cards[id] || 0;
const cardKnown = (id) => !!state.cardsEver[id];
const albumCount = () => CARDS.filter((c) => cardKnown(c.id)).length;
const suitDone = (suit) => CARDS.every((c) => c.suit !== suit || cardKnown(c.id));
const fullSuits = () => SUITS.filter(suitDone).length;
const deckDone = () => fullSuits() === SUITS.length;

// Бонус Кузни: +3% к шансу за каждую собранную масть.
const FORGE_SUIT_BONUS = 3;
const forgeBonus = () => fullSuits() * FORGE_SUIT_BONUS;

// Лицевая сторона карты. size: '' — обычная, 'sm' — маленькая для списков.
function cardHTML(card, { size = '', count = 0, attrs = '' } = {}) {
  const sig = card.sigil ? SIGILS[card.sigil] : null;
  return `<div class="pcard${size ? ' ' + size : ''}" style="--sc:${card.suit.color};--rc:${cardColor(card)}" ${attrs}
      title="${cardTitle(card)}${sig ? ' · ' + sig.n + ': ' + sig.d : ''}">
    <span class="pc-corner">${RANKS[card.rank]}<i>${card.suit.sym}</i></span>
    ${count > 1 ? `<span class="pc-n">×${count}</span>` : ''}
    <span class="pc-ic">${card.ic}</span>
    <span class="pc-nm">${card.name}</span>
    <span class="pc-stats"><b title="Цена в мелочи">🪙${card.cost}</b><b title="Атака">⚔️${card.atk}</b><b title="Здоровье">❤️${card.hp}</b></span>
    ${sig ? `<span class="pc-sig">${sig.n}</span>` : ''}
  </div>`;
}

// Рубашка: карты ещё нет в коллекции.
const cardBackHTML = (card, { size = '', attrs = '' } = {}) =>
  `<div class="pcard back${size ? ' ' + size : ''}" style="--sc:${card.suit.color}" ${attrs} title="${RANKS[card.rank]}${card.suit.sym} — ещё не выкована">
    <span class="pc-corner">${RANKS[card.rank]}<i>${card.suit.sym}</i></span><span class="pc-ic">?</span>
  </div>`;
