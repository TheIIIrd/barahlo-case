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
const BT_PITY = 6;   // с 1.18.0: после 6 открытий награды подряд без карты следующее — точно карта
const BT_STREAK = 3; // с 1.18.0: каждая 3-я победа подряд — +1 открытие награды (ничья серию не прерывает)
// Эта победа (следующая) — серийная? И через сколько открытий карта будет гарантирована (1 — в следующем).
const btStreakNext = () => (state.btStreak + 1) % BT_STREAK === 0;
const btPityLeft = () => Math.max(1, BT_PITY + 1 - state.btDry);
/* Наградная рулетка щедрее обычного открытия того же кейса: «Хлама» и «Мусора средней руки» нет, к весу редкости —
   «Подозрительное» ×0,5, «Запретное» ×3, «Засекреченное» ×7, «Тайное» ×11, ★ ×14,5. Итог по кейсам в среднем:
   «Засекреченное» и выше — около 63% открытий, «Тайное» и выше — 30,5%, ★ — 7,6%; средняя ценность открытия —
   примерно ×14,1 к цене кейса. История: 1.16.0–1.18.0 — ×1, ×2, ×4, ×6, ×8 (50% / 6%, ×11); 1.19.0 — ×0,5, ×3, ×7,
   ×12, ×16 (64% / 8%, ×14,9); 1.20.0 — «Тайное» и ★ чуть реже: −5% ценности в обмен на трофей соперника.
   Удача уровня и баффы сюда не добавляются. */
const BT_RARITY_BOOST = [0, 0, 0.5, 3, 7, 11, 14.5];
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

/* Награда (с 1.19.0): самый дорогой платный кейс любой масти, не дороже большего из двух —
   цены подарков уровня (как giftCase: 40 + уровень² × 12) и обычной цены твоих открытий (серединная цена
   последних OPENS_RECENT нажатий «Открыть» на платных кейсах). Так награда растёт вместе с тем, что ты открываешь,
   а не упирается в потолок масти (у Гаража дороже 100 ₽ кейсов нет). Младшая карта — по-прежнему масти соперника.
   До 1.19.0 кейс брался только из главной масти соперника и только по уровню. */
