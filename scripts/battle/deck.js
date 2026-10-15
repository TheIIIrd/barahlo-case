/* ==========================================================================
   Бои: колода, ранения, соперник, награда
   ========================================================================== */
'use strict';

const BT_TIERS = [
  { n: 'слабее тебя', k: 0.85, opens: 1, c: 'var(--good)' },
  { n: 'равный по силе', k: 1, opens: 2, c: 'var(--accent)' },
  { n: 'сильнее тебя', k: 1.15, opens: 3, c: 'var(--bad)' },
];
const BT_CARD_CHANCE = 0.15; // вместо предмета наградной рулетки — младшая карта масти (с 1.16.0; было 5%)
/* Наградная рулетка щедрее обычного открытия того же кейса (с 1.16.0): «Хлама» и «Мусора средней руки» нет,
   «Запретное» ×2, «Засекреченное» ×4, «Тайное» ×6, ★ ×8 к весу редкости. Итог: «Засекреченное» и выше —
   около половины открытий, ★ — около 6%. Удача уровня и баффы сюда не добавляются. */
const BT_RARITY_BOOST = [0, 0, 1, 2, 4, 6, 8];
function btRewardWeights(c) {
  const w = c.items.map(([r]) => (RARITY[r].w * BT_RARITY_BOOST[r]) / c.items.filter((x) => x[0] === r).length);
  return sum(w, (x) => x) > 0 ? w : chancesOf(c); // в кейсе одни низшие редкости — крутим как обычно
}

// Колода: state.deck — id карт. Одна карта — до 2 раз и не больше, чем копий в коллекции.
const deckCount = (id) => state.deck.filter((x) => x === id).length;
const deckRoom = (id) => Math.min(BT.COPIES, cardCount(id)) - deckCount(id);
const deckFull = () => state.deck.length === BT.DECK;
// Сколько карт можно собрать в колоду из коллекции (с учётом «не больше 2 копий»).
const deckPossible = () => sum(CARDS, (c) => Math.min(BT.COPIES, cardCount(c.id)));
const battlesOpen = () => deckPossible() >= BT.DECK;

// Убрать из колоды то, чего больше нет (копию стёрли в бою или потратили в Кузне), и лишние ранения.
function deckNormalize() {
  const seen = {};
  state.deck = state.deck.filter((id) => {
    if (!CARD_BY_ID.has(id)) return false;
    seen[id] = (seen[id] || 0) + 1;
    return seen[id] <= Math.min(BT.COPIES, cardCount(id));
  }).slice(0, BT.DECK);
  for (const id of Object.keys(state.hurt)) {
    const h = CARD_BY_ID.has(id) ? Math.min(Math.floor(state.hurt[id]) || 0, cardCount(id)) : 0;
    if (h > 0) state.hurt[id] = h; else delete state.hurt[id];
  }
}

/* Добрать колоду до 10: каждый раз — самая сильная свободная карта той цены, которой в колоде меньше всего
   относительно BT_CURVE (если такой нет — любой). Возвращает добавленные карты. */
function deckFill() {
  deckNormalize();
  const added = [];
  while (state.deck.length < BT.DECK) {
    const free = CARDS.filter((c) => deckRoom(c.id) > 0);
    if (!free.length) break;
    const have = {};
    state.deck.forEach((id) => { const c = CARD_BY_ID.get(id).cost; have[c] = (have[c] || 0) + 1; });
    const lack = (c) => (BT_CURVE[c.cost] || 0) - (have[c.cost] || 0);
    // Здоровые копии лучше раненых: раненая погибнет — пропадёт.
    const healthy = (c) => (cardCount(c.id) - cardHurt(c.id) > deckCount(c.id) ? 1 : 0);
    free.sort((a, b) => Math.sign(lack(b)) - Math.sign(lack(a)) || healthy(b) - healthy(a) || btPower(b) - btPower(a) || b.rank - a.rank);
    state.deck.push(free[0].id);
    added.push(free[0]);
  }
  return added;
}
// «↺ Автоподбор»: собрать колоду заново.
function deckAuto() {
  state.deck = [];
  return deckFill();
}

/* Карты игрока для боя: копии в колоде — сначала здоровые, потом раненые. */
function deckForBattle() {
  const used = {};
  return state.deck.map((id) => {
    used[id] = (used[id] || 0) + 1;
    return { id, hurt: used[id] > cardCount(id) - cardHurt(id) };
  });
}

/* Награда: кейс масти, которой у соперника больше всего, — самый дорогой из тех, что дарят на твоём уровне
   (как giftCase: цена до 40 + уровень² × 12). Нет такого — самый дешёвый кейс масти (у Космоса кейсы от 100 тыс.). */
