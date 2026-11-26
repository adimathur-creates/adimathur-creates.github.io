// Builds ../index.html from the simulation. Run: node src/build_page.js
const fs = require("fs"), path = require("path");
const D = require("./data.js"), M = require("./match.js"), R = require("./resolve.js"), G = require("./govern.js"), A = require("./arbitrate.js"), L = require("./learn.js");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%", n0 = (x) => Math.round(x).toLocaleString("en-US");
const day = (d) => { const t = new Date(Date.UTC(2026, 10, 26) - (20000 - d) * 864e5); return t.toISOString().slice(0, 10); };

// ---------- 1. policies across seeds ----------
const SEEDS = [7, 11, 19, 23, 29], runs = SEEDS.map((s) => R.run({ seed: s }));
const avg = (p, k) => runs.reduce((s, r) => s + r[p][k], 0) / runs.length;
const sumTrap = (p, t) => runs.reduce((s, r) => [s[0] + r[p].traps[t][0], s[1] + r[p].traps[t][1]], [0, 0]);
const POL = {}; R.POLICIES.forEach((p) => (POL[p] = { precision: avg(p, "precision"), recall: avg(p, "recall"), overMerged: avg(p, "overMerged"), entitiesInBad: avg(p, "entitiesInBadMerges"), duplicates: avg(p, "duplicates"), review: avg(p, "reviewPairs"), twin: sumTrap(p, "twin"), homonym: sumTrap(p, "homonym"), parentChild: sumTrap(p, "parentChild") }));
const pairLevel = runs.reduce((s, r) => s + r.governed.pairLevelQueue, 0) / runs.length;
const meta = { records: avg("governed", "clusters") && runs[0].meta.records, entities: runs[0].meta.entities, candidates: runs[0].meta.candidates };
const recAvg = runs.reduce((s, r) => s + r.meta.records, 0) / runs.length, entAvg = runs.reduce((s, r) => s + r.meta.entities, 0) / runs.length;
const omCut = 1 - POL.governed.overMerged / POL.naive.overMerged, dupCut = 1 - POL.governed.duplicates / POL.naive.duplicates;

// ---------- 2. threshold grid ----------
const AUTOS = [8, 9, 10, 11, 12, 14], FLOORS = [1, 2, 3, 4, 5, 6, 7];
const grid = R.grid({ seed: 7 }, AUTOS, FLOORS);

// ---------- 3. overrides over six months ----------
const sim = G.simulate({ seed: 7 });
const simSeeds = [11, 19].map((s) => G.simulate({ seed: s }).totals);

// ---------- 4. arbitration + vendor evaluation ----------
const x7 = runs[0], { P, label, data, pairs, G: G7 } = x7._;
const arb = A.assess(P, label, data.byId, ["one_source", "most_recent", "rules"]);
const attrAcc = (s, a) => { const r = arb.res[s][a]; return r.right / (r.right + r.wrong + r.missing); };
const vendor = [undefined, "LEI_REG", "VENDOR_B", "CREDIT"].map((drop) => { const x = drop ? R.run({ data, dropSource: drop }) : x7, a = drop ? A.assess(x._.P, x._.label, data.byId, ["rules"]) : arb, r = a.res.rules;
  const acc = (k) => r[k].right / (r[k].right + r[k].wrong + r[k].missing);
  return { drop, recall: x.governed.recall, overMerged: x.governed.overMerged, dup: x.governed.duplicates, review: x.governed.reviewPairs, acc: r.overall, parent: acc("parent"), lei: acc("lei"), industry: acc("industry"), name: acc("legalName") }; });
const vb = vendor.find((v) => v.drop === "VENDOR_B"), lr = vendor.find((v) => v.drop === "LEI_REG"), cr = vendor.find((v) => v.drop === "CREDIT"), base = vendor[0];

// ---------- 5. learned weights ----------
const ml99 = L.compare({ targetP: 0.99 }), ml995 = L.compare({ targetP: 0.995 }), mlAudit = L.compare({ targetP: 0.99, mode: "audit", auditN: 800 });

// ---------- 6. example pairs for the explainer ----------
const E = data.byId, ent = (i) => E[P[i].truth], same = (p) => P[p.i].truth === P[p.j].truth;
const inGov = (p) => label[p.i] === label[p.j];
const govRoute = (p) => (p.hard.length ? "BLOCK" : G7.held.has(p.i + "|" + p.j) ? "HOLD" : p.score >= R.ASSUME.autoMatch ? "AUTO" : p.score >= R.ASSUME.reviewFloor ? "REVIEW" : "NO");
const find = (f) => pairs.find(f);
const EX = [
  ["Same-name twins in one group", "Two group companies with the same name, Ltd vs LLP style. Fuzzy matching sees one client.", find((p) => { const a = ent(p.i), b = ent(p.j); return (a.twinOf === b.id || b.twinOf === a.id) && p.hard.length && p.naive >= 8 && P[p.i].src === "KYC" && P[p.j].src === "KYC"; })],
  ["A record that fits two companies", "A CRM record with no legal form or ID strongly matches two companies the hard rules keep apart. Attaching it to either would be a guess.", find((p) => G7.held.has(p.i + "|" + p.j) && [p.i, p.j].some((i) => P[i].src === "CRM" && !P[i].n.form) && (ent(p.i).twinOf || ent(p.j).twinOf || Object.values(E).some((e) => e.twinOf === ent(p.i).id || e.twinOf === ent(p.j).id)))],
  ["Unrelated companies, same name", "Two unrelated companies with the same name in the same country.", find((p) => { const a = ent(p.i), b = ent(p.j); return (a.homonymOf === b.id || b.homonymOf === a.id) && p.naive >= 8; })],
  ["Parent and subsidiary at one address", "A holding company and its subsidiary share a head-office address.", find((p) => p.f.hierarchy && p.naive >= 8 && p.f.streetEq)],
  ["Abbreviated name, same company", "Credit system spells it in capitals with abbreviations; CRM drops the legal form.", find((p) => same(p) && /\bCAP\b|\bINTL\b|\bHLDGS\b/.test(P[p.i].name + " " + P[p.j].name) && p.score >= 10 && !p.f.leiEq && !p.f.regEq && govRoute(p) === "AUTO")],
  ["Renamed company", "One source still holds the old name. Names disagree; the LEI settles it.", find((p) => same(p) && p.f.jw < 0.8 && p.f.leiEq)],
  ["Mistyped LEI", "The credit system's LEI fails its check digits, so it's ignored instead of treated as a conflict.", find((p) => same(p) && p.f.leiInvalid && govRoute(p) !== "BLOCK")],
  ["Grey zone: a person decides", "Similar enough to be the same, different enough to be wrong. One question goes to an analyst.", find((p) => same(p) && govRoute(p) === "REVIEW" && P[p.i].src !== P[p.j].src)],
].filter((e) => e[2]).map(([title, blurb, p]) => {
  const rec = (i) => { const r = P[i]; return { src: D.SOURCES[r.src].label, name: r.name, country: r.country, lei: r.lei ? r.lei + (r.leiOk ? "" : " (fails check digits)") : "—", reg: r.reg || "—", addr: [r.addr.street, r.addr.city, r.addr.postcode].filter(Boolean).join(", "), industry: r.industry || "—", parent: r.parentRef ? (r.parentRef.lei ? "LEI " + r.parentRef.lei : r.parentRef.vendorId ? "Vendor " + r.parentRef.vendorId : r.parentRef.name) : "—" }; };
  return { title, blurb, a: rec(p.i), b: rec(p.j), naive: p.naive, naiveLink: p.naive >= R.ASSUME.naiveThreshold, terms: M.explain(p.f), score: p.score, hard: p.hard, route: govRoute(p), together: inGov(p), truth: same(p) };
});

