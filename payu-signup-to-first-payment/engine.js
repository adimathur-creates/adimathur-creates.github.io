/*
 * First Payment in 7 Days — simulation engine.
 * SIMULATION ON FICTIONAL DATA. Every merchant, rate, rupee figure and milestone here is invented.
 * Nothing here is PayU data. Built with Claude by Aditya Mathur.
 *
 * Works in the browser (window.Engine) and in Node (require('./engine.js')).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(this, function () {
  'use strict';

  // ---------- deterministic random numbers ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(u, items) { // items: [[value, weight], ...]
    var total = 0, i; for (i = 0; i < items.length; i++) total += items[i][1];
    var x = u * total;
    for (i = 0; i < items.length; i++) { x -= items[i][1]; if (x < 0) return items[i][0]; }
    return items[items.length - 1][0];
  }
  function lerp(u, a, b) { return a + u * (b - a); }

  // ---------- assumptions (all fictional, all editable in one place) ----------
  var A = {
    seed: 20261118,
    weeks: 8,
    signupsPerWeek: 600,
    segments: [
      { key: 'micro', label: 'Micro (turnover up to ₹40L)', share: 0.58, monthlyGmv: 60000 },
      { key: 'small', label: 'Small (₹40L to ₹5Cr)', share: 0.32, monthlyGmv: 450000 },
      { key: 'mid', label: 'Mid (above ₹5Cr)', share: 0.10, monthlyGmv: 2500000 }
    ],
    paths: [
      { key: 'nocode', label: 'No-code (payment links / pages)' },
      { key: 'plugin', label: 'Plugin (store platforms)' },
      { key: 'api', label: 'API / SDK' }
    ],
    netRevenueRate: 0.0025,        // net revenue as share of GMV after bank and network costs (assumption)
    activeAfterFirstPayment: 0.70,  // share of first-payment merchants still transacting at day 30
    activeIfLinkOnly: 0.60,         // lower for merchants who only ever used the link fallback
    monthlyChurnAfterD30: 0.04,     // share of day-30 active merchants lost each later month
    costs: {
      voiceCall: 8,          // ₹ per voice-agent call attempt
      whatsapp: 0.8,         // ₹ per WhatsApp template message
      engWeek: 150000,       // ₹ per engineering week, loaded
      engWeeks: { L1: 3, L2: 2, L3: 2, L4: 2 }
    }
  };

  var STAGES = [
    { key: 'signed', label: 'Signed up' },
    { key: 'docs', label: 'Documents submitted' },
    { key: 'kyc', label: 'KYC approved' },
    { key: 'live', label: 'Integration live' },
    { key: 'first', label: 'First successful payment' }
  ];

  var LEVERS = {
    L1: { key: 'L1', name: 'Fix-it rework queue', short: 'Reason-specific fix screens for KYC rework (bank name, PAN–GST, policy pages)', owner: 'Product (Onboarding) + Risk Ops' },
    L2: { key: 'L2', name: 'Simplified route for small merchants', short: 'Route eligible micro merchants (turnover up to ₹40L, not high-risk) to the simplified due-diligence path', owner: 'Risk & Compliance + Product' },
    L3: { key: 'L3', name: 'First payment by link', short: 'After KYC approval, plugin/API merchants can take their first live payment by link while integration finishes', owner: 'Product (Payment Links) + Sales' },
    L4: { key: 'L4', name: 'Stall nudges (voice + WhatsApp)', short: 'Hindi/English voice call and WhatsApp at the two biggest stall points, hand-off to an account manager', owner: 'Product (Merchant Growth) + Ops' }
  };

  // ---------- cohort generation ----------
  // Each merchant gets a fixed vector of random numbers, so turning a lever on changes
  // only what the lever touches (common random numbers). Differences are lever effects,
  // not noise.
  var DRAWS = 24;
  function makeCohort(opts) {
    opts = opts || {};
    var seed = opts.seed || A.seed;
    var n = (opts.weeks || A.weeks) * (opts.signupsPerWeek || A.signupsPerWeek);
    var r = mulberry32(seed), out = [], i, j;
    for (i = 0; i < n; i++) {
      var u = []; for (j = 0; j < DRAWS; j++) u.push(r());
      var seg = pick(u[0], A.segments.map(function (s) { return [s.key, s.share]; }));
      var path = seg === 'mid' ? pick(u[1], [['nocode', 0.10], ['plugin', 0.25], ['api', 0.65]])
        : seg === 'small' ? pick(u[1], [['nocode', 0.25], ['plugin', 0.40], ['api', 0.35]])
          : pick(u[1], [['nocode', 0.50], ['plugin', 0.28], ['api', 0.22]]);
      var source = pick(u[2], [['self', seg === 'mid' ? 0.35 : 0.75], ['sales', seg === 'mid' ? 0.55 : 0.15], ['partner', 0.10]]);
      var website = path === 'nocode' ? u[3] < 0.40 : u[3] < 0.90;
      var risk = pick(u[4], [['low', 0.70], ['medium', 0.22], ['high', 0.08]]);
      out.push({ id: 'M' + String(10001 + i), week: Math.floor(i / (opts.signupsPerWeek || A.signupsPerWeek)) + 1,
        segment: seg, path: path, source: source, website: website, risk: risk, u: u });
    }
    return out;
  }

  // ---------- one merchant's journey ----------
  function journey(m, lev) {
    lev = lev || {};
    var u = m.u, day = 0, res = { id: m.id, week: m.week, segment: m.segment, path: m.path, source: m.source,
      risk: m.risk, website: m.website, reached: 'signed', stuck: null, rejected: false, firstDay: null,
      viaLink: false, nudged: false, fastLane: false, reworked: false, active30: false, integrated: false };

    // Stage 1: documents submitted
    var pDocs = m.source === 'sales' ? 0.92 : m.source === 'partner' ? 0.85 : 0.72;
    if (!m.website && m.path !== 'nocode') pDocs -= 0.08;
    var docsDone = u[5] < pDocs, docsDay = 0.5 + -Math.log(1 - u[6]) * 2.5;
    if (!docsDone && lev.L4 && m.source === 'self') {
      res.nudged = true;
      if (u[7] < 0.20) { docsDone = true; docsDay = lerp(u[8], 4, 8); }
    }
    if (!docsDone) {
      res.stuck = !m.website && m.path !== 'nocode' ? pick(u[9], [['Never started documents', 0.5], ['Abandoned at bank account step', 0.2], ['Abandoned at website / policy pages step', 0.3]])
        : pick(u[9], [['Never started documents', 0.65], ['Abandoned at bank account step', 0.35]]);
      return res;
    }
    res.reached = 'docs'; day = docsDay;

    // Stage 2: KYC
    res.fastLane = !!(lev.L2 && m.segment === 'micro' && m.risk !== 'high');
    var pFail = 0.36 + (m.risk === 'high' ? 0.14 : 0) + (!m.website && m.path !== 'nocode' ? 0.08 : 0);
    if (res.fastLane) pFail -= 0.12; // fewer documents in the simplified route, fewer mismatches
    var review = res.fastLane ? lerp(u[10], 0.5, 1.5) : lerp(u[10], 1, 5);
    day += review;
    if (u[11] < pFail) {
      res.reworked = true;
      var reasons = m.risk === 'high'
        ? [['Category needs enhanced review', 0.45], ['Bank account name mismatch', 0.25], ['PAN–GST name mismatch', 0.15], ['Contact point verification pending', 0.15]]
        : [['Bank account name mismatch', 0.38], ['PAN–GST name mismatch', res.fastLane ? 0.08 : 0.22], ['Website policy pages missing', m.website ? 0.26 : 0], ['Contact point verification pending', 0.14]];
      var reason = pick(u[12], reasons);
      if (reason === 'Category needs enhanced review' && u[13] < 0.35) { // correct outcome, not a leak
        res.rejected = true; res.stuck = 'Rejected on policy (correct outcome)'; return res;
      }
      var fixable = /mismatch|policy pages/.test(reason);
      var pFix = (lev.L1 && fixable) ? 0.78 : 0.55;
      if (u[14] >= pFix) { res.stuck = 'KYC rework not completed: ' + reason; return res; }
      day += (lev.L1 && fixable) ? lerp(u[15], 1, 3) : lerp(u[15], 2, 8);
    }
    res.reached = 'kyc';
    var kycDay = day;

    // Optional link-first payment (L3): plugin/API merchants, not high-risk
    var linkDay = null;
    if (lev.L3 && m.path !== 'nocode' && m.risk !== 'high' && u[16] < 0.25) linkDay = kycDay + lerp(u[17], 0.3, 3);

    // Stage 3: integration live
    var pLive = { nocode: 0.92, plugin: 0.76, api: m.segment === 'mid' ? 0.70 : 0.58 }[m.path];
    if (m.source === 'sales') pLive += 0.08;
    var liveDays = { nocode: lerp(u[18], 0, 1.5), plugin: lerp(u[18], 1, 6), api: lerp(u[18], 3, 18) }[m.path];
    var live = u[19] < pLive;
    if (!live && lev.L4 && m.source === 'self') {
      res.nudged = true;
      if (u[20] < 0.14) { live = true; liveDays += lerp(u[8], 3, 7); }
    }
    var liveDay = live ? kycDay + liveDays : null;
    res.integrated = live;
    var stuckLive = { nocode: [['Never created a link or page', 1]],
      plugin: [['Plugin installed, configuration error', 0.6], ['Plugin version conflict', 0.4]],
      api: [['API keys generated, no test transaction', 0.5], ['Webhook / callback not configured', 0.25], ['Waiting on merchant\'s developer', 0.25]] }[m.path];

    // Stage 4: first successful payment
    var payGap = m.path === 'nocode' ? lerp(u[21], 0, 4) : lerp(u[21], 0, 10);
    var paid = u[22] < 0.88;
    var viaIntegration = live && paid ? liveDay + payGap : null;
    if (live) res.reached = 'live';
    if (viaIntegration === null && linkDay === null) {
      res.stuck = live ? 'Live, no customer payment yet' : pick(u[9], stuckLive);
      return res;
    }
    if (linkDay !== null && (viaIntegration === null || linkDay < viaIntegration)) {
      res.firstDay = linkDay; res.viaLink = true;
    } else res.firstDay = viaIntegration;
    res.reached = 'first';
    var pActive = (res.viaLink && !live) ? A.activeIfLinkOnly : A.activeAfterFirstPayment;
    res.active30 = u[23] < pActive;
    return res;
  }

  function run(cohort, lev) { return cohort.map(function (m) { return journey(m, lev); }); }

  // ---------- metrics ----------
  function median(xs) { if (!xs.length) return null; var s = xs.slice().sort(function (a, b) { return a - b; }); var h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
  var ORDER = { signed: 0, docs: 1, kyc: 2, live: 3, first: 4 };

  function summarise(rows, filter) {
    if (filter) rows = rows.filter(filter);
    var n = rows.length, eligible = rows.filter(function (r) { return !r.rejected; });
    var counts = [
      n,
      rows.filter(function (r) { return ORDER[r.reached] >= 1; }).length,
      rows.filter(function (r) { return ORDER[r.reached] >= 2; }).length,
      rows.filter(function (r) { return r.integrated; }).length,
      rows.filter(function (r) { return r.firstDay !== null; }).length
    ];
    var first = eligible.filter(function (r) { return r.firstDay !== null; });
    var within14 = first.filter(function (r) { return r.firstDay <= 14; }).length;
    var within7 = first.filter(function (r) { return r.firstDay <= 7; }).length;
    var stuck = {};
    rows.forEach(function (r) { if (r.stuck && !r.rejected) stuck[r.stuck] = (stuck[r.stuck] || 0) + 1; });
    var stuckList = Object.keys(stuck).map(function (k) { return { reason: k, count: stuck[k], share: stuck[k] / Math.max(1, n) }; })
      .sort(function (a, b) { return b.count - a.count; });
    return {
      n: n, eligible: eligible.length, rejected: n - eligible.length,
      counts: counts,
      firstEver: first.length,
      rate7: eligible.length ? within7 / eligible.length : 0,
      rate14: eligible.length ? within14 / eligible.length : 0,
      rateEver: eligible.length ? first.length / eligible.length : 0,
      medianDays: median(first.map(function (r) { return r.firstDay; })),
      active30: rows.filter(function (r) { return r.active30; }).length,
      viaLink: rows.filter(function (r) { return r.viaLink; }).length,
      fastLane: rows.filter(function (r) { return r.fastLane; }).length,
      fastLaneHighRisk: rows.filter(function (r) { return r.fastLane && r.risk === 'high'; }).length,
      nudged: rows.filter(function (r) { return r.nudged; }).length,
      stuck: stuckList
    };
  }
  function evaluate(lev, opts) {
    var cohort = makeCohort(opts);
    var rows = run(cohort, lev);
    return { cohort: cohort, rows: rows, summary: summarise(rows) };
  }

  // ---------- business case ----------
  function monthlyValue(rows) {
    // value of merchants active at day 30, per cohort, expressed per month of signups
    var weeks = Math.max.apply(null, rows.map(function (r) { return r.week; }));
    var perMonth = 52 / 12 / weeks;
    var gmv = 0;
    rows.forEach(function (r) {
      if (!r.active30) return;
      var seg = A.segments.filter(function (s) { return s.key === r.segment; })[0];
      gmv += seg.monthlyGmv;
    });
    return { activeMerchantsPerMonth: rows.filter(function (r) { return r.active30; }).length * perMonth,
      monthlyGmvPerMonthCohort: gmv * perMonth, netRevenuePerMonthCohort: gmv * perMonth * A.netRevenueRate };
  }

  function businessCase(lev, opts) {
    var base = evaluate({}, opts), withL = evaluate(lev, opts);
    var vb = monthlyValue(base.rows), vl = monthlyValue(withL.rows);
    var weeks = (opts && opts.weeks) || A.weeks;
    var perMonth = 52 / 12 / weeks;
    // running costs per month of signups
    var nudgeCalls = withL.summary.nudged * 2 * perMonth, nudgeMsgs = withL.summary.nudged * 3 * perMonth;
    var runCost = lev.L4 ? nudgeCalls * A.costs.voiceCall + nudgeMsgs * A.costs.whatsapp : 0;
    var build = 0; Object.keys(lev).forEach(function (k) { if (lev[k]) build += (A.costs.engWeeks[k] || 0) * A.costs.engWeek; });
    var incNetPerCohortMonth = vl.netRevenuePerMonthCohort - vb.netRevenuePerMonthCohort; // each month's cohort adds this much monthly net revenue
    // payback: monthly cohorts stack, each decaying by monthly churn after day 30.
    function stacked(m) { var t = 0; for (var a = 0; a < m; a++) t += Math.pow(1 - A.monthlyChurnAfterD30, a); return t; }
    var cum = -build, month = 0;
    while (cum < 0 && month < 36) { month++; cum += incNetPerCohortMonth * stacked(month) - runCost; }
    return {
      base: base.summary, with: withL.summary, valueBase: vb, valueWith: vl,
      incActivePerMonth: vl.activeMerchantsPerMonth - vb.activeMerchantsPerMonth,
      incGmvPerCohortMonth: vl.monthlyGmvPerMonthCohort - vb.monthlyGmvPerMonthCohort,
      incNetPerCohortMonth: incNetPerCohortMonth,
      runCostPerMonth: runCost, buildCost: build,
      paybackMonths: cum >= 0 ? month : null,
      firstYearNet: (function () { var t = -build; for (var k = 1; k <= 12; k++) t += incNetPerCohortMonth * stacked(k) - runCost; return t; })()
    };
  }

  // ---------- experiment sizing ----------
  function sampleSizePerArm(p1, p2, alpha, power) {
    var za = alpha === 0.05 ? 1.959964 : 2.575829, zb = power === 0.9 ? 1.281552 : 0.841621;
    var pb = (p1 + p2) / 2;
    var num = za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    return Math.ceil(num * num / Math.pow(p2 - p1, 2));
  }

  // ---------- program tracker → weekly CPO note ----------
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function rag(item, asOf, byId) {
    var slip = daysBetween(item.due, item.forecast);
    var depRed = (item.dependsOn || []).some(function (d) { return byId[d] && byId[d].__rag === 'Red' && byId[d].pct < 100; });
    var decisionOverdue = item.decision && item.decisionBy && daysBetween(item.decisionBy, asOf) > 0 && !item.decisionMade;
    if (item.pct >= 100) return { rag: 'Done', slip: slip, why: 'Complete' };
    if (slip > 7) return { rag: 'Red', slip: slip, why: 'Forecast ' + slip + ' days past due' };
    if (depRed) return { rag: 'Red', slip: slip, why: 'Blocked by a red dependency (' + item.dependsOn.join(', ') + ')' };
    if (decisionOverdue) return { rag: 'Red', slip: slip, why: 'Decision overdue since ' + item.decisionBy };
    if (slip > 0) return { rag: 'Amber', slip: slip, why: 'Forecast ' + slip + ' days past due' };
    var toDue = daysBetween(asOf, item.due);
    if (toDue <= 7 && item.pct < 70) return { rag: 'Amber', slip: slip, why: 'Due in ' + toDue + ' days at ' + item.pct + '% done' };
    return { rag: 'Green', slip: slip, why: 'On track' };
  }
  function assess(items, asOf) {
    var byId = {}; items.forEach(function (i) { byId[i.id] = i; });
    // two passes so dependency status is known
    for (var pass = 0; pass < 2; pass++) items.forEach(function (i) { var r = rag(i, asOf, byId); i.__rag = r.rag; i.__slip = r.slip; i.__why = r.why; });
    return items.map(function (i) { return Object.assign({}, i, { rag: i.__rag, slip: i.__slip, why: i.__why }); });
  }
  function weeklyNote(prevItems, curItems, asOf, metric) {
    var prev = assess(JSON.parse(JSON.stringify(prevItems)), metric.prevAsOf), cur = assess(JSON.parse(JSON.stringify(curItems)), asOf);
    var pById = {}; prev.forEach(function (p) { pById[p.id] = p; });
    var rank = { Done: 0, Green: 1, Amber: 2, Red: 3 };
    var moved = [], worse = [], better = [], decisions = [];
    cur.forEach(function (c) {
      var p = pById[c.id];
      if (p && c.pct >= 100 && p.pct < 100) moved.push(c);
      if (p && rank[c.rag] > rank[p.rag]) worse.push({ c: c, from: p.rag });
      if (p && rank[c.rag] < rank[p.rag] && c.rag !== 'Done') better.push({ c: c, from: p.rag });
      if (c.decision && !c.decisionMade) decisions.push(c);
    });
    var counts = { Done: 0, Green: 0, Amber: 0, Red: 0 }; cur.forEach(function (c) { counts[c.rag]++; });
    var lines = [];
    var delta = metric.cur - metric.prev;
    var newReds = worse.filter(function (w) { return w.c.rag === 'Red'; }).length;
    lines.push('Headline: 14-day first-payment rate ' + pct(metric.cur) + ' (' + (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + ' pts week on week, fictional). ' +
      counts.Red + ' red (' + newReds + ' new), ' + counts.Amber + ' amber, ' + counts.Green + ' green, ' + counts.Done + ' done.');
    // trace every red back to the item that actually caused it
    var cById = {}; cur.forEach(function (c) { cById[c.id] = c; });
    function root(c, seen) {
      seen = seen || {};
      if (seen[c.id]) return c; seen[c.id] = true;
      if (c.rag === 'Red' && /red dependency/.test(c.why)) {
        var d = (c.dependsOn || []).map(function (x) { return cById[x]; }).filter(function (x) { return x && x.rag === 'Red'; })[0];
        if (d) return root(d, seen);
      }
      return c;
    }
    var roots = {};
    cur.filter(function (c) { return c.rag === 'Red'; }).forEach(function (c) {
      var r = root(c); roots[r.id] = roots[r.id] || { item: r, blocks: [] };
      if (r.id !== c.id) roots[r.id].blocks.push(c.id);
    });
    var rootList = Object.keys(roots).map(function (k) { return roots[k]; });
    if (rootList.length) {
      lines.push(counts.Red + ' red item' + (counts.Red === 1 ? '' : 's') + ' trace to ' + rootList.length + ' root cause' + (rootList.length === 1 ? '' : 's') + ':');
      rootList.forEach(function (r) {
        lines.push('  • ' + r.item.id + ' ' + r.item.title + ' (' + r.item.owner + '). ' + r.item.why + '.' +
          (r.item.blocker ? ' Blocker: ' + r.item.blocker + '.' : '') + (r.blocks.length ? ' Also holding up ' + r.blocks.join(', ') + '.' : ''));
      });
    }
    var ambers = cur.filter(function (c) { return c.rag === 'Amber'; });
    if (ambers.length) lines.push('Watch list (amber): ' + ambers.map(function (c) { return c.id + ' (' + c.why.toLowerCase() + ')'; }).join('; ') + '.');
    if (moved.length) lines.push('Done this week: ' + moved.map(function (m) { return m.id + ' ' + m.title; }).join('; ') + '.');
    better.forEach(function (b) { lines.push('Recovered to ' + b.c.rag + ' (was ' + b.from + '): ' + b.c.id + ' ' + b.c.title + '.'); });
    var asks = decisions.map(function (d) { return 'Decision needed from ' + d.decisionOwner + ' by ' + d.decisionBy + ': ' + d.decision; });
    rootList.forEach(function (r) { if (!r.item.decision && r.item.blocker) asks.push('Unblock ' + r.item.id + ': ask ' + r.item.owner + ' for a dated fix plan by the next review, or agree a workaround (' + (r.blocks.length ? 'it holds up ' + r.blocks.join(', ') : 'it is late') + ').'); });
    return { lines: lines, asks: asks, items: cur, counts: counts, roots: rootList };
  }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }

  return { A: A, STAGES: STAGES, LEVERS: LEVERS, makeCohort: makeCohort, journey: journey, evaluate: evaluate,
    summarise: summarise, businessCase: businessCase, sampleSizePerArm: sampleSizePerArm, assess: assess,
    weeklyNote: weeklyNote, median: median, pct: pct, daysBetween: daysBetween };
});
