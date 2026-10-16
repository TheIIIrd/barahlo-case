/* ==========================================================================
   Состояние и сохранение
   ========================================================================== */
'use strict';

/* Версия формата сохранения. Растёт, когда меняется устройство сохранения (новые поля с особой
   миграцией): loadState дотягивает старые сохранения до текущей версии, а сохранение из более новой
   версии игры (откатились на старую) не грузит — откладывает, как сломанное, чтобы не испортить. */
const SAVE_VERSION = 2;
/* Какие версии формата эта игра умеет читать. 1.15.0 писала 3, хотя поля боёв (deck, hurt, battle, btNext, btWins,
   btLosses) только добавились и особой миграции не требуют. Из-за тройки 1.14.1 (второе окно, старая копия игры,
   откат) считала такое сохранение «из будущего» и откладывала весь прогресс. С 1.15.1 снова пишем 2 — старая версия
   читает его и сохраняет новые поля как есть, — а 3 по-прежнему читаем. Поднимать SAVE_VERSION — только для
   несовместимых изменений. */
const SAVE_READABLE = 3;

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
  // Бои (с 1.15.0): колода (id карт, одна карта до 2 раз), ранения { id: сколько копий ранено }, идущий бой,
  // следующий соперник (выбран заранее и не меняется) и счёт побед и поражений.
  deck: [], hurt: {}, battle: null, btNext: null, btWins: 0, btLosses: 0,
  // С 1.18.0: побед подряд (каждая третья — +1 открытие награды) и открытий награды подряд без карты (гарантия).
  btStreak: 0, btDry: 0,
  // С 1.19.0: цены последних открытий платных кейсов (для награды боёв), полученные медали и Зал славы Музея.
  opensRecent: [], medals: {}, glory: {},
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
let saveWarned = false; // предупредили о нехватке места; сбрасывается, как только запись снова удалась
let saveLocked = false; // игру сохранила другая вкладка — эта больше не пишет, чтобы не затереть
// Что эта вкладка последним прочитала или записала под SAVE_KEY. Не совпадает с хранилищем —
// значит, писала другая вкладка (granny.js сверяет при возвращении на страницу).
let lastWritten = null;
try { lastWritten = localStorage.getItem(SAVE_KEY); } catch (_) { /* хранилище недоступно */ }
/* Записать строку сохранения. Если места нет — текущая игра важнее отложенного сохранения и
   запасной копии: их сначала отдаём файлами (stashToFile в scripts/inventory/saves.js), потом
   убираем из браузера. Возвращает true — записано, 'freed' — записано ценой копий, false — не влезло. */
