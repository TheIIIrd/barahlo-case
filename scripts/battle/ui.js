/* ==========================================================================
   Бои: экран соперника, стол, анимации, итог боя
   ========================================================================== */
'use strict';

let btSel = null;       // выбранная карта в руке (номер в руке)
let btSacMode = false;  // режим «Сдать на запчасти»: следующая своя карта на столе уйдёт за мелочь
let btNote = '';        // описание карты, на которую нажали
let btBotTurnNow = false;
let btMyStrike = false; // «Закончить ход» нажата: сначала бьют карты игрока, потом ход соперника (событие turn)
// Сколько длится показ события, мс (при «меньше движения» sleep сам укорачивает до 60).
const BT_DUR = { turn: 240, draw: 200, play: 300, buff: 220, skip: 240, weak: 240, move: 280, coins: 220, sac: 260,
  strike: 170, dmg: 360, scale: 380, die: 340, revive: 380, snooze: 280, over: 300, calm: 700, mull: 420 };

const btLeadText = (v) => (v > 0 ? `+${v} в твою пользу` : v < 0 ? `${minusSign('-' + -v)} в пользу бота` : 'поровну');
const btSigText = (sg) => (sg && SIGILS[sg] ? `${SIGILS[sg].n}: ${SIGILS[sg].d[0].toLowerCase()}${SIGILS[sg].d.slice(1)}.` : '');

/* ---------- Карты на столе и в руке ---------- */
/* Карта на столе (с 1.16.0): справа сверху — цена, под ней 🩹 и zZ; здоровье «6/8», если не полное.
   Строка ⚔️/❤️ у всех карт на одной высоте: под название — место на 2 строки, под свойство — строка, даже пустая. */
const BT_NOSIG = '<span class="pc-sig" aria-hidden="true"></span>'; // пустая строка свойства держит высоту
function btCardHTML(u, side, B) {
  const zz = u.skip ? '<span class="pc-zz" title="Пропустит ход">zZ</span>' : '';
  if (u.id === BT_PACKET) {
    return `<div class="pcard bd pk"><span class="pc-tr">${zz}</span><span class="pc-ic">🛍️</span><span class="pc-nm">Пакет</span>
      <span class="pc-st"><span>⚔️0</span><span>❤️${u.hp}</span></span>${BT_NOSIG}</div>`;
  }
  const c = CARD_BY_ID.get(u.id);
  const sig = u.sg ? SIGILS[u.sg] : null;
  const hurt = side === 1 && B.mine[u.m] && B.mine[u.m].hurt;
  const hpCls = u.hp < u.max ? 'hurt' : u.max > c.hp ? 'up' : '';
  return `<div class="pcard bd${hurt ? ' hurt' : ''}" style="--sc:${c.suit.color};--rc:${cardColor(c)}">
    <span class="pc-corner">${RANKS[c.rank]}<i>${c.suit.sym}</i></span>
    <span class="pc-tr"><span class="pc-cost">🪙${c.cost}</span>${hurt ? '<span class="pc-hurt">🩹</span>' : ''}${zz}</span>
    <span class="pc-ic">${c.ic}</span><span class="pc-nm">${c.name}</span>
    <span class="pc-st"><span class="${u.atk < c.atk ? 'weak' : ''}">⚔️${u.atk}</span><span class="${hpCls}">❤️${u.hp}${u.hp !== u.max ? `<i>/${u.max}</i>` : ''}</span></span>
    ${sig ? `<span class="pc-sig">${sig.n}</span>` : BT_NOSIG}</div>`;
}

/* Нажатие на карту стола: всё о ней — словами в строке подсказки под рукой (её же читает экранный диктор).
   Цена, атака и здоровье видны на самой карте — здесь только то, чего на ней нет: свойство и что с картой сейчас. */
