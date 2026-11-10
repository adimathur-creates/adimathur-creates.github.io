/* Builds index.html from src/template.html + results.json + sql/output.json.
 *   node src/build_page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const E = require('./engine');
const S = require('./stories');
const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'results.json'), 'utf8'));
const Q = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'output.json'), 'utf8'));

const pol = Object.fromEntries(R.policies.map(p => [p.policy, p]));
const am = pol['amount'], li = pol['lists'], jo = pol['journey'], jl = pol['journey+lists'];
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const lakh = n => n >= 1e7 ? (n / 1e7).toFixed(1) + ' crore' : (n / 1e5).toFixed(1) + ' lakh';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const th = E.DEFAULT_CONFIG.thresholds;

const shape = Object.fromEntries(Q.journey_shape.map(r => [r.archetype, r]));
const bait = Object.fromEntries(Q.bait_rate.map(r => [r.kind, r]));
const band = Object.fromEntries(Q.score_bands.map(r => [r.kind, r]));
const gpayMonthly = 23.2e9 * 0.3275;
const nTests = (fs.readFileSync(path.join(ROOT, 'test', 'engine.test.js'), 'utf8').match(/^test\(/gm) || []).length;

const K = {
  lossCr: '₹19,813 crore', upiFraud: '₹805 crore',
  am_protected: am.protectedPct, am_gT2: am.gT2per1kMonth.toFixed(0), am_users: am.gUsersWithT2MonthPct.toFixed(1),
  li_reached: li.reachedPct, li_protected: li.protectedPct,
  jo_protected: jo.protectedPct,
  jl_protected: jl.protectedPct, jl_gT2: jl.gT2per1kMonth.toFixed(1), jl_ahead: jl.medianAheadAtFirstPct, jl_by3: jl.reachedBy3Pct,
  warnRatio: Math.round(am.gT2per1kMonth / jl.gT2per1kMonth),
  bait_scam: bait['scam payment'].pct_after_stranger_credit, bait_gen: bait['genuine payment'].pct_after_stranger_credit,
  band_scam: band.scam.pct_warning_or_above.toFixed(1), band_gen: band.genuine.pct_warning_or_above.toFixed(1),
  task_n: Math.round(shape.task.payments_per_victim), task_ids: Math.round(shape.task.receiving_ids_per_victim), task_step: shape.task.median_step_up.toFixed(1),
  stock_n: Math.round(shape.stock.payments_per_victim), stock_days: Math.round(shape.stock.median_days_on_app), stock_first: inr(shape.stock.median_first_payment),
  quick_reached: R.byArch.quick.reachedPct,
  users: R.meta.users.toLocaleString('en-IN'), victims: R.meta.victims, scored: (R.meta.scoredPayments / 1e5).toFixed(1) + ' lakh',
  generated: R.meta.generated, seed: R.meta.seed, victimRate: '0.45%',
  n1k: lakh(R.sizing[0].usersPerArm), n10k: lakh(R.sizing[2].usersPerArm),
  gpayMonthly: (gpayMonthly / 1e9).toFixed(1) + ' billion', gpayPerSec: (Math.round(gpayMonthly / (30 * 86400) / 100) * 100).toLocaleString('en-IN'),
  sqlChecked: Q.check_velocity[0].payments_checked.toLocaleString('en-IN'), nTests,
  t1: th.t1, t2: th.t2, t3: th.t3
};

// ---------- policy table ----------
const names = {
  'amount': 'Amount rule (\u20b910,000+ to a new person)',
  'lists': 'Fraud lists only',
  'journey': 'Journey score',
  'journey+lists': 'Journey score + fraud lists <b>(recommended)</b>'
};
const policyTable = '<table class="pol"><tr><th>Policy</th><th class="num">Victims warned</th><th class="num">By 3rd payment</th><th class="num">Losses protected</th><th class="num">Questions*</th><th class="num">Full warnings*</th><th class="num">Users warned / mo</th><th class="num">Precision</th></tr>' +
  R.policies.map(p => `<tr${p.policy === 'journey+lists' ? ' class="pick"' : ''}><td>${names[p.policy]}</td><td class="num">${p.reachedPct}%</td><td class="num">${p.reachedBy3Pct}%</td><td class="num"><b>${p.protectedPct}%</b></td><td class="num">${p.gT1per1kMonth ? p.gT1per1kMonth.toFixed(0) : '–'}</td><td class="num"><b>${p.gT2per1kMonth.toFixed(1)}</b></td><td class="num">${p.gUsersWithT2MonthPct.toFixed(2)}%</td><td class="num">${(p.precisionAt1in1000 * 100).toFixed(1)}%</td></tr>`).join('') + '</table>';

// ---------- persona table ----------
const pn = { everyday: 'Everyday payer', student: 'Student', trader: 'Shopkeeper on a personal UPI ID', buyer: 'Second-hand buyer', investor: 'Real investor (@valid)', mover: 'Moving flat (in the window)', freelancer: 'Freelancer', emergency: 'Family emergency (pays a relative)' };
const personaTable = '<table><tr><th>Genuine group</th><th class="num">Payers</th><th class="num">Questions / 1k / mo</th><th class="num">Full warnings / 1k / mo</th></tr>' +
  Object.entries(jl.byPersona).sort((a, b) => b[1].t2per1kMonth - a[1].t2per1kMonth).map(([k, v]) => `<tr><td>${pn[k]}</td><td class="num">${v.users.toLocaleString('en-IN')}</td><td class="num">${v.t1per1kMonth.toFixed(0)}</td><td class="num">${v.t2per1kMonth.toFixed(1)}</td></tr>`).join('') + '</table>';

// ---------- Neha timeline (honest answers) ----------
const neha = S.STORIES.find(s => s.id === 'neha');
const steps = S.play(E, neha, E.DEFAULT_CONFIG);
const totalOut = steps.filter(p => p.e.dir === 'out').reduce((a, p) => a + p.e.amt, 0);
let ahead = totalOut;
const tierName = ['no friction', 'question', 'full warning', 'hold'];
const timeline = '<div class="tl">' + steps.map(p => {
  const d = Math.floor(p.e.t / 1440) - 30, hh = Math.floor((p.e.t % 1440) / 60), mm = p.e.t % 60;
  const when = `Day ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  if (p.e.dir === 'in') return `<div class="ev in"><div class="when">${when}</div><div class="what">Receives ${inr(p.e.amt)} from ${esc(p.raw.name)}</div><div class="sees">${esc(p.raw.note)}. Not scored, but remembered.</div></div>`;
  let t = p.tier; const honest = t === 1; const remind = honest && p.res.tier >= 2; if (honest) t = 2;
  const top = p.res.signals.filter(s => s.pts > 0.25).sort((a, b) => b.pts - a.pts).slice(0, 3).map(s => esc(s.label)).join('; ');
  const line = `<div class="ev t${t}"><div class="when">${when}</div><div class="what">Pays ${inr(p.e.amt)} to ${esc(p.raw.name)} <span class="pill p${t}">${tierName[t]}</span></div><div class="sees">${esc(p.raw.note)}. Score ${p.res.score.toFixed(1)}${top ? ': ' + top : ''}.${remind ? ' She was warned the day before, so the fatigue rules show a reminder question first; answering "a job or task" brings the warning back.' : honest ? ' Question first; answering "a job or task" sends it to the warning.' : ''}${p.tier < p.res.tier && !remind ? ' A hold was already used in the last 24 hours, so this is a full warning instead.' : ''} <b>${Math.round(100 * ahead / totalOut)}% of her eventual loss is still in her account.</b></div></div>`;
  ahead -= p.e.amt;
  return line;
}).join('') + '</div>';

// ---------- trade-off chart (log x) ----------
function tradeoff() {
  const W = 760, Hh = 360, m = { l: 56, r: 24, t: 18, b: 48 };
  const x0 = Math.log10(0.02), x1 = Math.log10(200);
  const X = v => m.l + (Math.log10(Math.max(0.02, v)) - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = v => m.t + (1 - v / 100) * (Hh - m.t - m.b);
  let g = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Trade-off between warnings to genuine users and losses protected"><g class="grid">`;
  [0, 25, 50, 75, 100].forEach(v => { g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`; });
  [0.1, 1, 10, 100].forEach(v => { g += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${Hh - m.b}"/><text x="${X(v)}" y="${Hh - m.b + 18}" text-anchor="middle">${v}</text>`; });
  g += `</g><text x="${(W + m.l) / 2}" y="${Hh - 8}" text-anchor="middle">Full warnings per 1,000 genuine users per month (log scale)</text>`;
  g += `<text transform="translate(14 ${(Hh - m.b + m.t) / 2}) rotate(-90)" text-anchor="middle">Share of victim losses protected</text>`;
  const pts = R.sweep.filter(s => s.gT2per1kMonth > 0).sort((a, b) => a.gT2per1kMonth - b.gT2per1kMonth);
  g += `<polyline fill="none" stroke="var(--s1)" stroke-width="2" points="${pts.map(s => X(s.gT2per1kMonth) + ',' + Y(s.protectedPct)).join(' ')}"/>`;
  pts.forEach(s => { g += `<circle cx="${X(s.gT2per1kMonth)}" cy="${Y(s.protectedPct)}" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" data-tip="Warning threshold ${s.t2}: ${s.gT2per1kMonth} warnings per 1,000 genuine users a month, ${s.protectedPct}% of losses protected, ${s.reachedPct}% of victims warned"/>`; });
  const L = R.sweep.find(s => Math.abs(s.t2 - th.t2) < 0.01);
  g += `<circle cx="${X(L.gT2per1kMonth)}" cy="${Y(L.protectedPct)}" r="8" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  g += `<text class="lbl" x="${X(L.gT2per1kMonth) - 12}" y="${Y(L.protectedPct) - 16}" text-anchor="end">Launch threshold (${th.t2}): ${L.gT2per1kMonth} warnings, ${L.protectedPct}% protected</text>`;
  [[am, 'Amount rule', 'end', -12], [li, 'Fraud lists only', 'start', 12]].forEach(([p, n, anchor, dx]) => {
    g += `<rect x="${X(p.gT2per1kMonth) - 6}" y="${Y(p.protectedPct) - 6}" width="12" height="12" rx="2" fill="var(--s2)" stroke="var(--surface)" stroke-width="2" data-tip="${n}: ${p.gT2per1kMonth.toFixed(1)} warnings per 1,000 genuine users a month, ${p.protectedPct}% protected"/>`;
    g += `<text class="lbl" x="${X(p.gT2per1kMonth) + dx}" y="${Y(p.protectedPct) + 4}" text-anchor="${anchor}">${n}: ${p.gT2per1kMonth.toFixed(0)} warnings, ${p.protectedPct}%</text>`;
  });
  g += `<g transform="translate(${m.l + 10} ${m.t + 8})"><circle cx="5" cy="5" r="4" fill="var(--s1)"/><text x="14" y="9">Journey score + lists, at different thresholds</text><rect x="1" y="19" width="9" height="9" rx="2" fill="var(--s2)"/><text x="14" y="28">Simple rules</text></g>`;
  return g + '</svg>';
}

// ---------- ablation chart ----------
function ablation() {
  const lab = { new: 'First payment to this person', vel: 'New people paid in 7 days', bait: 'Stranger paid you first (bait)', esc: 'Rising amounts across people', cum: 'Money to new people vs usual month', fan: 'Many first-time payers today', listed: 'On a government fraud list', round: 'Round amount' };
  const rows = R.ablation.map(a => ({ s: a.signal, d: +(jl.protectedPct - a.protectedPct).toFixed(1), w: a.gT2per1kMonth })).sort((a, b) => b.d - a.d);
  const W = 760, rowH = 30, m = { l: 250, r: 70, t: 6 }, Hh = m.t + rows.length * rowH + 26;
  const max = Math.max(...rows.map(r => r.d), 1);
  const X = v => m.l + Math.max(0, v) / max * (W - m.l - m.r);
  let g = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Protection lost when each signal is removed">`;
  rows.forEach((r, i) => {
    const y = m.t + i * rowH;
    g += `<text x="${m.l - 10}" y="${y + 18}" text-anchor="end" style="fill:var(--ink)">${lab[r.s]}</text>`;
    const w = Math.max(2, X(r.d) - m.l);
    g += `<rect x="${m.l}" y="${y + 6}" width="${w}" height="16" rx="4" fill="var(--s1)" data-tip="Without '${lab[r.s]}': protection ${(jl.protectedPct - r.d).toFixed(1)}% (${r.d >= 0 ? '−' : '+'}${Math.abs(r.d)} points), full warnings ${r.w} per 1,000 genuine users a month"/>`;
    g += `<text x="${m.l + w + 8}" y="${y + 18}">${r.d > 0 ? '−' + r.d + ' pts' : r.d === 0 ? '0' : '+' + Math.abs(r.d) + ' pts'}</text>`;
  });
  g += `<line class="axis" x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + rows.length * rowH}"/>`;
  return g + '</svg>';
}

let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const blocks = {
  POLICY_TABLE: policyTable, PERSONA_TABLE: personaTable, TIMELINE: timeline,
  CHART_TRADEOFF: tradeoff(), CHART_ABLATION: ablation(),
  ENGINE: fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8'),
  STORIES: fs.readFileSync(path.join(__dirname, 'stories.js'), 'utf8'),
  DATA: JSON.stringify({ heed: R.meta.heed, traces: R.traces })
};
html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m0, k) => { if (!(k in blocks)) throw new Error('missing block ' + k); return blocks[k]; });
html = html.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m0, k) => { if (!(k in K)) throw new Error('missing key ' + k); return String(K[k]); });
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html written,', (html.length / 1024).toFixed(0), 'KB');
console.log(K);
