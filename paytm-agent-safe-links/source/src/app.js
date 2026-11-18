// UI for the page. Everything runs in the browser; no network calls.
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inr = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pill = d => `<span class="pill ${d.toLowerCase()}">${d}</span>`;
  const { CTX, CASES } = window;

  // ---------- Try it ----------
  const sel = $('#case');
  sel.innerHTML = CASES.map(c => `<option value="${c.id}">${c.id} · ${esc(c.group)} · ${esc(c.text.slice(0, 60))}${c.text.length > 60 ? '…' : ''}</option>`).join('');
  function load(id) {
    const c = CASES.find(x => x.id === id);
    $('#t-text').value = c.text; $('#t-source').value = c.source || 'merchant'; $('#t-tool').value = c.call.tool;
    $('#t-args').value = JSON.stringify(c.call.args, null, 2);
    run();
  }
  function run() {
    let args;
    try { args = JSON.parse($('#t-args').value); $('#t-err').textContent = ''; }
    catch (e) { $('#t-err').textContent = 'Arguments are not valid JSON: ' + e.message; return; }
    const r = window.evaluate({ tool: $('#t-tool').value, args, provenance: { source: $('#t-source').value, text: $('#t-text').value } }, CTX);
    const amt = window.parseAmounts($('#t-text').value);
    $('#t-out').innerHTML = `
      <div class="decision">${pill(r.decision)} <span class="muted">${r.decision === 'AUTO' ? 'Runs now.' : r.decision === 'CONFIRM' ? 'Waits for the merchant to tap Approve.' : 'Not run. The agent is told why, in words it can act on.'}</span></div>
      <div class="muted small">Amounts read from the message: ${amt.candidates.length ? amt.candidates.map(c => inr(c.value) + (c.ambiguous ? ' (?)' : '')).join(', ') : 'none'}</div>
      <ul class="reasons">${r.reasons.map(x => `<li>${pill(x.level)} <code>${x.code}</code> ${esc(x.msg)}</li>`).join('') || '<li class="muted">No rule fired.</li>'}</ul>
      ${r.card ? `<div class="phone"><div class="phone-h">Approve this?</div><div class="phone-b">${esc(r.card)}</div><div class="phone-a"><span>Reject</span><span>Edit</span><span class="ok">Approve</span></div><div class="muted small">Push to the merchant's business app. Expires in 10 minutes if ignored; nothing runs.</div></div>` : ''}`;
  }
  sel.addEventListener('change', () => load(sel.value));
  ['#t-text', '#t-source', '#t-tool', '#t-args'].forEach(s => $(s).addEventListener('input', run));
  load('R01'); sel.value = 'R01';

  // ---------- Test set ----------
  let pass = 0;
  $('#cases tbody').innerHTML = CASES.map(c => {
    const r = window.evaluate({ ...c.call, provenance: { source: c.source || 'merchant', text: c.text } }, CTX);
    const ok = r.decision === c.expect; if (ok) pass++;
    return `<tr class="${ok ? '' : 'bad'}"><td>${c.id}</td><td>${esc(c.group)}</td><td>${esc(c.text)}<div class="muted small">${esc(c.call.tool)} ${esc(JSON.stringify(c.call.args))}</div></td><td>${esc(c.why || '')}</td><td>${pill(c.expect)}</td><td>${pill(r.decision)}</td><td class="small">${r.reasons.filter(x => x.level !== 'AUTO' || x.code === 'READ_ONLY').map(x => x.code).join(', ')}</td></tr>`;
  }).join('');
  $('#cases-score').textContent = `${pass} of ${CASES.length} match`;
  const byGroup = {};
  CASES.forEach(c => { byGroup[c.group] = byGroup[c.group] || { n: 0, AUTO: 0, CONFIRM: 0, BLOCK: 0 }; byGroup[c.group].n++; byGroup[c.group][c.expect]++; });

  // ---------- Simulation ----------
  const RATE_UI = [
    ['amountMisread', 'Agent misreads the amount', 0, 0.1, 0.005],
    ['contactError', 'Agent uses a wrong or invented contact', 0, 0.1, 0.005],
    ['retryDuplicate', 'Agent retries a create after a timeout', 0, 0.1, 0.005],
    ['ambiguousText', 'Merchant writes an ambiguous amount', 0, 0.1, 0.005],
    ['partialWrong', 'Agent turns on part payments unasked', 0, 0.05, 0.005],
    ['injected', 'Instruction comes from an email or PDF', 0, 0.05, 0.001],
    ['refundShare', 'Share of requests that are refunds', 0, 0.3, 0.01],
    ['refundOver', 'Refunds asking for more than is left', 0, 0.5, 0.01],
    ['rubberStamp', 'If every write asks, taps approved unread', 0, 1, 0.05],
  ];
  const D = window.DEFAULT_RATES;
  $('#sliders').innerHTML = RATE_UI.map(([k, label, min, max, step]) => `<label class="slider"><span>${label}</span><input type="range" id="r-${k}" min="${min}" max="${max}" step="${step}" value="${D[k]}"><b id="v-${k}">${(D[k] * 100).toFixed(1)}%</b></label>`).join('');
  function sim() {
    const rates = {};
    RATE_UI.forEach(([k]) => { rates[k] = +$('#r-' + k).value; $('#v-' + k).textContent = (rates[k] * 100).toFixed(1) + '%'; });
    const { summary: s } = window.simulate(rates);
    const P = s.policies;
    const row = (p, extra) => `<tr><td>${p.label}</td><td><b>${p.badThrough}</b> of ${s.bad}</td><td>${p.goodAsked} (${(100 * p.goodAsked / s.good).toFixed(0)}%)</td><td>${p.goodBlocked}</td><td class="small">${extra}</td></tr>`;
    $('#sim-table tbody').innerHTML =
      row(P.direct, 'What a direct agent connection does if nothing sits in between.') +
      row(P.cap, 'Most bad calls are small: wrong person, duplicate, over-refund. A cap never sees them.') +
      row(P.askAll, 'Safe on paper. In practice people approve without reading when every action asks.') +
      row(P.gate, `Blocks ${P.gate.badBlocked}, asks on ${P.gate.badConfirm}, lets ${P.gate.badAuto} run unasked. Asks on ${(P.gate.askShare * 100).toFixed(0)}% of writes.`);
    const names = { clean: 'Clean request', new_customer: 'Genuinely new customer', ambiguous: 'Ambiguous amount in message', refund: 'Valid refund', amount_misread: 'Agent misread amount', contact_error: 'Wrong or invented contact', retry_duplicate: 'Retry duplicate', partial_wrong: 'Part payments unasked', injected: 'Instruction from data', refund_over: 'Refund above what is left' };
    $('#kind-table tbody').innerHTML = Object.entries(s.byKind).sort((a, b) => b[1].n - a[1].n).map(([k, v]) =>
      `<tr><td>${names[k] || k}</td><td>${v.truth === 'bad' ? '<span class="pill block">must not run</span>' : v.truth === 'needs_tap' ? '<span class="pill confirm">needs a tap</span>' : '<span class="pill auto">fine to run</span>'}</td><td>${v.n}</td><td>${v.AUTO}</td><td>${v.CONFIRM}</td><td>${v.BLOCK}</td></tr>`).join('');
    $('#k-total').textContent = s.total.toLocaleString('en-IN');
    $('#k-bad').textContent = s.bad;
    $('#k-cap').textContent = P.cap.badThrough;
    $('#k-gate').textContent = P.gate.badThrough;
    $('#k-ask').textContent = (P.gate.askShare * 100).toFixed(0) + '%';
    $('#k-clean').textContent = (100 * s.cleanAuto / s.cleanTotal).toFixed(1) + '%';
    return s;
  }
  RATE_UI.forEach(([k]) => $('#r-' + k).addEventListener('input', sim));
  $('#reset').addEventListener('click', () => { RATE_UI.forEach(([k]) => { $('#r-' + k).value = D[k]; }); sim(); });
  const s0 = sim();

  // ---------- Self-checks (same assertions as the Node test suite) ----------
  const checks = [];
  const chk = (name, fn) => { let ok = false, info = ''; try { const r = fn(); ok = r === true || (r && r.ok); info = r && r.info || ''; } catch (e) { info = e.message; } checks.push({ name, ok, info }); };
  const vals = t => window.parseAmounts(t).candidates.map(c => c.value).sort((a, b) => a - b).join(',');
  chk('Parser reads Indian grouping and suffixes (1,20,000 · ₹2,500 · 5 lakh · 4k)', () => vals('1,20,000') === '120000' && vals('₹2,500') === '2500' && vals('5 lakh') === '500000' && vals('4k') === '4000');
  chk('Parser reads spoken Hinglish (dedh hazaar · dhai hazaar · saadhe teen hazaar · do hazaar paanch sau)', () => vals('dedh hazaar') === '1500' && vals('dhai hazaar') === '2500' && vals('saadhe teen hazaar') === '3500' && vals('do hazaar paanch sau') === '2500');
  chk('Parser surfaces ambiguity instead of guessing ("1.5", "15,00")', () => vals('1.5 ka link') === '1.5,1500,150000' && vals('15,00 ka') === '15,1500,15000');
  chk('Phone numbers, link IDs, counts and durations are never read as amounts', () => vals('number 9876501234') === '' && vals('LNK-6990 ko 3 din') === '' && vals('3 kishton mein') === '' && vals('link bhej do') === '');
  chk(`All ${CASES.length} scripted proposals get the expected decision`, () => ({ ok: pass === CASES.length, info: `${pass}/${CASES.length}` }));
  chk('Hard rule: a refund is never AUTO', () => CASES.filter(c => c.call.tool === 'initiate_refund').every(c => window.evaluate({ ...c.call, provenance: { source: 'merchant', text: c.text } }, CTX).decision !== 'AUTO'));
  chk('Hard rule: no write runs on an instruction that came from data', () => CASES.filter(c => !/^fetch_/.test(c.call.tool)).every(c => window.evaluate({ ...c.call, provenance: { source: 'tool_output', text: c.text } }, CTX).decision === 'BLOCK'));
  chk('Hard rule: no link goes to a contact the merchant never saved or typed', () => window.evaluate({ tool: 'create_payment_link', args: { recipient_name: 'Zara', amount: 500, purpose: 'x', customer_mobile: '9000000001' }, provenance: { source: 'merchant', text: 'Zara ko 500 ka link' } }, CTX).decision === 'BLOCK');
  chk('Two saved customers with the same name: either saved number works, a third is blocked', () => {
    const ctx = Object.assign({}, CTX, { customers: CTX.customers.concat([{ name: 'Meera Shah', mobile: '9000011111', email: '' }]) });
    const mk = mob => window.evaluate({ tool: 'create_payment_link', args: { recipient_name: 'Meera Shah', amount: 4500, purpose: 'Fees', customer_mobile: mob }, provenance: { source: 'merchant', text: 'Meera Shah ko 4500 ka link' } }, ctx).decision;
    return mk('9876501234') === 'AUTO' && mk('9000011111') === 'AUTO' && mk('9000022222') === 'BLOCK';
  });
  chk('Missing expiry is defaulted, and never beyond one year', () => { const r = window.evaluate({ ...CASES[0].call, provenance: { source: 'merchant', text: CASES[0].text } }, CTX); const d = (new Date(r.args.expiry) - new Date(CTX.now)) / 864e5; return d > 0 && d <= 365; });
  chk('Simulation: gate beats every baseline and lets 0 bad calls run unasked', () => { const p = s0.policies; return { ok: p.gate.badThrough < p.cap.badThrough && p.gate.badThrough < p.askAll.badThrough && p.gate.badAuto === 0, info: `gate ${p.gate.badThrough} vs cap ${p.cap.badThrough}` }; });
  chk('Simulation: asks on under 20% of writes; over 97% of clean requests run straight through', () => ({ ok: s0.policies.gate.askShare < 0.2 && s0.cleanAuto / s0.cleanTotal > 0.97, info: `${(s0.policies.gate.askShare * 100).toFixed(1)}% asked` }));
  const passed = checks.filter(c => c.ok).length;
  $('#checks').innerHTML = checks.map(c => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${esc(c.name)} ${c.info ? `<span class="muted small">(${esc(c.info)})</span>` : ''}</li>`).join('');
  $('#checks-score').textContent = `${passed} of ${checks.length} pass`;
  $('#hero-checks').textContent = `${passed}/${checks.length} self-checks pass on this page load`;
  window.__checks = { passed, total: checks.length };
})();
