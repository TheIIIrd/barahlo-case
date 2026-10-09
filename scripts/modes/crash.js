/* ==========================================================================
   Курс огурцов (краш)
   ========================================================================== */
'use strict';

const crashCanvas = $('crashCv');
const crashCtx = crashCanvas.getContext('2d');
let crashW = 0, crashH = 0;

// state: idle → wait (отсчёт) → run → boom → idle.
let crash = { state: 'idle', t0: 0, mult: 1, cp: 1, bet: 0, cashed: false, pts: [] };

function sizeCrashCanvas() {
  const r = $('cbox').getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  crashW = r.width;
  crashH = r.height;
  crashCanvas.width = crashW * dpr;
  crashCanvas.height = crashH * dpr;
  crashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCrash();
}
addEventListener('resize', sizeCrashCanvas);

// Точка взрыва: ~5% раундов (u < 0,0495) взрываются сразу на ×1,00, дальше вероятность падает как 1/x.
function crashPoint() {
  const u = rnd();
  return Math.max(1, Math.min(1000, Math.floor(96 / (1 - u)) / 100));
}

function drawCrash() {
  if (!crashW) return;
  const g = crashCtx;
  const pts = crash.pts;
  g.clearRect(0, 0, crashW, crashH);

  const tMax = Math.max(8, pts.length ? pts[pts.length - 1][0] * 1.15 : 8);
  const mMax = Math.max(2, crash.mult * 1.2);
  const X = (t) => 34 + (t / tMax) * (crashW - 50);
  const Y = (m) => crashH - 24 - ((m - 1) / (mMax - 1)) * (crashH - 50);

  // Сетка и подписи.
  g.font = '10px JetBrains Mono, monospace';
  g.fillStyle = '#8a97a8';
  g.strokeStyle = 'rgba(138,151,168,.15)';
  g.lineWidth = 1;
  const stepM = mMax <= 3 ? 0.5 : mMax <= 6 ? 1 : mMax <= 20 ? 5 : mMax <= 100 ? 25 : 250;
  for (let m = 1; m <= mMax; m += stepM) {
    const y = Y(m);
    g.beginPath();
    g.moveTo(34, y);
    g.lineTo(crashW - 10, y);
    g.stroke();
    g.fillText('×' + NF.format(+m.toFixed(1)), 2, y + 3);
  }
  const stepT = tMax <= 12 ? 2 : tMax <= 30 ? 5 : 10;
  for (let t = 0; t <= tMax; t += stepT) g.fillText(t + 'с', X(t) - 6, crashH - 8);
  if (pts.length < 2) return;

  // Заливка и линия графика.
  const boom = crash.state === 'boom';
  const lineColor = boom ? '#ff5468' : crash.cashed ? '#5fe08a' : '#ffb02e';
  const fill = g.createLinearGradient(0, 0, 0, crashH);
  fill.addColorStop(0, boom ? 'rgba(255,84,104,.35)' : 'rgba(255,176,46,.35)');
  fill.addColorStop(1, 'rgba(255,176,46,0)');
  const last = pts[pts.length - 1];
  g.beginPath();
  g.moveTo(X(pts[0][0]), Y(1));
  pts.forEach((p) => g.lineTo(X(p[0]), Y(p[1])));
  g.lineTo(X(last[0]), Y(1));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
  g.strokeStyle = lineColor;
  g.lineWidth = 3;
  g.stroke();

  // Огурец (или взрыв) на конце линии.
  g.font = '30px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(X(last[0]), Y(last[1]));
  if (!boom) g.rotate(-0.5);
  g.fillText(boom ? '💥' : '🥒', 0, 0);
  g.restore();
  g.textAlign = 'start';
  g.textBaseline = 'alphabetic';
}

function updateCrashButton() {
  const btn = $('crashBtn');
  const label = $('crashTxt');
  const hint = $('crashSub');
  if (crash.state === 'run' && !crash.cashed) {
    label.textContent = 'ЗАБРАТЬ ' + fmt(crash.bet * crash.mult);
    hint.textContent = 'пока банка цела';
    btn.disabled = false;
  } else if (crash.state === 'boom') {
    label.textContent = crash.cashed ? 'ВЫИГРЫШ ЗАБРАН' : 'БАНКА ВЗОРВАЛАСЬ';
    hint.textContent = 'новый раунд через секунду';
    btn.disabled = true;
  } else if (crash.state === 'wait' || crash.state === 'run') {
    label.textContent = crash.state === 'wait' ? 'ЗАСОЛКА…' : 'ИДЁТ РАУНД';
    hint.textContent = crash.cashed ? 'выигрыш забран' : 'ставка принята';
    btn.disabled = true;
  } else {
    const bet = parseFloat($('bet').value) || 0;
    label.textContent = 'ЗАСОЛИТЬ';
    hint.textContent = 'ставка ' + fmt(bet);
    btn.disabled = bet < 1 || bet > state.bal;
  }
}
$('bet').oninput = updateCrashButton;

