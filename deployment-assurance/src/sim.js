// After go-live: does an AI deployment still do what it did at acceptance, and is its value real?
// Daily, stratum-level simulation of four illustrative deployments. Every number is a labelled assumption.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.DASim = f(); })(this, function () {
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function binom(r, n, p) { if (n <= 0 || p <= 0) return 0; if (p >= 1) return n; if (n < 60) { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; }
    const m = n * p, s = Math.sqrt(n * p * (1 - p)); let u = 0, v = 0; while (u === 0) u = r(); v = r(); const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); return Math.max(0, Math.min(n, Math.round(m + s * z))); }

  // Illustrative deployments, shaped like workflows a used-car marketplace runs on agents (not real data)
  const DEPLOYMENTS = {
    inspect: { label: "Inspection scheduling (voice agent)", volume: 6000, baseErr: 0.03, errCost: 150, notice: 0.30, auditMin: 2, what: "wrong slot or address; an inspector trip is wasted" },
    loandoc: { label: "Loan document checks (document agent)", volume: 800, baseErr: 0.02, errCost: 4000, notice: 0.08, auditMin: 6, what: "a bad document passes; rework or credit loss later" },
    po:      { label: "Purchase-order auto-approval (finance agent)", volume: 300, baseErr: 0.01, errCost: 15000, notice: 0.15, auditMin: 5, what: "a wrong purchase order is approved and paid" },
  };
  const ASSUME = {
    days: 120, lowConfShare: 0.12, lowConfErrMultiple: 4, // at acceptance: 12% of cases are low-confidence, 4x the error rate
    driftShare: 0.15, driftErr: 0.25, novelFlag: 0.6, baseNovel: 0.03, loudToLowConf: 0.9, // a drift hits 15% of cases at 25% error; a novelty flag catches 60% of them
    capDays: 30, fixDays: 2, reportLagDays: 3, // undetected drift ends after 30 days (someone eventually notices); a fix lands 2 days after an alarm
    auditShare: 0.01, minAudits: 20, riskShareOfAudits: 0.6, // audit 1% of volume (at least 20 a day); stratified puts 60% of audits on risky cases
    cusumH: 5, falseAlarmHours: 4,
  };
  const POLICIES = ["client", "confidence", "random", "stratified"];
  const NAMES = { client: "Wait for the client to complain", confidence: "Watch model confidence", random: "Random audits", stratified: "Risk-stratified audits + confidence" };

  // two drift events per deployment: one loud (confidence drops), one silent (confidence unchanged)
  function events(r, o) { const ev = []; for (const d of Object.keys(DEPLOYMENTS)) { const a = 20 + Math.floor(r() * 35), b = 65 + Math.floor(r() * 35), loudFirst = r() < 0.5; ev.push({ d, start: a, type: loudFirst ? "loud" : "silent" }, { d, start: b, type: loudFirst ? "silent" : "loud" }); } return ev; }

  // one deployment-day, split into strata: high-confidence & not flagged ("rest"), and risky (low-confidence or novelty-flagged)
  function day(r, D, o, drift) {
    const N = D.volume, e0 = D.baseErr, rHigh = e0 / (1 - o.lowConfShare + o.lowConfShare * o.lowConfErrMultiple), rLow = rHigh * o.lowConfErrMultiple;
    let nD = 0, nDlow = 0, nDnovel = 0; if (drift) { nD = Math.round(N * o.driftShare); nDlow = drift === "loud" ? Math.round(nD * o.loudToLowConf) : Math.round(nD * o.lowConfShare); nDnovel = Math.round(nD * o.novelFlag); }
    const nN = N - nD, nNlow = Math.round(nN * o.lowConfShare), nNnovel = Math.round(nN * o.baseNovel);
    // normal cases
    const normRiskN = nNlow + Math.round((nN - nNlow) * o.baseNovel), normRestN = nN - normRiskN;
    const normRiskErr = binom(r, nNlow, rLow) + binom(r, normRiskN - nNlow, rHigh), normRestErr = binom(r, normRestN, rHigh);
    // drifted cases: risky if low-confidence or flagged novel
    const dRiskN = drift ? Math.min(nD, Math.round(nDlow + (nD - nDlow) * o.novelFlag)) : 0, dRestN = nD - dRiskN;
    const dRiskErr = binom(r, dRiskN, o.driftErr), dRestErr = binom(r, dRestN, o.driftErr);
    const lowConf = nNlow + nDlow;
    return { N, riskN: normRiskN + dRiskN, restN: normRestN + dRestN, riskErr: normRiskErr + dRiskErr, restErr: normRestErr + dRestErr, errors: normRiskErr + dRiskErr + normRestErr + dRestErr, baseErrors: N * e0, lowConf, rHigh, rLow };
  }
  // Bernoulli CUSUM: accumulates evidence that the error rate doubled
  function cusumStep(S, k, n, p0) { if (n <= 0) return S; const p1 = Math.min(0.5, 2 * p0), a = Math.log(p1 / p0), b = Math.log((1 - p1) / (1 - p0)); return Math.max(0, S + k * a + (n - k) * b); }

  // audits per deployment per day. "volume": a share of volume (minimum 20). "risk": the same total, split by expected money at risk.
  function auditPlan(o) {
    const vol = {}; let total = 0; for (const [d, D] of Object.entries(DEPLOYMENTS)) { vol[d] = Math.max(o.minAudits, Math.round(D.volume * o.auditShare)); total += vol[d]; }
    if (o.alloc !== "risk") return vol;
    const w = {}; let W = 0; for (const [d, D] of Object.entries(DEPLOYMENTS)) { w[d] = D.volume * D.baseErr * D.errCost; W += w[d]; }
    const out = {}; for (const d of Object.keys(w)) out[d] = Math.max(10, Math.round((total * w[d]) / W)); return out;
  }
  function run(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, opts || {}), r = rng(o.seed), ev = opts && opts.events ? opts.events : events(rng(o.seed * 13 + 1), o);
    const out = {}, series = {};
    for (const pol of POLICIES) { out[pol] = { delays: [], loud: [], silent: [], missed: 0, excessErrors: 0, cost: 0, falseAlarms: 0, auditHours: 0, perDeployment: {} }; }
    for (const [d, D] of Object.entries(DEPLOYMENTS)) {
      const myEv = ev.filter((e) => e.d === d);
      // pre-draw the day stream once so every policy sees identical days (drift state differs only by when it is fixed)
      const days = []; const rr = rng(o.seed * 1000 + d.length * 31 + D.volume);
      for (let t = 0; t < o.days; t++) { const cov = myEv.filter((e) => t >= e.start && t < e.start + o.capDays), act = cov.length ? cov.reduce((a, b) => (b.start > a.start ? b : a)) : undefined; days.push({ act, drifted: day(rr, D, o, act ? act.type : null), clean: day(rr, D, o, null) }); }
      const audits = auditPlan(o)[d];
      for (const pol of POLICIES) {
        const res = out[pol], fixedAt = {}; let S = 0, S1 = 0, S2 = 0, weekly = [], lowHist = [], alarmCooldown = 0; const pd = (res.perDeployment[d] = { events: [], cost: 0 }); const ar = rng(o.seed * 7 + pol.length * 101 + D.volume);
        const ser = (series[d] = series[d] || {}); ser[pol] = { est: [], alarms: [], truth: [] };
        for (let t = 0; t < o.days; t++) {
          const x = days[t], act = x.act, live = act && !(fixedAt[act.start] !== undefined && t >= fixedAt[act.start]), s = live ? x.drifted : x.clean;
          ser[pol].truth.push(s.errors / s.N);
          if (live) { const ex = Math.max(0, s.errors - s.baseErrors); res.excessErrors += ex; res.cost += ex * D.errCost; pd.cost += ex * D.errCost; }
          let alarm = false, est = null;
          if (pol === "client") { const noticed = binom(ar, s.errors, D.notice); weekly.push(noticed); if (weekly.length > 7) weekly.shift();
            const base = 7 * D.volume * D.baseErr * D.notice, sum = weekly.reduce((a, b) => a + b, 0); est = sum / 7 / D.notice / D.volume;
            if (weekly.length === 7 && sum > base + 3 * Math.sqrt(base) && sum > 1.5 * base) alarm = true; }
          if (pol === "confidence" || pol === "stratified") { const share = s.lowConf / s.N; if (t >= 14) { const m = lowHist.reduce((a, b) => a + b, 0) / lowHist.length, sd = Math.sqrt(m * (1 - m) / s.N) + 0.004; if (share > m + 4 * sd) alarm = true; } if (!live) { lowHist.push(share); if (lowHist.length > 30) lowHist.shift(); } if (pol === "confidence") est = share; }
          if (pol === "random") { const k = binom(ar, audits, s.errors / s.N); S = cusumStep(S, k, audits, D.baseErr); est = k / audits; if (S > o.cusumH) { alarm = true; S = 0; } res.auditHours += (audits * D.auditMin) / 60; }
          if (pol === "stratified") { const nr = Math.round(audits * o.riskShareOfAudits), nq = audits - nr, pr = s.riskErr / Math.max(1, s.riskN), pq = s.restErr / Math.max(1, s.restN);
            const kr = binom(ar, nr, pr), kq = binom(ar, nq, pq);
            const riskBase = (s.N * (o.lowConfShare * s.rLow + (1 - o.lowConfShare) * o.baseNovel * s.rHigh)) / (s.N * (o.lowConfShare + (1 - o.lowConfShare) * o.baseNovel));
            S1 = cusumStep(S1, kr, nr, riskBase); S2 = cusumStep(S2, kq, nq, s.rHigh); est = (s.riskN * (kr / nr) + s.restN * (kq / nq)) / s.N;
            if (S1 > o.cusumH || S2 > o.cusumH) { alarm = true; S1 = 0; S2 = 0; } res.auditHours += (audits * D.auditMin) / 60; }
          ser[pol].est.push(est);
          if (alarm && alarmCooldown <= 0) {
            ser[pol].alarms.push(t); alarmCooldown = 5;
            if (live) { const lag = pol === "client" ? o.reportLagDays : 0; fixedAt[act.start] = t + lag + o.fixDays; const delay = t + lag - act.start; res.delays.push(delay); res[act.type].push(delay); pd.events.push({ type: act.type, start: act.start, detected: t + lag, delay }); }
            else if (!act || (fixedAt[act.start] !== undefined && t >= fixedAt[act.start])) { res.falseAlarms++; }
          }
          alarmCooldown--;
        }
        myEv.forEach((e) => { if (fixedAt[e.start] === undefined) { res.missed++; pd.events.push({ type: e.type, start: e.start, detected: null, delay: null }); } });
      }
    }
    for (const pol of POLICIES) { const x = out[pol], mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null); x.meanDelay = mean(x.delays); x.meanLoud = mean(x.loud); x.meanSilent = mean(x.silent); x.caught = x.delays.length; x.events = ev.length; }
    return { ...out, events: ev, series, meta: { seed: o.seed } };
  }
  function seeds(n, opts) { return Array.from({ length: n }, (_, i) => run(Object.assign({}, opts, { seed: 101 + i * 7 }))); }
  return { auditPlan, rng, binom, DEPLOYMENTS, ASSUME, POLICIES, NAMES, run, seeds, cusumStep };
});
