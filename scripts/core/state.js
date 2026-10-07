/* ==========================================================================
   Состояние и сохранение
   ========================================================================== */
'use strict';

/* Версия формата сохранения. Растёт, когда меняется устройство сохранения (новые поля с особой
   миграцией): loadState дотягивает старые сохранения до текущей версии, а сохранение из более новой
   версии игры (откатились на старую) не грузит — откладывает, как сломанное, чтобы не испортить. */
const SAVE_VERSION = 2;

const freshState = () => ({
  v: SAVE_VERSION,
  bal: 100, debt: 0, inv: [], uid: 1,
  opened: 0, spent: 0, earn: 0, best: null, rc: [0, 0, 0, 0, 0, 0, 0],
  xp: 0, lvl: 1, tokens: {},
  freeStore: 1, freeTick: null,
  contracts: 0, upgrades: 0, crafts: 0, recipes: {},
  crashNet: 0, chist: [],
  museum: {}, museumHalf: {}, museumDone: {}, museumSpent: 0,
  restos: 0, restoSpent: 0,
  buffs: {}, contrast: false,
  pending: [], pendingBet: 0, pendingXp: 0, grannyDue: false,
  cards: {}, cardsEver: {}, forgeFails: {}, forged: 0, forgeLost: 0,
});

/* Сохранение. Название, иконку, описание и состояние износа у обычных предметов не пишем:
   они восстанавливаются из каталога и износа при загрузке (hydrate). Так сохранение почти вдвое
   меньше и дольше влезает в лимит localStorage. Если сохранить всё же не вышло, один раз предупреждаем. */
const SKIP_KEYS = new Set(['lore', 'wear', 'name', 'ic']);
const ROOM_BY_ID = new Map(ROOMS.map((c) => [c.id, c]));
// Пропускаем поле, только если предмет точно найдётся в каталоге при загрузке.
function saveReplacer(key, value) {
  if (!SKIP_KEYS.has(key) || !this || this.special || typeof this.idx !== 'number') return value;
  const c = ROOM_BY_ID.get(this.caseId);
  return c && this.idx >= 0 && this.idx < c.items.length ? undefined : value;
}
let saveWarned = false;
let saveLocked = false; // игру сохранила другая вкладка — эта больше не пишет, чтобы не затереть
/* Записать строку сохранения. Если места нет — текущая игра важнее отложенного сохранения и
   запасной копии: их сначала отдаём файлами (stashToFile в scripts/inventory/saves.js), потом
   убираем из браузера. Возвращает true — записано, 'freed' — записано ценой копий, false — не влезло. */
