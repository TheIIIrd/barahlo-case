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
let upgradeAdd = 0; // доплата деньгами к ставке апгрейда

function pickerList() {
  const list = state.inv.slice();
  const order = $('sort').value;
  if (order === 'price') list.sort((x, y) => y.price - x.price);
  else if (order === 'rar') list.sort((x, y) => y.r - x.r || y.price - x.price);
  else list.reverse();
  return list;
}
$('sort').onchange = () => renderPicker();

function renderPicker() {
  const fk = focusKey($('wrap'));
  try { renderPickerNow(); } finally { restoreFocus(fk); }
}
function renderPickerNow() {
  renderContractFill();
  const grid = $('inv');
  $('invSum').textContent = `${state.inv.length} ${plural(state.inv.length, 'предмет', 'предмета', 'предметов')} · ${fmtShort(sum(state.inv, (x) => x.price))}`;
  $('invHint').textContent = tab === 'contract' && contractMega
    ? `Выбрано ${contractItems.length} из ${MEGA_MAX} · любая редкость, без закреплённых · нужно от ${MEGA_MIN}`
    : tab === 'contract'
    ? (contractItems.length
      ? `Выбрано ${contractItems.length} из 10 · только «${RARITY[contractItems[0].r].n}»`
      : 'Нажимай на предметы одной редкости (кроме ★), нужно 10 штук')
    : 'Нажми на предмет, чтобы поставить его на апгрейд';
  if ($('picker').hidden) return; // сетку рисуем, только когда её видно (goTab перерисует при открытии)

  if (!state.inv.length) {
    grid.innerHTML = '<span class="empty">Пусто. Сначала открой пару кейсов.</span>';
    return;
  }

  const rarity = contractItems.length ? contractItems[0].r : null;
  grid.innerHTML = pickerList().map((x, k) => {
    let cls = 'inv-item';
    if (tab === 'contract' && contractMega) {
      if (contractItems.includes(x)) cls += ' sel';
      else if (x.lock || contractItems.length >= MEGA_MAX) cls += ' dim';
    } else if (tab === 'contract') {
      if (contractItems.includes(x)) cls += ' sel';
      else if (x.lock || x.r >= 6 || (rarity !== null && x.r !== rarity) || contractItems.length >= 10) cls += ' dim';
    } else {
      if (upgradeStake === x) cls += ' sel';
      if (x.price <= 0) cls += ' dim';
    }
    return `
      <button class="${cls}" type="button" data-u="${x.uid}"
        style="--c:${RARITY[x.r].c};${k > 8 ? 'animation:none' : ''}" title="${x.name} · ${x.wear}">
        ${x.stat ? '<span class="st">СЧ™</span>' : ''}<span class="ic">${x.ic}</span>${baseName(x)}
        <span class="p${x.price < 0 ? ' neg' : ''}" title="${fmt(x.price)}">${fmtShort(x.price)}</span>
      </button>`;
  }).join('');

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
    else contractItems.push(it);
    tone(800, 0.04);
    renderContract();
    renderPicker();
  } else if (tab === 'upgrade') {
    if (it.price <= 0) {
      toast('Предмет с отрицательной ценой апгрейдить нельзя. Только выбросить.');
      return;
    }
    upgradeStake = upgradeStake === it ? null : it;
    tone(800, 0.04);
    renderUpgrade();
    renderPicker();
  }
}
