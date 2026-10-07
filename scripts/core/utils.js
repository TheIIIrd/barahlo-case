/* ==========================================================================
   Утилиты
   ========================================================================== */
'use strict';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function rnd() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const r2 = (n) => Math.round(n * 100) / 100 || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? Math.min(ms, 60) : ms));
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

// Русское множественное число: plural(5, 'предмет', 'предмета', 'предметов') → «предметов».
function plural(n, one, few, many) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

// Деньги: полная сумма с копейками.
const fmt = (n) =>
  r2(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0₽'; // ₽ не уезжает на новую строку

// Деньги кратко: «1,5 млрд ₽» для больших сумм, иначе полная.
function fmtShort(n) {
  const a = Math.abs(n);
  if (a < 1e6) return fmt(n);
  const units = [[1e15, 'квадрлн'], [1e12, 'трлн'], [1e9, 'млрд'], [1e6, 'млн']];
  for (let k = 0; k < units.length; k++) {
    const [v, u] = units[k];
    if (a >= v) {
      const x = n / v;
      const rounded = Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
      // 999,96 млн округлилось бы до «1 000 млн» — тогда показываем следующей единицей: «1 млрд».
      if (Math.abs(rounded) >= 1000 && k > 0) return (Math.round((n / units[k - 1][0]) * 10) / 10).toLocaleString('ru-RU') + ' ' + units[k - 1][1] + '\u00a0₽';
      return rounded.toLocaleString('ru-RU') + ' ' + u + '\u00a0₽';
    }
  }
}

/* Перерисовка заменяет кнопки — фокус клавиатуры возвращаем на «ту же» кнопку: по id или по data-атрибутам.
   focusKey(root) — запомнить до перерисовки (если фокус внутри root), restoreFocus(key) — вернуть после. */
function focusKey(root) {
  const a = document.activeElement;
  if (!a || a === document.body || !root || !root.contains(a)) return null;
  if (a.id) return '#' + CSS.escape(a.id);
  const d = Object.entries(a.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${CSS.escape(v)}"]`).join('');
  return d ? a.tagName.toLowerCase() + d : null;
}
function restoreFocus(key) {
  if (!key || (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) return;
  const el = document.querySelector(key);
  if (el && !el.disabled) el.focus({ preventScroll: true });
}

// Проценты с русской запятой: 2,35%.
const fmtPct = (x, digits = 2) => x.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';

const fmtFloat = (fl) => (fl < 1e-9 ? fl.toExponential(3) : fl.toFixed(10));
// Износ коротко, для подписей: 4 значащие цифры, совсем маленький — в экспоненте («2.35e-12»).
const fmtWear = (fl) => (fl < 1e-4 ? fl.toExponential(2) : fl.toPrecision(4));

// Перезапуск CSS-анимации на элементе.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