function rewardCase(suit) {
  const list = suit.cases.map((id) => CASES.find((c) => c.id === id)).filter(Boolean).sort((a, b) => a.price - b.price);
  const cap = 40 + state.lvl * state.lvl * 12;
  let byLvl = 0;
  list.forEach((c, i) => { if (c.price <= cap) byLvl = i; });
  return list[byLvl];
}

/* Следующий соперник: выбирается заранее и не меняется до боя (кнопки «Другой соперник» нет).
   Колода — из мастей, которые уже есть у игрока; сила — от силы колоды игрока: 25 % слабее, 50 % равный, 25 % сильнее. */
function makeFoe() {
  deckFill();
  const roll = rnd();
  const tier = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;
  const suits = SUITS.filter((s) => CARDS.some((c) => c.suit === s && cardKnown(c.id)));
  const pool = CARDS.filter((c) => suits.includes(c.suit));
  const foe = btBuildFoe(pool, btDeckPower(state.deck) * BT_TIERS[tier].k, rnd);
  const bySuit = SUITS.map((s) => ({ s, n: foe.filter((id) => CARD_BY_ID.get(id).suit === s).length })).sort((a, b) => b.n - a.n);
  return {
    name: pick(NICKS), tier, foe, seed: Math.floor(rnd() * 2 ** 31),
    rew: { c: rewardCase(bySuit[0].s).id, n: BT_TIERS[tier].opens },
  };
}
function btNextLooksValid(x) {
  return !!x && typeof x === 'object' && typeof x.name === 'string' && x.name.length <= 40 && !/[<>&"'`]/.test(x.name) &&
    [0, 1, 2].includes(x.tier) && Number.isInteger(x.seed) && Array.isArray(x.foe) && x.foe.length === BT.DECK &&
    x.foe.every((id) => CARD_BY_ID.has(id)) && !!x.rew && CASES.some((c) => c.id === x.rew.c && !c.free) &&
    [1, 2, 3].includes(x.rew.n);
}

/* Итог боя — сразу в сохранение, до анимации: ранения, стёртые копии, награда (предметы — в state.pending,
   пока игрок не заберёт их из окна итога; перезагрузка вернёт их в инвентарь). Возвращает сводку для окна. */
function finishBattle(B) {
  const res = { winner: B.winner, name: B.name, tier: B.tier, scale: B.scale, turns: B.pturn[1], lost: [], hurt: [], items: [], cards: [], rew: null };
  for (const m of B.dead) {
    const x = B.mine[m];
    if (!cardCount(x.id)) continue; // копию успели потратить (на всякий случай: Кузня не трогает карты боя)
    if (x.hurt) {
      state.cards[x.id] = cardCount(x.id) - 1;
      state.hurt[x.id] = Math.max(0, (state.hurt[x.id] || 0) - 1);
      if (state.cards[x.id] <= 0) delete state.cards[x.id];
      res.lost.push(x.id);
    } else {
      state.hurt[x.id] = (state.hurt[x.id] || 0) + 1;
      res.hurt.push(x.id);
    }
  }
  if (B.winner === 1) state.btWins++;
  else if (B.winner === 0) state.btLosses++;
  if (B.winner === 1 && B.rew) {
    const next = B.rew;
    const c = CASES.find((x) => x.id === next.c);
    const suit = SUITS.find((s) => s.cases.includes(c.id));
    const weights = btRewardWeights(c);
    res.rew = { c: c.id, n: next.n };
    for (let k = 0; k < next.n; k++) {
      if (rnd() < BT_CARD_CHANCE) {
        const card = pick(CARDS.filter((x) => x.suit === suit && x.rank <= 2));
        state.cards[card.id] = cardCount(card.id) + 1;
        state.cardsEver[card.id] = true;
        res.cards.push({ k, id: card.id });
      } else {
        res.items.push({ k, it: makeItem(c, roll(c, weights)) });
      }
    }
    const won = res.items.map((x) => x.it);
    state.pending = state.pending.concat(won);
    won.forEach(trackBest);
    holdXP(sum(won, itemXP) + 5);
  }
  state.battle = null;
  deckNormalize();
  save();
  return res;
}

// Сохранение могли поправить руками или собрать в старой версии: чиним колоду и проверяем бой (каталог уже загружен).
// Зовётся при загрузке и ещё раз из main.js, если игра перешла на запасную копию.
function btCheckLoaded() {
  deckNormalize();
  if (state.battle && !btLooksValid(state.battle)) {
    state.battle = null;
    restoreNotes.push('Бой из сохранения не прочитался и снят. Карты целы.');
  }
  if (state.btNext && !btNextLooksValid(state.btNext)) state.btNext = null;
}
btCheckLoaded();
