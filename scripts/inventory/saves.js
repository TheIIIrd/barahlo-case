/* ==========================================================================
   Сохранения: файл с прогрессом, загрузка из файла, запасная копия
   ========================================================================== */
'use strict';

/* Файл сохранения — одна строка: «KSB1:» + base64 от JSON + «.» + контрольная сумма.
   Base64 не даёт поправить баланс в блокноте, а контрольная сумма отсекает изменённые и
   битые файлы. От упорного взломщика это не защита (всё считается в браузере), от случайной
   правки и «чуть-чуть подкрутить» — да.

   Перед загрузкой чужого файла и перед «Начать жизнь заново» текущий прогресс уходит в
   запасную копию (localStorage, ключ BACKUP_KEY), а прежняя копия — в BACKUP_OLD_KEY: две загрузки
   подряд не теряют исходный прогресс. Нетронутую новую игру не копируем — затёрли бы настоящую копию.
   Кнопка «Вернуть прежнее» меняет текущий прогресс и копию местами (или берёт копию постарше). */
const SAVE_FILE_TAG = 'KSB1:';
const SAVE_FILE_SALT = 'барахло-не-трогать';

// cyrb53 — короткий быстрый хэш строки (общественное достояние).
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// base64 для текста в UTF-8 (btoa понимает только латиницу). Кусками — длинный инвентарь не упрётся в лимит аргументов.
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Текущее сохранение в том же сжатом виде, что пишет save().
const currentSave = () => JSON.parse(JSON.stringify(state, saveReplacer));

function encodeSave(save) {
  const body = toBase64(JSON.stringify({ game: 'junkcase', v: 1, at: Date.now(), save }));
  return SAVE_FILE_TAG + body + '.' + cyrb53(SAVE_FILE_SALT + body);
}

// Разбор файла. Возвращает { save, at } или бросает ошибку с понятным текстом.
function decodeSave(text) {
  const s = String(text).trim();
  if (!s.startsWith(SAVE_FILE_TAG)) throw new Error('Это не файл сохранения «Кейсов с Барахлом».');
  const dot = s.lastIndexOf('.');
  const body = s.slice(SAVE_FILE_TAG.length, dot);
  if (dot < 0 || cyrb53(SAVE_FILE_SALT + body) !== s.slice(dot + 1)) {
    throw new Error('Файл повреждён или изменён вручную — загрузить его нельзя.');
  }
  let data;
  try { data = JSON.parse(fromBase64(body)); } catch (_) { throw new Error('Файл повреждён — загрузить его нельзя.'); }
  if (!data || data.game !== 'junkcase' || data.v !== 1 || !saveLooksValid(data.save)) {
    throw new Error('В файле что-то не так с прогрессом — загрузить его нельзя.');
  }
  return { save: cleanImported(data.save), at: data.at };
}

