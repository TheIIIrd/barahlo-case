/* ==========================================================================
   Запуск: клавиатура, первая отрисовка, фоновые таймеры
   Подключается последним: к этому моменту объявлено всё из остальных файлов.
   ========================================================================== */
'use strict';

/* ==========================================================================
   Клавиатура
   ========================================================================== */

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !$('elsewhere').hidden) return;
  if (albumPick && tab === 'cards' && !anyModalOpen()) {
    closeAlbumCard();
    return;
  }
  if (invUi.open && !anyModalOpen()) {
    closeItemCardView();
    return;
  }
  if (!$('drop').hidden) $('dKeep').click();
  else if (!$('multi').hidden) $('mKeep').click();
  else if (!$('granny').hidden) $('gOk').click();
  else if (!$('ask').hidden) $('aNo').click();
  else if (!$('forgeRes').hidden) $('frOk').click();
});

/* ==========================================================================
   Запуск
   ========================================================================== */

function renderAll() {
  renderContents();
  renderMuseum();
  renderCraft();
  renderLevel();
  renderCases();
  updateOpenButton();
  renderStats();
  renderInventory();
  renderContract();
  renderUpgrade();
  renderCrashHistory();
  updateCrashButton();
  renderCards();
}

$('tagline').textContent =
  `${CASES.length} ${plural(CASES.length, 'кейс', 'кейса', 'кейсов')}, Музей, ` +
  `${RECIPES.length} ${plural(RECIPES.length, 'рецепт', 'рецепта', 'рецептов')}, ` +
  `${CATALOG.length} ${plural(CATALOG.length, 'бесполезная вещь', 'бесполезные вещи', 'бесполезных вещей')}, ` +
  `${CARDS.length} ${plural(CARDS.length, 'карта', 'карты', 'карт')} · шансы опубликованы ниже`;


for (let i = 0; i < 10; i++) feedPush();
(function feedLoop() {
  feedPush();
  setTimeout(feedLoop, 900 + Math.random() * 2600);
})();

// Залы, набравшие половину до 1.4.0, отмечаем без праздника — поздравление только за новые.
function firstRender() {
  ROOMS.forEach((c) => { if (roomHalf(c)) state.museumHalf[c.id] = true; });
  renderAll();
  renderArena();
  renderSaves();
}
try {
  firstRender();
} catch (e) {
  // Сохранение загрузилось, но игра на нём падает — откладываем его и берём запасную копию.
  recoverBrokenSave(e);
  try {
    firstRender();
  } catch (e2) {
    // Не помогла и копия — начинаем заново. Сломанное сохранение уже отложено.
    console.error(e2);
    state = freshState();
    restoreNotes.length = 0;
    restoreNotes.push('Ни сохранение, ни запасная копия не загрузились, игра начата заново.');
    firstRender();
  }
}

// Опыт за открытие, прерванное перезагрузкой, мог дотянуть до нового уровня — выдаём его сразу.
if (state.xp >= xpNeed(state.lvl)) levelUp();

// Фоновые таймеры — когда загружены все файлы.
setInterval(tickCases, 500);
setInterval(grannyDecide, GRANNY_CHECK_MS);
setInterval(grannyDoor, 250);

if (restoreNotes.length) {
  save();
  setTimeout(() => toast(restoreNotes.join('. ') + '.', 5000, { important: true }), 600);
}

// Всё загружено и нарисовано — включаем клики (до этого их гасит styles/base.css).
document.documentElement.classList.add('ready');
