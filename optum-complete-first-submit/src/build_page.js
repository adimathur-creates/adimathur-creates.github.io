/* Builds index.html and the downloads from the backlog, the rules engine and the sample results.
 *   node src/sample.js && node src/build_page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PA = require('./pa');
const B = require('./backlog');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sample-results.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- swimlane diagrams ----------
const LANES = ['Clinician (in the EHR)', 'Prior-auth coordinator', 'Health plan systems', 'Clinical reviewer (nurse / doctor)'];
function swim(title, nodes, edges, W = 980) {
  const LH = 96, LW = 132, top = 8, H = top + LANES.length * LH + 6;
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><defs><marker id="ah${title.length}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>`;
  LANES.forEach((l, i) => {
    const y = top + i * LH;
    g += `<rect x="0" y="${y}" width="${W}" height="${LH}" fill="${i % 2 ? 'var(--lane2)' : 'var(--lane1)'}"/>`;
    g += `<text x="10" y="${y + LH / 2 - 6}" class="lane">${esc(l.split(' (')[0])}</text>${l.includes('(') ? `<text x="10" y="${y + LH / 2 + 10}" class="lanesub">(${esc(l.split(' (')[1])}</text>` : ''}`;
  });
  g += `<line x1="${LW - 8}" x2="${LW - 8}" y1="${top}" y2="${H - 6}" stroke="var(--line)"/>`;
  const pos = {};
  nodes.forEach(n => { const cy = top + n.lane * LH + LH / 2; pos[n.id] = { cx: n.x, cy, w: n.w || 124, h: n.diamond ? 64 : 50, diamond: n.diamond }; });
  const anchor = (id, side) => { const p = pos[id]; const hw = p.w / 2, hh = p.h / 2; return { r: [p.cx + hw, p.cy], l: [p.cx - hw, p.cy], t: [p.cx, p.cy - hh], b: [p.cx, p.cy + hh] }[side]; };
  edges.forEach(e => {
    const a = anchor(e.from, e.fs || 'r'), b = anchor(e.to, e.ts || 'l');
    let d;
    if (e.via) d = `M${a[0]},${a[1]} ` + e.via.map(p => `L${p[0]},${p[1]}`).join(' ') + ` L${b[0]},${b[1]}`;
    else if (a[1] === b[1] || a[0] === b[0]) d = `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
    else d = (e.fs === 'b' || e.fs === 't') ? `M${a[0]},${a[1]} L${a[0]},${b[1]} L${b[0]},${b[1]}` : `M${a[0]},${a[1]} L${(a[0] + b[0]) / 2},${a[1]} L${(a[0] + b[0]) / 2},${b[1]} L${b[0]},${b[1]}`;
    g += `<path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" ${e.dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#ah${title.length})"/>`;
    if (e.label) g += `<text x="${e.lx}" y="${e.ly}" class="elabel">${esc(e.label)}</text>`;
  });
  nodes.forEach(n => {
    const p = pos[n.id], lines = n.t.split('\n');
    const fill = n.kind === 'bad' ? 'var(--bad-soft)' : n.kind === 'good' ? 'var(--good-soft)' : 'var(--surface)';
    const stroke = n.kind === 'bad' ? 'var(--bad)' : n.kind === 'good' ? 'var(--good)' : 'var(--ink-soft)';
    if (p.diamond) g += `<polygon points="${p.cx},${p.cy - p.h / 2} ${p.cx + p.w / 2},${p.cy} ${p.cx},${p.cy + p.h / 2} ${p.cx - p.w / 2},${p.cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
    else g += `<rect x="${p.cx - p.w / 2}" y="${p.cy - p.h / 2}" width="${p.w}" height="${p.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
    lines.forEach((l, i) => { g += `<text x="${p.cx}" y="${p.cy + (i - (lines.length - 1) / 2) * 14 + 4}" text-anchor="middle" class="node">${esc(l)}</text>`; });
  });
  return g + '</svg>';
}
const today = swim('Today: prior auth for a lumbar MRI', [
  { id: 'a', lane: 0, x: 205, t: 'Signs MRI order' },
  { id: 'b', lane: 1, x: 345, t: 'Checks the plan\'s\nlist or portal' },
  { id: 'c', lane: 1, x: 485, t: 'Copies notes,\nfills the form' },
  { id: 'd', lane: 1, x: 625, t: 'Uploads or faxes' },
  { id: 'e', lane: 2, x: 625, t: 'Complete?', diamond: true, w: 110 },
  { id: 'f', lane: 2, x: 800, t: 'Pend letter:\n"send more info"', kind: 'bad' },
  { id: 'g', lane: 1, x: 800, t: 'Chases clinician,\nresubmits', kind: 'bad' },
  { id: 'h', lane: 3, x: 625, t: 'Reviews the\npacket by hand' },
  { id: 'i', lane: 3, x: 800, t: 'Decision; reason\noften unclear' }
], [
  { from: 'a', to: 'b', fs: 'r', ts: 't', via: [[345, 56]] },
  { from: 'b', to: 'c' }, { from: 'c', to: 'd' },
  { from: 'd', to: 'e', fs: 'b', ts: 't' },
  { from: 'e', to: 'f', label: 'No', lx: 690, ly: 238 },
  { from: 'f', to: 'g', fs: 't', ts: 'b', label: 'up to 3 business days', lx: 808, ly: 193 },
  { from: 'g', to: 'd', fs: 't', ts: 't', via: [[800, 120], [625, 120]], dash: true, label: 'loop', lx: 700, ly: 116 },
  { from: 'e', to: 'h', fs: 'b', ts: 't', label: 'Yes', lx: 640, ly: 290 },
  { from: 'h', to: 'i' }
]);
const target = swim('Target: complete on first submit', [
  { id: 'a', lane: 0, x: 205, t: 'Signs MRI order' },
  { id: 'b', lane: 2, x: 345, t: 'Coverage check:\nPA needed? (seconds)', kind: 'good', w: 150 },
  { id: 'c', lane: 1, x: 485, t: 'Questions pre-filled\nfrom the chart', kind: 'good' },
  { id: 'r', lane: 0, x: 485, t: 'One tap: confirm\nred flags', kind: 'good' },
  { id: 'd', lane: 1, x: 625, t: 'Checklist of only\nwhat is missing' },
  { id: 'e', lane: 1, x: 765, t: 'Submit through\nthe PA API' },
  { id: 'f', lane: 2, x: 765, t: 'Complete and\nmeets rules?', diamond: true, w: 150 },
  { id: 'g', lane: 2, x: 915, t: 'Approved in\nreal time', kind: 'good', w: 100 },
  { id: 'h', lane: 3, x: 900, t: 'Clinician decides;\nspecific reason', w: 140 }
], [
  { from: 'a', to: 'b', fs: 'r', ts: 't', via: [[345, 56]] },
  { from: 'b', to: 'c', fs: 'r', ts: 'b', via: [[485, 248]] },
  { from: 'c', to: 'r', fs: 't', ts: 'b', label: 'if not in chart', lx: 492, ly: 100 },
  { from: 'r', to: 'd', fs: 'r', ts: 't', via: [[625, 56]] },
  { from: 'c', to: 'd' }, { from: 'd', to: 'e' },
  { from: 'e', to: 'f', fs: 'b', ts: 't' },
  { from: 'f', to: 'g', label: 'Yes', lx: 841, ly: 241 },
  { from: 'f', to: 'h', fs: 'b', ts: 'l', via: [[765, 344]], label: 'Unclear or no: never auto-deny', lx: 560, ly: 362 }
], 980);

// ---------- pareto chart ----------
function pareto() {
  const lab = { redFlags: 'Red flags confirmed', neuroExam: 'Neurological exam result', conservativeWeeks: 'Weeks of conservative care', symptomWeeks: 'Weeks of pain', recentNote: 'Office note from last 30 days', dx: 'Diagnosis' };
  const pre = Object.fromEntries(S.pareto.map(p => [p.linkId, p.requests]));
  const post = Object.fromEntries(S.paretoB.map(p => [p.linkId, p.requests]));
  const keys = S.pareto.map(p => p.linkId);
  const W = 760, rowH = 46, m = { l: 210, r: 70, t: 30 }, H = m.t + keys.length * rowH + 44;
  const X = v => m.l + v / S.meta.n * (W - m.l - m.r);
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Requests missing each item, before and after asking">`;
  g += `<g transform="translate(${m.l} 8)"><rect width="10" height="10" rx="2" fill="var(--s1)"/><text x="16" y="9">Pre-fill only</text><rect x="120" width="10" height="10" rx="2" fill="var(--s2)"/><text x="136" y="9">After asking before submit</text></g>`;
  [0, 250, 500, 750, 1000].forEach(v => { g += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - 40}" stroke="var(--grid)"/><text x="${X(v)}" y="${H - 24}" text-anchor="middle">${v}</text>`; });
  keys.forEach((k, i) => {
    const y = m.t + i * rowH;
    g += `<text x="${m.l - 10}" y="${y + 22}" text-anchor="end" style="fill:var(--ink)">${lab[k]}</text>`;
    const a = pre[k] || 0, b = post[k] || 0;
    g += `<rect x="${m.l}" y="${y + 6}" width="${Math.max(2, X(a) - m.l)}" height="14" rx="4" fill="var(--s1)" data-tip="${lab[k]}: missing in ${a} of ${S.meta.n} requests with pre-fill only"/><text x="${X(a) + 6}" y="${y + 17}">${a}</text>`;
    g += `<rect x="${m.l}" y="${y + 22}" width="${Math.max(2, X(b) - m.l)}" height="14" rx="4" fill="var(--s2)" data-tip="${lab[k]}: still missing in ${b} of ${S.meta.n} requests after asking"/><text x="${X(b) + 6}" y="${y + 33}">${b}</text>`;
  });
  g += `<text x="${(W + m.l) / 2}" y="${H}" text-anchor="middle" style="font-size:11px">Requests missing this item (out of ${S.meta.n.toLocaleString('en-IN')} synthetic requests)</text>`;
  return g + '</svg>';
}

// ---------- tables ----------
const featById = Object.fromEntries(B.features.map(f => [f.id, f]));
const wsjfTable = '<table><tr><th>Feature</th><th>What it does</th><th class="num">Value</th><th class="num">Time crit.</th><th class="num">Risk red.</th><th class="num">Size</th><th class="num">WSJF</th></tr>' +
  B.features.slice().sort((a, b) => b.wsjf - a.wsjf).map(f => `<tr><td><b>${f.id}</b> ${esc(f.name)}</td><td>${esc(f.what)}</td><td class="num">${f.bv}</td><td class="num">${f.tc}</td><td class="num">${f.rr}</td><td class="num">${f.size}</td><td class="num"><b>${f.wsjf}</b></td></tr>`).join('') + '</table>';
const storyBlocks = B.features.map(f => {
  const ss = B.stories.filter(s => s.feature === f.id);
  return `<h3>${f.id} · ${esc(f.name)} <span class="note">WSJF ${f.wsjf}</span></h3>` + ss.map(s => `<details><summary><span class="sid">${s.id}</span> ${esc(s.story)} <span class="pts">${s.points} pts · ${esc(s.sprint)}${s.must ? ' · must' : ''}</span></summary><div class="ac">${s.ac.map(c => `<p><b>Given</b> ${esc(c.given)}<br><b>When</b> ${esc(c.when)}<br><b>Then</b> ${esc(c.then)}${c.and.map(a => `<br><b>And</b> ${esc(a)}`).join('')}</p>`).join('')}</div></details>`).join('');
}).join('');
const sprintTable = '<table><tr><th>Sprint</th><th>Dates</th><th class="num">Capacity</th><th>Stories</th><th class="num">Planned</th><th>Note</th></tr>' +
  B.capacity.map(c => { const ss = B.stories.filter(s => s.sprint === c.sprint); const pts = ss.reduce((a, s) => a + s.points, 0); return `<tr><td><b>${c.sprint}</b></td><td>${c.dates}</td><td class="num">${c.points}</td><td>${ss.map(s => s.id).join(', ') || '–'}</td><td class="num">${pts}</td><td>${esc(c.note)}</td></tr>`; }).join('') +
  `<tr class="cut"><td colspan="6"><b>Cut line for 1 Jan 2027.</b> Below it, after go-live: ${B.stories.filter(s => s.sprint === 'After go-live').map(s => s.id + ' (' + s.points + ')').join(', ')}. Spike S7.1 runs in Sprint 2 with clinical policy.</td></tr></table>`;
const personaCards = B.personas.map(p => `<div class="card"><h3>${esc(p.name)}</h3><p class="note">${esc(p.role)}</p><p><b>Wants:</b> ${esc(p.goal)}</p><ul>${p.pains.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="quote">${esc(p.quote)}</p></div>`).join('');
const J = B.journey;
const journeyTable = `<table class="journey"><tr><th></th>${J.stages.map(s => `<th>${s}</th>`).join('')}</tr>` +
  [['Today', J.today], ['Pain', J.pain], ['Target', J.target], ['Measure', J.metric]].map(([k, row]) => `<tr class="j-${k.toLowerCase()}"><td><b>${k}</b></td>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</table>';
const simpleTable = (cols, rows) => `<table><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
const depTable = simpleTable(['Dependency', 'Owner', 'Needed by', 'Status'], B.dependencies.map(d => [d.what, d.owner, d.needed, d.status]));
const riskTable = simpleTable(['Risk', 'ROAM', 'Plan'], B.risks.map(r => [r.risk, r.roam, r.plan]));
const okrHtml = B.okrs.map(o => `<div class="card"><h3>${esc(o.o)}</h3><ul>${o.krs.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>`).join('');
const li = arr => '<ul>' + arr.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
const ol = arr => '<ol>' + arr.map(x => `<li>${esc(x)}</li>`).join('') + '</ol>';

// ---------- downloads ----------
const csvq = v => '"' + String(v).replace(/"/g, '""') + '"';
const acText = s => s.ac.map(c => `Given ${c.given}\nWhen ${c.when}\nThen ${c.then}` + c.and.map(a => `\nAnd ${a}`).join('')).join('\n\n');
const csv = ['Name,Description,Acceptance Criteria,Plan Estimate,Feature,Iteration,Schedule State,Tags'].concat(
  B.stories.map(s => [s.id + ' ' + s.story.split(', so that')[0].replace(/^As an? [^,]+, /, '').replace(/^I want (to )?/, '').replace(/^we want (to )?/, ''), s.story, acText(s), s.points, s.feature + ' ' + featById[s.feature].name, s.sprint, 'Defined', (s.must ? 'must-have;' : '') + 'prior-auth;lumbar-mri'].map(csvq).join(','))).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'downloads', 'rally-backlog.csv'), csv);
B.stories.forEach(s => {
  const md = `---\ntitle: "${s.id}: ${s.story.split(', so that')[0].replace(/"/g, "'")}"\nlabels: [user-story, ${s.feature}, ${s.must ? 'must-have' : 'later'}]\n---\n\n**Story.** ${s.story}\n\n**Feature.** ${s.feature} ${featById[s.feature].name}\n\n**Estimate.** ${s.points} points · ${s.sprint}\n\n### Acceptance criteria\n\n` + s.ac.map(c => '```gherkin\nGiven ' + c.given + '\nWhen ' + c.when + '\nThen ' + c.then + c.and.map(a => '\nAnd ' + a).join('') + '\n```').join('\n\n') + `\n\n### Definition of done\n\n${B.dod.map(d => '- [ ] ' + d).join('\n')}\n`;
  fs.writeFileSync(path.join(ROOT, 'downloads', 'github-issues', s.id.replace('.', '-') + '.md'), md);
});
fs.writeFileSync(path.join(ROOT, 'downloads', 'questionnaire-lumbar-mri.json'), JSON.stringify(PA.QUESTIONNAIRE, null, 2));

// ---------- page ----------
const totalPts = B.stories.reduce((a, s) => a + s.points, 0), mustPts = B.stories.filter(s => s.must).reduce((a, s) => a + s.points, 0);
const nTests = (fs.readFileSync(path.join(ROOT, 'test', 'pa.test.js'), 'utf8').match(/^test\(/gm) || []).length;
const top = S.pareto[0], topB = S.paretoB[0];
const K = {
  completeA: S.completeA, completeB: S.completeB, autoB: S.routesB.autoApprove, reviewB: S.routesB.clinicalReview, incB: S.routesB.incomplete,
  topPct: top.pctOfIncomplete, topBPct: topB.pctOfIncomplete, n: S.meta.n.toLocaleString('en-IN'),
  nStories: B.stories.length, totalPts, mustPts, nTests, falseAuto: S.falseAutoApprovals, generated: S.meta.generated
};
const blocks = {
  TODAY: today, TARGET: target, PARETO: pareto(), WSJF: wsjfTable, STORIES: storyBlocks, SPRINTS: sprintTable,
  PERSONAS: personaCards, JOURNEY: journeyTable, DEPS: depTable, RISKS: riskTable, OKRS: okrHtml,
  GUARDRAILS: li(B.guardrails), DOR: li(B.dor), DOD: li(B.dod), NFRS: li(B.nfrs), GROOMING: ol(B.grooming),
  PA_JS: fs.readFileSync(path.join(__dirname, 'pa.js'), 'utf8'), PATIENTS_JS: fs.readFileSync(path.join(__dirname, 'patients.js'), 'utf8')
};
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => { if (!(k in blocks)) throw new Error('block ' + k); return blocks[k]; });
html = html.replace(/\{\{([a-zA-Z]+)\}\}/g, (m, k) => { if (!(k in K)) throw new Error('key ' + k); return String(K[k]); });
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(0) + 'KB', K);
