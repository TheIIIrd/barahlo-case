/* ==========================================================================
   Бой на весах: правила без отрисовки
   ========================================================================== */
'use strict';

/* Состояние боя — простой объект (целиком пишется в сохранение, state.battle), ходы — функции, которые меняют
   его и возвращают список событий для анимации. У каждого события — снимок стола после него, поэтому отрисовка
   просто показывает снимки по очереди. Случайность — свой генератор, его состояние лежит в самом бою:
   после перезагрузки бой продолжается так же. Стороны: 0 — бот (ходит первым), 1 — игрок.
   Весы (scale) — перевес игрока: +8 — победа игрока, −8 — победа бота. */
const BT = {
  WIN: 8,          // перевес для победы
  BONUS: 2,        // перевес игрока на старте (бот ходит первым)
  CAP: 5,          // мелочи в кошельке не больше
  LANES: 4,
  PACKS: 5,        // пакетов у каждого
  HAND: 3,         // карт в стартовой руке (плюс один пакет)
  DECK: 10,        // карт в колоде
  COPIES: 2,       // копий одной карты в колоде не больше
  TURNS: 30,       // ходов у каждого; дальше побеждает тот, у кого перевес
};
const BT_PACKET = 'pk';
const BT_PK = { atk: 0, hp: 1, cost: 0, sigil: '' };
const btStats = (id) => (id === BT_PACKET ? BT_PK : CARD_BY_ID.get(id));
const btArmor = (u) => (u.sg === 'bronya' ? 1 : u.sg === 'bronya2' ? 2 : 0);

