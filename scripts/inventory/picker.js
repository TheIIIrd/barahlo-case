/* ==========================================================================
   Инвентарь: выбор предметов для контракта и апгрейда
   ========================================================================== */
'use strict';

let contractItems = [];
let contractMega = false; // рубильник: обычный контракт (10 одной редкости) или мегаконтракт (до 100 любых)
let megaTarget = '';      // мегаконтракт нацелен на кейс (id) или на любой ('')

// Предметы, занятые где-то ещё: верстак, контракт (или мегаконтракт), ставка апгрейда. Кузня и
// заполнение контрактов их не трогают. bench объявлен в workshop.js — зовётся только во время игры.
const takenItems = () => new Set([...bench, ...contractItems, upgradeStake].filter(Boolean));
let upgradeStake = null;
let upgradeMult = 2;

/* Предмет лежит только в одном месте: верстак, контракт или ставка апгрейда. Кладём в новое место —
   убираем из прежнего и говорим об этом, чтобы одно действие не съело то, что показано в другом. */
function claimItem(it, place) {
  const from = [];
  if (place !== 'bench' && bench.includes(it)) { bench = bench.filter((x) => x !== it); from.push('с верстака'); }
  if (place !== 'contract' && contractItems.includes(it)) { contractItems = contractItems.filter((x) => x !== it); from.push('из контракта'); }
  if (place !== 'upgrade' && upgradeStake === it) { upgradeStake = null; from.push('со ставки апгрейда'); }
  if (from.length) toast(`Предмет «${baseName(it)}» переложен ${from.join(' и ')}.`, 2600);
}
let upgradeAdd = 0; // доплата деньгами к ставке апгрейда

function pickerList() {
  const list = state.inv.slice();
  const order = $('sort').value;
  if (order === 'price') list.sort((x, y) => y.price - x.price);
  else if (order === 'rar') list.sort((x, y) => y.r - x.r || y.price - x.price);
  else list.reverse();
  return list;
}
// Сколько плиток выбора показано: по LIST_PAGE, дальше — «Показать ещё». Сбрасывается сортировкой и переходом на вкладку.
let pickLimit = LIST_PAGE;
// Блок «Из дальней части списка»: выбранные предметы за пределами показанного. Состав блока держится, пока
// выбираешь: снятый предмет остаётся в нём обычной плиткой — соседние не съезжают под пальцем.
let pickFar = [];
const resetPickPage = () => { pickLimit = LIST_PAGE; pickFar = []; };
$('sort').onchange = () => { resetPickPage(); renderPicker(); };

