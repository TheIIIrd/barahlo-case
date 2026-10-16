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
  if (albumPick && tab === 'cards' && cardsSub === 'album' && !anyModalOpen()) {
    closeAlbumCard();
    return;
  }
  if (btPrePick !== null && tab === 'cards' && cardsSub === 'battle' && !state.battle && !anyModalOpen()) {
    closeBtPreCard();
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
  else if (!$('btEnd').hidden && !$('beOk').disabled) $('beOk').click();
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
  if (!document.hidden) feedPush(); // в скрытой вкладке лента стоит: незачем перерисовывать то, чего не видно
  setTimeout(feedLoop, 900 + Math.random() * 2600);
})();

// Новая версия игры установилась (service worker сменился) — эта вкладка ещё на старой: говорим, что она включится
// после перезагрузки. Первая установка (контроллера ещё не было) — молчим.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () =>
    toast('Загружена новая версия игры. Она включится после перезагрузки страницы.', 6000, { important: true }), { once: true });
}

// Залы, набравшие половину до 1.4.0, отмечаем без праздника — поздравление только за новые.
function firstRender() {
  ROOMS.forEach((c) => { if (roomHalf(c)) state.museumHalf[c.id] = true; });
  renderAll();
  renderArena();
  renderSaves();
}
/* Страница и скрипты из разных версий: сервис-воркер новой версии включился посреди загрузки, и к старой
   странице пришли новые скрипты (или наоборот). Игра на такой смеси падает, и сохранение отложилось бы как
   сломанное — хотя оно цело. Поэтому не рисуем, а один раз перезагружаемся: тогда всё придёт из одного кэша.
   BUILD — та же метка, что data-build у <html> в index.html (tools/check_site.py сверяет их). */
const BUILD = '1.21.3';
const buildMismatch = document.documentElement.dataset.build !== BUILD;
{
  let retried = false;
  try {
    retried = sessionStorage.getItem('junkcase_build_retry') === '1';
    if (buildMismatch && !retried) sessionStorage.setItem('junkcase_build_retry', '1');
    if (!buildMismatch) sessionStorage.removeItem('junkcase_build_retry');
  } catch (_) { retried = true; } // без sessionStorage не рискуем бесконечной перезагрузкой
  if (buildMismatch && !retried) {
    location.reload();
    throw new Error('Файлы игры из разных версий — перезагрузка'); // дальше main.js не выполняется
  }
}
try {
  firstRender();
} catch (e) {
  // Файлы разных версий и перезагрузка не помогла — сохранение не трогаем: оно цело, сломана сама страница.
  if (buildMismatch) {
    document.documentElement.classList.add('ready');
    toast('Файлы игры из разных версий. Закрой все вкладки игры и открой её снова — прогресс цел.', 10000, { important: true });
    throw e;
  }
  // Сохранение загрузилось, но игра на нём падает — откладываем его и берём запасную копию.
  recoverBrokenSave(e);
  btCheckLoaded(); // бой и колоду запасной копии проверяем так же, как основного сохранения
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
  setTimeout(() => toast(restoreNotes.join(' '), 5000, { important: true }), 600);
}

// Вкладка после перезапуска всегда «Кейсы» — прокрутку прежней страницы (длинного инвентаря) не восстанавливаем,
// иначе после загрузки сохранения игра открывалась посередине.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Всё загружено и нарисовано — показываем игру и включаем клики (до этого их прячет styles/base.css).
document.documentElement.classList.add('ready');