const lvlCaseCap = (lvl) => 40 + lvl * lvl * 12;
function typicalOpen() {
  const a = state.opensRecent.slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function rewardCase() {
  const target = Math.max(lvlCaseCap(state.lvl), typicalOpen());
  const paid = CASES.filter((c) => !c.free).sort((a, b) => a.price - b.price);
  return paid.filter((c) => c.price <= target).pop() || paid[0];
}

/* Бафф за победу (с 1.19.0): с шансом 15% два кейса получают редкие ×BUFF_MULT (как бафф за ×20/×100) на 2 минуты.
   Какие кейсы — по уровню: кейс входит в выбор с уровня из BT_BUFF_LEVELS, выбор — из двух старших открытых ступеней:
     ур. 1+  — «Холодильник холостяка», «Школьный рюкзак», «Бабушкин балкон», «Просроченная аптечка», «Общага»;
     ур. 5+  — «Бардачок маршрутки», «Подъезд», «Ящик с проводами», «Гараж отца»;
     ур. 10+ — «Офисный стол», «Корпоратив», «Дача»;   ур. 15+ — «Сейф олигарха»;   ур. 20+ — «Склад Росрезерва»;
     ур. 25+ — «Хранилище ЦБ»;   ур. 30+ — «Свалка Вселенной»;   ур. 35+ — «Чёрная дыра».
   Например, на 12-м уровне бафф получают два кейса из ступеней 10+ и 5+, на 30-м — «Свалка Вселенной» и «Хранилище ЦБ».
   Кейс, у которого уже идёт бафф (за ×20/×100 или за прошлую победу), не выбирается: чужой бафф не продлевается
   и не перебивается. Сам бафф за ×20/×100 (grid.js, roulette.js) не менялся. */
const BT_BUFF_CHANCE = 0.15;
const BT_BUFF_LEVELS = {
  fridge: 1, school: 1, balcony: 1, pharmacy: 1, dorm: 1,
  minibus: 5, entrance: 5, cables: 5, garage: 5,
  office: 10, party: 10, dacha: 10,
  oligarch: 15, reserve: 20, cbr: 25, cosmos: 30, blackhole: 35,
};
// Ошибку в данных ловим сразу: у каждого платного кейса должен быть уровень.
CASES.forEach((c) => { if (!c.free && !BT_BUFF_LEVELS[c.id]) throw new Error('Нет уровня бафа за победу у кейса ' + c.id); });
function btBuffPool(lvl) {
  const open = CASES.filter((c) => !c.free && BT_BUFF_LEVELS[c.id] <= lvl);
  const steps = [...new Set(open.map((c) => BT_BUFF_LEVELS[c.id]))].sort((a, b) => b - a).slice(0, 2);
  return open.filter((c) => steps.includes(BT_BUFF_LEVELS[c.id]) && buffLeft(c) <= 0);
}
function btGrantBuff() {
  const pool = btBuffPool(state.lvl);
  const picked = [];
  while (picked.length < BUFF_CASES && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const until = Date.now() + BUFF_MS_WIN;
  picked.forEach((c) => (state.buffs[c.id] = { until, left: BUFF_MS_WIN, max: BUFF_MS_WIN }));
  return picked;
}

/* Трофей соперника (с 1.20.0): победа над соперником «сильнее тебя» с шансом 25% даёт копию случайной карты из его
   колоды — не больше чем на ранг старше самой старшей карты этой масти, что у тебя когда-либо была (state.cardsEver).
   Так трофей добавляет копии и может открыть следующую карту, но не перепрыгивает Кузню на много рангов.
   Подходящих карт нет — трофея нет. Трофей — сверх открытий награды, гарантию карты (btDry) не трогает. */
const BT_TROPHY_CHANCE = 0.25;
function btTrophyPool(foe) {
  const top = {};
  for (const id of Object.keys(state.cardsEver)) {
    const c = CARD_BY_ID.get(id);
    if (c) top[c.suit.id] = Math.max(top[c.suit.id] ?? -1, c.rank);
  }
  return foe.map((id) => CARD_BY_ID.get(id)).filter((c) => c && top[c.suit.id] !== undefined && c.rank <= top[c.suit.id] + 1);
}

/* Медали (с 1.19.0, список — scripts/data/medals.js): каждая — один раз, за первое выполнение условия.
   Новые — в state.pending вместе с наградой (перезагрузка вернёт их в инвентарь), сразу закреплены. */
const gloryFull = () => MEDALS.every((m) => state.glory[m.id]);
function makeMedal(id) {
  const m = MEDAL_BY_ID.get(id);
  const it = makeItem(CASES[0], 0, 0.01); // номер, время и износ; остальное — свои
  const price = r2(m.k * lvlCaseCap(state.lvl));
  return Object.assign(it, { special: true, medal: id, idx: -1, name: m.name, ic: m.ic, lore: m.lore, r: m.r, stat: false,
    base: price, price, lock: true });
}
function btNewMedals(B) {
  const got = [];
  const want = (id, cond) => { if (cond && !state.medals[id]) got.push(id); };
  want('strong', B.tier === 2);
  want('clean', B.bh === false); // у боя, начатого до 1.19.0, поля нет — тогда не знаем и медаль не даём
  for (const n of [3, 5, 10]) want('s' + n, state.btStreak >= n);
  for (const n of [10, 50, 100]) want('w' + n, state.btWins >= n);
  return got;
}

/* Следующий соперник: выбирается заранее (кнопки «Другой соперник» нет) — имя, сила относительно игрока
   (25 % слабее, 50 % равный, 25 % сильнее) и награда до боя не меняются. Колода — из мастей, которые уже есть у
   игрока, сила — от силы колоды игрока (pw — на момент сборки). Колода игрока с тех пор стала другой — колоду
   соперника собираем заново под новую силу (btFoeFresh), иначе «сильнее тебя» против слабой колоды, набранной
   ради этого, и смены на сильную перед боем оказывался бы слабее. Колода соперника — из своего генератора
   (seed соперника и сила): та же сила — та же колода, так что менять колоду туда-обратно ради «удобного»
   соперника бесполезно. */
function btFoeDeck(tier, seed) {
  const pw = btDeckPower(state.deck);
  const suits = SUITS.filter((s) => CARDS.some((c) => c.suit === s && cardKnown(c.id)));
  const pool = CARDS.filter((c) => suits.includes(c.suit));
  const g = { rs: (seed ^ Math.round(pw * 1000)) | 0 };
  const foe = btBuildFoe(pool, pw * BT_TIERS[tier].k, () => btRand(g));
  const bySuit = SUITS.map((s) => ({ s, n: foe.filter((id) => CARD_BY_ID.get(id).suit === s).length })).sort((a, b) => b.n - a.n);
  return { foe, pw, s: bySuit[0].s.id };
}
function makeFoe() {
  deckFill();
  const roll = rnd();
  const tier = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;
  const seed = Math.floor(rnd() * 2 ** 31);
  const d = btFoeDeck(tier, seed);
  return {
    name: pick(NICKS), tier, foe: d.foe, pw: d.pw, seed,
    rew: { c: rewardCase().id, n: BT_TIERS[tier].opens, s: d.s },
  };
}
// Колода игрока (полная) не та, под которую собран соперник, — пересобираем его колоду; возвращает true, если пересобрали.
// Награда (кейс, число открытий и масть карты) — как была объявлена.
function btFoeFresh(n) {
  if (!n || !deckFull() || n.pw === btDeckPower(state.deck)) return false;
  const d = btFoeDeck(n.tier, n.seed);
  n.foe = d.foe;
  n.pw = d.pw;
  return true;
}
function btNextLooksValid(x) {
  return !!x && typeof x === 'object' && typeof x.name === 'string' && x.name.length <= 40 && !/[<>&"'`]/.test(x.name) &&
    [0, 1, 2].includes(x.tier) && Number.isInteger(x.seed) && Array.isArray(x.foe) && x.foe.length === BT.DECK &&
    x.foe.every((id) => CARD_BY_ID.has(id)) && !!x.rew && CASES.some((c) => c.id === x.rew.c && !c.free) &&
    [1, 2, 3].includes(x.rew.n) && (x.rew.s === undefined || SUITS.some((s) => s.id === x.rew.s)) &&
    (x.pw === undefined || Number.isFinite(x.pw)); // pw — с 1.21.3
}

/* Итог боя — сразу в сохранение, до анимации: ранения, стёртые копии, награда (предметы — в state.pending,
   пока игрок не заберёт их из окна итога; перезагрузка вернёт их в инвентарь). Возвращает сводку для окна. */
function finishBattle(B) {
  const res = { winner: B.winner, name: B.name, tier: B.tier, scale: B.scale, turns: B.pturn[1], lost: [], hurt: [], items: [], cards: [], rew: null, medals: [], buff: [], trophy: null };
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
  if (B.winner === 1) {
    state.btWins++;
    state.btStreak++;
  } else if (B.winner === 0) {
    state.btLosses++;
    state.btStreak = 0; // сдача — тоже поражение
  }
  if (B.winner === 1 && B.rew) {
    const next = B.rew;
    const c = CASES.find((x) => x.id === next.c);
    // Карта — масти соперника (rew.s, с 1.19.0); у соперника, выбранного раньше, — масти кейса, как было.
    const suit = SUITS.find((s) => s.id === next.s) || SUITS.find((s) => s.cases.includes(c.id));
    const weights = btRewardWeights(c);
    const streak = state.btStreak % BT_STREAK === 0;
    const glory = gloryFull() && B.tier === 2; // полный Зал славы: +1 открытие за сильного соперника
    const n = next.n + (streak ? 1 : 0) + (glory ? 1 : 0);
    res.rew = { c: c.id, n, streak, glory };
    for (let k = 0; k < n; k++) {
      const pity = state.btDry >= BT_PITY;
      if (pity || rnd() < BT_CARD_CHANCE) {
        const card = pick(CARDS.filter((x) => x.suit === suit && x.rank <= 2));
        state.cards[card.id] = cardCount(card.id) + 1;
        state.cardsEver[card.id] = true;
        state.btDry = 0;
        res.cards.push({ k, id: card.id, pity });
      } else {
        state.btDry++;
        res.items.push({ k, it: makeItem(c, roll(c, weights)) });
      }
    }
    const won = res.items.map((x) => x.it);
    state.pending = state.pending.concat(won);
    won.forEach(trackBest);
    holdXP(sum(won, itemXP) + 5);
  }
  if (B.winner === 1) {
    res.medals = btNewMedals(B).map((id) => {
      state.medals[id] = true;
      const it = makeMedal(id);
      state.pending.push(it);
      return it;
    });
    if (rnd() < BT_BUFF_CHANCE) res.buff = btGrantBuff().map((c) => c.id);
    if (B.tier === 2 && rnd() < BT_TROPHY_CHANCE) {
      const pool = btTrophyPool(B.foe);
      if (pool.length) {
        const card = pool[Math.floor(rnd() * pool.length)];
        state.cards[card.id] = cardCount(card.id) + 1;
        state.cardsEver[card.id] = true;
        res.trophy = card.id;
      }
    }
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