function renderPicker() {
  const fk = focusKey($('picker'));
  try { renderPickerNow(); } finally { restoreFocus(fk); }
}
function renderPickerNow() {
  $('cFill').hidden = tab !== 'contract'; // чипы быстрого заполнения — только у контракта
  if (tab === 'contract') renderContractFill();
  const grid = $('inv');
  $('invSum').textContent = `${state.inv.length} ${plural(state.inv.length, 'предмет', 'предмета', 'предметов')} · ${fmtShort(sum(state.inv, (x) => x.price))}`;
  $('invHint').textContent = tab === 'contract' && contractMega
    ? `Выбрано ${contractItems.length} из ${MEGA_MAX} · любая редкость, без закреплённых · нужно от ${MEGA_MIN}`
    : tab === 'contract'
    ? (contractItems.length
      ? `Выбрано ${contractItems.length} из 10 · только «${RARITY[contractItems[0].r].n}»`
      : 'Нажми на предметы одной редкости (кроме ★) — нужно 10')
    : 'Нажми на предмет, чтобы поставить его на апгрейд';
  if ($('picker').hidden) return; // сетку рисуем, только когда её видно (goTab перерисует при открытии)

  if (!state.inv.length) {
    grid.innerHTML = '<span class="empty">Инвентарь пуст. Открой пару кейсов.</span>';
    return;
  }

  const rarity = contractItems.length ? contractItems[0].r : null;
  const list = pickerList();
  const shown = list.slice(0, pickLimit);
  // Выбранные, что лежат дальше показанного (например, «Дешёвое» взяло их из конца списка), — отдельно в конце:
  // их видно и можно снять, а плитки выше не сдвигаются.
  const chosen = new Set(tab === 'contract' ? contractItems : [upgradeStake].filter(Boolean));
  const shownSet = new Set(shown);
  if (!chosen.size) pickFar = []; // ничего не выбрано (очистили, подписали) — блок больше не нужен
  const inv = new Set(list);
  pickFar = pickFar.filter((x) => inv.has(x) && !shownSet.has(x)); // ушедшие из инвентаря и попавшие в показанное
  const farSet = new Set(pickFar);
  pickFar.push(...list.filter((x) => chosen.has(x) && !shownSet.has(x) && !farSet.has(x))); // новые — в конец
  const extra = pickFar;
  const tile = (x, k) => {
    let cls = 'inv-item';
    if (tab === 'contract' && contractMega) {
      if (chosen.has(x)) cls += ' sel';
      else if (x.lock || contractItems.length >= MEGA_MAX) cls += ' dim';
    } else if (tab === 'contract') {
      if (chosen.has(x)) cls += ' sel';
      else if (x.lock || x.r >= 6 || (rarity !== null && x.r !== rarity) || contractItems.length >= 10) cls += ' dim';
    } else {
      if (upgradeStake === x) cls += ' sel';
      if (x.price <= 0 || x.lock) cls += ' dim';
    }
    return `
      <button class="${cls}" type="button" data-u="${x.uid}"${cls.includes(' dim') ? ' aria-disabled="true"' : ''}
        style="--c:${RARITY[x.r].c};${k > 8 ? 'animation:none' : ''}" title="${x.name} · ${x.wear}">
        ${x.stat ? '<span class="st">СЧ™</span>' : ''}<span class="ic">${x.ic}</span>${baseName(x)}
        <span class="p${x.price < 0 ? ' neg' : ''}" title="${fmt(x.price)}">${fmtShort(x.price)}</span>
      </button>`;
  };
  grid.innerHTML = shown.map(tile).join('') +
    (extra.length ? `<p class="pick-sep">Из дальней части списка:</p>${extra.map((x) => tile(x, 99)).join('')}` : '') +
    moreButtonHTML('pkMore', list.length - shown.length - extra.length, LIST_PAGE, list.length);
  if ($('pkMore')) {
    $('pkMore').onclick = () => {
      const from = pickLimit;
      pickLimit += LIST_PAGE;
      pickFar = []; // список перестроится: выбранные из нового куска встанут на свои места
      showMore('pkMore', renderPicker, grid, '.inv-item', from);
    };
  }

  $$('.inv-item', grid).forEach((b) => (b.onclick = () => {
    pickerClick(state.inv.find((x) => x.uid === +b.dataset.u), b);
  }));
}

function pickerClick(it, el) {
  if (!it || busy) return;
  if (tab === 'contract') {
    if (el.classList.contains('dim')) return;
    const i = contractItems.indexOf(it);
    if (i >= 0) contractItems.splice(i, 1);
    else {
      claimItem(it, 'contract');
      contractItems.push(it);
    }
    tone(800, 0.04);
    renderContract();
    renderPicker();
  } else if (tab === 'upgrade') {
    if (it.price <= 0) {
      toast('Предмет с минусом апгрейдить нельзя — только выбросить.');
      return;
    }
    if (it.lock) { toast('Закреплённое не ставится на апгрейд — сначала открепи в инвентаре.'); return; }
    if (upgradeStake === it) upgradeStake = null;
    else {
      claimItem(it, 'upgrade');
      upgradeStake = it;
    }
    tone(800, 0.04);
    renderUpgrade();
    renderPicker();
  }
}