/* Проверка здравого смысла: всё, без чего игра не загрузится, на месте и нужного типа.
   Соль и хэш видны в коде, так что подделать контрольную сумму можно, — поэтому файл проверяем
   ещё и по содержимому. Текст обычных предметов (название, иконка, описание, износ) из файла
   не берём вовсе: игра восстановит его из каталога. Текст особых предметов (пирожок бабушки)
   допускаем только простой — без разметки. */
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isPlainText = (x) => typeof x === 'string' && x.length <= 300 && !/[<>&"'`]/.test(x);
const optNum = (x) => x === undefined || x === null || isNum(x);
function itemLooksValid(it) {
  if (!isObj(it) || !isNum(it.price) || !Number.isInteger(it.r) || it.r < 0 || it.r >= RARITY.length) return false;
  if (!optNum(it.uid) || !optNum(it.base) || !optNum(it.noise) || !optNum(it.t)) return false;
  if (it.float !== undefined && !(isNum(it.float) && it.float >= 0 && it.float <= 1)) return false;
  const c = ROOM_BY_ID.get(it.caseId);
  if (!c) return false;
  if (it.special) return isPlainText(it.name) && [it.ic, it.lore, it.wear].every((x) => x === undefined || isPlainText(x));
  if (it.idx !== undefined) return Number.isInteger(it.idx) && it.idx >= 0 && it.idx < c.items.length;
  return isPlainText(it.name) && idxOf(it) >= 0; // у совсем старых сохранений индекса нет — ищем по названию
}
function saveLooksValid(s) {
  if (!isObj(s) || !isNum(s.bal) || !Array.isArray(s.inv)) return false;
  if (s.v !== undefined && !(Number.isInteger(s.v) && s.v >= 1 && s.v <= SAVE_READABLE)) return false; // из новой версии игры — не грузим
  for (const k of ['debt', 'uid', 'opened', 'spent', 'earn', 'xp', 'lvl', 'freeStore', 'freeTick', 'contracts', 'upgrades',
    'crafts', 'crashNet', 'museumSpent', 'restos', 'restoSpent', 'pendingBet', 'pendingXp', 'forged', 'forgeLost', 'btWins', 'btLosses']) {
    if (!optNum(s[k])) return false;
  }
  if ((s.debt || 0) < 0 || (s.pendingBet || 0) < 0 || (s.pendingXp || 0) < 0 || (s.xp || 0) < 0) return false;
  if (s.lvl !== undefined && !(Number.isInteger(s.lvl) && s.lvl >= 1 && s.lvl <= LVL_SANE)) return false;
  // Опыт с запасом на одно прерванное действие, но не «бесконечный»: иначе подсчёт уровней повесил бы игру.
  if ((s.xp || 0) > xpNeed(s.lvl || 1) * 10 + 1e6 || (s.pendingXp || 0) > 1e6) return false;
  for (const k of ['tokens', 'recipes', 'museum', 'museumHalf', 'museumDone', 'buffs', 'cards', 'cardsEver', 'forgeFails', 'hurt']) {
    if (s[k] !== undefined && !isObj(s[k])) return false;
  }
  for (const k of ['rc', 'chist']) {
    if (s[k] !== undefined && !(Array.isArray(s[k]) && s[k].every(isNum))) return false;
  }
  if (s.rc !== undefined && s.rc.length !== RARITY.length) return false;
  const counts = (o) => !o || Object.values(o).every((n) => Number.isInteger(n) && n >= 0);
  if (!counts(s.tokens) || !counts(s.cards) || !counts(s.forgeFails) || !counts(s.hurt)) return false;
  for (const k of ['forged', 'forgeLost', 'btWins', 'btLosses']) {
    if (s[k] !== undefined && !(Number.isInteger(s[k]) && s[k] >= 0)) return false;
  }
  if (s.cardsEver && !Object.values(s.cardsEver).every((v) => v === true)) return false;
  if (s.cards && !Object.keys(s.cards).every((id) => s.cardsEver && s.cardsEver[id])) return false;
  // Карты — только существующие: id попадают в разметку.
  for (const k of ['cards', 'cardsEver', 'forgeFails', 'hurt']) {
    if (s[k] && !Object.keys(s[k]).every((id) => CARD_BY_ID.has(id))) return false;
  }
  // Бои (с 1.15.0): колода — id карт, сам бой и следующий соперник — по своим проверкам (scripts/battle).
  if (s.deck !== undefined && !(Array.isArray(s.deck) && s.deck.length <= BT.DECK && s.deck.every((id) => CARD_BY_ID.has(id)))) return false;
  if (s.battle !== undefined && s.battle !== null && !btLooksValid(s.battle)) return false;
  if (s.btNext !== undefined && s.btNext !== null && !btNextLooksValid(s.btNext)) return false;
  if (s.best !== undefined && s.best !== null && !(isObj(s.best) && isNum(s.best.price) && isPlainText(s.best.name))) return false;
  if (s.pending !== undefined && !(Array.isArray(s.pending) && s.pending.every(itemLooksValid))) return false;
  // Экспонат лежит под ключом «кейс|индекс» своего же предмета.
  const museumOk = Object.entries(s.museum || {}).every(([k, it]) => itemLooksValid(it) && !it.special &&
    k === museumKey(it.caseId, idxOf(it)));
  return museumOk && s.inv.every(itemLooksValid);
}

// Из файла берём только числа и ключи; текст обычных предметов и износ игра восстановит сама (hydrate).
function cleanImported(save) {
  const strip = (it) => {
    if (!it.special) {
      it.idx = idxOf(it);
      it.stat = !!it.stat || (typeof it.name === 'string' && it.name.startsWith(STAT_TRAK));
      delete it.name;
      delete it.ic;
      delete it.lore;
    }
    if (typeof it.float !== 'number') it.float = 0.5;
    delete it.wear;
  };
  save.inv.forEach(strip);
  Object.values(save.museum || {}).forEach(strip);
  (save.pending || []).forEach(strip);
  return save;
}

// Нетронутая игра: ничего не открыто, не собрано и не занято. Её в запасную копию не кладём.
const isFreshGame = () => !state.opened && !state.inv.length && !Object.keys(state.museum).length &&
  !Object.keys(state.cardsEver).length && state.lvl === 1 && !state.xp && state.bal === freshState().bal && !state.debt;

// Краткая сводка для окна подтверждения.
function saveSummary(s) {
  const items = s.inv.length;
  const ex = Object.keys(s.museum || {}).length;
  const cards = Object.keys(s.cardsEver || {}).length;
  return `баланс ${fmtShort(s.bal)}, ${s.lvl || 1}-й уровень, ${items} ${plural(items, 'предмет', 'предмета', 'предметов')}` +
    `, ${ex} ${plural(ex, 'экспонат', 'экспоната', 'экспонатов')} в Музее` +
    (cards ? `, ${cards} ${plural(cards, 'карта', 'карты', 'карт')} в коллекции` : '');
}
const fmtDate = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const saveFileName = () => `kejsy-s-barahlom-${new Date().toISOString().slice(0, 10)}.txt`;

function readBackup(key = BACKUP_KEY) {
  try {
    const b = JSON.parse(localStorage.getItem(key) || 'null');
    return b && saveLooksValid(b.save) ? b : null;
  } catch (_) { return null; }
}

/* Убрать текущий прогресс в запасную копию. rotate — прежняя копия сдвигается в BACKUP_OLD_KEY
   (загрузка, сброс, «взять постарше»); без него копия просто заменяется (обмен «Вернуть прежнее»:
   прежняя копия как раз становится текущей игрой). Не влезло в память браузера — отдаём файлом. */
function backupCurrent(rotate = true) {
  if (isFreshGame()) return true; // копировать нечего, а настоящую копию затёрли бы
  const save = currentSave();
  let prevOld = null, shifted = false;
  try {
    const last = rotate ? readBackup() : null;
    if (last && JSON.stringify(last.save) === JSON.stringify(save)) return true; // эта игра уже в копии
    if (last) {
      prevOld = localStorage.getItem(BACKUP_OLD_KEY);
      localStorage.setItem(BACKUP_OLD_KEY, localStorage.getItem(BACKUP_KEY));
      shifted = true;
    }
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: Date.now(), save }));
    return true;
  } catch (_) {
    // Сдвиг уже затёр копию постарше, а новая не легла — возвращаем ту на место, не вышло — тоже файлом.
    if (shifted && prevOld) {
      try { localStorage.setItem(BACKUP_OLD_KEY, prevOld); } catch (_) {
        try { downloadText(saveFileName(), encodeSave(JSON.parse(prevOld).save)); } catch (_) { /* битая — нечего спасать */ }
      }
    }
    downloadText(saveFileName(), encodeSave(currentSave()));
    toast('Запасной копии не хватило места в браузере — она скачана файлом.', 4000, { important: true });
    return false;
  }
}

