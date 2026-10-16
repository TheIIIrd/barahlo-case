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

/* Вкладки с клавиатуры, как принято у role="tab": стрелки влево и вправо — соседняя вкладка (по кругу),
   Home и End — первая и последняя. Вкладка сразу открывается, фокус переходит на неё. */
document.addEventListener('keydown', (e) => {
  const t = e.target.closest && e.target.closest('[role="tab"]');
  if (!t || e.altKey || e.ctrlKey || e.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const all = $$('[role="tab"]', t.closest('[role="tablist"]'));
  const i = all.indexOf(t);
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
  e.preventDefault();
  if (busy) return; // во время анимации вкладки не переключаются
  all[j].click();
  all[j].focus();
});

/* Карточки предмета и карты на узком экране — шторки поверх страницы. Открыта с клавиатуры — фокус сразу в неё,
   а Tab ходит по её кнопкам по кругу, как в окне: иначе он уходил бы по скрытому под шторкой. У карты фокус — на ✕:
   повторный Enter закрывает её и возвращает на карту, как повторное нажатие на саму карту. На широком экране
   карточка — обычная панель сбоку, там ничего не меняем. */
const SHEET_MQ = matchMedia('(max-width: 860px)');
const sheetFocusable = (box) => $$('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])', box)
  .filter((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
function focusSheet(box, e) {
  if (!SHEET_MQ.matches || !e || e.detail !== 0 || !box.classList.contains('show')) return;
  sheetFocusable(box).find((x) => x.classList.contains('close'))?.focus({ preventScroll: true });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !SHEET_MQ.matches) return;
  const box = e.target.closest && e.target.closest('.detail.show, .cdetail.show');
  if (!box) return;
  const f = sheetFocusable(box);
  if (!f.length) return;
  if (e.shiftKey && e.target === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && e.target === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
});