function btCardNote(u, side, B) {
  if (u.id === BT_PACKET) return 'Пакет: атаки нет, закрывает линию от удара в весы.';
  const c = CARD_BY_ID.get(u.id);
  const st = [];
  if (side === 1 && B.mine[u.m] && B.mine[u.m].hurt) st.push('Ранена: погибнет — копия сотрётся.');
  if (u.atk < c.atk) st.push(`Ей не до драки: атака ${u.atk} вместо ${c.atk}.`);
  if (u.max > c.hp) st.push(`Здоровье выросло до ${u.max}.`);
  if (u.skip) st.push('Пропустит следующий ход.');
  if (u.sg === 'dyhanie' && u.rev) st.push('Второе дыхание уже потрачено.');
  return `«${cardTitle(c)}». ${u.sg ? btSigText(u.sg) : 'Без свойства.'}${st.length ? ' ' + st.join(' ') : ''}`;
}
function btHandHTML(B) {
  const coins = B.coins[1];
  return B.hand[1].map((h, i) => {
    const pk = h.id === BT_PACKET;
    const c = pk ? null : CARD_BY_ID.get(h.id);
    const cost = pk ? 0 : c.cost;
    const cls = `${btSel === i ? ' picked' : ''}${B.phase === 'main' && cost > coins ? ' no' : ''}${pk ? ' pk' : ''}`;
    const hurt = !pk && B.mine[h.m] && B.mine[h.m].hurt;
    const attrs = `data-hand="${i}" tabindex="0" role="button" aria-pressed="${btSel === i}"`;
    if (pk) {
      return `<div class="pcard${cls}" ${attrs} title="Пакет: бесплатный, закрывает линию"><span class="pc-n">🪙0</span><span class="pc-ic">🛍️</span>
        <span class="pc-nm">Пакет</span><span class="pc-st pc-stats"><b>⚔️0</b><b>❤️1</b></span>${BT_NOSIG}</div>`;
    }
    const sig = c.sigil ? SIGILS[c.sigil] : null;
    return `<div class="pcard${cls}${hurt ? ' hurt' : ''}" ${attrs} style="--sc:${c.suit.color};--rc:${cardColor(c)}" title="${cardTitle(c)}${sig ? ' · ' + sig.n : ''}">
      <span class="pc-corner">${RANKS[c.rank]}<i>${c.suit.sym}</i></span><span class="pc-n">🪙${c.cost}</span>
      <span class="pc-ic">${c.ic}</span><span class="pc-nm">${c.name}</span><span class="pc-st pc-stats"><b>⚔️${c.atk}</b><b>❤️${c.hp}</b></span>
      ${sig ? `<span class="pc-sig">${sig.n}</span>` : BT_NOSIG}${hurt ? '<span class="pc-hurt" title="Ранена">🩹</span>' : ''}</div>`;
  }).join('');
}

/* Стол по снимку. fx — событие, которое сейчас показываем (подсветка клетки и всплывающее число), prev — снимок
   до него: погибшую карту рисуем из него, чтобы она успела исчезнуть на глазах. */
const BT_FXN = {
  dmg: (e) => [minusSign('-' + e.n), ''], scale: (e) => ['+' + e.n, e.side === 1 ? 'good' : ''], buff: () => ['+1', 'good'],
  skip: () => ['zZ', 'info'], weak: () => [minusSign('-1'), ''], sac: () => ['+1 🪙', 'good'], coins: () => ['+2 🪙', 'good'],
  revive: () => ['1❤️', 'good'], snooze: () => ['zZ', 'info'],
};
function btRenderTable(B, snap, fx = null, prev = null) {
  const canPut = B.phase === 'main' && !busy && btSel !== null && B.hand[1][btSel] &&
    btStats(B.hand[1][btSel].id).cost <= B.coins[1];
  for (const side of [0, 1]) {
    const row = $(side ? 'btMeRow' : 'btFoeRow');
    row.innerHTML = snap.lanes[side].map((u0, lane) => {
      const hit = fx && fx.side === side && fx.lane === lane;
      const u = hit && fx.t === 'die' && prev ? prev.lanes[side][lane] : u0;
      const cls = `bcell ${side ? 'mine' : 'foe'}${hit ? ' fx-' + fx.t : ''}`;
      const f = hit && BT_FXN[fx.t] ? BT_FXN[fx.t](fx) : null;
      const fxn = f ? `<span class="fxn${f[1] ? ' ' + f[1] : ''}" aria-hidden="true">${f[0]}</span>` : '';
      if (!u) {
        if (!side) return `<div class="${cls}" data-fo="${lane}"><div class="bslot"></div>${fxn}</div>`;
        return `<div class="${cls}"><button class="bslot${canPut ? ' can' : ''}" type="button" data-put="${lane}" aria-label="Линия ${lane + 1}: пусто"${canPut ? '' : ' tabindex="-1"'}>${canPut ? 'сюда' : ''}</button>${fxn}</div>`;
      }
      const card = btCardHTML(u, side, B).replace('class="pcard', `${side ? `data-me="${lane}"` : `data-fo="${lane}"`} tabindex="0" role="button" class="pcard`);
      return `<div class="${cls}">${card}${fxn}</div>`;
    }).join('');
  }
  const v = Math.max(-BT.WIN, Math.min(BT.WIN, snap.scale));
  $('btKnob').style.setProperty('--v', v);
  $('btKnob').classList.toggle('neg', v < 0);
  const lead = $('btLead');
  lead.textContent = btLeadText(snap.scale);
  lead.className = v > 0 ? '' : v < 0 ? 'neg' : 'zero';
  $('btScale').setAttribute('aria-label', 'Весы: ' + btLeadText(snap.scale));
  $('btCoins').textContent = `🪙${snap.coins[1]}/${BT.CAP}`;
  $('btDeckN').textContent = snap.deck[1];
  $('btPackN').textContent = snap.packs[1];
  const pill = btBotTurnNow ? '<span class="turnpill">ходит соперник</span>' : '';
  $('btInfo').innerHTML = `${pill}${BT_TIERS[B.tier].n} · рука ${snap.hand[0]} · колода ${snap.deck[0]} · ход ${B.pturn[1] || 1}`;
}