// Записать сохранение и перезапустить игру с ним. Таймеры этой вкладки больше ничего не пишут.
function writeSaveAndReload(save) {
  const done = writeSave(JSON.stringify(save));
  if (!done) {
    toast('Браузеру не хватает места для этого сохранения. Текущий прогресс не тронут.', 5000, { important: true });
    sad();
    return;
  }
  saveLocked = true;
  reloading = true;
  busy = true; // до перезагрузки ничего не нажать: всё равно не сохранится
  // Пришлось отдать запасную копию файлом — даём скачиванию начаться до перезагрузки.
  const delay = done === 'freed' ? 1500 : 0;
  if (delay) toast('Места в браузере мало: запасная копия скачана файлом.', delay + 1000, { important: true });
  else toast('Сохранение загружается…', 3000);
  // Два кадра на то, чтобы окно «Точно?» закрылось на экране: иначе оно висело до самой перезагрузки.
  // В скрытой вкладке кадров нет — тогда перезапускает запасной таймер.
  let gone = false;
  const go = () => { if (!gone) { gone = true; location.reload(); } };
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(go, delay)));
  setTimeout(go, delay + 500);
}

// Окно «Точно?». Возвращает обещание: true — согласился, false — передумал.
// alt — третья кнопка (необязательная): тогда обещание вернёт 'alt'.
function ask({ icon, title, html, ok, alt }) {
  return new Promise((resolve) => {
    $('aIcon').textContent = icon;
    $('aTitle').textContent = title;
    $('aText').innerHTML = html;
    $('aOk').textContent = ok;
    $('aAlt').hidden = !alt;
    $('aAlt').textContent = alt || '';
    $('ask').hidden = false;
    $('aNo').focus({ preventScroll: true });
    const done = (yes) => {
      $('ask').hidden = true;
      $('aOk').onclick = $('aNo').onclick = $('aAlt').onclick = null;
      resolve(yes);
    };
    $('aOk').onclick = () => done(true);
    $('aAlt').onclick = () => done('alt');
    $('aNo').onclick = () => done(false);
  });
}

