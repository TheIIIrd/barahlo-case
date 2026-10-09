/* ==========================================================================
   Кошелёк и долг
   ========================================================================== */
'use strict';

function setBal(delta) {
  state.bal = r2(state.bal + delta);
  renderBalance();
  replay($('bal'), 'bump');
  updateOpenButton();
  updateCrashButton();
  refreshMoneyViews();
  save();
}

/* Всё, что на экране зависит от баланса: кнопки «Выкупить», «Выбросить», «Реставрировать», панель
   продажи, доплата в апгрейде и Кузне. Иначе после займа они оставались выключенными. Во время
   анимации (busy) не трогаем: её экран перерисуется в конце сам. */
function refreshMoneyViews() {
  if (busy) return;
  if (tab === 'inventory') {
    if (subVisible('items')) {
      // Карточка перерисуется целиком — фокус на её кнопке не теряем.
      const f = document.activeElement;
      const fid = f && f.id && f.closest('#detail') ? f.id : '';
      renderItemCard();
      renderBulkBar();
      if (fid) $(fid)?.focus({ preventScroll: true });
    }
    if (subVisible('museum')) renderMuseum();
  }
  if (tab === 'upgrade') renderUpgrade();
  if (tab === 'cards' && cardsSub === 'forge') renderAnvil();
}

// Баланс полностью; если не влезает в свою плашку — коротко («1,2 трлн ₽»), полный — в подсказке.
function renderBalance() {
  const el = $('bal');
  const cls = state.bal < 0 ? 'neg' : '';
  el.innerHTML = `Баланс: <b class="${cls}">${fmt(state.bal)}</b>`;
  el.title = '';
  // Сокращаем, если сумма не влезает или (на широком экране) из-за неё кошелёк переносится на вторую строку.
  const kids = [...el.parentElement.children].filter((x) => x.offsetParent);
  const wrapped = innerWidth > 1180 && kids.some((x) => x.offsetTop !== kids[0].offsetTop);
  if (el.scrollWidth > el.clientWidth + 1 || wrapped) {
    el.innerHTML = `Баланс: <b class="${cls}">${fmtShort(state.bal)}</b>`;
    el.title = fmt(state.bal);
  }
}
addEventListener('resize', renderBalance);

// Хватит ли денег, если сумма отрицательная (утилизация).
const canPay = (v) => v >= 0 || state.bal + v >= -0.001;

// Подпись кнопки продажи: за плюс продаём, за минус доплачиваем за утилизацию.
const sellLabel = (v, sell, discard) => (v >= 0 ? `${sell} за ${fmt(v)}`
  : canPay(v) ? `${discard} за ${fmt(-v)}` : 'Не хватает на утилизацию ' + fmt(-v));

function noMoney(v) {
  toast(`Не хватает денег: утилизация стоит ${fmt(-v)}, а на балансе ${fmt(state.bal)}. Продай что-нибудь или займи у бабушки.`, 3600);
  sad();
}

// Частые займы подряд не сыплют сообщениями: одно сообщение обновляет сумму на месте.
let loanStreak = { n: 0, at: 0, sum: 0 };
$('loan').onclick = () => {
  // Долг не растёт выше MAX_DEBT; старые сохранения с большим долгом не трогаем — просто не даёт больше.
  const amount = r2(Math.min(LOAN, MAX_DEBT - state.debt));
  if (amount <= 0) {
    toast(`Бабушка больше не даёт: долг уже ${fmt(state.debt)}. Верни хоть часть — тогда поговорим.`, 3200, { key: 'loan' });
    sad();
    return;
  }
  state.debt = r2(state.debt + amount);
  setBal(amount);
  renderStats();
  const now = Date.now();
  loanStreak = now - loanStreak.at < 3000 ? { n: loanStreak.n + 1, at: now, sum: loanStreak.sum + amount } : { n: 1, at: now, sum: amount };
  const text = state.debt >= MAX_DEBT
    ? `Бабушка дала ${amount < LOAN ? 'последние ' : ''}${fmt(amount)} и закрыла банку с гречкой: больше ${fmt(MAX_DEBT)} в долг не даёт.`
    : loanStreak.n === 1
    ? pick([
      `Бабушка дала ${fmt(LOAN)} и пирожок.`,
      'Бабушка: «Только на учёбу!»',
      'Бабушка достала деньги из банки с гречкой.',
      'Бабушка: «Опять на свои коробки?»',
    ])
    : `Бабушка дала уже ${fmt(loanStreak.sum)} подряд и тяжело вздохнула. Долг — ${fmt(state.debt)}.`;
  toast(text, 2400, { key: 'loan' });
  tone(700, 0.1, 'sine', 0.06);
};

$('repay').onclick = () => {
  if (busy) return; // во время продажи с доплатой баланс ещё не списан — иначе ушёл бы в минус
  if (!state.debt) { toast('Долгов нет. Бабушка гордится тобой.'); return; }
  const pay = r2(Math.min(state.debt, state.bal));
  if (pay <= 0) { toast('Нечем отдавать. Бабушка поймёт. Наверное.'); return; }
  state.debt = r2(state.debt - pay);
  setBal(-pay);
  renderStats();
  tone(900, 0.1, 'sine', 0.06);
  toast(state.debt ? `Возвращено ${fmt(pay)}. Осталось ${fmt(state.debt)}.` : 'Долг погашен! Бабушка испекла пирожки.');
};

/* Кнопки долга. «Вернуть» всегда шириной с «Вернуть 3 000,00 ₽»: подпись и невидимая распорка
   лежат в одной клетке, а бабушка у двери — значком в углу. Иначе от смены суммы и прихода
   бабушки соседние кнопки шапки ездили бы туда-сюда. */
const REPAY_SIZER = `<span class="sizer" aria-hidden="true">Вернуть ${fmt(MAX_DEBT)}</span>`;
function renderDebt() {
  const loan = $('loan');
  const capped = state.debt >= MAX_DEBT;
  loan.classList.toggle('capped', capped);
  loan.setAttribute('aria-disabled', capped);
  loan.title = capped ? `Больше ${fmt(MAX_DEBT)} бабушка в долг не даёт` : `Бабушка даёт по ${fmt(LOAN)}, но не больше ${fmt(MAX_DEBT)} долга`;

  const b = $('repay');
  if (!state.debt) {
    b.innerHTML = '<span>Долгов нет</span>' + REPAY_SIZER;
    b.disabled = true;
    b.title = '';
    return;
  }
  const atDoor = state.grannyDue && state.debt >= GRANNY_DEBT;
  b.disabled = false;
  b.innerHTML = `<span>Вернуть ${fmtShort(state.debt)}</span>` + REPAY_SIZER +
    (atDoor ? '<span class="gdoor" aria-hidden="true">👵</span>' : '');
  b.title = atDoor ? 'Бабушка стоит у двери и сейчас зайдёт за долгом'
    : state.debt >= GRANNY_DEBT
    ? `Долг от ${fmt(GRANNY_DEBT)}: бабушка может прийти за ним в любой момент`
    : `Если долг дойдёт до ${fmt(GRANNY_DEBT)}, бабушка может прийти за ним сама`;
}