function btHint(B) {
  // Первый ход боя: соперник только выставляет карты (B.pturn[0] — уже его первый ход, исход посчитан до показа).
  if (btMyStrike) return 'Твои карты бьют слева направо.';
  if (btBotTurnNow) return B.pturn[0] === 1 ? 'Первый ход соперника: только выставляет карты, атаки нет.' : 'Ход соперника: его карты бьют слева направо.';
  if (B.phase === 'draw') return btCanMull(B) ? 'Возьми карту: из колоды или пакет. Рука не нравится — ↻ заменит её, один раз за бой.' : 'Возьми карту: из колоды или пакет.';
  if (btSacMode) return 'Нажми на свою карту на столе: она уйдёт на запчасти, мелочи станет на 1 больше.';
  if (btNote) return btNote;
  if (btSel !== null && B.hand[1][btSel]) {
    const h = B.hand[1][btSel];
    if (h.id === BT_PACKET) return 'Выбран пакет — нажми на свободную клетку стола.';
    const c = CARD_BY_ID.get(h.id);
    const sig = btSigText(c.sigil);
    if (c.cost > B.coins[1]) return `Не хватает мелочи для «${c.name}»: нужно ${c.cost}, есть ${B.coins[1]}. Сдай карту на запчасти или выбери другую.`;
    return `Выбрана «${c.name}» — нажми на свободную клетку стола.${sig ? ' ' + sig : ''}`;
  }
  return 'Выбери карту в руке или закончи ход.';
}
function btControls(B) {
  const main = B.phase === 'main' && !busy;
  const draw = B.phase === 'draw' && !busy;
  $('btDeck').disabled = !(draw && B.deck[1].length);
  $('btPack').disabled = !(draw && B.packs[1]);
  $('btDeck').classList.toggle('want', !$('btDeck').disabled);
  $('btPack').classList.toggle('want', !$('btPack').disabled);
  const go = $('btEndTurn');
  go.disabled = !main;
  go.textContent = btMyStrike ? '⏳ Твои карты бьют…' : btBotTurnNow ? '⏳ Ход соперника…' : B.phase === 'draw' ? '⚔️ Сначала возьми карту' : '⚔️ Закончить ход';
  // «↻ Новая рука» стоит на месте «Сдать на запчасти» (та в это время всё равно выключена): ряд не сдвигается.
  const mull = btCanMull(B) && !btBotTurnNow && !btMyStrike;
  $('btMull').classList.toggle('off', !mull);
  $('btMull').disabled = !mull || busy;
  const sac = $('btSac');
  sac.classList.toggle('off', mull);
  sac.disabled = !main || B.coins[1] >= BT.CAP || !B.lanes[1].some(Boolean);
  if (sac.disabled) btSacMode = false;
  sac.setAttribute('aria-pressed', String(btSacMode));
  $('btBoard').classList.toggle('sacmode', btSacMode);
  $('btGiveUp').disabled = busy || B.phase === 'over';
  $('btHint').textContent = btHint(B);
}
// Полная перерисовка стола из состояния боя.
function btRenderAll(B) {
  const key = focusKey($('btBoard'));
  if (btSel !== null && !B.hand[1][btSel]) btSel = null;
  $('btName').textContent = B.name;
  $('btName').title = B.name; // на телефоне длинное имя обрезается многоточием
  btRenderTable(B, btSnap(B));
  $('btHand').innerHTML = btHandHTML(B);
  btControls(B);
  restoreFocus(key);
}

/* Показ событий по очереди. Исход уже посчитан и записан — здесь только картинка. */
// Пока идёт анимация, кнопки выключены: фокус клавиатуры держит сам стол, потом возвращается на нужную кнопку.
function btHoldFocus() {
  const a = document.activeElement;
  if (!a || a === document.body || $('csub-battle').contains(a)) $('btBoard').focus({ preventScroll: true });
}
function btFocusBack(B) {
  if (document.activeElement === $('btBoard')) $('btBoard').blur();
  const take = B.phase === 'draw' ? [$('btDeck'), $('btPack')] : [];
  focusBack(take, $('btEndTurn'), $$('#btHand .pcard'), $('btDeck'), $('btPack'));
}
async function btShow(B, ev, prev, bot = false) {
  btHoldFocus();
  await withBusy(async () => {
    $('btHand').innerHTML = btHandHTML(B);
    btControls(B);
    let last = prev;
    for (const e of ev) {
      if (e.t === 'turn') { btBotTurnNow = e.side === 0 && bot; btMyStrike = false; }
      btRenderTable(B, e.snap, e, last);
      if (e.t === 'turn' || e.t === 'draw' || e.t === 'calm') btControls(B);
      if (e.t === 'draw' && e.side === 1) replay($('btHand').lastElementChild, 'fx-draw', 400);
      if (e.t === 'mull') $$('#btHand .pcard:not(.pk)').forEach((el) => replay(el, 'fx-draw', 400));
      btSound(e);
      last = e.snap;
      await sleep(BT_DUR[e.t] || 200);
    }
  });
  btBotTurnNow = false;
  btMyStrike = false;
}
function btSound(e) {
  switch (e.t) {
    case 'play': tone(e.side ? 560 : 440, 0.05, 'triangle', 0.04); break;
    case 'dmg': tone(190, 0.06, 'sawtooth', 0.035); break;
    case 'scale': tone(e.side ? 820 : 300, 0.09, 'triangle', 0.05); break;
    case 'die': tone(140, 0.12, 'sawtooth', 0.04); break;
    case 'sac': case 'coins': tone(980, 0.05, 'square', 0.03); break;
    case 'draw': if (e.side) tone(660, 0.03, 'square', 0.025); break;
    case 'mull': tone(520, 0.06, 'triangle', 0.035); break;
  }
}

