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
const CATALOG_BY_NAME = new Map(CATALOG.map((e) => [e.name, e]));

/* Рецепт карты: { need, chance, kind, riddle }. need — сначала карта и именные предметы, потом «куча»:
   так именной предмет не уйдёт в кучу той же редкости. kind: base — только куча, ladder — нужна
   младшая карта, special — нужны именные предметы. Ошибку в данных ловим сразу при загрузке. */
function buildRecipe(card) {
  const named = (FORGE_NAMED[card.suit.id] || {})[card.rank] || [];
  const ladder = FORGE_LADDER.includes(card.rank);
  const need = [
    ...(ladder ? [{ card: card.suit.id + RANK_IDS[card.rank - 1], n: 1 }] : []),
    ...named.map((item) => ({ item, n: 1 })),
    ...FORGE_HEAPS[card.rank].map((q) => ({ r: q.r, n: q.n })),
  ];
  for (const q of need) {
    if (q.item && !CATALOG_BY_NAME.has(q.item)) throw new Error('В рецепте карты неизвестный предмет: ' + q.item);
    if (q.item && !card.suit.cases.includes(CATALOG_BY_NAME.get(q.item).c.id)) throw new Error('Именной предмет не из кейсов масти: ' + q.item);
    if (q.item && !FORGE_RIDDLES[q.item]) throw new Error('Нет загадки для предмета: ' + q.item);
    if (q.card && !CARD_BY_ID.has(q.card)) throw new Error('В рецепте карты неизвестная карта: ' + q.card);
  }
  const riddle = {};
  named.forEach((n) => (riddle[n] = FORGE_RIDDLES[n]));
  return { need, kind: named.length ? 'special' : ladder ? 'ladder' : 'base', chance: FORGE_CHANCE[card.rank], riddle };
}
const CARD_RECIPES = new Map(CARDS.map((c) => [c.id, buildRecipe(c)]));
// Все именные предметы рецептов: «куча» берёт их в последнюю очередь, чтобы не съесть нужное старшей карте.
const FORGE_NAMED_SET = new Set(Object.values(FORGE_NAMED).flatMap((m) => Object.values(m).flat()));

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
