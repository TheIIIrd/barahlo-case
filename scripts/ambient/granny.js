/* ==========================================================================
   Бабушка-коллектор
   ========================================================================== */
'use strict';

// Визит: сначала забирает наличные, потом — предмет, который покрывает остаток долга
// (самый дешёвый из таких, иначе самый дорогой). Если брать нечего — оставляет пирожок.
function grannyVisit() {
  const parts = [];

  const cash = r2(Math.min(state.debt, Math.max(0, state.bal)));
  if (cash >= 0.01) {
    state.debt = r2(state.debt - cash);
    setBal(-cash);
    parts.push(`Пересчитала наличные и забрала ${fmt(cash)}.`);
  }

  if (state.debt > 0) {
    const sellable = state.inv.filter((x) => x.price > 0).sort((a, b) => a.price - b.price);
    const take = sellable.find((x) => x.price >= state.debt) || sellable[sellable.length - 1];
    if (take) {
      removeItem(take);
      const off = r2(Math.min(state.debt, take.price));
      state.debt = r2(state.debt - off);
      parts.push(`Денег не хватило, поэтому унесла «${take.name}» (${fmt(take.price)}) и списала ${fmt(off)}.` +
        (take.price > off ? ' Сдачу не дала.' : ''));
    }
  }

  let text;
  if (!parts.length) {
    const pie = makeItem(CASES.find((c) => c.id === 'fridge'), 0, 0.01);
    Object.assign(pie, {
      special: true, idx: -1, name: 'Пирожок с капустой', stat: false, ic: '🥟',
      lore: 'Бабушкин. Горячий. Бесценный.', r: 2, base: 60, price: 60,
    });
    state.inv.push(pie);
    text = 'Забирать нечего. Бабушка вздохнула, погладила по голове и оставила горячий пирожок.';
  } else {
    const flavor = pick([
      'Сказала, что в её время кейсов не было.', 'Оставила тарелку супа.', 'Перекрестила монитор.',
      'Пообещала вернуться.', 'Спросила, когда ты уже женишься.',
    ]);
    text = parts.join(' ') + ' ' + (state.debt ? `Осталось ${fmt(state.debt)}.` : 'Долг закрыт.') + ' ' + flavor;
  }

  $('gText').textContent = text;
  $('granny').hidden = false;
  tone(200, 0.4, 'sawtooth', 0.06);
  shake();
  renderAll();
  $('gOk').focus({ preventScroll: true });
}
$('gOk').onclick = () => ($('granny').hidden = true);

/* Две вкладки. Браузер присылает событие storage, когда сохранение меняет ДРУГАЯ вкладка.
   Тогда эта вкладка перестаёт сохранять и просит обновиться: прогресс не затрётся молча.
   Фоновые таймеры (заряды, бафф, решение бабушки) в скрытой вкладке не пишут, чтобы она
   не перехватывала игру у вкладки, в которой играют. */
addEventListener('storage', (e) => {
  if (e.storageArea !== localStorage || (e.key !== SAVE_KEY && e.key !== null)) return;
  saveLocked = true;
  $('elsewhere').hidden = false;
  $('eReload').focus({ preventScroll: true });
});
$('eReload').onclick = () => location.reload();

// Раз в 20 секунд (GRANNY_CHECK_MS) при долге от 150 ₽ бабушка с шансом 28% решает прийти.
function grannyDecide() {
  if (document.hidden || saveLocked || state.debt < GRANNY_DEBT || state.grannyDue) return;
  if (rnd() < GRANNY_CHANCE) {
    state.grannyDue = true;
    save();
    renderDebt();
  }
}

// Решила прийти — ждёт конца открытия, стоит у двери GRANNY_DOOR_MS и заходит. Проверка раз в 250 мс.
let grannyEntersAt = null;
function grannyDoor() {
  if (document.hidden || saveLocked) return; // бабушка приходит, только когда на игру смотрят
  if (!state.grannyDue) { grannyEntersAt = null; return; }
  if (state.debt < GRANNY_DEBT) {
    state.grannyDue = false;
    grannyEntersAt = null;
    save();
    renderDebt();
    return;
  }
  if (busy || anyModalOpen() || crash.state === 'run') { grannyEntersAt = null; return; }
  if (!grannyEntersAt) {
    grannyEntersAt = Date.now() + GRANNY_DOOR_MS;
    toast('Бабушка стоит у двери… 👵', GRANNY_DOOR_MS, { important: true });
    renderDebt();
    return;
  }
  if (Date.now() >= grannyEntersAt) {
    state.grannyDue = false;
    grannyEntersAt = null;
    grannyVisit();
    save();
    renderDebt();
  }
}