// ---------- 7. golden profile example ----------
const groups = {}; P.forEach((r, i) => (groups[label[i]] = groups[label[i]] || []).push(r));
const parentNameG = (id) => (id && E[id] ? E[id].core + " " + D.FORM_TEXT[E[id].form][0] : "—");
const normV = (v) => String(v).toUpperCase().replace(/[.,]/g, "");
const eqV = (a2, v, t) => { if (a2 === "legalName") { const x = M.normName(String(v)), y = M.normName(String(t)); return x.core === y.core && x.form && M.formsCompatible(x.form, y.form); } return normV(v) === normV(t); };
function wins(g) { const e = E[g[0].truth], tv = { legalName: e.core + " " + D.FORM_TEXT[e.form][0], lei: e.lei || "—", registeredCity: e.addr.city, postcode: e.addr.postcode, industry: e.industry, parent: parentNameG(e.parent) };
  const pr = A.profile(g, "rules", arb.ctx), po = A.profile(g, "one_source", arb.ctx), sv = (a, v) => (v == null ? "—" : a === "parent" ? parentNameG(v) : v);
  let w = 0, lose = 0; for (const a2 of A.ATTRS) { const r1 = pr[a2] && eqV(a2, sv(a2, pr[a2].value), tv[a2]), o1 = po[a2] && eqV(a2, sv(a2, po[a2].value), tv[a2]); if (r1 && !o1) w++; if (!r1) lose++; } return lose ? -1 : w; }
const goldenGroup = Object.values(groups).filter((g) => new Set(g.map((r) => r.truth)).size === 1 && new Set(g.map((r) => r.src)).size >= 4 && E[g[0].truth].parent).map((g) => [wins(g), g]).sort((a2, b2) => b2[0] - a2[0] || b2[1].length - a2[1].length)[0][1];
const gEnt = E[goldenGroup[0].truth], prof = A.profile(goldenGroup, "rules", arb.ctx), profOne = A.profile(goldenGroup, "one_source", arb.ctx);
const parentName = (id) => (id && E[id] ? E[id].core + " " + D.FORM_TEXT[E[id].form][0] : "—");
const showVal = (a, v) => (v == null ? "—" : a === "parent" ? parentName(v) : v);
const truthVal = { legalName: gEnt.core + " " + D.FORM_TEXT[gEnt.form][0], lei: gEnt.lei || "—", registeredCity: gEnt.addr.city, postcode: gEnt.addr.postcode, industry: gEnt.industry, parent: parentName(gEnt.parent) };

// ---------- charts (static SVG, hover via data-t) ----------
function hbars(rows, fmt, title, max) {
  const W = 440, rh = 30, pl = 168, pr = 54, H = rows.length * rh + 34, mx = max || Math.max(...rows.map((r) => r.v)) * 1.05 || 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><text class="lab" x="0" y="14">${esc(title)}</text>`;
  rows.forEach((r, i) => { const y = 26 + i * rh, w = Math.max(2, ((W - pl - pr) * r.v) / mx);
    s += `<text x="${pl - 8}" y="${y + 15}" text-anchor="end">${esc(r.label)}</text><rect class="b" data-t="${esc(r.label + ": " + fmt(r.v))}" x="${pl}" y="${y + 3}" width="${w}" height="${rh - 10}" rx="4" fill="${r.hi ? "var(--accent)" : "var(--s2)"}"/><text class="val" x="${pl + w + 6}" y="${y + 16}">${fmt(r.v)}</text>`; });
  return s + "</svg>";
}
function lines() {
  const W = 900, H = 280, pl = 54, pr = 120, pt = 30, pb = 40, months = sim.persistent.map((m) => m.month), mx = Math.max(...sim.amnesia.map((m) => m.reviewTasks)) * 1.15;
  const X = (m) => pl + ((m - 1) * (W - pl - pr)) / (months.length - 1), Y = (v) => H - pb - (v * (H - pt - pb)) / mx;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Review tasks per monthly rebuild"><text class="lab" x="0" y="14">Review questions per monthly rebuild</text>`;
  [0, 100, 200, 300, 400].filter((v) => v < mx).forEach((v) => (s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`));
  months.forEach((m) => (s += `<text x="${X(m)}" y="${H - pb + 20}" text-anchor="middle">Month ${m}</text>`));
  [["amnesia", "var(--s2)", "Lost on rebuild"], ["persistent", "var(--accent)", "Kept"]].forEach(([k, c, lab]) => {
    const pts = sim[k].map((m) => [X(m.month), Y(m.reviewTasks), m]);
    s += `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts.map((p) => p[0] + "," + p[1]).join(" ")}"/>`;
    pts.forEach(([x, y, m]) => (s += `<circle class="b" data-t="${esc(lab + ", month " + m.month + ": " + m.reviewTasks + " review tasks, " + m.challenges + " user challenges, " + m.reverted + " fixes reverted")}" cx="${x}" cy="${y}" r="9" fill="transparent"/><circle cx="${x}" cy="${y}" r="4.5" fill="${c}" stroke="var(--surface)" stroke-width="2"/>`));
    const last = pts[pts.length - 1]; s += `<text class="val" x="${last[0] + 12}" y="${last[1] + 4}">${lab}</text>`;
  });
  return s + "</svg>";
}
const polRows = (k, fmt) => R.POLICIES.map((p) => ({ label: R.NAMES[p], v: POL[p][k], hi: p === "governed" }));
const SHORT = { deterministic: "IDs only", naive: "Fuzzy name + address", scored: "Evidence scoring", guarded: "+ hard rules", governed: "+ hold + review" };
const polRowsS = (k) => R.POLICIES.map((p) => ({ label: SHORT[p], v: POL[p][k], hi: p === "governed" }));