// Пока идёт анимация или раунд «Курса огурцов», с сохранениями не играем.
let reloading = false; // игра уже перезапускается с новым сохранением
function savesBlocked() {
  if (reloading) return true;
  if (saveLocked) { $('elsewhere').hidden = false; return true; } // в памяти устаревшая игра — её не копируем
  if (busy) { toast('Дождись конца анимации.'); return true; }
  if (crash.state !== 'idle') { toast('Дождись конца раунда «Курса огурцов».'); return true; }
  return false;
}

$('saveOut').onclick = () => {
  if (savesBlocked()) return;
  downloadText(saveFileName(), encodeSave(currentSave()));
  toast('Файл сохранения скачан. Загрузить его можно здесь же, на любом устройстве.', 3200);
};

// Из полосы «Прогресс не сохраняется» — скачать можно даже посреди анимации: недоигранное
// (pending) лежит в сохранении и вернётся при загрузке.
$('saveFailOut').onclick = () => {
  downloadText(saveFileName(), encodeSave(currentSave()));
  toast('Файл сохранения скачан. Освободи место: продай или выброси часть инвентаря.', 4200);
};

$('saveIn').onclick = () => {
  if (savesBlocked()) return;
  $('saveFile').value = '';
  $('saveFile').click();
};

$('saveFile').onchange = async () => {
  const file = $('saveFile').files[0];
  if (!file || savesBlocked()) return;
  let loaded;
  try {
    if (file.size > 20e6) throw new Error('Файл слишком большой для сохранения.');
    loaded = decodeSave(await file.text());
  } catch (e) {
    toast(e.message, 4200, { important: true });
    sad();
    return;
  }
  const yes = await ask({
    icon: '📂',
    title: 'Загрузить сохранение?',
    html: `В файле${loaded.at ? ' от ' + fmtDate(loaded.at) : ''}: <b>${saveSummary(loaded.save)}</b>.<br><br>` +
      (isFreshGame()
        ? 'Текущая игра только начата — запасная копия останется прежней.'
        : `Сейчас у тебя ${saveSummary(currentSave())}. Этот прогресс не пропадёт: он станет запасной копией, ` +
          'и его можно будет вернуть кнопкой «Вернуть прежнее».'),
    ok: 'Загрузить',
  });
  if (!yes || savesBlocked()) return;
  backupCurrent();
  writeSaveAndReload(loaded.save);
};

