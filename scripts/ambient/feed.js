/* ==========================================================================
   Лента дропов
   ========================================================================== */
'use strict';

const NICK_STYLES = [
  (n) => n, (n) => n, (n) => n,
  (n) => n + '_' + (Math.floor(Math.random() * 900) + 100),
  (n) => 'xX_' + n + '_Xx',
  (n) => n + '228',
  (n) => '[VIP] ' + n,
  (n) => n + '_' + (1960 + Math.floor(Math.random() * 60)),
  (n) => 'TTV_' + n,
];
const fakeNick = () => pick(NICK_STYLES)(pick(NICKS));

function feedPush() {
  const c = pick(CASES);
  const it = stub(c, roll(c));
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.style.setProperty('--c', RARITY[it.r].c);
  el.innerHTML = `<span class="ic">${it.ic}</span><span><span>${it.name}</span><span class="who">${fakeNick()} · ${c.name}</span></span>`;
  const feed = $('feed');
  feed.prepend(el);
  while (feed.children.length > 14) feed.lastChild.remove();
}