// ---------- page ----------
const T = sim.totals, reviewCut = 1 - T.persistent.reviewTasks / T.amnesia.reviewTasks;
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Same name, different company: governed entity resolution for Client 360 · Aditya Mathur</title>
<meta name="description" content="A bank holds the same client under many IDs, and different clients under the same name. A governed entity resolution design: explainable match decisions, hard rules, a review band, overrides that survive rebuilds, and attribute arbitration with lineage. Simulated on ${n0(recAvg)} records from five sources.">
<style>
:root{--bg:#fafaf8;--surface:#fff;--ink:#15151f;--ink-soft:#3b414b;--muted:#5b6170;--line:#e4e3de;--accent:#2b4fd8;--accent-soft:#eaeefc;--tag:#f0efea;--good:#1f6b45;--good-soft:#e5f3eb;--bad:#a5332a;--bad-soft:#fbeae8;--warn:#8a5a10;--warn-soft:#fbf1df;--s2:#9aa0ab;--grid:#ebeae6}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--surface:#171a1f;--ink:#e9ebee;--ink-soft:#c3c8d0;--muted:#9aa1ad;--line:#2a2e36;--accent:#8ea6ff;--accent-soft:#1a2140;--tag:#1f232a;--good:#6fd09c;--good-soft:#142a1e;--bad:#f09186;--bad-soft:#2d1816;--warn:#f0b86e;--warn-soft:#2a2214;--s2:#5d6470;--grid:#24272d}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a.src{font-size:12px;white-space:nowrap}.wrap{max-width:1000px;margin:0 auto;padding:44px 18px 80px}
.kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}h1{font-size:clamp(30px,5vw,44px);line-height:1.08;margin:0 0 12px;letter-spacing:-.02em}
.lede{font-size:19px;color:var(--muted);margin:0 0 14px;max-width:840px}.byline{font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 16px}
.disclaimer{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:18px 0 0}
h2{font-size:24px;line-height:1.2;margin:56px 0 10px;letter-spacing:-.01em}h2 .n{color:var(--muted);font-weight:500;margin-right:8px}h3{font-size:17px;margin:22px 0 6px}
p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:22px}li{margin:5px 0}
.tldr{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:28px 0 0}.tldr h2{margin:0 0 10px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat b{display:block;font-size:26px;line-height:1.1}.stat span{font-size:13.5px;color:var(--muted);display:block;margin-top:4px;line-height:1.35}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 14px;background:var(--surface);border:1px solid var(--line)}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--tag)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.top td{background:var(--accent-soft)}.tablewrap{overflow-x:auto}.note{font-size:13px;color:var(--muted);font-weight:400}
.callout{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin:14px 0}.callout.warn{background:var(--warn-soft)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card h3{margin-top:0}
.pill{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;padding:2px 9px;border-radius:999px;white-space:nowrap}
.r-AUTO{background:var(--good-soft);color:var(--good)}.r-REVIEW{background:var(--accent-soft);color:var(--accent)}.r-HOLD{background:var(--warn-soft);color:var(--warn)}.r-BLOCK,.r-NO{background:var(--bad-soft);color:var(--bad)}.r-YES{background:var(--good-soft);color:var(--good)}
.chart{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;position:relative}.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--muted);font-size:12px;font-family:inherit}.chart .lab{fill:var(--ink);font-size:13px;font-weight:600}.chart .val{fill:var(--ink);font-size:12px}
figure{margin:14px 0 18px}figcaption{font-size:13.5px;color:var(--muted);margin-top:6px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12.5px;padding:6px 9px;border-radius:8px;opacity:0;transition:opacity .1s;max-width:280px;line-height:1.4;z-index:2}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink-soft);margin:6px 0 0 4px}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.ex{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px}.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.tabs button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--bg);color:var(--ink-soft);border-radius:999px;padding:5px 12px;cursor:pointer}.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.recs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rec{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;background:var(--bg)}.rec b{font-size:15px;display:block;margin:2px 0 6px}
.rec dl{display:grid;grid-template-columns:78px 1fr;gap:2px 8px;margin:0}.rec dt{color:var(--muted)}.rec dd{margin:0;word-break:break-word}
.terms{margin:12px 0 0;display:grid;gap:4px}.term{display:grid;grid-template-columns:150px 1fr 54px;gap:10px;align-items:center;font-size:13.5px}.term .bar{height:12px;border-radius:3px}
.verdicts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}.verdicts div{border:1px solid var(--line);border-radius:10px;padding:10px;font-size:13.5px}
.sl{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;grid-template-columns:1fr 1.3fr;gap:18px}.sl label{display:block;font-size:13.5px;color:var(--ink-soft);margin-bottom:12px}
input[type=range]{width:100%;accent-color:var(--accent)}.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.kv div{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px}.kv b{display:block;font-size:22px}.kv span{font-size:12.5px;color:var(--muted)}
code{font-size:13px;background:var(--tag);padding:1px 5px;border-radius:4px}.sources li{font-size:13.5px}.flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13.5px;margin:8px 0 14px}.flow span{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 10px}.flow i{color:var(--muted);font-style:normal}
@media (max-width:760px){.stats{grid-template-columns:1fr 1fr}.grid2,.recs,.sl,.verdicts{grid-template-columns:1fr}.kv{grid-template-columns:1fr 1fr}.term{grid-template-columns:110px 1fr 46px}}
</style></head><body><div class="wrap">
<p class="kicker">Product proposal · Entity resolution · written for J.P. Morgan CIB Client 360</p>
<h1>Same name, different company</h1>
<p class="lede">A corporate bank holds one client under many IDs, and different clients under almost the same name. Matching them is only half the problem. The other half is product: explaining every merge, stopping the ones that are never safe, letting an analyst's fix survive the next rebuild, and deciding which source wins each attribute of the profile.</p>
<div class="byline"><span>Aditya Mathur</span><span>Bengaluru</span><span>November 2026</span><span><a href="https://github.com/adimathur-creates/adimathur-creates.github.io/tree/main/jpm-entity-resolution">Code and 16 tests</a></span></div>
<p class="disclaimer">Independent work. Not affiliated with or reviewed by J.P. Morgan, and no J.P. Morgan data. The ${n0(recAvg)} records per run are synthetic, built to look like five real source types: KYC onboarding, a credit system, a CRM, the GLEIF LEI registry and a commercial data vendor. Every noise rate, weight and threshold is a labelled assumption in the code. The numbers show trade-offs, not J.P. Morgan's results.</p>

