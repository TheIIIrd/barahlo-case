/* ==========================================================================
   Навигация: вкладки и разделы инвентаря
   ========================================================================== */
'use strict';

const TABS = ['cases', 'inventory', 'contract', 'upgrade', 'crash', 'cards'];
const INV_SECTIONS = ['items', 'museum', 'craft'];

function closeItemCard() {
  invUi.open = null;
  $('detail').classList.remove('show');
  $('inv2').querySelector('.icard.cur')?.classList.remove('cur');
}

function goTab(t) {
  if (busy) return;
  tab = t;
  $$('.tabs .tab').forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === t));
  TABS.forEach((v) => ($('v-' + v).hidden = v !== t));
  $('picker').hidden = !(t === 'contract' || t === 'upgrade');
  // «Выбор из инвентаря» у контракта — внутри вкладки (справа или ниже), у апгрейда — отдельной панелью под ней.
  if (t === 'contract' || t === 'upgrade') resetPickPage(); // выбор снова с первых LIST_PAGE предметов
  const pickHost = t === 'contract' ? $('cSide') : $('pickHome');
  if ($('picker').parentElement !== pickHost) pickHost.appendChild($('picker'));
  if (t !== 'inventory') closeItemCard();
  if (t === 'crash') sizeCrashCanvas();
  // Кнопки открытия и «Курса огурцов» обновляем при каждом переходе: пока шла анимация на другой
  // вкладке (busy), setBal мог выключить их, а включить обратно было некому.
  if (t === 'cases') updateOpenButton(); // заодно перемерит подсказку, измеренную на скрытой вкладке
  if (t === 'crash') updateCrashButton();
  if (t === 'upgrade') renderUpgrade(); // доплата и шанс зависят от баланса, а он мог измениться
  if (t === 'contract') renderContract(); // предмет могли закрепить или продать на другой вкладке
  renderInventory();
  if (t === 'inventory') {
    renderMuseum();
    renderCraft();
  }
  if (t === 'cards') renderCards();
  updateCBar(); // липкая полоса контракта — только на его вкладке
  // Новая вкладка начинается сверху: если страница прокручена ниже полосы вкладок — возвращаемся к ней.
  const bar = $$('.tabs')[0];
  if (bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  tone(500, 0.04);
}
$$('.tabs .tab').forEach((b) => (b.onclick = () => goTab(b.dataset.tab)));

// Виден ли раздел инвентаря: невидимое не перерисовываем, его догонят goTab и setSub.
const subVisible = (sub) => tab === 'inventory' && !$('sub-' + sub).hidden;

function setSub(section) {
  if (busy) return;
  $$('#v-inventory .subnav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.sub === section));
  INV_SECTIONS.forEach((v) => ($('sub-' + v).hidden = v !== section));
  if (section !== 'items') closeItemCard();
  if (section === 'museum') renderMuseum();
  if (section === 'craft') {
    benchPickLimit = LIST_PAGE; // «Что положить» снова с первых видов
    renderCraft();
  }
  if (section === 'items') renderInvView();
  tone(560, 0.03);
}
$$('#v-inventory .subnav button').forEach((b) => (b.onclick = () => setSub(b.dataset.sub)));

function goSub(section) {
  goTab('inventory');
  setSub(section);
}