/* Действие игрока: посчитать, записать (с итогом боя, если он кончился), потом показать. */
async function btAct(fn, bot = false) {
  const B = state.battle;
  if (busy || !B) return;
  const prev = btSnap(B);
  const ev = fn(B);
  if (!ev) return;
  btNote = '';
  let res = null;
  if (B.phase === 'over') res = finishBattle(B);
  else save();
  if (bot) btMyStrike = true; // ход соперника покажет его событие turn
  await btShow(B, ev, prev, bot);
  if (res) { showBattleEnd(res, B); return; }
  btRenderAll(B);
  btFocusBack(B);
}

/* ---------- Экран до боя ---------- */
// Колода неполная (копию стёрли в бою, карту потратили в Кузне или убрали в Картотеке) — добираем сами и говорим об этом.
function btFillDeck() {
  deckNormalize();
  const before = state.deck.length;
  const added = deckFill();
  if (!added.length) return;
  if (!before) toast('Колода собрана сама из лучших карт. Поменять её можно в Картотеке.', 3200);
  else if (added.length <= 3) toast(`В колоду добавлено до ${BT.DECK} карт: ${added.map((c) => `«${c.name}»`).join(', ')}.`, 3600);
  else toast(`В колоду добавлено ${added.length} ${plural(added.length, 'карта', 'карты', 'карт')} до ${BT.DECK}. Посмотреть можно в Картотеке.`, 3200);
}
function renderBtPre() {
  const box = $('btPre');
  const key = focusKey(box);
  if (!battlesOpen()) {
    box.innerHTML = `<div class="panel btlock"><span class="ic">⚔️</span><h2>Бои</h2>
      <p>Для боя нужна колода из ${BT.DECK} карт, одна карта — не больше ${BT.COPIES} раз. Сейчас в коллекции хватает на ${deckPossible()}. Карты куются в Кузне.</p>
      <button class="btn primary" id="btToForge" type="button">⚒️ В Кузню</button></div>`;
    $('btToForge').onclick = () => setCardsSub('forge');
    restoreFocus(key);
    return;
  }
  btFillDeck();
  if (!state.btNext) state.btNext = makeFoe();
  else btFoeFresh(state.btNext);
  save();
  const n = state.btNext;
  const T = BT_TIERS[n.tier];
  const c = CASES.find((x) => x.id === n.rew.c);
  // Карта награды — масти соперника (rew.s, с 1.19.0); у соперника, выбранного раньше, — масти кейса.
  const suit = SUITS.find((s) => s.id === n.rew.s) || SUITS.find((s) => s.cases.includes(c.id));
  const bonus = btStreakNext(); // эта победа — третья подряд: +1 открытие
  const glory = gloryFull() && n.tier === 2; // полный Зал славы: +1 открытие за сильного соперника
  const opens = n.rew.n + (bonus ? 1 : 0) + (glory ? 1 : 0);
  const pity = btPityLeft();
  const bySuit = SUITS.map((s) => [s, n.foe.filter((id) => CARD_BY_ID.get(id).suit === s).length]).filter(([, k]) => k).sort((a, b) => b[1] - a[1]);
  const backs = bySuit.flatMap(([s, k]) => Array(k).fill(s)).map((s) =>
    `<div class="pcard back xs" style="--sc:${s.color}" aria-hidden="true"><span class="pc-corner"><i>${s.sym}</i></span><span class="pc-ic">?</span></div>`).join('');
  const mine = deckForBattle();
  const hurtN = mine.filter((x) => x.hurt).length;
  if (btPrePick !== null && !(btPrePick < mine.length)) btPrePick = null; // колода стала короче (копию стёрли)
  const myCards = mine.map((x, i) => {
    const h = cardHTML(CARD_BY_ID.get(x.id), { size: 'xs', attrs: `data-pk="${i}" tabindex="0" role="button" aria-pressed="${btPrePick === i}"` })
      .replace('class="pcard', `class="pcard${btPrePick === i ? ' picked' : ''}`);
    return x.hurt ? h.replace('class="pcard', 'class="pcard hurt').replace(/<\/div>\s*$/, '<span class="pc-hurt" title="Ранена">🩹</span></div>') : h;
  }).join('');
  box.innerHTML = `<div class="prebattle">
    <div class="panel pfoe">
      <h2>Соперник <small>случайный · побед ${state.btWins}, поражений ${state.btLosses}</small></h2>
      <div class="foe-row"><div class="foe-ava" aria-hidden="true">🧔</div><div class="foe-t"><b title="${n.name}">${n.name}</b>
        <span class="chips"><span class="chip lit" style="--c:${T.c}">${T.n}</span><span class="chip">${bySuit.map(([s, k]) => `${s.sym} ${k}`).join(' · ')}</span></span></div></div>
      <div class="foe-deck" role="img" aria-label="Колода соперника: ${bySuit.map(([s, k]) => `${s.name} ${k}`).join(', ')}">${backs}</div>
      <div class="pre-tiles">
        <div class="tile"><div class="k">Награда за победу</div>
          <div class="rew"><span class="rew-ic" style="--cc:${c.color}" aria-hidden="true">${c.ic}</span><span><b>«${c.name}» ×${opens}</b>
            <small>${opens} ${plural(opens, 'открытие', 'открытия', 'открытий')} · без хлама, редкие чаще · иногда вместо предмета — младшая карта ${suit.sym}</small>
            <small class="rline">Серия побед ${state.btStreak % BT_STREAK} из ${BT_STREAK}${bonus ? ': эта победа третья — +1 открытие' : ''}</small>
            ${glory ? '<small class="rline">Зал славы собран: +1 открытие за сильного соперника</small>' : ''}
            <small class="rline">${pity <= opens ? `Карта ${suit.sym} — точно за эту победу` : `Карта — точно не позже ${pity}-го открытия награды`}</small>
            <small class="rline">Иногда (${Math.round(BT_BUFF_CHANCE * 100)}%) — бафф двух кейсов твоего уровня</small>
            ${n.tier === 2 ? `<small class="rline">Трофей (${Math.round(BT_TROPHY_CHANCE * 100)}%) — карта из колоды соперника</small>` : ''}</span></div></div>
        <div class="tile lose"><div class="k">Если проиграешь</div><div class="s">Награды нет. Погибшие в бою карты ранены, раненые второй раз — стираются.</div></div>
      </div>
    </div>
    <div class="pcol"><div class="panel pme">
      <h2>Твоя колода <small>${BT.DECK} из ${BT.DECK}${hurtN ? ` · раненых ${hurtN}` : ''}</small></h2>
      <div class="me-deck" role="group" aria-label="Твоя колода: нажми на карту, чтобы рассмотреть">${myCards}</div>
      <div class="pbtns"><button class="btn" type="button" id="btToAlbum">🗂️ В Картотеку</button></div>
      <button class="btn primary go" type="button" id="btGo">⚔️ В бой</button>
      <details class="howto"><summary>Как играть</summary>
        <p>Выставляй карты на свои 4 линии. В конце хода каждая карта бьёт карту напротив, а если напротив пусто — бьёт по весам. Перевес 8 — победа.</p>
        <p>Карты стоят мелочь: +1 за ход, копится до 5. Свою карту на столе можно сдать на запчасти за +1 мелочь. Пакеты бесплатные — ими закрывают линии.</p>
        <p>Бот ходит первым, но в первый ход только выставляет карты — атаки нет. Весы начинаются с 0. Не нравится стартовая рука — в свой первый ход, пока не взята карта, её можно один раз заменить: «↻ Новая рука».</p>
        <p>Награда — кейс по твоему уровню и обычной цене твоих открытий, с щедрыми шансами. Каждая ${BT_STREAK}-я победа подряд даёт +1 открытие. Младшая карта иногда выпадает вместо предмета, а после ${BT_PITY} открытий без карты следующее — точно карта. С шансом ${Math.round(BT_BUFF_CHANCE * 100)}% победа даёт бафф: редкие ×${BUFF_MULT} на ${BUFF_MS_WIN / 60000} минуты в двух кейсах твоего уровня.</p>
        <p>Победа над соперником «сильнее тебя» с шансом ${Math.round(BT_TROPHY_CHANCE * 100)}% даёт трофей — карту из его колоды, не больше чем на ранг старше твоих карт этой масти. За особые победы — медали: их можно продать или поставить в Зал славы Музея. Погибшая в бою карта ранена, раненая второй раз — стирается.</p></details>
    </div>
    <aside class="cdetail btdetail" id="btDetail" aria-label="Карта из колоды"></aside></div></div>`;
  $('btToAlbum').onclick = () => setCardsSub('album');
  $('btGo').onclick = btFight;
  $$('[data-pk]', box).forEach((el) => {
    el.onclick = (e) => openBtPreCard(+el.dataset.pk, e);
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
  });
  renderBtPreDetail(mine);
  if (btDetailEl) toEndRO.unobserve(btDetailEl);
  btDetailEl = $('btDetail');
  toEndRO.observe(btDetailEl); // кнопка «Наверх» обходит карточку, как в Картотеке
  restoreFocus(key);
}

