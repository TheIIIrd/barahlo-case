/* ==========================================================================
   Звук
   ========================================================================== */
'use strict';

let audio = null;
let soundOn = false;

// Контрастный режим хранится в сохранении и включается сразу при загрузке.
function applyContrast() {
  document.documentElement.classList.toggle('hc', !!state.contrast);
  $('hcBtn').setAttribute('aria-pressed', !!state.contrast);
}
let hcFadeTimer = 0;
$('hcBtn').onclick = () => {
  state.contrast = !state.contrast;
  const root = document.documentElement;
  // Во время анимаций (рулетка, апгрейд, ×100) без плавного перехода — чтобы их не оборвать.
  if (!busy) root.classList.add('hc-fade');
  clearTimeout(hcFadeTimer);
  hcFadeTimer = setTimeout(() => root.classList.remove('hc-fade'), 400);
  applyContrast();
  save();
  tone(650, 0.04);
};
applyContrast();

$('soundBtn').onclick = () => {
  soundOn = !soundOn;
  if (soundOn && !audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { soundOn = false; }
  }
  $('soundBtn').setAttribute('aria-pressed', soundOn);
  if (audio && audio.state === 'suspended') audio.resume();
  tone(880, 0.06);
};

function tone(freq, dur, type = 'square', vol = 0.05) {
  if (!soundOn || !audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + dur);
}

function fanfare(rarity) {
  const notes = [392, 494, 587, 784, 988];
  const n = Math.min(2 + rarity, 5);
  for (let i = 0; i < n; i++) {
    setTimeout(() => tone(notes[i] * (rarity >= 6 ? 1.5 : 1), 0.5, 'triangle', 0.08), i * 90);
  }
}

function sad() {
  [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.05), i * 160));
}