<section class="tldr"><h2>The short version</h2>
<ul>
<li><b>The problem.</b> One legal entity can sit in a bank under several IDs and names, and onboarding, credit, compliance and reference data teams may each work from a different version <a class="src" href="https://www.risk.net/insight/technology-and-data/7964142/one-legal-entity-multiple-ids-three-business-risks">[source]</a>. Counterparty limits and BCBS 239 risk aggregation both depend on getting this right <a class="src" href="https://www.risk.net/insight/technology-and-data/7964142/one-legal-entity-multiple-ids-three-business-risks">[source]</a>. The Basel Committee still calls data lineage a challenging part of BCBS 239 in 2026 <a class="src" href="https://www.bis.org/publ/bcbs_nl36.htm">[source]</a>.</li>
<li><b>The costly error is the false merge.</b> A missed match leaves a duplicate profile. A false merge puts two legal entities under one profile, so exposure, KYC status and ownership are wrong for both. Fuzzy name-and-address matching reached ${pct(POL.naive.recall, 0)} recall but left <b>${POL.naive.overMerged.toFixed(0)}</b> wrongly merged profiles per run, and merged <b>${POL.naive.twin[0]} of ${POL.naive.twin[1]}</b> same-name twin companies.</li>
<li><b>The design.</b> Evidence for and against every pair, each term explained. Three hard rules that no score can override. A hold for records that fit two companies equally. One review question per pair of clusters, not per pair of records. It cut wrongly merged profiles by <b>${pct(omCut, 0)}</b> and duplicate profiles by <b>${pct(dupCut, 0)}</b> versus fuzzy matching, at ${pct(POL.governed.precision, 2)} precision and ${pct(POL.governed.recall, 1)} recall.</li>
<li><b>Overrides that stick.</b> If an analyst's fix is stored against the golden-record ID, the next rebuild forgets it. Stored against source-record IDs and versions, it lasts until a record changes. Over six monthly rebuilds that meant <b>${pct(reviewCut, 0)} fewer review tasks</b> and <b>${T.persistent.reverted} reverted fixes instead of ${T.amnesia.reverted}</b>.</li>
<li><b>Vendors earn their money in the profile, not the match rate.</b> Removing the commercial vendor barely moved match recall (${pct(base.recall)} → ${pct(vb.recall)}). Profile accuracy fell from <b>${pct(base.acc)} to ${pct(vb.acc)}</b>, and industry codes from ${pct(base.industry, 0)} to ${pct(vb.industry, 0)}.</li>
<li><b>Tested and parked:</b> learning match weights from today's labels. The model needed ${pct(ml99.ml.review / ml99.hand.review - 1, 0)} more human review than the hand-set rules at 99% precision, because today's labels are biased. Fix the labels first.</li>
</ul></section>

<div class="stats">
<div class="stat"><b>${pct(omCut, 0)}</b><span>fewer wrongly merged profiles than fuzzy matching</span></div>
<div class="stat"><b>${POL.governed.twin[0]} / ${POL.governed.twin[1]}</b><span>same-name twins merged, vs ${POL.naive.twin[0]} with fuzzy matching (5 runs)</span></div>
<div class="stat"><b>${pct(1 - POL.governed.review / pairLevel, 0)}</b><span>fewer review tasks from asking per cluster, not per record pair</span></div>
<div class="stat"><b>${T.persistent.reverted} vs ${T.amnesia.reverted}</b><span>analyst fixes undone by rebuilds in six months</span></div>
</div>

<h2><span class="n">1</span>Why this is the problem to solve</h2>
<div class="grid2">
<div class="card"><h3>What the team owns</h3><ul>
<li>The Client 360 Product Associate role covers entity resolution, organisational profiles and third-party data integration. It also covers challenge-and-override workflows, explainability, attribute arbitration and lineage, measured with precision and recall.</li>
<li>Another J.P. Morgan posting describes entity resolution across internal and third-party sources that balances deterministic rules with ML-assisted matching, with every decision explainable, traceable and auditable <a class="src" href="https://www.canarywharfian.co.uk/jobs/jp-morgan/product-manager-ai-platform/b0e433cf-10f6-4001-99ad-f984e5d8b0b2">[source]</a>.</li>
<li>Matching models are not the gap. J.P. Morgan has published neural entity linking work <a class="src" href="https://arxiv.org/abs/2411.02695v1">[source]</a> and patented ML company matching with a feedback loop <a class="src" href="https://patentsgazette.uspto.gov/week17/OG/html/1533-5/US12287766-20250429.html">[source]</a>. The open product questions are governance: what may merge automatically, what never may, and how a human correction persists.</li></ul></div>
<div class="card"><h3>Who feels a wrong profile</h3><ul>
<li><b>Credit risk:</b> exposure to a counterparty is summed by legal entity. A false merge adds a subsidiary's exposure to its twin's; a duplicate splits it.</li>
<li><b>KYC and onboarding:</b> a merged profile can show one entity as verified because its twin was.</li>
<li><b>Bankers:</b> an incomplete view of a client group hides cross-sell and prospecting opportunities <a class="src" href="https://www.risk.net/insight/technology-and-data/7964142/one-legal-entity-multiple-ids-three-business-risks">[source]</a>.</li>
<li><b>Reference data operations:</b> analysts who validate and remediate Client 360 data every day <a class="src" href="https://www.talentmate.com/jobs/india/Bengaluru/data-management-analyst/2605-2545-3957">[source]</a>. Their time is the review budget.</li></ul></div>
</div>
<p><b>Problem statement.</b> Resolve records from internal systems and third-party vendors into one governed profile per legal entity. Keep false merges near zero, because they corrupt risk and compliance data. Keep duplicates low. Keep analyst work bounded, explain every decision, and make every human correction durable and auditable.</p>