$('saveBack').onclick = async () => {
  if (savesBlocked()) return;
  // Последняя копия могла уйти файлом (кончилось место) — тогда главной считаем ту, что постарше.
  const old = readBackup(BACKUP_OLD_KEY);
  const b = readBackup() || old;
  if (!b) { renderSaves(); return; }
  // Копия постарше, совпадающая с текущей игрой (её только что вернули), — не предлагаем.
  const older = b !== old && old && JSON.stringify(old.save) !== JSON.stringify(currentSave()) ? old : null;
  const now = isFreshGame()
    ? 'Текущая игра только начата, копировать её не нужно.'
    : `Текущий прогресс (${saveSummary(currentSave())}) станет запасной копией — передумаешь, вернёшь обратно.`;
  const yes = await ask({
    icon: '↩️',
    title: 'Вернуть прежний прогресс?',
    html: `Запасная копия от ${fmtDate(b.at)}: <b>${saveSummary(b.save)}</b>.<br>` +
      (older ? `Есть и копия постарше, от ${fmtDate(older.at)}: <b>${saveSummary(older.save)}</b>.<br>` : '') +
      '<br>' + now,
    ok: 'Вернуть',
    alt: older ? 'Взять постарше' : '',
  });
  if (!yes || savesBlocked()) return;
  const pick = yes === 'alt' ? older : b;
  // Обмен с последней копией — без сдвига (она и становится игрой); копия постарше — со сдвигом, чтобы
  // последняя копия не пропала.
  backupCurrent(pick !== b || b === old);
  writeSaveAndReload(pick.save);
};

// Отдать файлом то, что лежит в браузере под ключом key: запасную копию или отложенное сохранение.
function stashToFile(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return;
  let data = null;
  try { data = JSON.parse(raw); } catch (_) { /* не JSON — отдадим как есть */ }
  const save = (key === BACKUP_KEY || key === BACKUP_OLD_KEY) && data ? data.save : data;
  const suffix = { [BROKEN_KEY]: '-otlozhennoe', [BROKEN2_KEY]: '-otlozhennoe-2', [BACKUP_KEY]: '-kopiya', [BACKUP_OLD_KEY]: '-kopiya-2' }[key];
  const name = saveFileName().replace('.txt', suffix + '.txt');
  downloadText(name, save ? encodeSave(save) : raw);
}

// Сохранение, на котором игра не запустилась (state.js), — отдаём файлом и убираем из браузера.
$('saveBroken').onclick = () => {
  for (const key of [BROKEN_KEY, BROKEN2_KEY]) {
    stashToFile(key);
    try { localStorage.removeItem(key); } catch (_) { /* ничего */ }
  }
  renderSaves();
  toast('Несработавшее сохранение скачано. Загрузить его можно будет снова, когда игру обновят.', 4200);
};

// Кнопка «Вернуть прежнее» видна, только когда есть запасная копия, «Скачать несработавшее» — когда
// есть отложенное сохранение. Меняются они редко (сброс, загрузка, запуск), поэтому проверяем не на
// каждой отрисовке, а при запуске (main.js) и после этих действий.
function renderSaves() {
  $('saveBack').hidden = !readBackup() && !readBackup(BACKUP_OLD_KEY);
  let broken = false;
  try { broken = localStorage.getItem(BROKEN_KEY) !== null || localStorage.getItem(BROKEN2_KEY) !== null; } catch (_) { /* хранилище недоступно */ }
  $('saveBroken').hidden = !broken;
}
