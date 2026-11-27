// Runs the book across seeds and assumptions; writes results.json for the page.
const R = require("./report.js"), fs = require("fs"), path = require("path");
const cheap = (x) => { const hit = x.fams.filter((f) => Object.keys(f.err).length); return hit.filter((f) => Object.keys(f.err).every((k) => k === "annualised" || k === "externalZero")).length / hit.length; };
const pick = (x) => ({ cheap: cheap(x), anyErr: x.anyErr, clean: x.clean, coverage: x.avgCoverage, s: x.s, harvestShare: x.harvestShare, harvestMedian: x.harvestMedian, avoidedMedian: x.avoidedMedian, members: x.members, n: x.n });
const seeds = [7, 11, 23].map((seed) => pick(R.run({ seed })));
const sens = [];
for (const [k, vals] of [["externalShare", [0.05, 0.15, 0.3]], ["recency", [1, 2, 3]], ["switchLinkLost", [0.3, 0.7, 1]]])
  for (const v of vals) { const x = pick(R.run({ seed: 7, families: 1000, [k]: v })); sens.push({ k, v, anyErr: x.anyErr, clean: x.clean, s: Object.fromEntries(Object.entries(x.s).map(([a, b]) => [a, b.share])) }); }
// example families for the interactive report: one per issue, plus one clean, from seed 7
const base = R.run({ seed: 7, families: 400 }), ex = [], want = ["annualised", "externalZero", "familyAvg", "switchDouble", "taxMethod", "syncLag"];
const slim = (f) => ({ id: f.id, value: f.value, scValue: f.scValue, moneyIn: f.moneyIn, scMoneyIn: f.scMoneyIn, truthX: f.truthX, scFamX: f.scFamX, gdX: f.gdX, coverage: f.coverage, err: f.err,
  members: f.members.map((m) => ({ name: m.name, tax: m.tax, scTax: m.scTax, gains: m.gains, scGains: m.scGains, room: m.room, unknownCost: m.unknownCost })),
  rows: f.rows.map((r) => ({ member: r.member, fund: r.fund, kind: r.kind, age: r.age, external: r.external, syncLag: r.syncLag, switchIn: r.switchIn, moneyIn: r.moneyIn, scMoneyIn: r.scMoneyIn,
    truth: { value: r.truth.value, cost: r.truth.cost, ret: r.truth.ret }, sc: { value: r.sc.value, cost: r.sc.cost, ret: r.sc.ret }, gd: { value: r.gd.value, cost: r.gd.cost, ret: r.gd.ret, flag: r.gd.flag } })) });
const good = {
  annualised: (f) => f.rows.some((r) => r.age < 365 && r.kind === "equity" && !r.external && !r.syncLag && r.truth.value > 0.25 * f.value && r.sc.ret.v - r.truth.ret.v > 0.15),
  externalZero: (f) => f.coverage > 0.3 && f.coverage < 0.85 && !f.rows.some((r) => r.syncLag),
  familyAvg: (f) => f.members.length >= 2 && f.err.familyAvg > 0.02,
  switchDouble: () => true, taxMethod: (f) => f.err.taxMethod > 500, syncLag: (f) => !f.rows.some((r) => r.external) };
for (const k of want) { const f = base.fams.find((f) => f.err[k] != null && f.rows.length <= 8 && !ex.some((e) => e.id === f.id) && good[k](f)) || base.fams.find((f) => f.err[k] != null && !ex.some((e) => e.id === f.id)); if (f) ex.push({ issue: k, ...slim(f) }); }
const cl = base.fams.find((f) => !Object.keys(f.err).length && f.members.length >= 2 && f.rows.length <= 6); if (cl) ex.push({ issue: "clean", ...slim(cl) });
const out = { generated: "2026-11-27", assume: require("./book.js").ASSUME, labels: R.LABEL, seeds, sens, examples: ex };
fs.writeFileSync(path.join(__dirname, "..", "results.json"), JSON.stringify(out));
const r = (a) => (a * 100).toFixed(1) + "%";
console.log("seeds anyErr", seeds.map((x) => r(x.anyErr)).join(" "), "clean", seeds.map((x) => r(x.clean)).join(" "), "coverage", seeds.map((x) => r(x.coverage)).join(" "));
for (const k of Object.keys(R.LABEL)) console.log(k.padEnd(15), seeds.map((x) => r(x.s[k].share)).join(" "), "median", seeds.map((x) => (x.s[k].median == null ? "-" : x.s[k].median.toFixed(3))).join(" "));
console.log("harvest", seeds.map((x) => r(x.harvestShare) + " " + Math.round(x.harvestMedian) + " " + Math.round(x.avoidedMedian)).join(" | "));
for (const s of sens) console.log(s.k, s.v, "anyErr", r(s.anyErr), "ext", r(s.s.externalZero), "ann", r(s.s.annualised), "sw", r(s.s.switchDouble));
console.log("cheap fixes fully clear", seeds.map((x) => r(x.cheap)).join(" "));
console.log("examples", ex.map((e) => e.issue + ":" + e.id).join(" "));