<h2><span class="n">2</span>Try it: why a pair did or didn't merge</h2>
<p>Real pairs from one simulated run. Each shows the two records, the evidence for and against, any hard rule, and what each approach decided.</p>
<div class="ex" id="ex"><div class="tabs" role="tablist"></div><p class="note" id="exBlurb"></p><div class="recs" id="exRecs"></div><div class="terms" id="exTerms"></div><div class="verdicts" id="exVerdicts"></div></div>

<h2><span class="n">3</span>Five approaches, same data</h2>
<p>${SEEDS.length} runs, each about ${n0(recAvg)} records for ${n0(entAvg)} legal entities, about ${n0(meta.candidates / 1000)}k candidate pairs after blocking. Every approach sees identical records. The governed approach adds two things on top of hard rules: it holds records that fit two companies equally, and it sends the grey zone to an analyst who is right 95% of the time (an assumption).</p>
<div class="grid2">
<figure class="chart">${hbars(polRowsS("overMerged"), (v) => v.toFixed(1), "Wrongly merged profiles per run (lower is better)")}<div class="tip"></div></figure>
<figure class="chart">${hbars(polRowsS("duplicates"), (v) => n0(v), "Duplicate profiles left per run (lower is better)")}<div class="tip"></div></figure>
</div>
<div class="tablewrap"><table>
<tr><th>Approach</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">Wrong merges</th><th class="num">Duplicates</th><th class="num">Twins merged</th><th class="num">Homonyms merged</th><th class="num">Review tasks</th></tr>
${R.POLICIES.map((p) => `<tr${p === "governed" ? ' class="top"' : ""}><td><b>${esc(R.NAMES[p])}</b></td><td class="num">${pct(POL[p].precision, 2)}</td><td class="num">${pct(POL[p].recall)}</td><td class="num">${POL[p].overMerged.toFixed(1)}</td><td class="num">${n0(POL[p].duplicates)}</td><td class="num">${POL[p].twin[0]} / ${POL[p].twin[1]}</td><td class="num">${POL[p].homonym[0]} / ${POL[p].homonym[1]}</td><td class="num">${POL[p].review ? n0(POL[p].review) : "—"}</td></tr>`).join("")}
</table></div>
<p class="note">Precision and recall are pairwise, over records placed in the same profile. "Wrong merges" counts profiles that contain more than one legal entity. Twins and homonyms are totals across the ${SEEDS.length} runs. No approach merged a parent into its subsidiary except fuzzy matching (${POL.naive.parentChild[0]} of ${POL.naive.parentChild[1]}).</p>
<div class="grid2">
<div class="card"><h3>What each step bought</h3><ul>
<li><b>Scoring evidence against a match</b> (distinguishing words, different legal forms, different postcodes) took wrong merges from ${POL.naive.overMerged.toFixed(0)} to ${POL.scored.overMerged.toFixed(0)}, but recall fell to ${pct(POL.scored.recall, 0)}.</li>
<li><b>Hard rules</b> (different valid LEIs, different registration numbers, one record naming the other as its parent) halved wrong merges again, to ${POL.guarded.overMerged.toFixed(0)}.</li>
<li><b>The hold and the review band</b> took wrong merges to ${POL.governed.overMerged.toFixed(1)} and recovered recall to ${pct(POL.governed.recall, 0)}.</li></ul></div>
<div class="card"><h3>Why per-cluster review matters</h3><p>A CRM record that resembles a company held by four sources creates four record-pair questions with one answer. Asking once per pair of clusters cut the queue from ${n0(pairLevel)} to ${n0(POL.governed.review)} questions a run, about ${n0((POL.governed.review * 4) / 60)} analyst hours at 4 minutes each. Pairs between clusters that a hard rule already separates never reach the queue.</p></div>
</div>
<h3>Choose the thresholds</h3>
<p>Auto-match is the score above which records merge with no human. The review floor is the score below which they are treated as different. Between them, an analyst decides.</p>
<div class="sl"><div>
<label>Auto-match at score ≥ <b id="oA">10</b><input type="range" id="sA" min="0" max="${AUTOS.length - 1}" step="1" value="${AUTOS.indexOf(10)}"></label>
<label>Review floor at score ≥ <b id="oF">3</b><input type="range" id="sF" min="0" max="${FLOORS.length - 1}" step="1" value="${FLOORS.indexOf(3)}"></label>
<p class="note">Raising auto-match moves pairs from automatic to human. Lowering the floor catches more true matches but grows the queue.</p></div>
<div class="kv"><div><b id="kP"></b><span>precision</span></div><div><b id="kR"></b><span>recall</span></div><div><b id="kO"></b><span>wrongly merged profiles</span></div><div><b id="kD"></b><span>duplicate profiles</span></div><div><b id="kV"></b><span>review questions</span></div><div><b id="kH"></b><span>analyst hours</span></div></div></div>