/* Карта колоды крупно — как в Картотеке: на компьютере панель под колодой, на телефоне шторка снизу.
   Здесь только смотреть: менять колоду — в Картотеке (кнопка открывает там эту же карту). */
let btPrePick = null; // номер карты в колоде (копии различаются: одна может быть ранена)
let btDetailEl = null;
function openBtPreCard(i, e) {
  if (busy) return;
  btPrePick = btPrePick === i ? null : i; // повторное нажатие на ту же карту закрывает её (aria-pressed — переключатель)
  tone(650, 0.03);
  renderBtPre();
  if (btPrePick !== null) focusSheet($('btDetail'), e); // с клавиатуры на телефоне — в шторку
}
function closeBtPreCard() {
  const i = btPrePick;
  const inside = $('btDetail') && $('btDetail').contains(document.activeElement);
  btPrePick = null;
  if (inside) document.activeElement.blur(); // иначе перерисовка вернёт фокус «на ближайшую кнопку», а не на карту
  renderBtPre();
  if (inside) focusBack($('btPre').querySelector(`[data-pk="${i}"]`), $('btGo'));
}
function renderBtPreDetail(mine) {
  const box = $('btDetail');
  const x = btPrePick === null ? null : mine[btPrePick];
  box.classList.toggle('show', !!x);
  if (!x) {
    box.innerHTML = '<div class="emptyd"><span class="ic">🃏</span>Нажми на карту колоды, чтобы рассмотреть её поближе.</div>';
    return;
  }
  const card = CARD_BY_ID.get(x.id);
  const big = cardHTML(card);
  const copies = deckCount(card.id);
  box.innerHTML = `<button class="btn sm close" type="button" id="btdClose" aria-label="Закрыть" title="Закрыть">✕</button>
    ${x.hurt ? big.replace('class="pcard', 'class="pcard hurt').replace(/<\/div>\s*$/, '<span class="pc-hurt" title="Ранена">🩹</span></div>') : big}
    <h3>${cardTitle(card)}</h3>
    ${cardFactsHTML(card)}
    <p class="muted">В колоде ×${copies} · в коллекции ×${cardCount(card.id)}</p>
    ${x.hurt ? '<p class="cwound"><b>🩹 Эта копия ранена.</b> Погибнет в бою ещё раз — сотрётся.</p>' : ''}
    <button class="btn" type="button" id="btdAlbum">🗂️ Поменять в Картотеке</button>`;
  $('btdClose').onclick = closeBtPreCard;
  $('btdAlbum').onclick = () => {
    if (busy) return;
    btPrePick = null;
    albumPick = card.id; // в Картотеке откроется эта же карта: там «Убрать из колоды» и выбор замены
    setCardsSub('album');
    focusBack($('album').querySelector(`[data-card="${card.id}"]`), $('aDeckOut'));
  };
}

