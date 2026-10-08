/* ==========================================================================
   Аналитика
   ========================================================================== */
'use strict';

function renderStats() {
  renderBalance();
  $('sOpen').textContent = state.opened;
  $('sSpent').textContent = fmt(state.spent);
  $('sEarn').textContent = fmt(state.earn);

  const roi = state.spent ? ((state.earn + sum(state.inv, (x) => x.price)) / state.spent - 1) * 100 : null;
  $('sRoi').textContent = roi === null ? '—' : (roi > 0 ? '+' : '') + fmtPct(roi, 1);
  $('sRoi').className = roi === null ? '' : roi >= 0 ? 'pos' : 'neg';

  $('sCU').textContent = `${state.contracts} / ${state.upgrades} / ${state.crafts}`;
  $('sCrash').textContent = (state.crashNet > 0 ? '+' : '') + fmt(state.crashNet);
  $('sCrash').className = state.crashNet > 0 ? 'pos' : state.crashNet < 0 ? 'neg' : '';
  $('sMR').textContent = fmtShort(state.museumSpent + state.restoSpent);
  $('sDebt').textContent = fmt(state.debt);
  $('sDebt').className = state.debt >= GRANNY_DEBT ? 'neg' : '';
  $('sForge').textContent = `${state.forged} / ${state.forgeLost}`;
  $('sBest').textContent = state.best ? state.best.name + ' · ' + fmt(state.best.price) : '—';
  renderDebt();

  const max = Math.max(1, ...state.rc);
  $('rbars').innerHTML = RARITY.map((r, i) => `
    <div class="rb" style="--c:${r.c}">
      <span>${r.n}</span>
      <div class="tr"><b style="width:${(state.rc[i] / max) * 100}%"></b></div>
      <span>${state.rc[i]}</span>
    </div>`).join('');
  save();
}