<h2><span class="n">4</span>Overrides that survive the next rebuild</h2>
<p>Profiles are rebuilt as sources refresh. In this simulation about 5% of records change each month, and downstream users catch half of the wrongly merged profiles they meet and raise a challenge. An analyst splits each one. The question is what happens to that split, and to every reviewer decision, next month.</p>
<figure class="chart">${lines()}<div class="tip"></div></figure>
<div class="legend"><span><i style="background:var(--s2)"></i>Overrides stored against the golden-record ID (lost on rebuild)</span><span><i style="background:var(--accent)"></i>Overrides stored against source-record IDs and versions</span></div>
<div class="tablewrap"><table><tr><th>Six months</th><th class="num">Review tasks</th><th class="num">Analyst hours</th><th class="num">User challenges</th><th class="num">Fixes undone by a rebuild</th></tr>
<tr><td>Overrides lost on rebuild</td><td class="num">${n0(T.amnesia.reviewTasks)}</td><td class="num">${n0(T.amnesia.reviewHours)}</td><td class="num">${T.amnesia.challenges}</td><td class="num">${T.amnesia.reverted}</td></tr>
<tr class="top"><td><b>Overrides kept, re-verified when a record changes</b></td><td class="num">${n0(T.persistent.reviewTasks)}</td><td class="num">${n0(T.persistent.reviewHours)}</td><td class="num">${T.persistent.challenges}</td><td class="num">${T.persistent.reverted}</td></tr></table></div>
<p class="note">Two more seeds gave the same direction: review tasks ${simSeeds.map((t) => n0(t.amnesia.reviewTasks) + " → " + n0(t.persistent.reviewTasks)).join(" and ")}; fixes undone ${simSeeds.map((t) => t.amnesia.reverted + " → " + t.persistent.reverted).join(" and ")}.</p>
<div class="callout"><b>Why the lost version is worse than it looks.</b> Without memory, every reviewer decision is asked again, and a reviewer's 5% error rate is re-rolled each month, so some correct splits flip back. Users see the same wrong profile return after they reported it. That is how people stop trusting the golden source. With memory, a decision is re-asked only when one of its records changes. That's the re-verify rule.</div>
<h3>The challenge-and-override workflow</h3>
<div class="flow"><span>User raises a challenge on a profile</span><i>→</i><span>Triage: merge, split or attribute fix</span><i>→</i><span>Maker proposes, with evidence</span><i>→</i><span>Checker approves</span><i>→</i><span>Stored as a constraint on source-record IDs + versions</span><i>→</i><span>Re-verified when a record changes</span></div>
<ul>
<li><b>Split</b> becomes a cannot-link between the records. <b>Merge</b> becomes a must-link. <b>Attribute fix</b> pins a value, with an expiry and the evidence behind it.</li>
<li>Every override records who, when, why, the evidence, and who approved it. That's the audit trail BCBS 239 lineage needs.</li>
<li>Overrides rank above model output and below a hard rule. An analyst can't merge two records with different valid LEIs without first fixing the LEI.</li>
</ul>

<h2><span class="n">5</span>One profile per entity: arbitration and lineage</h2>
<p>Once records are grouped, each attribute of the profile needs one value. Arbitration decides which source wins, and lineage records why. Here is a real resolved profile from the run: a subsidiary held by ${new Set(goldenGroup.map((r) => r.src)).size} sources, where a single trusted source would get some attributes wrong.</p>
<div class="tablewrap"><table><tr><th>Source</th><th>Name as recorded</th><th>LEI</th><th>City, postcode</th><th class="num">Industry</th><th>As of</th></tr>
${goldenGroup.map((r) => `<tr><td>${esc(D.SOURCES[r.src].label)}</td><td>${esc(r.name)}</td><td>${esc(r.lei ? (r.leiOk ? r.lei : r.lei + " ✗") : "—")}</td><td>${esc([r.addr.city, r.addr.postcode].filter(Boolean).join(", "))}</td><td class="num">${esc(r.industry || "—")}</td><td>${day(r.asOf)}</td></tr>`).join("")}
</table></div>
<div class="tablewrap"><table><tr><th>Attribute</th><th>Profile value (attribute rules)</th><th>Chosen from</th><th>Rule</th><th>Single-source order would pick</th><th>Correct?</th></tr>
${A.ATTRS.map((a) => { const v = prof[a], o = profOne[a], tv = truthVal[a], ok = v && eqV(a, showVal(a, v.value), tv), ok1 = o && eqV(a, showVal(a, o.value), tv);
  return `<tr><td><b>${A.LABEL[a]}</b></td><td>${esc(v ? showVal(a, v.value) : "—")}</td><td>${esc(v ? D.SOURCES[v.source].label + " · " + v.record + " · " + day(v.asOf) : "—")}</td><td class="note">${esc(A.WHY[a])}</td><td>${esc(o ? showVal(a, o.value) : "—")}</td><td><span class="pill ${ok ? "r-YES" : "r-NO"}">${ok ? "Rules ✓" : "Rules ✗"}</span> <span class="pill ${ok1 ? "r-YES" : "r-NO"}">${ok1 ? "Single ✓" : "Single ✗"}</span></td></tr>`; }).join("")}
</table></div>
<p class="note">Correctness is checked against the simulated truth: ${esc(truthVal.legalName)}, registered in ${esc(truthVal.registeredCity)}, parent ${esc(truthVal.parent)}.</p>
<h3>Across all ${n0(arb.profiles)} clean profiles in the run</h3>
<div class="tablewrap"><table><tr><th>Arbitration strategy</th>${A.ATTRS.map((a) => `<th class="num">${A.LABEL[a]}</th>`).join("")}<th class="num">All attributes</th></tr>
${[["one_source", "One trusted source for everything (KYC first)"], ["most_recent", "Most recent record wins"], ["rules", "Attribute-level rules"]].map(([s, l]) => `<tr${s === "rules" ? ' class="top"' : ""}><td><b>${l}</b></td>${A.ATTRS.map((a) => `<td class="num">${pct(attrAcc(s, a), 0)}</td>`).join("")}<td class="num">${pct(arb.res[s].overall)}</td></tr>`).join("")}
</table></div>
<p class="note">Share of profiles with the correct value; a missing value counts as wrong. The gain from attribute rules is real but modest (${((arb.res.rules.overall - arb.res.one_source.overall) * 100).toFixed(1)} points overall, ${((attrAcc("rules", "parent") - attrAcc("one_source", "parent")) * 100).toFixed(0)} on parent). Most remaining errors are values no source holds, so the next step is coverage, not a cleverer rule.</p>
<h3>Which third-party data is worth paying for</h3>
<p>Rerun everything with one source removed. This is how I would rank integrations: by what each one adds to the profile and removes from the review queue, not by match rate.</p>
<div class="tablewrap"><table><tr><th>Source removed</th><th class="num">Match recall</th><th class="num">Review tasks</th><th class="num">Profile accuracy</th><th class="num">Parent correct</th><th class="num">LEI known</th><th class="num">Industry correct</th></tr>
${vendor.map((v) => `<tr${!v.drop ? ' class="top"' : ""}><td><b>${v.drop ? esc(D.SOURCES[v.drop].label) : "None (all five sources)"}</b></td><td class="num">${pct(v.recall)}</td><td class="num">${n0(v.review)}</td><td class="num">${pct(v.acc)}</td><td class="num">${pct(v.parent, 0)}</td><td class="num">${pct(v.lei, 0)}</td><td class="num">${pct(v.industry, 0)}</td></tr>`).join("")}
</table></div>
<p class="note">Match recall is measured over the records that remain, so it is only comparable within a row. The front-office CRM is left out: removing it removes the noisiest records rather than a capability.</p>
<ul>
<li><b>Commercial vendor:</b> worth ${((base.acc - vb.acc) * 100).toFixed(1)} points of profile accuracy, mostly industry and parent. Match recall barely notices. A vendor bake-off that only measured match rate would wrongly call it marginal.</li>
<li><b>LEI registry:</b> free, and worth ${((base.acc - lr.acc) * 100).toFixed(1)} points plus ${n0(lr.review - base.review)} fewer review questions a run, because a shared valid LEI settles a pair without a person.</li>
<li><b>Credit system:</b> adds ${((base.acc - cr.acc) * 100).toFixed(1)} points. It matters for exposure, not for the profile; don't let it win any profile attribute.</li>
</ul>