async function btFight() {
  if (busy || state.battle) return;
  btPrePick = null;
  btFillDeck();
  if (!deckFull()) { renderBattle(); return; }
  const n = state.btNext && btNextLooksValid(state.btNext) ? state.btNext : makeFoe();
  btFoeFresh(n); // колоду меняли, не заходя на экран соперника
  const B = btCreate({ mine: deckForBattle(), foe: n.foe, seed: n.seed, name: n.name, tier: n.tier, rew: n.rew });
  const prev = btSnap(B);
  const ev = btBegin(B);
  state.battle = B;
  state.btNext = null;
  btSel = null;
  btSacMode = false;
  btNote = '';
  const res = B.phase === 'over' ? finishBattle(B) : null;
  if (!res) save();
  renderCards();
  $('btPre').hidden = true;
  $('btBoard').hidden = false;
  $('btName').textContent = B.name;
  $('btName').title = B.name; // на телефоне длинное имя обрезается многоточием
  btRenderTable(B, prev);
  btBotTurnNow = true;
  await btShow(B, ev, prev, true);
  if (res) { showBattleEnd(res, B); return; }
  btRenderAll(B);
  btFocusBack(B);
}

/* ---------- Раздел ---------- */
function renderBattle() {
  if (tab !== 'cards' || cardsSub !== 'battle') return;
  const B = state.battle;
  $('btPre').hidden = !!B;
  $('btBoard').hidden = !B;
  if (!B) { renderBtPre(); return; }
  if (busy) return;
  // Бой из сохранения, прерванный в неожиданный момент: доводим до своего хода или до итога.
  if (B.phase === 'over') { const res = finishBattle(B); showBattleEnd(res, B); return; }
  if (B.phase === 'bot') { btAct((x) => { const ev = []; btBotTurn(x, ev); return ev; }, true); return; }
  btRenderAll(B);
}