function writeSave(json) {
  try {
    localStorage.setItem(SAVE_KEY, json);
    lastWritten = json;
    return true;
  } catch (_) { /* места нет — освобождаем ниже */ }
  // Сначала то, что ценно меньше всего: отложенные (на этой версии они всё равно не грузятся), потом копии.
  for (const key of [BROKEN2_KEY, BROKEN_KEY, BACKUP_OLD_KEY, BACKUP_KEY]) {
    try {
      if (localStorage.getItem(key) === null) continue;
      if (typeof stashToFile === 'function') stashToFile(key);
      localStorage.removeItem(key);
      localStorage.setItem(SAVE_KEY, json);
      lastWritten = json;
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
  // Пока запись не удаётся, над игрой висит полоса с кнопкой «Скачать файлом»: тост легко пропустить.
  const bar = document.getElementById('saveFail');
  if (bar) bar.hidden = !!done;
  if (done) saveWarned = false; // снова сломается — снова предупредим
  if (done === 'freed') {
    if (typeof renderSaves === 'function') renderSaves();
    if (typeof toast === 'function') toast('Браузеру не хватало места: запасная копия прогресса скачана файлом и убрана из браузера.', 5000, { important: true });
  } else if (!done && !saveWarned && typeof toast === 'function') {
    saveWarned = true;
    toast('Не получилось сохранить прогресс: браузеру не хватает места. Скачай прогресс файлом, потом продай или выброси часть инвентаря.', 6000, { important: true });
  }
}

/* Восстанавливаем то, что не пишется в сохранение: название, иконку, описание и износ.
   У предмета из каталога текст всегда берём из каталога (save() его и так не пишет — для честного сохранения это
   то же самое), а текст особых предметов очищаем от разметки: он попадает в innerHTML, а localStorage общий для
   всех страниц сайта (на <user>.github.io — для всех проектов пользователя). Так же чистит файлы cleanImported. */
const plainText = (x) => (typeof x === 'string' ? x.replace(/[<>&"'`]/g, '') : x);
function hydrate(it) {
  if (!it || typeof it !== 'object') return;
  const c = ROOMS.find((x) => x.id === it.caseId);
  const row = c && Number.isInteger(it.idx) ? c.items[it.idx] : null;
  if (row) {
    if (it.stat === undefined && typeof it.name === 'string' && it.name.startsWith(STAT_TRAK)) it.stat = true; // старые записи
    it.name = (it.stat ? STAT_TRAK : '') + row[2];
    it.ic = row[1];
    it.lore = row[3];
    if (typeof it.float === 'number') it.wear = wearOf(it.float);
  }
  // Медаль (с 1.19.0): текст — из таблицы MEDALS, как у предметов из каталога.
  const medal = it.special && MEDAL_BY_ID.get(it.medal);
  if (medal) Object.assign(it, { name: medal.name, ic: medal.ic, lore: medal.lore });
  if (it.wear === undefined && typeof it.float === 'number') it.wear = wearOf(it.float);
  for (const k of ['name', 'ic', 'lore', 'wear']) it[k] = plainText(it[k]);
}

// Загрузка сохранения: восстановление после прерванных действий и миграция старых версий.
// Что восстановили — пишем в restoreNotes, это покажется после запуска (main.js).
const restoreNotes = [];
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UID_MAX = 2 ** 50; // с запасом до 2^53: столько предметов не выдать никогда
function loadState(saved) {
  if (Number.isInteger(saved.v) && saved.v > SAVE_READABLE) throw new Error('Сохранение из более новой версии игры: ' + saved.v);
  // Поля копируем по одному, без «__proto__» и т. п.: Object.assign подменил бы прототип состояния.
  const s = freshState();
  for (const k of Object.keys(saved)) if (!UNSAFE_KEYS.has(k)) s[k] = saved[k];
  // Числа из сохранения попадают в разметку и в расчёты: не число или не конечное (правленый файл, NaN из сбоя) —
  // значение новой игры. Счётчики по ключам и редкостям — только целые ≥ 0.
  const fresh = freshState();
  for (const [k, v] of Object.entries(fresh)) {
    if (typeof v === 'number' && !Number.isFinite(s[k])) s[k] = v;
  }
  // Сломано устройство сохранения (инвентарь не список предметов, история «Курса» не список, износ вне 0…1) — это
  // поломка, а не мусор: бросаем, и recoverBrokenSave отложит сохранение и продолжит с запасной копии. Молча «чинить»
  // нельзя — пустой инвентарь затёр бы настоящий при первом же save().
  const isItem = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const broken = (why) => { throw new Error('Сохранение повреждено: ' + why); };
  if (!Array.isArray(s.inv) || !s.inv.every(isItem)) broken('инвентарь');
  if (!Array.isArray(s.chist)) broken('история «Курса огурцов»');
  if (!Array.isArray(s.rc) || s.rc.length !== fresh.rc.length) broken('счётчик редкостей');
  s.pending = Array.isArray(s.pending) ? s.pending.filter(isItem) : [];
  s.rc = s.rc.map((n) => (Number.isFinite(n) ? n : 0));
  s.chist = s.chist.filter(Number.isFinite);
  for (const k of ['tokens', 'recipes', 'museumDone', 'museumHalf']) {
    if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
  }
  for (const [id, n] of Object.entries(s.tokens)) if (!(Number.isInteger(n) && n >= 0)) delete s.tokens[id];
  s.v = SAVE_VERSION; // 1 — всё, что до 1.9.0 (поля v не было); 3 (1.15.0) читается как 2
  if (Array.isArray(s.pending) && s.pending.length) {
    s.inv.push(...s.pending);
    const n = s.pending.length;
    restoreNotes.push(`Действие прервалось: ${n} ${plural(n, 'предмет возвращён', 'предмета возвращены', 'предметов возвращено')} в инвентарь.`);
    s.pending = [];
  }
  if (s.pendingBet > 0) {
    s.bal = r2(s.bal + s.pendingBet);
    restoreNotes.push(`Раунд «Курса огурцов» прервался: ставка ${fmt(s.pendingBet)} возвращена.`);
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
    const win = !!b && b.max === BUFF_MS_WIN; // бафф за победу в бою (с 1.19.0) — длиннее
    const rest = ok ? Math.min(win ? BUFF_MS_WIN : BUFF_MS, left, until - Date.now()) : 0;
    if (rest > 0) s.buffs[id] = win ? { until, left: rest, max: BUFF_MS_WIN } : { until, left: rest };
    else delete s.buffs[id];
  }
  s.museumDone ||= {};
  // Карты (с 1.8.0): сколько копий, какие были хоть раз, неудачи подряд по рецептам; ранения (с 1.15.0).
  for (const k of ['cards', 'cardsEver', 'forgeFails', 'hurt']) {
    if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
  }
  for (const k of ['cards', 'forgeFails', 'hurt']) {
    for (const [id, n] of Object.entries(s[k])) if (!(Number.isInteger(n) && n >= 0)) delete s[k][id]; // 0 бывает (как в старых сохранениях) — не трогаем
  }
  for (const [id, v] of Object.entries(s.cardsEver)) if (v !== true) delete s.cardsEver[id];
  if (!s.museum || typeof s.museum !== 'object' || !Object.values(s.museum).every(isItem)) broken('Музей');
  // Бои (с 1.15.0). Здесь — только типы: id карт и сам бой проверяются в scripts/battle/deck.js, когда каталог
  // карт уже загружен.
  if (!Array.isArray(s.deck)) s.deck = [];
  if (!s.battle || typeof s.battle !== 'object' || Array.isArray(s.battle)) s.battle = null;
  if (!s.btNext || typeof s.btNext !== 'object' || Array.isArray(s.btNext)) s.btNext = null;
  for (const k of ['btWins', 'btLosses', 'btStreak', 'btDry']) s[k] = Number.isInteger(s[k]) && s[k] >= 0 ? s[k] : 0;
  // С 1.19.0: последние открытия — только числа, не больше OPENS_RECENT; медали — только известные; в Зале славы —
  // только медали под своим id.
  s.opensRecent = Array.isArray(s.opensRecent) ? s.opensRecent.filter((x) => Number.isFinite(x) && x > 0).slice(-OPENS_RECENT) : [];
  const plainObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  s.medals = plainObj(s.medals) ? Object.fromEntries(Object.keys(s.medals).filter((id) => MEDAL_BY_ID.has(id)).map((id) => [id, true])) : {};
  s.glory = plainObj(s.glory) ? s.glory : {};
  for (const [id, it] of Object.entries(s.glory)) {
    if (!MEDAL_BY_ID.has(id) || !it || typeof it !== 'object' || it.medal !== id || !it.special) delete s.glory[id];
  }
  // Каждая медаль — в одном месте и одна: лишние копии (правленый файл) убираем — сначала держим ту, что в зале,
  // потом первую в инвентаре; найденная где угодно медаль считается полученной (иначе её выдали бы второй раз).
  const seenMedal = new Set(Object.keys(s.glory));
  s.inv = s.inv.filter((x) => {
    if (!x || !x.medal) return true;
    if (!MEDAL_BY_ID.has(x.medal) || seenMedal.has(x.medal)) return false;
    seenMedal.add(x.medal);
    return true;
  });
  seenMedal.forEach((id) => (s.medals[id] = true));
  // Сначала недостающие поля (износ, цена-основа), потом индекс в каталоге и текст из каталога.
  const fix = (x) => {
    if (!Number.isFinite(x.price)) x.price = 0;
    if (typeof x.float !== 'number') x.float = 0.5;
    else if (!(x.float >= 0 && x.float <= 1)) broken('износ');
    if (!Number.isFinite(x.base)) x.base = x.price;
    // Попытки реставрации — целое ≥ 0 (выводится в разметку), отметки — да/нет.
    x.resto = Number.isInteger(x.resto) && x.resto > 0 ? x.resto : 0;
    if (!x.resto) delete x.resto;
    for (const k of ['lock', 'stat', 'bought', 'special']) if (x[k] !== undefined) x[k] = !!x[k];
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
  // Номера предметов: счётчик — выше всех уже выданных; нет номера или он повторяется (испорченный файл) —
  // выдаём новый, иначе выбор и продажа задели бы сразу два предмета. Экспонаты Музея считаем тоже:
  // заменённый экспонат возвращается в инвентарь со своим номером.
  const numbered = [...s.inv, ...Object.values(s.museum), ...Object.values(s.glory)];
  // Номер — «безопасное» целое (выше 2^53 соседние номера совпадают); за пределом — перенумеровываем всё с 1.
  const uidOk = (n) => Number.isInteger(n) && n >= 1 && n <= UID_MAX;
  const tooBig = !uidOk(Math.floor(s.uid) || 1) || numbered.some((x) => Number.isInteger(x.uid) && x.uid > UID_MAX);
  if (tooBig) numbered.forEach((x) => delete x.uid);
  s.uid = numbered.reduce((m, x) => (uidOk(x.uid) && x.uid >= m ? x.uid + 1 : m), tooBig ? 1 : Math.max(1, Math.floor(s.uid) || 1));
  const seenUid = new Set();
  numbered.forEach((x) => {
    fix(x);
    if (!uidOk(x.uid) || seenUid.has(x.uid)) x.uid = s.uid++;
    seenUid.add(x.uid);
  });
  s.inv.forEach(hydrate);
  Object.values(s.museum).forEach(hydrate);
  Object.values(s.glory).forEach(hydrate);
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
  let kept = false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const first = localStorage.getItem(BROKEN_KEY);
    // Сохранения нет (упала отрисовка новой игры) — откладывать нечего. Уже отложенное не затираем:
    // первое обычно и есть настоящий прогресс, а второе (сыгранное с копии) кладём рядом.
    if (raw !== null && first === null) localStorage.setItem(BROKEN_KEY, raw);
    else if (raw !== null && first !== raw) localStorage.setItem(BROKEN2_KEY, raw);
    kept = raw !== null;
  } catch (_) { /* не влезло — что ж */ }
  restoreNotes.length = 0;
  const tail = kept ? ' Несработавшее можно скачать файлом в инвентаре, под аналитикой.' : '';
  for (const key of [BACKUP_KEY, BACKUP_OLD_KEY]) {
    const b = readJSON(key);
    if (!b || !b.save || !Number.isFinite(b.save.bal)) continue;
    try {
      state = loadState(b.save);
      restoreNotes.push('Сохранение не загрузилось, игра продолжена с запасной копии.' + tail);
      return;
    } catch (e) { console.error(e); }
  }
  state = freshState();
  restoreNotes.push('Сохранение не загрузилось, игра начата заново.' + tail);
}

let state = freshState();
{
  // Сохранение есть, но нечитаемо или без баланса — тоже «сломанное»: откладываем (recoverBrokenSave), а не затираем
  // первым же save(). Совсем нет сохранения — новая игра.
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (_) { /* хранилище недоступно */ }
  const saved = readJSON(SAVE_KEY);
  if (saved && typeof saved === 'object' && Number.isFinite(saved.bal)) {
    try { state = loadState(saved); } catch (e) { recoverBrokenSave(e); }
  } else if (raw !== null && raw !== 'null') {
    recoverBrokenSave(new Error('Сохранение нечитаемо'));
  }
}

// Состояние интерфейса.
let currentCase = CASES.find((c) => c.id === 'balcony') || CASES[0];
let openCount = 1;
let tab = 'cases';
let busy = false; // идёт анимация с деньгами или предметами — остальные действия ждут
