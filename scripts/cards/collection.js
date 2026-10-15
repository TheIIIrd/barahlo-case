/* ==========================================================================
   Карты: вкладка, разделы, Картотека (колода и альбом коллекции)
   ========================================================================== */
'use strict';

const CARD_SECTIONS = ['forge', 'album', 'battle'];
let cardsSub = 'forge';
let albumPick = null; // карта, открытая в альбоме крупно

function setCardsSub(section) {
  if (busy) return;
  cardsSub = section;
  $$('#v-cards .subnav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.csub === section));
  CARD_SECTIONS.forEach((v) => ($('csub-' + v).hidden = v !== section));
  renderCards();
  tone(560, 0.03);
}
$$('#v-cards .subnav button').forEach((b) => (b.onclick = () => setCardsSub(b.dataset.csub)));

// Счётчики на вкладке — всегда; разделы — только когда их видно.
function renderCards() {
  const n = albumCount();
  $('tabCardsN').textContent = n;
  $('albumN').textContent = `${n}/${CARDS.length}`;
  $('btN').textContent = state.btWins;
  $('btN').title = `Побед: ${state.btWins}, поражений: ${state.btLosses}`;
  if (tab !== 'cards') return;
  if (cardsSub === 'forge') renderForge();
  else if (cardsSub === 'album') renderAlbum();
  else renderBattle();
}

/* Колода над альбомом: 10 мест, итоги, «Автоподбор» и переход к боям. Нажатие на карту колоды открывает
   её карточку (там же «Убрать из колоды»), на пустое место — подсказку. */
function renderDeckPanel() {
  const box = $('deckPanel');
  const key = focusKey(box);
  const n = state.deck.length;
  const mine = deckForBattle();
  const hurtN = mine.filter((x) => x.hurt).length;
  const cards = state.deck.map((id) => CARD_BY_ID.get(id));
  const avg = n ? sum(cards, (c) => c.cost) / n : 0;
  const slots = state.deck.map((id, i) => {
    const html = cardHTML(CARD_BY_ID.get(id), { attrs: `data-dk="${i}" tabindex="0" role="button"` });
    return mine[i].hurt ? html.replace('class="pcard', 'class="pcard hurt').replace(/<\/div>\s*$/, '<span class="pc-hurt" title="Ранена">🩹</span></div>') : html;
  }).join('') + Array.from({ length: BT.DECK - n }, (_, i) => `<button class="dslot" type="button" data-de="${i}" aria-label="Свободное место в колоде">+</button>`).join('');
  const open = battlesOpen();
  box.innerHTML = `<h2>Колода <small>${n} из ${BT.DECK}${hurtN ? ` · раненых ${hurtN}` : ''}</small></h2>
    <div class="dslots" role="group" aria-label="Колода">${slots}</div>
    ${open ? '' : `<p class="dnote">Для боёв нужна колода из ${BT.DECK} карт, одна карта — не больше ${BT.COPIES} раз. Сейчас можно собрать ${deckPossible()}: остальные куются в Кузне.</p>`}
    <div class="drow">
      <div class="dsum">${n ? `<span class="chip">🪙 средняя цена <b>${NF.format(Math.round(avg * 10) / 10)}</b></span><span class="chip">⚔️ <b>${sum(cards, (c) => c.atk)}</b></span><span class="chip">❤️ <b>${sum(cards, (c) => c.hp)}</b></span>` : ''}${hurtN ? `<span class="chip">🩹 раненых <b>${hurtN}</b></span>` : ''}</div>
      <div class="dline">${n ? `🪙 средняя цена ${NF.format(Math.round(avg * 10) / 10)} · ⚔️ ${sum(cards, (c) => c.atk)} · ❤️ ${sum(cards, (c) => c.hp)}${hurtN ? ` · раненых ${hurtN}` : ''}` : ''}</div>
      <div class="dacts"><button class="btn" type="button" id="dAuto"${deckPossible() ? '' : ' disabled'}>↺ Автоподбор</button><button class="btn primary" type="button" id="dGo"${open ? '' : ' disabled'}>⚔️ К боям</button></div>
    </div>`;
  $$('[data-dk]', box).forEach((el) => {
    el.onclick = () => openAlbumCard(state.deck[+el.dataset.dk]);
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
  });
  $$('[data-de]', box).forEach((el) => (el.onclick = () => toast('Выбери карту в альбоме ниже и нажми «В колоду». Или нажми «Автоподбор».', 3200)));
  $('dAuto').onclick = () => {
    if (busy) return;
    deckAuto();
    save();
    renderAlbum();
    toast(state.deck.length === BT.DECK ? 'Колода собрана: дешёвые карты для начала боя и сильные на потом.' : `В колоду попало ${state.deck.length} из ${BT.DECK}: больше карт пока нет.`, 2600);
  };
  $('dGo').onclick = () => setCardsSub('battle');
  restoreFocus(key);
}

function renderAlbum() {
  renderDeckPanel();
  const full = fullSuits();
  $('aN').textContent = `${albumCount()} / ${CARDS.length}`;
  $('aNs').textContent = `копий всего: ${sum(CARDS, (c) => cardCount(c.id))}`;
  $('aS').textContent = `${full} / ${SUITS.length}`;
  $('aB').textContent = `+${forgeBonus()}%`;
  $('aT').textContent = deckDone() ? '«Шулер барахла»' : '—';

  $('album').innerHTML = SUITS.map((s) => {
    const have = CARDS.filter((c) => c.suit === s && cardKnown(c.id)).length;
    const cards = CARDS.filter((c) => c.suit === s).map((c) => {
      const attrs = `data-card="${c.id}" tabindex="0" role="button"`;
      if (!cardKnown(c.id)) return cardBackHTML(c, { attrs });
      let html = cardHTML(c, { count: cardCount(c.id), attrs });
      if (!cardCount(c.id)) return html.replace('class="pcard', 'class="pcard gone');
      // Метки: 🩹 — есть раненые копии, галочка — карта в колоде.
      const marks = (cardHurt(c.id) ? `<span class="pc-hurt" title="Ранено копий: ${cardHurt(c.id)}">🩹</span>` : '') +
        (deckCount(c.id) ? `<span class="pc-in" title="В колоде ×${deckCount(c.id)}">✓</span>` : '');
      if (cardHurt(c.id) === cardCount(c.id)) html = html.replace('class="pcard', 'class="pcard hurt');
      return marks ? html.replace(/<\/div>\s*$/, marks + '</div>') : html;
    }).join('');
    return `<section class="asuit${suitDone(s) ? ' done' : ''}" style="--sc:${s.color}">
      <h3><i>${s.sym}</i> ${s.name} <small>${s.trait}</small><span class="cnt">${have}/${CARDS_PER_SUIT}${suitDone(s) ? ` · +${FORGE_SUIT_BONUS}%<span class="word"> к Кузне</span>` : ''}</span></h3>
      <div class="arow">${cards}</div>
    </section>`;
  }).join('');
  $$('[data-card]', $('album')).forEach((el) => {
    el.onclick = () => openAlbumCard(el.dataset.card);
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
  });
  renderAlbumDetail();
}

function openAlbumCard(id) {
  albumPick = id;
  renderAlbumDetail();
  tone(650, 0.03);
}
function closeAlbumCard() {
  const id = albumPick;
  const inside = $('aDetail').contains(document.activeElement);
  albumPick = null;
  renderAlbumDetail();
  // Кнопки карточки перерисованы — фокус возвращаем на саму карту в альбоме (или в колоде), а не теряем.
  if (inside) focusBack($('album').querySelector(`[data-card="${id}"]`), $$('#deckPanel [data-dk]'), $('dAuto'));
}

/* Карточка выбранной карты: на компьютере — липкая панель справа от альбома, на телефоне — шторка
   снизу (как карточка предмета в инвентаре). Показывает карту крупно, описание, характеристики,
   свойство и из чего она куётся. */
function renderAlbumDetail() {
  const box = $('aDetail');
  $$('#album .pcard.picked').forEach((el) => el.classList.remove('picked'));
  const card = albumPick && CARD_BY_ID.get(albumPick);
  box.classList.toggle('show', !!card);
  if (!card) {
    box.innerHTML = '<div class="emptyd"><span class="ic">🃏</span>Нажми на карту, чтобы рассмотреть её поближе. Карты куются в Кузне из барахла.</div>';
    return;
  }
  const el = $('album').querySelector(`[data-card="${card.id}"]`);
  if (el) el.classList.add('picked');
  const known = cardKnown(card.id);
  const sig = card.sigil ? SIGILS[card.sigil] : null;
  const rec = CARD_RECIPES.get(card.id);
  const recipe = recipeOpen(card)
    ? rec.need.map((q) => `${needLabel(q, card)}${q.n > 1 ? ' ×' + q.n : ''}`).join(' + ')
    : `откроется, когда выкуешь ${cardTitle(CARD_BY_ID.get(card.suit.id + RANK_IDS[card.rank - 1]))}`;
  box.innerHTML = `<button class="btn sm close" type="button" id="aClose" aria-label="Закрыть" title="Закрыть">✕</button>
    ${known ? cardHTML(card, { count: cardCount(card.id) }) : cardBackHTML(card)}
    <h3>${known ? cardTitle(card) : `${RANKS[card.rank]}${card.suit.sym} — ещё не выкована`}</h3>
    ${known ? `<p class="lore">${card.lore}</p>
      <div class="cstats"><span>🪙 Цена ${card.cost}</span><span>⚔️ Атака ${card.atk}</span><span>❤️ Здоровье ${card.hp}</span></div>
      ${sig ? `<p class="csig"><b>${sig.n}.</b> ${sig.d}.</p>` : ''}
      <p class="muted">В коллекции ×${cardCount(card.id)}${deckCount(card.id) ? ` · в колоде ×${deckCount(card.id)}` : ''}${cardInBattle(card.id) ? ` · в бою ×${cardInBattle(card.id)}` : ''}</p>
      ${cardHurt(card.id) ? `<p class="cwound"><b>🩹 Ранено копий: ${cardHurt(card.id)} из ${cardCount(card.id)}.</b> Раненая копия, погибшая в бою ещё раз, стирается.</p>` : ''}
      ${deckCount(card.id) || (cardCount(card.id) && deckRoom(card.id) > 0) ? `<div class="cbtns">${cardCount(card.id) && deckRoom(card.id) > 0 ? `<button class="btn" type="button" id="aDeckIn"${deckFull() ? ' disabled title="В колоде уже 10 карт: сначала убери одну"' : ''}>В колоду</button>` : ''}${deckCount(card.id) ? '<button class="btn" type="button" id="aDeckOut">Убрать из колоды</button>' : ''}</div>` : ''}` : ''}
    <p class="crecipe"><b>Рецепт:</b> ${recipe}</p>
    <button class="btn primary" type="button" id="aForge">⚒️ В Кузню</button>`;
  $('aClose').onclick = closeAlbumCard;
  const deckEdit = (f) => () => {
    if (busy) return;
    f();
    save();
    const k = focusKey(box);
    renderAlbum();
    restoreFocus(k);
    focusBack($('aDeckIn'), $('aDeckOut'), $('aForge'));
  };
  if ($('aDeckIn')) $('aDeckIn').onclick = deckEdit(() => { if (!deckFull() && deckRoom(card.id) > 0) state.deck.push(card.id); });
  if ($('aDeckOut')) $('aDeckOut').onclick = deckEdit(() => { const i = state.deck.lastIndexOf(card.id); if (i >= 0) state.deck.splice(i, 1); });
  $('aForge').onclick = () => {
    if (busy) return;
    forgeCardId = recipeOpen(card) ? card.id : card.suit.id + RANK_IDS[card.rank - 1];
    forgeSuit = card.suit.id;
    forgeAdd = 0;
    forgeMult = 1; // как и при любом другом выборе карты
    resetForgeSel();
    albumPick = null;
    setCardsSub('forge');
  };
}