// Нажатия на столе и в руке — одним обработчиком на контейнер.
function btPick(i) {
  const B = state.battle;
  if (!B || busy) return;
  if (B.phase !== 'main') { $('btHint').textContent = btHint(B); return; }
  btSel = btSel === i ? null : i;
  btSacMode = false;
  btNote = '';
  tone(640, 0.03);
  btRenderAll(B);
}
function btBoardClick(e) {
  const B = state.battle;
  if (!B || busy) return;
  const t = e.target.closest('[data-hand], [data-put], [data-me], [data-fo]');
  if (!t) return;
  if (t.dataset.hand !== undefined) { btPick(+t.dataset.hand); return; }
  if (t.dataset.put !== undefined) {
    if (btSel === null) { btNote = ''; $('btHint').textContent = 'Сначала выбери карту в руке.'; return; }
    const hi = btSel, lane = +t.dataset.put;
    if (!btCanPlay(B, hi, lane)) { $('btHint').textContent = btHint(B); return; }
    btSel = null;
    btAct((x) => btPlay(x, hi, lane));
    return;
  }
  if (t.dataset.me !== undefined && btSacMode) {
    const lane = +t.dataset.me;
    btSacMode = false;
    btAct((x) => btSac(x, lane));
    return;
  }
  // Нажатие на карту стола — всё о ней в строке подсказки.
  const side = t.dataset.me !== undefined ? 1 : 0;
  const u = B.lanes[side][+(side ? t.dataset.me : t.dataset.fo)];
  if (!u) return;
  btNote = btCardNote(u, side, B);
  $('btHint').textContent = btNote;
}
$('btBoard').addEventListener('click', (e) => btBoardClick(e));
$('btBoard').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-hand], [data-me], [data-fo]')) {
    e.preventDefault();
    e.target.click();
  }
});
$('btDeck').onclick = () => btAct((B) => btDraw(B, 'deck'));
$('btPack').onclick = () => btAct((B) => btDraw(B, 'pk'));
$('btMull').onclick = () => { btSel = null; btSacMode = false; btAct((B) => btMulligan(B)); };
$('btEndTurn').onclick = () => { btSel = null; btSacMode = false; btAct((B) => btEndTurn(B), true); };
$('btSac').onclick = () => {
  const B = state.battle;
  if (!B || busy || $('btSac').disabled) return;
  btSacMode = !btSacMode;
  btSel = null;
  btNote = '';
  btRenderAll(B);
};
$('btGiveUp').onclick = async () => {
  if (busy || !state.battle) return;
  const ok = await ask({ icon: '🏳️', title: 'Сдаться?', ok: 'Сдаться',
    html: 'Бой засчитается поражением. Карты, погибшие в этом бою, останутся ранеными, а раненые второй раз — стёртыми.' });
  if (ok === true && state.battle) btAct((B) => btSurrender(B));
  else focusBack($('btGiveUp'));
};