<h2><span class="n">6</span>Tested and parked: learning the weights</h2>
<div class="callout warn"><p><b>A model trained on the labels the process already produces did worse than the hand-set weights.</b> I trained a logistic regression on ${n0(ml99.trainLabels)} labels from one run: ${ml99.reviewerLabels} reviewer decisions, plus ID-confirmed matches and hard-rule conflicts. I tested it on another run's ${n0(ml99.poolPairs)} pairs that share no identifier, the hard part. To reach 99% precision it sent <b>${n0(ml99.ml.review)}</b> pairs to review, against <b>${n0(ml99.hand.review)}</b> for the hand weights. At 99.5% it was ${n0(ml995.ml.review)} against ${n0(ml995.hand.review)}.</p>
<p style="margin:0"><b>Why:</b> ID-confirmed pairs teach the model that names don't matter, and hard-rule conflicts are mostly twins, so it learns the wrong lesson about similar names. Adding 800 randomly audited pairs still left it at ${n0(mlAudit.ml.review)}. <b>What I'd do:</b> keep explainable rules for v1. Start a random audit sample now, because that's the only unbiased label set. Use ML first to rank the review queue, where a mistake costs minutes, not a wrong merge.</p></div>

<h2><span class="n">7</span>Spec</h2>
<h3>Requirements (v1)</h3>
<ol>
<li><b>Explainable decisions.</b> Every match, non-match, hold and review decision stores its evidence terms, score, rule version and thresholds. The pair view above is the analyst screen.</li>
<li><b>Hard rules beat scores.</b> Different valid LEIs, different registration numbers in one country, or a parent-subsidiary link means never merge. LEIs are validated against ISO 17442 check digits first, so a typo is ignored instead of blocking a true match.</li>
<li><b>Hold, don't guess.</b> A record that strongly matches two clusters a hard rule keeps apart waits for review.</li>
<li><b>Review by cluster.</b> One question per pair of clusters in the grey zone, showing both clusters' records.</li>
<li><b>Durable overrides.</b> Stored on source-record IDs and versions, with maker-checker approval, and re-verified on material change.</li>
<li><b>Attribute arbitration with lineage.</b> Source precedence by attribute. Every value records its source, record, date and rule.</li>
</ol>
<h3>Metrics</h3>
<div class="tablewrap"><table><tr><th>Metric</th><th>Why</th></tr>
<tr><td>Wrongly merged profiles, from a monthly random audit</td><td>The error that corrupts exposure and KYC; precision alone hides it inside millions of correct pairs</td></tr>
<tr><td>Precision and recall by segment: twins, homonyms, renamed, cross-source</td><td>An overall number of 99% can hide a segment at 60%</td></tr>
<tr><td>Duplicate profile rate</td><td>Split exposure and a broken client view</td></tr>
<tr><td>Review questions and analyst hours per refresh</td><td>The cost of the grey zone; the budget thresholds are set against</td></tr>
<tr><td>Override reversion rate and challenge repeat rate</td><td>Whether fixes stick; the trust metric for users</td></tr>
<tr><td>Profile accuracy by attribute, and coverage by source</td><td>Arbitration quality and vendor value</td></tr>
</table></div>
<h3>Rollout</h3>
<ol>
<li><b>Shadow:</b> run beside the current process for two refresh cycles. Compare every disagreement and label a random sample. That sample becomes the first unbiased truth set.</li>
<li><b>Migrate existing overrides</b> onto source-record keys before switching anything on, or the first rebuild undoes years of analyst work.</li>
<li><b>Turn on by segment,</b> starting where hard rules do most of the work (entities with LEIs), then the long tail without identifiers.</li>
<li><b>Guardrails:</b> stop auto-merging if the audited wrong-merge rate or the challenge rate crosses a set level.</li>
</ol>
<h3>Questions I'd bring to the team</h3>
<ul>
<li>How are overrides keyed today, and how many come back after a rebuild?</li>
<li>Which downstream consumer feels a false merge first: credit limits, KYC, or bankers' client views? That decides which segment to audit first.</li>
<li>How is a new vendor evaluated today: match rate, or what it adds to the profile?</li>
</ul>

