// Normalisation, candidate generation (blocking), comparison features, scoring and explanations.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./data.js")); else root.ERMatch = f(root.ERData); })(this, function (D) {
  const FORMS = [ // longest first; canonical legal form codes
    ["LIMITED LIABILITY COMPANY", "LLC"], ["PUBLIC LIMITED COMPANY", "PLC"], ["LIMITED PARTNERSHIP", "LP"], ["AKTIENGESELLSCHAFT", "AG"], ["PRIVATE LIMITED", "PRIVATE_LTD"], ["PVT LTD", "PRIVATE_LTD"], ["PTE LTD", "PRIVATE_LTD"],
    ["INCORPORATED", "INC"], ["CORPORATION", "CORP"], ["LIMITED", "LTD"], ["GMBH", "GMBH"], ["LLC", "LLC"], ["LLP", "LLP"], ["PLC", "PLC"], ["INC", "INC"], ["CORP", "CORP"], ["LTD", "LTD"], ["LP", "LP"], ["AG", "AG"], ["BV", "BV"], ["NV", "NV"]];
  const EXPAND = {}; Object.entries(D.ABBR).forEach(([k, v]) => (EXPAND[v.toUpperCase()] = k.toUpperCase()));
  function normName(name) {
    let s = " " + name.toUpperCase().replace(/&/g, " AND ").replace(/[.,'()]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim() + " ";
    s = s.replace(/ G M B H /g, " GMBH ").replace(/ L L C /g, " LLC ").replace(/ B V /g, " BV ").replace(/ N V /g, " NV ");
    let form = null;
    for (const [t, c] of FORMS) { if (s.endsWith(" " + t + " ")) { form = c; s = s.slice(0, s.length - t.length - 1); break; } }
    const tokens = s.trim().split(" ").filter((t) => t && t !== "THE").map((t) => EXPAND[t] || t);
    return { core: tokens.join(" "), tokens, form };
  }
  function jw(a, b) { // Jaro-Winkler similarity
    if (a === b) return 1; const la = a.length, lb = b.length; if (!la || !lb) return 0;
    const md = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1), ma = new Array(la).fill(false), mb = new Array(lb).fill(false); let m = 0;
    for (let i = 0; i < la; i++) for (let j = Math.max(0, i - md); j < Math.min(lb, i + md + 1); j++) if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; }
    if (!m) return 0; let t = 0, k = 0; for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
    const j = (m / la + m / lb + (m - t / 2) / m) / 3; let p = 0; while (p < 4 && a[p] === b[p]) p++; return j + p * 0.1 * (1 - j);
  }
  function lev1(a, b) { if (a === b) return 0; if (Math.abs(a.length - b.length) > 1) return 2; let i = 0; while (a[i] === b[i]) i++; const r = (x, y) => x === y; return r(a.slice(i + 1), b.slice(i + 1)) || r(a.slice(i + 1), b.slice(i)) || r(a.slice(i), b.slice(i + 1)) || (a[i] === b[i + 1] && a[i + 1] === b[i] && r(a.slice(i + 2), b.slice(i + 2))) ? 1 : 2; }
  const normStreet = (s) => s && s.toUpperCase().replace(/\bSTREET\b/, "ST").replace(/\bROAD\b/, "RD").replace(/\bAVENUE\b/, "AVE").replace(/\bLANE\b/, "LN");
  const FORM_EQUIV = { LTD: ["LTD", "PRIVATE_LTD"], PRIVATE_LTD: ["LTD", "PRIVATE_LTD"] };
  const formsCompatible = (a, b) => a === b || (FORM_EQUIV[a] || []).includes(b);

  function prepare(records) {
    return records.map((r) => { const n = normName(r.name); return Object.assign({}, r, { n, leiOk: D.leiValid(r.lei), street: normStreet(r.addr.street), pc: r.addr.postcode && r.addr.postcode.replace(/\s/g, "") }); });
  }
  function candidates(P) { // blocking: same country + first name token; or any shared identifier
    const keys = {}, add = (k, i) => { (keys[k] = keys[k] || []).push(i); };
    P.forEach((r, i) => { add("N|" + r.country + "|" + r.n.tokens[0], i); if (r.leiOk) add("L|" + r.lei, i); if (r.reg) add("G|" + r.country + "|" + r.reg, i); if (r.src === "VENDOR_B") add("V|" + r.srcId, i); if (r.pc) add("P|" + r.pc + "|" + r.n.tokens[0].slice(0, 3), i); });
    const seen = new Set(), pairs = [];
    for (const k in keys) { const a = keys[k]; if (a.length > 400) continue; for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) { const i = Math.min(a[x], a[y]), j = Math.max(a[x], a[y]), key = i * 100000 + j; if (i !== j && !seen.has(key)) { seen.add(key); pairs.push([i, j]); } } }
    return pairs;
  }
  // Raw comparison facts for a pair (shared by every scorer)
  function compare(a, b) {
    const f = {};
    f.leiEq = a.leiOk && b.leiOk && a.lei === b.lei; f.leiConflict = a.leiOk && b.leiOk && a.lei !== b.lei;
    f.leiInvalid = (!!a.lei && !a.leiOk) || (!!b.lei && !b.leiOk);
    if (a.reg && b.reg && a.country === b.country) { const d = lev1(a.reg, b.reg); f.regEq = d === 0; f.regNear = d === 1; f.regConflict = d >= 2; }
    f.vendorEq = a.src === "VENDOR_B" && b.src === "VENDOR_B" && a.srcId === b.srcId;
    f.nameExact = a.n.core === b.n.core; f.jw = jw(a.n.core, b.n.core);
    const ta = new Set(a.n.tokens), tb = new Set(b.n.tokens);
    f.extraTokens = [...a.n.tokens.filter((t) => !tb.has(t)), ...b.n.tokens.filter((t) => !ta.has(t))];
    f.formEq = a.n.form && b.n.form && formsCompatible(a.n.form, b.n.form); f.formConflict = a.n.form && b.n.form && !formsCompatible(a.n.form, b.n.form);
    f.pcEq = a.pc && b.pc && a.pc === b.pc; f.pcDiff = a.pc && b.pc && a.pc !== b.pc;
    f.cityEq = a.addr.city === b.addr.city; f.streetEq = a.street && b.street && a.street === b.street;
    f.indEq = a.industry && b.industry && a.industry === b.industry; f.indDiff = a.industry && b.industry && a.industry !== b.industry;
    f.sameCountry = a.country === b.country;
    // hierarchy: one record names the other as its parent
    const pointsTo = (x, y) => x.parentRef && ((x.parentRef.lei && y.leiOk && x.parentRef.lei === y.lei) || (x.parentRef.vendorId && y.src === "VENDOR_B" && x.parentRef.vendorId === y.srcId) || (x.parentRef.name && normName(x.parentRef.name).core === y.n.core));
    f.hierarchy = pointsTo(a, b) || pointsTo(b, a);
    return f;
  }
  // Naive scorer: what a typical fuzzy-name-plus-address rule does. Rewards similarity, never penalises difference.
  function scoreNaive(f) {
    let s = 0; if (f.leiEq) s += 12; if (f.regEq) s += 10; if (f.vendorEq) s += 12;
    s += f.nameExact ? 6 : f.jw >= 0.95 ? 4 : f.jw >= 0.9 ? 2 : 0;
    if (f.pcEq) s += 3; if (f.cityEq) s += 1; if (f.streetEq) s += 2; if (f.indEq) s += 1; return s;
  }
  // Governed scorer: evidence for AND against, each term explained. Weights are hand-set log-odds (assumption).
  const W = { leiEq: 12, regEq: 10, vendorEq: 12, regNear: 2, nameExact: 6, jw95: 4, jw90: 2, jwLow: -4, extraToken: -3.5, formEq: 1, formConflict: -4, pcEq: 3, pcDiff: -1, cityEq: 1, streetEq: 2, indEq: 1, indDiff: -0.5, crossCountry: -6 };
  function explain(f) {
    const t = [], add = (k, w, why) => t.push({ k, w, why });
    if (f.leiEq) add("LEI", W.leiEq, "Same valid LEI");
    if (f.regEq) add("Registration number", W.regEq, "Same company registration number");
    if (f.regNear) add("Registration number", W.regNear, "Registration numbers differ by one character (likely typo)");
    if (f.vendorEq) add("Vendor ID", W.vendorEq, "Same vendor entity ID");
    if (f.nameExact) add("Name", W.nameExact, "Same normalised name");
    else if (f.jw >= 0.95) add("Name", W.jw95, "Names nearly identical (" + f.jw.toFixed(2) + ")");
    else if (f.jw >= 0.9) add("Name", W.jw90, "Names similar (" + f.jw.toFixed(2) + ")");
    else if (f.jw < 0.8) add("Name", W.jwLow, "Names differ (" + f.jw.toFixed(2) + ")");
    const extra = [...new Set(f.extraTokens)];
    if (extra.length && !f.nameExact) add("Distinguishing words", Math.max(-7, W.extraToken * extra.length), "Words only one name has: " + extra.join(", "));
    if (f.formEq) add("Legal form", W.formEq, "Same legal form");
    if (f.formConflict) add("Legal form", W.formConflict, "Different legal forms");
    if (f.pcEq) add("Postcode", W.pcEq, "Same postcode"); else if (f.pcDiff) add("Postcode", W.pcDiff, "Different postcodes");
    if (f.cityEq) add("City", W.cityEq, "Same city");
    if (f.streetEq) add("Street", W.streetEq, "Same street address");
    if (f.indEq) add("Industry", W.indEq, "Same industry code"); else if (f.indDiff) add("Industry", W.indDiff, "Different industry codes");
    if (!f.sameCountry) add("Country", W.crossCountry, "Registered in different countries");
    return t;
  }
  function hardRules(f) { // any of these means: never the same legal entity, whatever the score
    const r = [];
    if (f.leiConflict) r.push("Different valid LEIs");
    if (f.regConflict) r.push("Different registration numbers in the same country");
    if (f.hierarchy) r.push("One record names the other as its parent company");
    return r;
  }
  function scoreGoverned(f) { return explain(f).reduce((s, x) => s + x.w, 0); }
  return { normName, jw, lev1, prepare, candidates, compare, scoreNaive, scoreGoverned, explain, hardRules, W, formsCompatible };
});