// Генератор mulberry32: состояние — одно число в бою (B.rs).
function btRand(B) {
  let a = (B.rs = (B.rs + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function btShuffle(B, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(btRand(B) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Карта на руке и в колоде — { id, m }: m — номер карты игрока в B.mine (у бота и пакетов −1).
const btUnit = (c) => {
  const s = btStats(c.id);
  return { id: c.id, m: c.m, atk: s.atk, hp: s.hp, max: s.hp, sg: s.sigil, skip: false, rev: false };
};

/* Новый бой. mine — карты игрока [{ id, hurt }], foe — id карт бота, seed — число, rew — награда { c: кейс, n: открытий }. */
function btCreate({ mine, foe, seed, name, tier, rew }) {
  const B = {
    v: 1, rs: seed | 0, name, tier, rew: rew ? { c: rew.c, n: rew.n } : null,
    mine: mine.map((x) => ({ id: x.id, hurt: !!x.hurt })), foe: foe.slice(),
    dead: [],                       // номера карт игрока, погибших в бою (для ранений)
    scale: BT.BONUS, turn: 0, active: 0, phase: 'bot', winner: null,
    pturn: [0, 0], coins: [0, 0], packs: [BT.PACKS, BT.PACKS],
    lanes: [new Array(BT.LANES).fill(null), new Array(BT.LANES).fill(null)],
    hand: [[], []], deck: [foe.map((id) => ({ id, m: -1 })), mine.map((x, m) => ({ id: x.id, m }))],
  };
  btShuffle(B, B.deck[0]);
  btShuffle(B, B.deck[1]);
  for (const p of [0, 1]) {
    B.hand[p] = B.deck[p].splice(0, BT.HAND);
    B.hand[p].push({ id: BT_PACKET, m: -1 });
    B.packs[p]--;
  }
  return B;
}

/* Снимок для отрисовки: стол, весы, мелочь, сколько карт в руках и колодах. */
function btSnap(B) {
  return {
    lanes: B.lanes.map((row) => row.map((u) => (u ? { id: u.id, m: u.m, atk: u.atk, hp: u.hp, max: u.max, sg: u.sg, skip: u.skip, rev: u.rev } : null))),
    scale: B.scale, coins: B.coins.slice(), packs: B.packs.slice(),
    hand: [B.hand[0].length, B.hand[1].length], deck: [B.deck[0].length, B.deck[1].length],
  };
}
const btEv = (B, ev, e) => { if (ev) { e.snap = btSnap(B); ev.push(e); } };

function btHitScale(B, side, lane, d, ev) {
  B.scale += side === 1 ? d : -d;
  btEv(B, ev, { t: 'scale', side, lane, n: d });
  if (B.scale >= BT.WIN) btOver(B, 1, ev);
  else if (B.scale <= -BT.WIN) btOver(B, 0, ev);
}
function btOver(B, winner, ev) {
  if (B.phase === 'over') return;
  B.phase = 'over';
  B.winner = winner;
  btEv(B, ev, { t: 'over', winner });
}
function btKill(B, side, lane, ev) {
  const u = B.lanes[side][lane];
  if (u.sg === 'dyhanie' && !u.rev) {
    u.rev = true;
    u.hp = 1;
    btEv(B, ev, { t: 'revive', side, lane });
    return;
  }
  B.lanes[side][lane] = null;
  if (B.dead && side === 1 && u.m >= 0) B.dead.push(u.m);
  btEv(B, ev, { t: 'die', side, lane, id: u.id });
}
function btDamage(B, side, lane, d, ev) {
  const u = B.lanes[side][lane];
  const real = Math.max(0, d - btArmor(u));
  u.hp -= real;
  btEv(B, ev, { t: 'dmg', side, lane, n: real });
  if (u.hp <= 0) btKill(B, side, lane, ev);
}

// Выставить карту (без проверок — их делают btCanPlay и бот).
function btPut(B, side, hi, lane, ev) {
  const c = B.hand[side].splice(hi, 1)[0];
  const st = btStats(c.id);
  B.coins[side] -= st.cost;
  const u = btUnit(c);
  B.lanes[side][lane] = u;
  btEv(B, ev, { t: 'play', side, lane, id: c.id });
  const q = 1 - side;
  const opp = B.lanes[q][lane];
  switch (u.sg) {
    case 'dobavka':
      for (const n of [lane - 1, lane + 1]) {
        const x = n >= 0 && n < BT.LANES ? B.lanes[side][n] : null;
        if (x) { x.hp++; x.max++; btEv(B, ev, { t: 'buff', side, lane: n }); }
      }
      break;
    case 'byuro':
      if (opp) { opp.skip = true; btEv(B, ev, { t: 'skip', side: q, lane }); }
      break;
    case 'spletnya':
      if (opp && opp.atk > 0) { opp.atk--; btEv(B, ev, { t: 'weak', side: q, lane }); }
      break;
    case 'perekl':
      if (opp) {
        for (const n of [lane - 1, lane + 1]) {
          if (n >= 0 && n < BT.LANES && !B.lanes[q][n]) {
            B.lanes[q][n] = opp;
            B.lanes[q][lane] = null;
            btEv(B, ev, { t: 'move', side: q, from: lane, lane: n });
            break;
          }
        }
      }
      break;
    case 'premiya':
      B.coins[side] = Math.min(BT.CAP, B.coins[side] + 2);
      btEv(B, ev, { t: 'coins', side, lane });
      break;
    case 'vzryv':
      for (let n = 0; n < BT.LANES && B.phase !== 'over'; n++) if (B.lanes[q][n]) btDamage(B, q, n, 1, ev);
      break;
  }
}
function btSacrifice(B, side, lane, ev) {
  B.lanes[side][lane] = null;
  B.coins[side] = Math.min(BT.CAP, B.coins[side] + 1);
  btEv(B, ev, { t: 'sac', side, lane });
}

function btAttack(B, side, ev) {
  const q = 1 - side;
  for (let l = 0; l < BT.LANES && B.phase !== 'over'; l++) {
    const u = B.lanes[side][l];
    if (!u) continue;
    if (u.skip) { u.skip = false; btEv(B, ev, { t: 'snooze', side, lane: l }); continue; }
    if (u.atk <= 0) continue;
    const t = B.lanes[q][l];
    btEv(B, ev, { t: 'strike', side, lane: l });
    if (!t || u.sg === 'nevesom') { btHitScale(B, side, l, u.atk, ev); continue; }
    const quills = t.sg === 'gvozdi';
    btDamage(B, q, l, u.atk, ev);
    if (quills && B.lanes[side][l] === u) btDamage(B, side, l, 1, ev);
  }
}

function btStartTurn(B, side, ev) {
  B.active = side;
  B.pturn[side]++;
  B.coins[side] = Math.min(BT.CAP, B.coins[side] + 1);
  btEv(B, ev, { t: 'turn', side });
}
const btCanDraw = (B, side) => B.deck[side].length > 0 || B.packs[side] > 0;
function btTake(B, side, src, ev) {
  if (src === 'pk' && B.packs[side] > 0) { B.packs[side]--; B.hand[side].push({ id: BT_PACKET, m: -1 }); }
  else if (B.deck[side].length) B.hand[side].push(B.deck[side].shift());
  else if (B.packs[side] > 0) { B.packs[side]--; B.hand[side].push({ id: BT_PACKET, m: -1 }); src = 'pk'; }
  btEv(B, ev, { t: 'draw', side, src });
}

/* ---------------- Бот ----------------
   Жадный бот с перебором первого действия: для каждого варианта доигрывает ход жадно и смотрит на позицию после
   своих атак и ответных атак соперника (новых карт соперника не угадывает — его руку не видит). */
const BT_SIG_V = { dobavka: 0.5, bronya: 1.5, bronya2: 3, gvozdi: 1, byuro: 0, spletnya: 0, perekl: 0, nevesom: 2, dyhanie: 1.5, premiya: 0, vzryv: 0 };
const btVal = (u) => (u.id === BT_PACKET ? 0.4 : u.atk * 1.6 + u.hp * 0.8 + (BT_SIG_V[u.sg] || 0) - (u.sg === 'dyhanie' && u.rev ? 1.5 : 0));
// Лёгкая копия для перебора: без событий, колод и списка погибших.
function btClone(B) {
  const cu = (u) => (u ? { ...u } : null);
  return {
    rs: B.rs, phase: B.phase, winner: B.winner, scale: B.scale, coins: B.coins.slice(), packs: B.packs.slice(),
    lanes: [B.lanes[0].map(cu), B.lanes[1].map(cu)], hand: [B.hand[0].slice(), B.hand[1].slice()],
    deck: [B.deck[0], B.deck[1]], dead: null,
  };
}
function btEval(B, p) {
  const s = btClone(B);
  btAttack(s, p, null);
  if (s.phase !== 'over') btAttack(s, 1 - p, null);
  if (s.phase === 'over') return s.winner === p ? 1e4 : -1e4;
  let v = (p === 1 ? s.scale : -s.scale) * 6;
  for (const u of s.lanes[p]) if (u) v += btVal(u);
  for (const u of s.lanes[1 - p]) if (u) v -= btVal(u);
  return v + s.coins[p] * 0.6;
}
function btCandidates(B, p) {
  const out = [];
  const lanes = B.lanes[p];
  const seen = new Set();
  B.hand[p].forEach((c, hi) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    const st = btStats(c.id);
    const need = st.cost - B.coins[p];
    if (need <= 0) {
      for (let l = 0; l < BT.LANES; l++) if (!lanes[l]) out.push({ hi, l, sac: [] });
      return;
    }
    const own = [];
    for (let l = 0; l < BT.LANES; l++) if (lanes[l]) own.push(l);
    if (own.length < need) return;
    own.sort((a, b) => btVal(lanes[a]) - btVal(lanes[b]));
    const sac = own.slice(0, need);
    const lost = sac.reduce((t, l) => t + btVal(lanes[l]), 0);
    if (lost >= btVal({ id: c.id, atk: st.atk, hp: st.hp, sg: st.sigil }) * 0.75) return;
    for (let l = 0; l < BT.LANES; l++) if (!lanes[l] || sac.includes(l)) out.push({ hi, l, sac });
  });
  return out;
}
function btApply(B, p, a, ev) {
  for (const l of a.sac) btSacrifice(B, p, l, ev);
  btPut(B, p, a.hi, a.l, ev);
}
function btGreedy(B, p, ev) {
  for (let step = 0; step < 8 && B.phase !== 'over'; step++) {
    const base = btEval(B, p);
    let best = null, bestV = base + 0.01;
    for (const a of btCandidates(B, p)) {
      const s = btClone(B);
      btApply(s, p, a, null);
      const v = s.phase === 'over' ? (s.winner === p ? 1e4 : -1e4) : btEval(s, p);
      if (v > bestV) { bestV = v; best = a; }
    }
    if (!best) return;
    btApply(B, p, best, ev);
  }
}
function btThink(B, p, ev) {
  let best = null, bestV = -Infinity;
  for (const a of [null, ...btCandidates(B, p)]) {
    const s = btClone(B);
    if (a) btApply(s, p, a, null);
    if (s.phase !== 'over') btGreedy(s, p, null);
    const v = s.phase === 'over' ? (s.winner === p ? 1e4 : -1e4) : btEval(s, p);
    if (v > bestV) { bestV = v; best = a; }
  }
  if (best) btApply(B, p, best, ev);
  if (B.phase !== 'over') btGreedy(B, p, ev);
}
function btWantPack(B, p) {
  if (!B.deck[p].length) return true;
  if (!B.packs[p]) return false;
  const hasPack = B.hand[p].some((c) => c.id === BT_PACKET);
  const onBoard = B.lanes[p].filter(Boolean).length;
  const blocked = B.hand[p].filter((c) => c.id !== BT_PACKET && btStats(c.id).cost > B.coins[p] + onBoard).length;
  return !hasPack && (blocked >= 2 || (!B.hand[p].length && !onBoard));
}

/* ---------------- Ходы ---------------- */
function btTurnLimit(B, ev) {
  if (B.phase === 'over' || B.pturn[0] < BT.TURNS || B.pturn[1] < BT.TURNS) return false;
  btOver(B, B.scale > 0 ? 1 : B.scale < 0 ? 0 : -1, ev);
  return true;
}
// Ход бота и начало хода игрока (до выбора, откуда брать карту).
function btBotTurn(B, ev) {
  btStartTurn(B, 0, ev);
  if (B.pturn[0] > 1 && btCanDraw(B, 0)) btTake(B, 0, btWantPack(B, 0) ? 'pk' : 'deck', ev);
  btThink(B, 0, ev);
  if (B.phase !== 'over') btAttack(B, 0, ev);
  if (B.phase === 'over' || btTurnLimit(B, ev)) return;
  btStartTurn(B, 1, ev);
  B.phase = btCanDraw(B, 1) ? 'draw' : 'main';
}
// Начало боя: первым ходит бот.
function btBegin(B) {
  const ev = [];
  btBotTurn(B, ev);
  return ev;
}
const btHandStats = (B, hi) => btStats(B.hand[1][hi].id);
const btCanPlay = (B, hi, lane) => B.phase === 'main' && hi >= 0 && hi < B.hand[1].length && lane >= 0 && lane < BT.LANES &&
  !B.lanes[1][lane] && btHandStats(B, hi).cost <= B.coins[1];
const btCanSac = (B, lane) => B.phase === 'main' && !!B.lanes[1][lane] && B.coins[1] < BT.CAP;

// Действия игрока. Возвращают события или null, если действие сейчас невозможно.
function btDraw(B, src) {
  if (B.phase !== 'draw') return null;
  if (src === 'pk' ? !B.packs[1] : !B.deck[1].length) return null;
  const ev = [];
  btTake(B, 1, src, ev);
  B.phase = 'main';
  return ev;
}
function btPlay(B, hi, lane) {
  if (!btCanPlay(B, hi, lane)) return null;
  const ev = [];
  btPut(B, 1, hi, lane, ev);
  return ev;
}
function btSac(B, lane) {
  if (!btCanSac(B, lane)) return null;
  const ev = [];
  btSacrifice(B, 1, lane, ev);
  return ev;
}
function btEndTurn(B) {
  if (B.phase !== 'main') return null;
  const ev = [];
  B.phase = 'bot';
  btAttack(B, 1, ev);
  if (B.phase === 'over' || btTurnLimit(B, ev)) return ev;
  btBotTurn(B, ev);
  return ev;
}
function btSurrender(B) {
  if (B.phase === 'over') return null;
  const ev = [];
  btOver(B, 0, ev);
  return ev;
}

/* Проверка боя из сохранения: только то, без чего отрисовка и ходы не упадут; id карт — только настоящие
   (попадают в разметку). Испорченный бой игра просто снимает (state.js). */
function btLooksValid(B) {
  const isId = (id) => id === BT_PACKET || CARD_BY_ID.has(id);
  const isN = (x) => Number.isInteger(x);
  const card = (c, mine) => !!c && typeof c === 'object' && isId(c.id) && isN(c.m) && c.m >= -1 && c.m < mine;
  const unit = (u, mine) => u === null || (card(u, mine) && isN(u.atk) && isN(u.hp) && isN(u.max) && u.atk >= 0 && u.hp > 0 &&
    u.hp <= 99 && u.max <= 99 && typeof u.skip === 'boolean' && typeof u.rev === 'boolean' && (u.sg === '' || (typeof u.sg === 'string' && Object.prototype.hasOwnProperty.call(SIGILS, u.sg))));
  try {
    if (!B || typeof B !== 'object' || B.v !== 1 || !isN(B.rs) || !Array.isArray(B.mine) || !Array.isArray(B.foe)) return false;
    const M = B.mine.length;
    if (M > BT.DECK || !B.mine.every((x) => x && CARD_BY_ID.has(x.id) && typeof x.hurt === 'boolean')) return false;
    if (!B.foe.every((id) => CARD_BY_ID.has(id))) return false;
    if (!Array.isArray(B.dead) || !B.dead.every((m) => isN(m) && m >= 0 && m < M) || new Set(B.dead).size !== B.dead.length) return false;
    if (!['draw', 'main', 'bot', 'over'].includes(B.phase) || !isN(B.scale) || Math.abs(B.scale) > 99) return false;
    if (B.phase === 'over' ? ![0, 1, -1].includes(B.winner) : B.winner !== null) return false;
    for (const k of ['pturn', 'coins', 'packs']) if (!Array.isArray(B[k]) || B[k].length !== 2 || !B[k].every((x) => isN(x) && x >= 0)) return false;
    if (B.coins.some((x) => x > BT.CAP) || B.packs.some((x) => x > BT.PACKS)) return false;
    for (const p of [0, 1]) {
      if (!Array.isArray(B.lanes[p]) || B.lanes[p].length !== BT.LANES || !B.lanes[p].every((u) => unit(u, M))) return false;
      if (!Array.isArray(B.hand[p]) || !B.hand[p].every((c) => card(c, M))) return false;
      if (!Array.isArray(B.deck[p]) || !B.deck[p].every((c) => card(c, M))) return false;
    }
    // Номер карты игрока m: у пакетов и карт бота −1; у карт игрока — свой, без повторов, совпадает с B.mine
    // и не числится погибшим (иначе ранение уйдёт не той карте или одной копии дважды).
    const ms = new Set(B.dead);
    for (const p of [0, 1]) {
      for (const c of [...B.hand[p], ...B.deck[p], ...B.lanes[p].filter(Boolean)]) {
        if (p === 0 || c.id === BT_PACKET) { if (c.m !== -1) return false; continue; }
        if (c.m < 0 || ms.has(c.m) || B.mine[c.m].id !== c.id) return false;
        ms.add(c.m);
      }
    }
    const rewOk = B.rew === null || (!!B.rew && CASES.some((c) => c.id === B.rew.c && !c.free) && [1, 2, 3].includes(B.rew.n));
    return rewOk && typeof B.name === 'string' && B.name.length <= 40 && !/[<>&"'`]/.test(B.name) && [0, 1, 2].includes(B.tier);
  } catch (_) { return false; }
}

/* ---------------- Колоды по силе ----------------
   Сила карты для подбора соперника: атака дороже здоровья, у свойства своя прибавка. */
const BT_SIG_P = { premiya: 3, vzryv: 3, nevesom: 2.5 };
const btPower = (c) => 1.5 * c.atk + c.hp + (c.sigil ? BT_SIG_P[c.sigil] || 1.5 : 0);
const btDeckPower = (ids) => ids.reduce((t, id) => t + btPower(CARD_BY_ID.get(id)), 0);
// Раскладка цен в колоде, к которой тянутся автоподбор и замена: сыграть должно быть чем с первых ходов.
const BT_CURVE = { 1: 3, 2: 3, 3: 2, 4: 2 };
const btCheap = (ids) => ids.filter((id) => CARD_BY_ID.get(id).cost <= 2).length;

/* Колода соперника: 10 карт из pool (одна карта до 2 раз), сила ≈ target, дешёвых (до 2🪙) не меньше 4.
   Сначала случайная, потом замены по одной, пока сила приближается к цели. rand — генератор 0…1. */
function btBuildFoe(pool, target, rand) {
  const pick = () => pool[Math.floor(rand() * pool.length)].id;
  const copies = (d, id) => d.filter((x) => x === id).length;
  const deck = [];
  for (let guard = 0; deck.length < BT.DECK && guard < 500; guard++) {
    const id = pick();
    if (copies(deck, id) < BT.COPIES) deck.push(id);
  }
  // Запасной путь (неудачный генератор): добираем по порядку, чтобы карт всегда было 10.
  for (const c of pool) while (deck.length < BT.DECK && copies(deck, c.id) < BT.COPIES) deck.push(c.id);
  const score = (d) => Math.abs(btDeckPower(d) - target) + Math.max(0, 4 - btCheap(d)) * 20;
  let cur = score(deck);
  for (let i = 0; i < 800 && cur > 0.5; i++) {
    const k = Math.floor(rand() * deck.length);
    const id = pick();
    if (id === deck[k] || copies(deck, id) >= BT.COPIES) continue;
    const old = deck[k];
    deck[k] = id;
    const s = score(deck);
    if (s <= cur) cur = s; else deck[k] = old;
  }
  return deck;
}