<h2><span class="n">8</span>Method and limits</h2>
<ul>
<li>Synthetic data: ${n0(entAvg)} entities per run in about 380 corporate groups, with renames, moves, shared head offices, same-name twins and homonyms. Source quality rates are assumptions in <code>src/data.js</code>.</li>
<li>Blocking (same country and first name word, or any shared identifier) finds about 97% of true pairs. Most misses are renamed companies with no shared ID. In production this would need a former-names index.</li>
<li>Weights are hand-set log-odds, not fitted. That's deliberate for explainability (see section 6).</li>
<li>Reviewers are assumed right 95% of the time; users catch half of wrong merges each month. Neither has been measured.</li>
<li>Not modelled: corporate actions that create new legal entities, branches, funds, and multilingual names.</li>
</ul>
<h3>Sources</h3>
<ol class="sources">
<li><a href="https://www.risk.net/insight/technology-and-data/7964142/one-legal-entity-multiple-ids-three-business-risks">Risk.net, "One legal entity. Multiple IDs. Three business risks." (sponsored, GoldenSource, Oct 2026)</a></li>
<li><a href="https://www.bis.org/publ/bcbs_nl36.htm">Basel Committee newsletter on BCBS 239 implementation, Jan 2026</a></li>
<li><a href="https://www.canarywharfian.co.uk/jobs/jp-morgan/product-manager-ai-platform/b0e433cf-10f6-4001-99ad-f984e5d8b0b2">J.P. Morgan, Product Manager, AI Platform (job listing)</a></li>
<li><a href="https://www.talentmate.com/jobs/india/Bengaluru/data-management-analyst/2605-2545-3957">J.P. Morgan, Data Management Analyst, Client 360 (job listing)</a></li>
<li><a href="https://arxiv.org/abs/2411.02695v1">Ding et al., "JEL: Applying End-to-End Neural Entity Linking in JPMorgan Chase"</a></li>
<li><a href="https://patentsgazette.uspto.gov/week17/OG/html/1533-5/US12287766-20250429.html">US 12,287,766 B2, ML-based data matching (assigned to JPMorgan Chase Bank)</a></li>
<li><a href="https://www.gleif.org/en/lei-data/gleif-concatenated-file/lei-download">GLEIF LEI and Level 2 "who owns whom" data</a></li>
</ol>
<p class="note">Built by Aditya Mathur. <a href="../">More work</a>.</p>
</div>
<script>
(function(){
  const EX = ${JSON.stringify(EX)}, GRID = ${JSON.stringify(grid)}, AUTOS = ${JSON.stringify(AUTOS)}, FLOORS = ${JSON.stringify(FLOORS)};
  const $ = (s) => document.querySelector(s), esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const ROUTE = { AUTO: "Auto-match", REVIEW: "Sent to an analyst", HOLD: "Held: fits two companies", BLOCK: "Never merge (hard rule)", NO: "No match" };
  const tabs = $("#ex .tabs");
  EX.forEach((e, i) => { const b = document.createElement("button"); b.textContent = e.title; b.setAttribute("role", "tab"); b.onclick = () => show(i); tabs.appendChild(b); });
  function rec(r) { return '<div class="rec"><span class="note">' + esc(r.src) + '</span><b>' + esc(r.name) + '</b><dl><dt>Country</dt><dd>' + r.country + '</dd><dt>LEI</dt><dd>' + esc(r.lei) + '</dd><dt>Reg. no.</dt><dd>' + esc(r.reg) + '</dd><dt>Address</dt><dd>' + esc(r.addr) + '</dd><dt>Industry</dt><dd>' + esc(r.industry) + '</dd><dt>Parent</dt><dd>' + esc(r.parent) + '</dd></dl></div>'; }
  function show(i) {
    const e = EX[i]; [...tabs.children].forEach((b, k) => b.setAttribute("aria-selected", k === i));
    $("#exBlurb").textContent = e.blurb; $("#exRecs").innerHTML = rec(e.a) + rec(e.b);
    const mx = Math.max(6, ...e.terms.map((t) => Math.abs(t.w)));
    $("#exTerms").innerHTML = e.terms.map((t) => '<div class="term"><span>' + esc(t.why) + '</span><div><div class="bar" style="width:' + (Math.abs(t.w) / mx * 100) + '%;background:' + (t.w >= 0 ? "var(--good)" : "var(--bad)") + '"></div></div><span style="text-align:right;font-variant-numeric:tabular-nums">' + (t.w > 0 ? "+" : "") + t.w + '</span></div>').join("") + '<div class="term"><b>Evidence score</b><span></span><b style="text-align:right">' + e.score.toFixed(1) + '</b></div>' + (e.hard.length ? '<div class="callout warn" style="margin:6px 0 0;padding:8px 12px"><b>Hard rule:</b> ' + e.hard.map(esc).join("; ") + '</div>' : "");
    $("#exVerdicts").innerHTML = '<div><span class="note">Fuzzy name + address</span><br><span class="pill ' + (e.naiveLink ? "r-AUTO" : "r-NO") + '">' + (e.naiveLink ? "Merge" : "No match") + '</span> score ' + e.naive + '</div>' +
      '<div><span class="note">Governed design</span><br><span class="pill r-' + e.route + '">' + ROUTE[e.route] + '</span><br><span class="note">Final: ' + (e.together ? "same profile" : "separate profiles") + '</span></div>' +
      '<div><span class="note">Truth (simulated)</span><br><span class="pill ' + (e.truth ? "r-YES" : "r-NO") + '">' + (e.truth ? "Same legal entity" : "Different legal entities") + '</span></div>';
  }
  show(0);
  function upd() { const a = AUTOS[$("#sA").value], f = FLOORS[$("#sF").value]; $("#oA").textContent = a; $("#oF").textContent = f;
    const g = GRID.find((x) => x.a === a && x.fl === f);
    if (!g) { ["#kP", "#kR", "#kO", "#kD", "#kV", "#kH"].forEach((s) => ($(s).textContent = "—")); $("#kP").textContent = "floor ≥ auto"; return; }
    $("#kP").textContent = (g.p * 100).toFixed(2) + "%"; $("#kR").textContent = (g.r * 100).toFixed(1) + "%"; $("#kO").textContent = g.om; $("#kD").textContent = g.dup; $("#kV").textContent = g.rv; $("#kH").textContent = Math.round(g.rv * 4 / 60); }
  $("#sA").addEventListener("input", upd); $("#sF").addEventListener("input", upd); upd();
  document.querySelectorAll(".chart").forEach((el) => { const tip = el.querySelector(".tip"); if (!tip) return;
    el.querySelectorAll(".b").forEach((r) => { r.addEventListener("mousemove", (ev) => { tip.textContent = r.dataset.t; const b = el.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - b.left + 12, b.width - 290) + "px"; tip.style.top = (ev.clientY - b.top - 34) + "px"; tip.style.opacity = 1; }); r.addEventListener("mouseleave", () => (tip.style.opacity = 0)); }); });
})();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "..", "index.html"), html);
console.log(JSON.stringify({ bytes: html.length, examples: EX.map((e) => e.title + ":" + e.route + ":" + e.naiveLink + ":" + e.truth), POL: Object.fromEntries(Object.entries(POL).map(([k, v]) => [k, { p: v.precision.toFixed(4), r: v.recall.toFixed(3), om: v.overMerged, dup: v.duplicates, rv: v.review, twin: v.twin, hom: v.homonym, pc: v.parentChild }])), pairLevel, T, simSeeds, vendor: vendor.map((v) => [v.drop, v.recall.toFixed(4), v.review, v.acc.toFixed(3), v.parent.toFixed(2), v.industry.toFixed(2)]), arb: [arb.res.one_source.overall, arb.res.most_recent.overall, arb.res.rules.overall], ml: [ml99.hand.review, ml99.ml.review, ml995.hand.review, ml995.ml.review, mlAudit.ml.review], golden: goldenGroup.length, gridN: grid.length }, null, 0));