function writeSave(json) {
  try {
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch (_) { /* места нет — освобождаем ниже */ }
  for (const key of [BROKEN_KEY, BACKUP_KEY]) {
    try {
      if (localStorage.getItem(key) === null) continue;
      if (typeof stashToFile === 'function') stashToFile(key);
      localStorage.removeItem(key);
      localStorage.setItem(SAVE_KEY, json);
      return 'freed';
    } catch (_) { /* не помогло — пробуем дальше */ }
  }
  return false;
}
/* Сохранение. Несколько вызовов подряд в одном действии (баланс, статистика, инвентарь) склеиваются
   в одну запись в конце текущей задачи: на большом инвентаре запись — десятки миллисекунд. Микрозадача
   выполнится раньше, чем браузер успеет обработать перезагрузку или закрытие вкладки. */
let saveQueued = false;
const save = () => {
  if (saveLocked || saveQueued) return;
  saveQueued = true;
  queueMicrotask(saveNow);
};
function saveNow() {
  saveQueued = false;
  if (saveLocked) return;
  const done = writeSave(JSON.stringify(state, saveReplacer));
  if (done === 'freed') {
    if (typeof renderSaves === 'function') renderSaves();
    if (typeof toast === 'function') toast('Браузеру не хватало места: запасная копия прогресса скачана файлом и убрана из браузера.', 5000, { important: true });
  } else if (!done && !saveWarned && typeof toast === 'function') {
    saveWarned = true;
    toast('Не получилось сохранить прогресс: браузеру не хватает места. Продай или выброси часть инвентаря.', 6000, { important: true });
  }
}

// Восстанавливаем то, что не пишется в сохранение: название, иконку, описание и износ.
function hydrate(it) {
  if (!it || typeof it !== 'object') return;
  const c = ROOMS.find((x) => x.id === it.caseId);
  const row = c && typeof it.idx === 'number' ? c.items[it.idx] : null;
  if (it.name === undefined && row) it.name = (it.stat ? STAT_TRAK : '') + row[2];
  if (it.ic === undefined && row) it.ic = row[1];
  if (it.lore === undefined && row) it.lore = row[3];
  if (it.wear === undefined && typeof it.float === 'number') it.wear = wearOf(it.float);
}

// Загрузка сохранения: восстановление после прерванных действий и миграция старых версий.
// Что восстановили — пишем в restoreNotes, это покажется после запуска (main.js).
const restoreNotes = [];
function loadState(saved) {
  if (Number.isInteger(saved.v) && saved.v > SAVE_VERSION) throw new Error('Сохранение из более новой версии игры: ' + saved.v);
  const s = Object.assign(freshState(), saved);
  s.v = SAVE_VERSION; // 1 — всё, что до 1.9.0 (поля v не было)
  if (Array.isArray(s.pending) && s.pending.length) {
    s.inv.push(...s.pending);
    const n = s.pending.length;
    restoreNotes.push(`Действие прервалось: ${n} ${plural(n, 'предмет сохранён', 'предмета сохранены', 'предметов сохранено')} в инвентарь`);
    s.pending = [];
  }
  if (s.pendingBet > 0) {
    s.bal = r2(s.bal + s.pendingBet);
    restoreNotes.push(`Раунд «Курса огурцов» прервался: ставка ${fmt(s.pendingBet)} возвращена`);
    s.pendingBet = 0;
  }
  // Опыт за открытие, прерванное перезагрузкой: уровень пересчитается при следующем начислении.
  if (s.pendingXp > 0) s.xp = (s.xp || 0) + Math.round(s.pendingXp);
  s.pendingXp = 0;
  s.debt = r2(s.debt || 0);
  s.recipes ||= {};
  s.museum ||= {};
  s.museumHalf ||= {};
  // Баффы: { id кейса: { until — когда кончится по часам, left — сколько осталось по секундомеру } }.
  // Бафф живёт, пока не кончилось хотя бы одно из двух, поэтому перевод часов его не продлевает.
  // Здесь чистим мусор и просроченное и переводим старую запись «id: время» в новую.
  s.buffs = s.buffs && typeof s.buffs === 'object' ? s.buffs : {};
  for (const [id, b] of Object.entries(s.buffs)) {
    const c = CASES.find((x) => x.id === id);
    const until = typeof b === 'number' ? b : b && b.until;
    const left = typeof b === 'number' ? until - Date.now() : b && b.left;
    const ok = c && !c.free && Number.isFinite(until) && Number.isFinite(left);
    const rest = ok ? Math.min(BUFF_MS, left, until - Date.now()) : 0;
    if (rest > 0) s.buffs[id] = { until, left: rest };
    else delete s.buffs[id];
  }
  s.museumDone ||= {};
  // Карты (с 1.8.0): сколько копий, какие были хоть раз, неудачи подряд по рецептам.
  for (const k of ['cards', 'cardsEver', 'forgeFails']) {
    if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
  }
  // Сначала недостающие поля (износ, цена-основа), потом индекс в каталоге и текст из каталога.
  const fix = (x) => {
    if (typeof x.float !== 'number') x.float = 0.5;
    if (typeof x.base !== 'number') x.base = x.price;
    // Совсем старые предметы записаны по названию — находим индекс и берём текст из каталога
    // (так переименованный «Чек на 0.5 ₽» получит новое название).
    if (!x.special && typeof x.idx !== 'number' && typeof x.name === 'string') {
      // Как idxOf (scripts/core/items.js), но тот ещё не загружен: загрузка идёт раньше.
      const c = ROOM_BY_ID.get(x.caseId);
      const name = x.name.replace(STAT_TRAK, '').replace('Чек на 0.5 ₽', 'Чек на 0,5 ₽'); // переименован в 1.4.0
      const i = c ? c.items.findIndex((row) => row[2] === name) : -1;
      if (i >= 0) {
        x.stat = !!x.stat || x.name.startsWith(STAT_TRAK);
        x.idx = i;
        delete x.name;
        delete x.ic;
        delete x.lore;
      }
    }
  };
  s.inv.forEach((x) => {
    fix(x);
    if (!x.uid) x.uid = s.uid++;
  });
  Object.values(s.museum).forEach(fix);
  s.inv.forEach(hydrate);
  Object.values(s.museum).forEach(hydrate);
  hydrate(s.best);
  return s;
}

const readJSON = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
};

/* Сохранение есть, но игра на нём падает (правленный руками файл, сбой браузера). Само сохранение
   откладываем под BROKEN_KEY — оно не пропадёт, — и продолжаем с запасной копии, а нет её — заново.
   Зовётся и отсюда, и из main.js, если сломалась первая отрисовка. */
function recoverBrokenSave(err) {
  console.error(err);
  try { localStorage.setItem(BROKEN_KEY, localStorage.getItem(SAVE_KEY)); } catch (_) { /* не влезло — что ж */ }
  restoreNotes.length = 0;
  try {
    const b = readJSON(BACKUP_KEY);
    if (!b || !b.save || typeof b.save.bal !== 'number') throw new Error('запасной копии нет');
    state = loadState(b.save);
    restoreNotes.push('Сохранение не загрузилось, игра продолжена с запасной копии. Несработавшее можно скачать файлом в Инвентаре, под аналитикой');
  } catch (_) {
    state = freshState();
    restoreNotes.push('Сохранение не загрузилось, игра начата заново. Несработавшее можно скачать файлом в Инвентаре, под аналитикой');
  }
}

let state = freshState();
{
  const saved = readJSON(SAVE_KEY); // нечитаемый JSON — начинаем заново, как и раньше
  if (saved && typeof saved.bal === 'number') {
    try { state = loadState(saved); } catch (e) { recoverBrokenSave(e); }
  }
}

// Состояние интерфейса.
let currentCase = CASES.find((c) => c.id === 'balcony') || CASES[0];
let openCount = 1;
let tab = 'cases';
let busy = false; // идёт анимация с деньгами или предметами — остальные действия ждут
