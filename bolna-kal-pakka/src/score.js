// Scores Bolna test_dispositions results (results/runs.jsonl) against the hand labels in data/.
const CRIT = ["C1", "C2", "C3", "C4", "C5"], QUAL = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"];
const codes = (s) => (!s || /^none$/i.test(String(s).trim()) ? [] : String(s).split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[CQ][1-8]$/.test(x)));
const isPTP = { naive: (r) => r.outcome === "promise_to_pay", eng: (r) => r.outcome === "ptp_confirmed" };
const ratio = (a, b) => (b ? a / b : null);

function load(lines) { return lines.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); }
// latest result per (version, id) wins, so a re-run replaces an earlier one
function latest(runs) { const m = new Map(); for (const r of runs) m.set(r.v + "|" + r.id, r); return [...m.values()]; }

function scoreVersion(runs, calls, v, splits) {
  const set = calls.filter((c) => splits.includes(c.split)), byId = new Map(runs.filter((r) => r.v === v).map((r) => [r.id, r]));
  const rows = set.filter((c) => byId.has(c.id)).map((c) => ({ c, r: byId.get(c.id) }));
  const out = { v, n: rows.length, missing: set.filter((c) => !byId.has(c.id)).map((c) => c.id) };
  const naive = v === "naive";
  // call level: does the call have a critical failure / any failure, and did the version flag it?
  const level = (pred, truth, rs = rows) => { let tp = 0, fp = 0, fn = 0, tn = 0; for (const { c, r } of rs) { const p = pred(c, r), t = truth(c); if (p && t) tp++; else if (p) fp++; else if (t) fn++; else tn++; } return { tp, fp, fn, tn, recall: ratio(tp, tp + fn), precision: ratio(tp, tp + fp), flagged: tp + fp }; };
  const hasCrit = (c) => c.fail.some((f) => f[0] === "C"), hasAny = (c) => c.fail.length > 0;
  out.anyFailure = level((c, r) => (naive ? r.mistake === "yes" : codes(r.crit).length + codes(r.qual).length > 0), hasAny);
  if (!naive) {
    out.critical = level((c, r) => codes(r.crit).length > 0, hasCrit);
    out.perCode = Object.fromEntries([...CRIT, ...QUAL].map((k) => [k, level((c, r) => codes(r.crit).concat(codes(r.qual)).includes(k), (c) => c.fail.includes(k))]));
    out.exactCodes = rows.filter(({ c, r }) => { const p = codes(r.crit).concat(codes(r.qual)).sort().join(), t = c.fail.slice().sort().join(); return p === t; }).length;
  }
  // collections outcome
  const coll = rows.filter(({ c }) => c.out);
  if (coll.length) {
    const ptpPred = naive ? isPTP.naive : isPTP.eng;
    out.ptp = level((c, r) => ptpPred(r), (c) => c.out.outcome === "ptp_confirmed", coll);
    out.ptp.n = coll.length;
    const ptpTrue = coll.filter(({ c }) => c.out.outcome === "ptp_confirmed");
    out.dateRight = ptpTrue.filter(({ c, r }) => String(r.date || "").includes(c.out.date)).length; out.ptpTrue = ptpTrue.length;
    if (!naive) { out.outcomeRight = coll.filter(({ c, r }) => r.outcome === c.out.outcome).length; out.amountRight = ptpTrue.filter(({ c, r }) => Number(r.amount) === c.out.amount).length; }
  }
  return out;
}
module.exports = { CRIT, QUAL, codes, load, latest, scoreVersion };
