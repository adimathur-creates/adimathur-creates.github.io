// Builds one organisational profile per resolved cluster and records where every attribute came from.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(require("./data.js"), require("./match.js")); else root.ERArbitrate = f(root.ERData, root.ERMatch); })(this, function (D, M) {
  const ATTRS = ["legalName", "lei", "registeredCity", "postcode", "industry", "parent"];
  const LABEL = { legalName: "Legal name", lei: "LEI", registeredCity: "Registered city", postcode: "Postcode", industry: "Industry code", parent: "Parent company" };
  const ONE_SOURCE = ["KYC", "LEI_REG", "VENDOR_B", "CREDIT", "CRM"];
  // attribute-level precedence: each attribute trusts the source that is authoritative for it (assumption, documented on the page)
  const RULES = {
    legalName: ["LEI_REG", "KYC", "VENDOR_B"], lei: ["LEI_REG", "KYC", "VENDOR_B", "CREDIT", "CRM"], registeredCity: ["LEI_REG", "VENDOR_B", "KYC", "CREDIT", "CRM"],
    postcode: ["LEI_REG", "VENDOR_B", "KYC", "CREDIT"], industry: ["VENDOR_B", "KYC", "CREDIT", "CRM"], parent: ["LEI_REG", "VENDOR_B", "KYC", "CRM"] };
  const WHY = { legalName: "LEI registry holds the registered legal name; KYC next; CRM and credit hold trading names", lei: "Only checksum-valid LEIs; registry first", registeredCity: "Registry and vendor refresh addresses; KYC is refreshed every 1–3 years", postcode: "Same as city; credit system addresses are often stale", industry: "Commercial vendor classifies industry; internal codes are coarse", parent: "Level 2 'who owns whom' from the LEI registry; vendor next" };
  function value(rec, a, ctx) {
    if (a === "legalName") return rec.src === "CRM" || rec.src === "CREDIT" ? rec.name : rec.name; // value as recorded
    if (a === "lei") return rec.leiOk ? rec.lei : null;
    if (a === "registeredCity") return rec.addr.city || null;
    if (a === "postcode") return rec.addr.postcode || null;
    if (a === "industry") return rec.industry || null;
    if (a === "parent") return rec.parentRef ? ctx.resolveParent(rec.parentRef) : null;
  }
  function correct(e, a, v, byId) {
    if (v === null || v === undefined) return null;
    if (a === "legalName") { const n = M.normName(v), t = M.normName(e.core + " " + D.FORM_TEXT[e.form][0]); return n.core === t.core && n.form !== null && M.formsCompatible(n.form, t.form); }
    if (a === "lei") return v === e.lei;
    if (a === "registeredCity") return v === e.addr.city;
    if (a === "postcode") return v === e.addr.postcode;
    if (a === "industry") return v === e.industry;
    if (a === "parent") return v === e.parent;
  }
  function profile(recs, strategy, ctx) {
    const out = {};
    for (const a of ATTRS) {
      let pickRec = null;
      if (strategy === "one_source") { for (const s of ONE_SOURCE) { pickRec = recs.find((x) => x.src === s && value(x, a, ctx) != null); if (pickRec) break; } }
      else if (strategy === "most_recent") pickRec = recs.filter((x) => value(x, a, ctx) != null).sort((x, y) => y.asOf - x.asOf)[0] || null;
      else { for (const s of RULES[a]) { pickRec = recs.filter((x) => x.src === s && value(x, a, ctx) != null).sort((x, y) => y.asOf - x.asOf)[0]; if (pickRec) break; } }
      out[a] = pickRec ? { value: value(pickRec, a, ctx), source: pickRec.src, record: pickRec.rid, srcId: pickRec.srcId, asOf: pickRec.asOf, rule: strategy === "rules" ? "Precedence: " + RULES[a].join(" > ") : strategy === "one_source" ? "Single source order: " + ONE_SOURCE.join(" > ") : "Most recent record" } : null;
    }
    return out;
  }
  // Evaluate profiles on clusters that resolve to exactly one true entity
  function assess(P, label, byId, strategies) {
    const groups = {}; P.forEach((x, i) => (groups[label[i]] = groups[label[i]] || []).push(x));
    // parent pointers resolve to the true entity of the record they point to (via LEI, vendor ID or exact name)
    const byLei = {}, byVendor = {}, byName = {}; P.forEach((x) => { if (x.leiOk) byLei[x.lei] = x.truth; if (x.src === "VENDOR_B") byVendor[x.srcId] = x.truth; byName[x.country + "|" + x.n.core + "|" + x.n.form] = x.truth; });
    const ctx = { resolveParent: (ref) => (ref.lei ? byLei[ref.lei] : ref.vendorId ? byVendor[ref.vendorId] : null) || (ref.name ? Object.entries(byName).find(([k]) => k.split("|")[1] === M.normName(ref.name).core)?.[1] : null) || null };
    const res = {}; strategies.forEach((s) => (res[s] = Object.fromEntries(ATTRS.map((a) => [a, { right: 0, wrong: 0, missing: 0 }]))));
    let n = 0;
    for (const k in groups) { const g = groups[k], ents = new Set(g.map((x) => x.truth)); if (ents.size !== 1) continue; const e = byId[g[0].truth]; n++;
      for (const s of strategies) { const p = profile(g, s, ctx); for (const a of ATTRS) { const truthHas = a === "lei" ? !!e.lei : a === "parent" ? !!e.parent : true; if (!truthHas) continue; const c = p[a] ? correct(e, a, p[a].value, byId) : null; if (c === null) res[s][a].missing++; else if (c) res[s][a].right++; else res[s][a].wrong++; } } }
    // diagnostics: flag an attribute when another source disagrees with the chosen value
    const flag = { flagged: 0, flaggedWrong: 0, wrong: 0 }, norm = (a, v) => (a === "legalName" ? M.normName(String(v)).core : v);
    for (const k in groups) { const g = groups[k]; if (new Set(g.map((x) => x.truth)).size !== 1) continue; const e = byId[g[0].truth], p = profile(g, "rules", ctx);
      for (const a of ATTRS) { if (!p[a]) continue; const c = correct(e, a, p[a].value, byId); const others = g.map((x) => value(x, a, ctx)).filter((v) => v != null);
        const disagree = others.some((v) => norm(a, v) !== norm(a, p[a].value)); if (c === false) flag.wrong++; if (disagree) { flag.flagged++; if (c === false) flag.flaggedWrong++; } } }
    for (const s of strategies) { let r = 0, t = 0; for (const a of ATTRS) { r += res[s][a].right; t += res[s][a].right + res[s][a].wrong + res[s][a].missing; } res[s].overall = r / t; }
    return { profiles: n, res, ctx, flag };
  }
  return { ATTRS, LABEL, RULES, WHY, ONE_SOURCE, profile, assess };
});
