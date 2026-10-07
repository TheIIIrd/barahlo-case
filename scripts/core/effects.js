/* ==========================================================================
   Эффекты: конфетти, тряска, всплывающий текст, уведомления
   ========================================================================== */
'use strict';

const fxCanvas = $('fx');
const fx = fxCanvas.getContext('2d');
let fxW = 0, fxH = 0, particles = [];

function sizeFx() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  fxW = innerWidth;
  fxH = innerHeight;
  fxCanvas.width = fxW * dpr;
  fxCanvas.height = fxH * dpr;
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeFx();
addEventListener('resize', sizeFx);

const FX_MAX_PARTICLES = 500; // больше одновременно не рисуем: лишние только тормозят

function burst(x, y, colors, n) {
  if (reducedMotion) n = Math.min(n, 20);
  n = Math.min(n, FX_MAX_PARTICLES - particles.length);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 3 + Math.random() * 10;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4,
      life: 1, decay: 0.006 + Math.random() * 0.012, size: 3 + Math.random() * 5,
      color: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    });
  }
  if (n > 0 && !fxRunning) {
    fxRunning = true;
    requestAnimationFrame(fxLoop);
  }
}

// Цикл крутится, только пока есть конфетти; в простое канвас не трогаем.
let fxRunning = false;
function fxLoop() {
  const dpr = fxCanvas.width / fxW || 1;
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.clearRect(0, 0, fxW, fxH);
  for (const p of particles) {
    p.vy += 0.2;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    p.rot += p.vr;
    const cos = Math.cos(p.rot) * dpr;
    const sin = Math.sin(p.rot) * dpr;
    fx.setTransform(cos, sin, -sin, cos, p.x * dpr, p.y * dpr);
    fx.globalAlpha = Math.max(p.life, 0);
    fx.fillStyle = p.color;
    fx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size * 0.66);
  }
  fx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0 && p.y < fxH + 40);
  if (particles.length) {
    requestAnimationFrame(fxLoop);
  } else {
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.clearRect(0, 0, fxW, fxH);
    fxRunning = false;
  }
}

function shake() {
  if (!reducedMotion) replay($('wrap'), 'shake');
}

function floatText(el, text, color) {
  const r = el && el.getBoundingClientRect
    ? el.getBoundingClientRect()
    : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
  const f = document.createElement('div');
  f.className = 'floaty';
  f.textContent = text;
  f.style.color = color;
  f.style.left = Math.max(8, Math.min(innerWidth - 160, r.left + r.width / 2 - 40)) + 'px';
  f.style.top = Math.max(8, r.top) + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

/* Уведомления. Два места: обычное и важное. Новое обычное заменяет прошлое обычное,
   важное (уровень, музей, рецепт, бабушка у двери, сбой сохранения) — прошлое важное.
   Друг друга они не вытесняют: важное дочитывается, даже если следом пришло «Продано за…».
   key — уведомления с одним ключом обновляют текст на месте, без новой анимации. */
const toastBox = document.createElement('div');
toastBox.id = 'toasts';
toastBox.setAttribute('aria-live', 'polite');
document.body.appendChild(toastBox);
const toastSlots = { normal: null, important: null };

function toast(message, ms = 2400, { important = false, key = '' } = {}) {
  const slot = important ? 'important' : 'normal';
  const cur = toastSlots[slot];
  if (cur && key && cur.dataset.key === key && cur.isConnected && !cur.classList.contains('out')) {
    cur.textContent = message;
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => dismissToast(cur), ms);
    return cur;
  }
  if (cur) dismissToast(cur);
  const t = document.createElement('div');
  t.className = 'toast' + (important ? ' imp' : '');
  t.dataset.key = key;
  t.textContent = message;
  // Важное всегда сверху стопки, обычное — под ним.
  if (important) toastBox.prepend(t);
  else toastBox.append(t);
  t.timer = setTimeout(() => dismissToast(t), ms);
  toastSlots[slot] = t;
  return t;
}

// Уведомление тает и схлопывает своё место, чтобы соседнее подъехало плавно, а не прыгнуло.
function dismissToast(t) {
  if (!t.isConnected || t.classList.contains('out')) return;
  clearTimeout(t.timer);
  if (reducedMotion) { t.remove(); return; }
  t.style.marginTop = `-${t.offsetHeight + 6}px`; // 6px — зазор стопки (#toasts gap)
  t.classList.add('out');
  setTimeout(() => t.remove(), 320);
}
