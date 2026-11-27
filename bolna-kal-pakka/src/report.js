// Builds results/summary.json: baseline vs the kit (extraction only) vs the kit plus string checks.
const fs = require("fs"), path = require("path"), S = require("./score.js"), R = require("./rules.js");
const calls = require("../data/calls.js").concat(require("../data/real.js"));
const runs = S.latest(S.load(fs.readFileSync(path.join(__dirname, "..", "results", "runs.jsonl"), "utf8")));
// naive dates are free text ("29 November"); accept them if they name the right day
const MON = { "11": ["nov"], "12": ["dec"] };
for (const r of runs.filter((r) => r.v === "naive")) { const c = calls.find((x) => x.id === r.id); if (c && c.out && c.out.date) { const [, m, d] = c.out.date.split("-"); const s = String(r.date || "").toLowerCase(); if (new RegExp("\\b0?" + Number(d) + "(st|nd|rd|th)?\\b").test(s) && MON[m].some((x) => s.includes(x))) r.date = c.out.date; } }
// hybrid: string checks decide Q4, Q5, Q6; the extraction decides everything else
const LEX = ["Q4", "Q5", "Q6"];
const hybrid = runs.filter((r) => r.v === "e3").map((r) => { const c = calls.find((x) => x.id === r.id); const q = S.codes(r.qual).filter((k) => !LEX.includes(k)).concat(R.check(c.t)); return { ...r, v: "hybrid", qual: q.length ? q.join(",") : "none" }; });
const all = runs.concat(hybrid);
const out = {};
for (const split of [["test"], ["real"], ["test", "real"]]) out[split.join("+")] = Object.fromEntries(["naive", "e3", "hybrid"].map((v) => [v, S.scoreVersion(all, calls, v, split)]));
out.rows = calls.filter((c) => c.split !== "dev").map((c) => ({ id: c.id, split: c.split, vertical: c.vertical, fail: c.fail, out: c.out, t: c.t, naive: all.find((r) => r.v === "naive" && r.id === c.id), e3: all.find((r) => r.v === "e3" && r.id === c.id), hybrid: all.find((r) => r.v === "hybrid" && r.id === c.id) }));
out.dev = runs.filter((r) => r.id.startsWith("d"));
fs.writeFileSync(path.join(__dirname, "..", "results", "summary.json"), JSON.stringify(out, null, 1));
const p = (x) => (x == null ? "-" : Math.round(x * 100) + "%");
for (const k of ["test", "real", "test+real"]) { console.log("==", k); for (const v of ["naive", "e3", "hybrid"]) { const s = out[k][v]; console.log(v.padEnd(7), "n", s.n, "missing", s.missing.join(",") || "-", "| any failure R", p(s.anyFailure.recall), "P", p(s.anyFailure.precision), "flagged", s.anyFailure.flagged, s.critical ? "| critical R " + p(s.critical.recall) + " P " + p(s.critical.precision) + " (" + s.critical.tp + "/" + (s.critical.tp + s.critical.fn) + ", fp " + s.critical.fp + ")" : "", s.ptp ? "| PTP fp " + s.ptp.fp + " fn " + s.ptp.fn + " of " + s.ptp.n + " date " + s.dateRight + "/" + s.ptpTrue + (s.outcomeRight != null ? " outcome " + s.outcomeRight + "/" + s.ptp.n + " amt " + s.amountRight : "") : "", s.exactCodes != null ? "| exact " + s.exactCodes : ""); } }
const s = out["test+real"].hybrid; console.log("per code (test+real, hybrid):"); for (const [k, v] of Object.entries(s.perCode)) if (v.tp + v.fn + v.fp) console.log(" ", k, "tp", v.tp, "fn", v.fn, "fp", v.fp);
const e = out["test+real"].e3; console.log("per code (test+real, e3):"); for (const [k, v] of Object.entries(e.perCode)) if (v.tp + v.fn + v.fp) console.log(" ", k, "tp", v.tp, "fn", v.fn, "fp", v.fp);