/* ---------- Итог боя ---------- */
function btLossRows(res) {
  const row = (id, txt, cls) => {
    const card = CARD_BY_ID.get(id);
    return `<div class="lrow">${cardHTML(card, { size: 'xs' }).replace('class="pcard', `class="pcard ${cls}`)}<span><b>${cardTitle(card)}</b> — ${txt}</span></div>`;
  };
  // Две копии одной карты — одной строкой с «×2».
  const group = (ids) => [...new Set(ids)].map((id) => [id, ids.filter((x) => x === id).length]);
  const rows = group(res.lost).map(([id, n]) => row(id, n > 1 ? `×${n}, обе погибли второй раз, копии стёрты` : 'погибла второй раз, копия стёрта', 'gone'))
    .concat(group(res.hurt).map(([id, n]) => row(id, n > 1 ? `×${n}, обе ранены` : 'ранена', 'hurt')));
  return `<div class="lrow"><span class="k">Потери в бою</span></div>${rows.length ? rows.join('') : '<span class="none">Потерь нет: все карты целы.</span>'}`;
}
async function showBattleEnd(res, B) {
  if (B) btRenderAll(B); // стол под окном — в последнем положении, без «ходит соперник»
  const win = res.winner === 1;
  const draw = res.winner === -1;
  const box = $('beBox');
  box.style.setProperty('--c', win ? 'var(--good)' : draw ? 'var(--accent)' : 'var(--bad)');
  $('beCtx').textContent = `${res.name} · перевес ${btLeadText(res.scale)} · ход ${res.turns}`;
  $('beRar').textContent = win ? 'Победа' : draw ? 'Ничья' : 'Поражение';
  $('beIc').hidden = win;
  $('beIc').textContent = draw ? '⚖️' : '🥀';
  const c = res.rew && CASES.find((x) => x.id === res.rew.c);
  $('beTitle').textContent = win && c ? `Награда: «${c.name}» ×${res.rew.n}` : draw ? 'Весы встали ровно' : 'Соперник перевесил';
  $('beSub').textContent = win ? btWinNotes(res, c) : 'Награды нет.';
  $('beGrid').innerHTML = '';
  $('beLoss').innerHTML = btLossRows(res);
  $('beOk').textContent = win ? 'Забрать' : '⚔️ Ещё бой';
  $('beAlt').textContent = '🗂️ В Картотеку';
  const reels = $('beReels');
  reels.innerHTML = '';
  $('btEnd').hidden = false;
  box.focus({ preventScroll: true }); // пока крутятся ленты, кнопки выключены — фокус держит само окно
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  if (!(win && c)) {
    $('beGrid').innerHTML = btMedalTiles(res); // бой, начатый до 1.15.1 без награды, — медали всё равно показываем
    if (win) fanfare(4); else sad();
    $('beOk').disabled = $('beAlt').disabled = false;
    $('beOk').focus({ preventScroll: true });
    return;
  }
  // Ленты: по одной на открытие; в каждой выигрыш на 50-м месте (как у кейсов).
  $('beOk').disabled = $('beAlt').disabled = true;
  const weights = btRewardWeights(c); // лента — из тех же щедрых шансов, что и выигрыш
  const wins = Array.from({ length: res.rew.n }, (_, k) => {
    const cardWin = res.cards.find((x) => x.k === k);
    if (cardWin) {
      const card = CARD_BY_ID.get(cardWin.id);
      return { card, pity: cardWin.pity, r: RANK_RARITY[card.rank], ic: card.ic, name: `Карта ${RANKS[card.rank]}${card.suit.sym} ${card.name}` };
    }
    return res.items.find((x) => x.k === k).it;
  });
  reels.innerHTML = wins.map(() => '<div class="reel-wrap"><div class="marker"></div><div class="reel"></div></div>').join('');
  await withBusy(async () => {
    // Ленты меряют ширину карточек: ждём, пока окно «вылетит» (пока оно увеличивается, мерка неверная).
    // (под нагрузкой анимация бывает дольше MODAL_IN_MS — ждём её конца, но не дольше секунды)
    await Promise.race([Promise.all(box.getAnimations().map((a) => a.finished.catch(() => {}))), sleep(1000)]);
    await new Promise((r) => requestAnimationFrame(() => r()));
    await Promise.all($$('.reel-wrap', reels).map((wrap, k) => {
      const strip = Array.from({ length: 60 }, (_, i) => (i === 50 ? wins[k] : stub(c, roll(c, weights))));
      return spinReel(wrap, strip, 50, reducedMotion ? 300 : 3200 + k * 260, k === 0).then(() => {
        if (wins[k].card) wrap.querySelector('.reel').children[50].classList.add('cardwin');
      });
    }));
    await sleep(300);
  });
  releaseXP();
  $('beGrid').innerHTML = wins.map((x) => (x.card
    ? `<div class="cardres" style="--c:${x.card.suit.color}"><span class="ic">${x.ic}</span><span class="nm">${x.name}</span><span class="p">${x.pity ? 'гарантия' : 'в Картотеку'}</span></div>`
    : `<div style="--c:${RARITY[x.r].c}" title="${x.name} · ${fmt(x.price)}"><span class="ic">${x.ic}</span><span class="nm">${nameHTMLPre(x)}</span>
        <span class="p${x.price < 0 ? ' neg' : ''}"><span class="pl">${fmtShort(x.price)}</span><span class="ps">${slotMoney(x.price)}</span></span></div>`)).join('') + btMedalTiles(res);
  fanfare(Math.max(...wins.map((x) => x.r), ...res.medals.map((x) => x.r), res.trophy ? RANK_RARITY[CARD_BY_ID.get(res.trophy).rank] : 0));
  renderCards();
  $('beOk').disabled = $('beAlt').disabled = false;
  $('beOk').focus({ preventScroll: true });
  $('beOk').scrollIntoView({ block: 'nearest' }); // на низком экране с 3–4 лентами кнопка ниже края окна
}
// Строка под заголовком окна победы: что добавилось к награде (серия, Зал славы, медали, бафф).
function btWinNotes(res, c) {
  const out = [];
  if (c) out.push('Кейс открывается сразу, бесплатно.');
  if (res.rew && res.rew.streak) out.push('Третья победа подряд — +1 открытие.');
  if (res.rew && res.rew.glory) out.push('Зал славы — +1 открытие.');
  const m = res.medals || [];
  if (m.length) out.push(m.length > 1 ? `Новые медали (${m.length}) — в инвентаре.` : `Новая медаль: ${m[0].name} — в инвентаре.`);
  if (res.trophy) out.push(`Трофей соперника: ${cardTitle(CARD_BY_ID.get(res.trophy))} — в Картотеке.`);
  const b = (res.buff || []).map((id) => CASES.find((x) => x.id === id)).filter(Boolean);
  if (b.length) out.push(`Бафф на ${BUFF_MS_WIN / 60000} минуты: ${b.map((x) => `«${x.name}»`).join(' и ')} — редкие ×${BUFF_MULT}.`);
  return out.join(' ');
}
// Плитки сверх открытий: трофей соперника (карта) и новые медали.
const btMedalTiles = (res) => {
  const t = res.trophy && CARD_BY_ID.get(res.trophy);
  const trophy = t ? `<div class="cardres trophyres" style="--c:${t.suit.color}" title="Трофей соперника: ${cardTitle(t)}"><span class="ic">${t.ic}</span><span class="nm">Карта ${cardTitle(t)}</span><span class="p">трофей</span></div>` : '';
  return trophy + (res.medals || []).map((x) =>
    `<div class="cardres medalres" style="--c:${RARITY[x.r].c}" title="${x.name} · ${fmt(x.price)}"><span class="ic">${x.ic}</span><span class="nm">${x.name}</span><span class="p">медаль</span></div>`).join('');
};
function closeBattleEnd(to) {
  if (busy || $('btEnd').hidden) return;
  $('btEnd').hidden = true;
  syncInert(); // иначе страница ещё неактивна и фокус на неё не встанет
  if (state.pending.length) {
    state.inv.push(...state.pending);
    state.pending = [];
    save();
    renderInventory();
    renderStats();
  }
  if (to === 'album') setCardsSub('album');
  else renderCards();
  focusBack($('btGo'), $('dGo'), $$('.cards-nav button'));
}
$('beOk').onclick = () => closeBattleEnd('battle');
$('beAlt').onclick = () => closeBattleEnd('album');
