/* ==========================================================================
   Карты: вкладка, разделы и альбом коллекции
   ========================================================================== */
'use strict';

const CARD_SECTIONS = ['forge', 'album'];
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
  if (tab !== 'cards') return;
  if (cardsSub === 'forge') renderForge();
  else renderAlbum();
}

function renderAlbum() {
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
      const html = cardHTML(c, { count: cardCount(c.id), attrs });
      return cardCount(c.id) ? html : html.replace('class="pcard', 'class="pcard gone');
    }).join('');
    return `<section class="asuit${suitDone(s) ? ' done' : ''}" style="--sc:${s.color}">
      <h3><i>${s.sym}</i> ${s.name} <small>${s.trait}</small><span class="cnt">${have}/${CARDS_PER_SUIT}${suitDone(s) ? ` · +${FORGE_SUIT_BONUS}% к Кузне` : ''}</span></h3>
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
  albumPick = null;
  renderAlbumDetail();
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
      <p class="muted">В коллекции ×${cardCount(card.id)} · характеристики пригодятся в будущих сражениях</p>` : ''}
    <p class="crecipe"><b>Рецепт:</b> ${recipe}</p>
    <button class="btn primary" type="button" id="aForge">⚒️ В Кузню</button>`;
  $('aClose').onclick = closeAlbumCard;
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