$$('[data-q]', $('v-crash')).forEach((b) => (b.onclick = () => {
  let v = parseFloat($('bet').value) || 1;
  if (b.dataset.q === 'half') v = Math.max(1, Math.floor(v / 2));
  if (b.dataset.q === 'dbl') v = v * 2;
  if (b.dataset.q === 'max') v = Math.floor(state.bal);
  $('bet').value = Math.max(1, Math.min(v, Math.floor(Math.max(state.bal, 1))));
  updateCrashButton();
}));

function cashout() {
  if (crash.state !== 'run' || crash.cashed) return;
  crash.cashed = true;
  state.pendingBet = 0;
  const win = r2(crash.bet * crash.mult);
  state.crashNet = r2(state.crashNet + win - crash.bet);
  setBal(win);
  renderStats();
  toast(`Забрано на ${fmtX(crash.mult)}: +${fmt(win)}.`);
  fanfare(crash.mult >= 10 ? 6 : crash.mult >= 3 ? 4 : 2);
  const r = $('cbox').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height * 0.4, ['#5fe08a', '#ffffff', '#ffb02e'], crash.mult >= 5 ? 180 : 70);
  updateCrashButton();
}

function setCrashLabel(text, sub, color) {
  $('cmult').innerHTML = `${text}<small>${sub}</small>`;
  $('cmult').style.color = color;
}

$('crashBtn').onclick = async () => {
  if (crash.state === 'run') { cashout(); return; }
  if (crash.state !== 'idle') return;
  const bet = Math.floor((parseFloat($('bet').value) || 0) * 100) / 100;
  if (bet < 1 || bet > state.bal) return;

  crash = { state: 'wait', t0: 0, mult: 1, cp: crashPoint(), bet, cashed: false, pts: [] };
  state.pendingBet = bet; // вернётся, если закрыть страницу посреди раунда
  setBal(-bet);
  updateCrashButton();

  for (const n of ['3', '2', '1']) {
    setCrashLabel(n, 'Огурцы засаливаются', 'var(--fg)');
    tone(520, 0.1, 'square', 0.06);
    await sleep(600);
  }

  crash.state = 'run';
  crash.t0 = performance.now();
  updateCrashButton();
  const autoAt = parseFloat($('auto').value);
  let lastBeep = 1;

  (function frame(t) {
    const s = (t - crash.t0) / 1000;
    const m = Math.exp(CRASH_SPEED * s);
    // Автозабор платит ровно по заданному множителю, даже если кадр пропущен.
    if (!crash.cashed && autoAt > 1 && autoAt <= crash.cp && m >= autoAt) {
      crash.mult = autoAt;
      cashout();
    }
    crash.mult = m;
    if (m >= crash.cp) {
      crash.mult = crash.cp;
      crash.pts.push([Math.log(crash.cp) / CRASH_SPEED, crash.cp]);
      crashBoom();
      return;
    }
    crash.pts.push([s, m]);
    if (m - lastBeep >= 0.25) {
      lastBeep = m;
      tone(300 + m * 60, 0.03, 'sine', 0.04);
    }
    setCrashLabel(fmtX(m), crash.cashed ? 'Забрано ✓' : 'Курс огурца растёт',
      crash.cashed ? 'var(--good)' : 'var(--accent)');
    if (!crash.cashed) $('crashTxt').textContent = 'ЗАБРАТЬ ' + fmt(crash.bet * m);
    drawCrash();
    requestAnimationFrame(frame);
  })(performance.now());
};

function crashBoom() {
  crash.state = 'boom';
  addXP(4); // за раунд — в конце: если перезагрузить посреди раунда, ставка вернётся, а опыт не начислится
  drawCrash();
  updateCrashButton();
  setCrashLabel(fmtX(crash.cp),
    crash.cashed ? 'Банка взорвалась, но выигрыш уже забран' : 'Банка взорвалась',
    crash.cashed ? 'var(--good)' : 'var(--bad)');
  if (!crash.cashed) {
    state.pendingBet = 0;
    state.crashNet = r2(state.crashNet - crash.bet);
    save();
    sad();
    shake();
  }
  state.chist.unshift(crash.cp);
  state.chist = state.chist.slice(0, 16);
  renderCrashHistory();
  renderStats();
  setTimeout(() => {
    crash.state = 'idle';
    updateCrashButton();
  }, 1400);
}

function renderCrashHistory() {
  $('chist').innerHTML = state.chist.map((m) => {
    const color = m >= 10 ? 'var(--r6)' : m >= 2 ? 'var(--good)' : 'var(--bad)';
    return `<span style="color:${color}">${fmtX(m)}</span>`;
  }).join('') || '<span class="word">Раундов ещё не было</span>';
}
