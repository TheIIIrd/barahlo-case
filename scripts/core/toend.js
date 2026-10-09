/* ==========================================================================
   Кнопка «В самый низ» / «Наверх»
   Появляется только на длинных страницах (больше пяти экранов): большой инвентарь, выбор для контракта
   на телефоне. Далеко от конца — ведёт вниз, у самого конца — наверх. Поднимается над тем, что прижато
   к низу экрана (липкая полоса контракта, панель выбора в инвентаре), и прячется под окнами и шторками.
   ========================================================================== */
'use strict';

const TOEND_LONG = 5; // страница длиннее пяти экранов (вкладка «Кейсы» на телефоне — около трёх, ей кнопка ни к чему)
const toEnd = document.createElement('button');
toEnd.type = 'button';
toEnd.className = 'toend';
toEnd.id = 'toEnd';
toEnd.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M6.5 10.5 12 16l5.5-5.5M6 20h12"/></svg>';
document.body.appendChild(toEnd);

let toEndDir = '';
let toEndRaf = 0;
function updateToEnd() {
  toEndRaf = 0;
  const vh = innerHeight;
  const total = document.documentElement.scrollHeight;
  const y = scrollY;
  const left = total - (y + vh); // сколько ещё до конца страницы
  const dir = total <= TOEND_LONG * vh ? '' : left > vh ? 'down' : y > vh ? 'up' : '';
  // Что прижато к низу экрана — над этим и держимся.
  let lift = 0;
  for (const el of [$('cBar'), ...$$('.bulk')]) {
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.height && r.top < vh && r.bottom > vh - 40) lift = Math.max(lift, vh - r.top);
  }
  toEnd.style.setProperty('--lift', Math.round(lift) + 'px');
  toEnd.classList.toggle('lifted', lift > 0); // у поднятой отступ от «чёлки» уже учтён высотой полосы
  toEnd.classList.toggle('on', !!dir);
  if (!dir || dir === toEndDir) return;
  toEndDir = dir;
  toEnd.classList.toggle('up', dir === 'up');
  const label = dir === 'up' ? 'Наверх' : 'В самый низ';
  toEnd.setAttribute('aria-label', label);
  toEnd.title = label;
}
const scheduleToEnd = () => { if (!toEndRaf) toEndRaf = requestAnimationFrame(updateToEnd); };
addEventListener('scroll', scheduleToEnd, { passive: true });
addEventListener('resize', scheduleToEnd);
// Панель выбора и липкая полоса выезжают с анимацией — перемеряем, когда она закончилась.
document.addEventListener('animationend', scheduleToEnd);
document.addEventListener('transitionend', scheduleToEnd);
new ResizeObserver(scheduleToEnd).observe(document.body); // страница выросла или стала короче (список, вкладка)
toEnd.onclick = () => {
  scrollTo({ top: toEndDir === 'up' ? 0 : document.documentElement.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
};
