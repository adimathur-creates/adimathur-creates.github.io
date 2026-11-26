// Synthetic party data for a corporate bank: legal entities, corporate families, and the records
// five sources hold about them. Every noise rate is an assumption, labelled here. Seeded, deterministic.
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.ERData = f(); })(this, function () {
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const BRANDS = ["Asterion","Northwind","Kestrel","Meridian","Halcyon","Orion","Summit","Pinnacle","Bluewater","Crescent","Granite","Harbor","Ironbridge","Juniper","Lakeshore","Maple","Nimbus","Oakridge","Polaris","Quarry","Redwood","Sterling","Tidewater","Union","Vantage","Westgate","Zenith","Apex","Beacon","Cobalt","Delta","Ember","Falcon","Glacier","Horizon","Indigo","Keystone","Lumen","Mosaic","Nova","Onyx","Pioneer","Riverstone","Sapphire","Titan","Vertex","Willow","Atlas","Bridgeport","Cedar","Dunmore","Everest","Fairview","Greystone","Highland","Ivory","Kingsway","Larkspur","Monarch","Newhaven","Oriel","Peregrine","Regent","Silverline","Thornbury","Upland","Valiant","Wexford","Yarrow","Ashford","Brightwater","Caspian","Driftwood","Eastbrook","Foxglove","Goldcrest","Hawthorn","Imperial","Jasper","Kingfisher","Lionsgate","Marlowe","Northgate","Oakmont","Prism","Quayside","Rowan","Sentinel","Trident","Ventura","Whitehall","Arcadia","Bastion","Corvus","Solace","Tamarind","Vireo","Acorn","Brookfield","Clearwater"];
  const COMMON = ["Summit","Pioneer","Apex","Delta","Horizon","Atlas","Union","Pinnacle","Sterling","Meridian"]; // reused by unrelated companies
  const ACTS = { Capital: 6211, "Capital Markets": 6211, Securities: 6211, "Asset Management": 6282, Energy: 4911, Logistics: 4731, Technologies: 7372, Pharma: 2834, Foods: 2099, Industries: 3599, Infrastructure: 1622, Insurance: 6411, Shipping: 4412, Realty: 6531, Trading: 5099, Services: 7389, Investments: 6799, Finance: 6153 };
  const COUNTRIES = {
    US: { forms: ["INC", "LLC", "CORP", "LP"], parent: "INC", cities: [["New York", "100"], ["Chicago", "606"], ["Houston", "770"], ["San Francisco", "941"]] },
    GB: { forms: ["LTD", "LTD", "LLP"], parent: "PLC", cities: [["London", "EC2"], ["Manchester", "M1"], ["Edinburgh", "EH1"], ["Leeds", "LS1"]] },
    IN: { forms: ["PRIVATE_LTD", "PRIVATE_LTD", "LTD"], parent: "LTD", cities: [["Mumbai", "400"], ["Bengaluru", "560"], ["New Delhi", "110"], ["Chennai", "600"]] },
    DE: { forms: ["GMBH", "GMBH", "AG"], parent: "AG", cities: [["Frankfurt", "603"], ["Munich", "803"], ["Hamburg", "201"], ["Berlin", "101"]] },
    SG: { forms: ["PRIVATE_LTD"], parent: "LTD", cities: [["Singapore", "01"], ["Singapore", "04"], ["Singapore", "07"], ["Singapore", "18"]] },
    NL: { forms: ["BV", "BV", "NV"], parent: "NV", cities: [["Amsterdam", "101"], ["Rotterdam", "301"], ["Utrecht", "351"], ["The Hague", "251"]] },
  };
  const FORM_TEXT = { INC: ["Inc", "Inc.", "Incorporated"], LLC: ["LLC", "L.L.C.", "Limited Liability Company"], CORP: ["Corp", "Corporation", "Corp."], LP: ["LP", "L.P.", "Limited Partnership"], LTD: ["Limited", "Ltd", "Ltd.", "LTD"], PLC: ["PLC", "plc", "Public Limited Company"], LLP: ["LLP"], PRIVATE_LTD: ["Private Limited", "Pvt Ltd", "Pvt. Ltd.", "Pte. Ltd."], GMBH: ["GmbH", "G.m.b.H."], AG: ["AG", "Aktiengesellschaft"], BV: ["B.V.", "BV"], NV: ["N.V.", "NV"] };
  const TWIN_FORM = { LTD: "LLP", PRIVATE_LTD: "LTD", GMBH: "AG", AG: "GMBH", BV: "NV", NV: "BV", INC: "LLC", LLC: "INC", CORP: "LP", LP: "CORP", LLP: "LTD" };
  const ABBR = { Capital: "Cap", International: "Intl", Holdings: "Hldgs", Services: "Svcs", Technologies: "Tech", Management: "Mgmt", Securities: "Secs", Investments: "Invts", Industries: "Inds", Infrastructure: "Infra", Logistics: "Logs", Markets: "Mkts", Finance: "Fin" };
  const STREETS = ["King", "Queen", "Market", "Church", "Station", "Park", "High", "Bridge", "Mill", "Harbour", "Lake", "Hill", "Victoria", "Albert", "Canal", "Garden"];
  const SUFFIX = [["Street", "St"], ["Road", "Rd"], ["Avenue", "Ave"], ["Lane", "Ln"]];
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const digits = (r, n) => { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(r() * 10); return s; };
  const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // ISO 17442 LEI: 18 characters + 2 check digits (ISO 7064 MOD 97-10)
  const toNum = (s) => s.toUpperCase().replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  function leiCheck(base18) { return String(98n - (BigInt(toNum(base18 + "00")) % 97n)).padStart(2, "0"); }
  function leiValid(lei) { return typeof lei === "string" && /^[A-Z0-9]{18}[0-9]{2}$/.test(lei) && BigInt(toNum(lei)) % 97n === 1n; }
  function makeLei(r) { let b = pick(r, ["5493", "2138", "9845", "3358", "7245"]) + "00"; for (let i = 0; i < 12; i++) b += ALNUM[Math.floor(r() * 36)]; return b + leiCheck(b); }
  function makeReg(r, c) { return c === "GB" ? digits(r, 8) : c === "US" ? digits(r, 2) + "-" + digits(r, 7) : c === "IN" ? "U" + digits(r, 5) + "MH" + digits(r, 4) + "PTC" + digits(r, 6) : c === "DE" ? "HRB " + digits(r, 5) : c === "SG" ? digits(r, 9) + "K" : digits(r, 8); }
  function makeAddr(r, c) { const [city, pc] = pick(r, COUNTRIES[c].cities), s = pick(r, SUFFIX); return { street: (1 + Math.floor(r() * 220)) + " " + pick(r, STREETS) + " " + s[0], city, postcode: pc + " " + digits(r, 2) + ALNUM[Math.floor(r() * 26)] }; }

  // Assumed source behaviour. coverage = share of entities the source holds a record for.
  const SOURCES = {
    KYC:      { label: "KYC onboarding", coverage: 0.6, parentCov: 0.9, formVar: 0.3, abbr: 0.02, dropForm: 0, typo: 0.01, upper: 0, stale: 0.15, reg: 0.95, regTypo: 0.01, lei: 0.85, leiBad: 0, staleAddr: 0.6, noPostcode: 0.02, ind: 0.7, indWrong: 0.15, parentRef: 0.5, dup: 0.01, ageDays: [200, 1100] },
    CREDIT:   { label: "Credit and lending", coverage: 0.45, parentCov: 0.6, formVar: 0.5, abbr: 0.5, dropForm: 0.2, typo: 0.04, upper: 0.8, stale: 0.4, reg: 0.6, regTypo: 0.02, lei: 0.5, leiBad: 0.04, staleAddr: 0.8, noPostcode: 0.3, ind: 0.5, indWrong: 0.2, parentRef: 0, dup: 0.05, ageDays: [100, 1500] },
    CRM:      { label: "Front-office CRM", coverage: 0.8, parentCov: 0.95, formVar: 0.5, abbr: 0.3, dropForm: 0.5, typo: 0.05, upper: 0.1, stale: 0.5, reg: 0.1, regTypo: 0.02, lei: 0.2, leiBad: 0.03, staleAddr: 0.5, noPostcode: 0.5, ind: 0.4, indWrong: 0.3, parentRef: 0.3, dup: 0.12, ageDays: [10, 900] },
    LEI_REG:  { label: "LEI registry (GLEIF)", coverage: 1, parentCov: 1, formVar: 0, abbr: 0, dropForm: 0, typo: 0, upper: 0, stale: 0, reg: 0.9, regTypo: 0, lei: 1, leiBad: 0, staleAddr: 0, noPostcode: 0, ind: 0, indWrong: 0, parentRef: 0.85, dup: 0, ageDays: [1, 60], onlyLei: true },
    VENDOR_B: { label: "Commercial data vendor", coverage: 0.85, parentCov: 0.95, formVar: 0.4, abbr: 0.1, dropForm: 0.05, typo: 0.01, upper: 0.3, stale: 0.3, reg: 0.5, regTypo: 0.01, lei: 0.4, leiBad: 0, staleAddr: 0.1, noPostcode: 0.02, ind: 0.95, indWrong: 0.05, parentRef: 0.8, parentWrong: 0.04, dup: 0, ageDays: [5, 120] },
  };
  const ASSUME = { twinShare: 0.22, homonymShare: 0.12, families: 380, standaloneShare: 0.4, maxSubs: 5, sameCountrySub: 0.55, shareHQAddress: 0.5, renamed: 0.06, moved: 0.1, leiShare: 0.62, parentLei: 0.92 };

  function generate(opts) {
    const o = Object.assign({ seed: 7 }, ASSUME, opts || {}), r = rng(o.seed), entities = [], usedBrand = {};
    for (let f = 0; f < o.families; f++) {
      let brand = r() < 0.18 ? pick(r, COMMON) : pick(r, BRANDS);
      if (usedBrand[brand] && r() < 0.5) brand = brand + " " + pick(r, ["Ridge", "Point", "Bay", "Park", "Hill", "Crest"]);
      usedBrand[brand] = (usedBrand[brand] || 0) + 1;
      const home = pick(r, Object.keys(COUNTRIES)), standalone = r() < o.standaloneShare;
      const mk = (core, form, country, parent, addr) => {
        const e = { id: "E" + String(entities.length + 1).padStart(5, "0"), family: f, brand, core, form, country, parent: parent ? parent.id : null,
          reg: makeReg(r, country), lei: null, addr: addr || makeAddr(r, country), oldAddr: null, formerCore: null, industry: ACTS[core.replace(brand + " ", "")] || 6719 };
        e.lei = r() < (parent ? o.leiShare : o.parentLei) ? makeLei(r) : null;
        if (r() < o.renamed) { e.formerCore = pick(r, BRANDS) + " " + (core.split(" ").slice(-1)[0]); }
        if (r() < o.moved) { e.oldAddr = e.addr; e.addr = makeAddr(r, country); }
        entities.push(e); return e;
      };
      if (standalone) {
        const act = pick(r, Object.keys(ACTS)), a = mk(brand + " " + act, pick(r, COUNTRIES[home].forms), home, null);
        // homonym trap: an unrelated company with the same name in the same country
        if (r() < o.homonymShare) { const b = mk(a.core, pick(r, COUNTRIES[home].forms), home, null); b.family = 10000 + f; b.homonymOf = a.id; if (r() < 0.5) b.addr.city = a.addr.city; }
        continue;
      }
      const par = mk(brand + " Holdings", COUNTRIES[home].parent, home, null); par.industry = 6719;
      const n = 1 + Math.floor(r() * o.maxSubs), acts = Object.keys(ACTS).slice().sort(() => r() - 0.5);
      for (let i = 0; i < n; i++) {
        const c = r() < o.sameCountrySub ? home : pick(r, Object.keys(COUNTRIES));
        const shared = c === home && r() < o.shareHQAddress ? Object.assign({}, par.addr) : null;
        mk(brand + " " + acts[i], pick(r, COUNTRIES[c].forms), c, par, shared);
      }
      // twin trap: a second group company with the same name and country but a different legal form (e.g. Ltd and LLP)
      if (r() < o.twinShare) {
        const sib = entities.filter((x) => x.family === f && x.parent && x.country === home);
        if (sib.length) { const s0 = pick(r, sib), alt = TWIN_FORM[s0.form]; if (alt) { const t = mk(s0.core, alt, home, par, r() < 0.6 ? Object.assign({}, s0.addr) : null); t.twinOf = s0.id; } }
      }
    }
    // records
    const records = [], byId = {}; entities.forEach((e) => (byId[e.id] = e));
    const variantForm = (s, form, p) => (s.formVar > 0 && r() < s.formVar ? pick(r, FORM_TEXT[form]) : FORM_TEXT[form][0]);
    function typo(str) { const i = 1 + Math.floor(r() * (str.length - 2)); const k = r(); return k < 0.33 ? str.slice(0, i) + str.slice(i + 1) : k < 0.66 ? str.slice(0, i) + str[i + 1] + str[i] + str.slice(i + 2) : str.slice(0, i) + ALNUM[Math.floor(r() * 26)].toLowerCase() + str.slice(i + 1); }
    function nameFor(e, s) {
      let core = e.formerCore && r() < s.stale ? e.formerCore : e.core;
      if (s.abbr) core = core.split(" ").map((w) => (ABBR[w] && r() < s.abbr ? ABBR[w] : w)).join(" ");
      let name = r() < s.dropForm ? core : core + " " + variantForm(s, e.form);
      if (r() < s.typo) name = typo(name);
      if (r() < 0.04 && s.formVar) name = name.replace(" & ", " and ");
      return r() < s.upper ? name.toUpperCase() : name;
    }
    let rid = 0, today = 20000;
    const vendorIds = {};
    for (const [src, s] of Object.entries(SOURCES)) {
      for (const e of entities) {
        if (s.onlyLei && !e.lei) continue;
        if (!s.onlyLei && r() > (e.parent === null && entities.some((x) => x.parent === e.id) ? s.parentCov : s.coverage)) continue;
        const copies = r() < s.dup ? 2 : 1;
        for (let k = 0; k < copies; k++) {
          const addr = Object.assign({}, e.oldAddr && r() < s.staleAddr ? e.oldAddr : e.addr);
          if (r() < s.noPostcode) addr.postcode = null;
          if (src === "CRM" && r() < 0.4) addr.street = null;
          if (src === "CREDIT" || (src === "VENDOR_B" && r() < 0.3)) addr.street = addr.street && addr.street.replace(/Street|Road|Avenue|Lane/, (m) => SUFFIX.find((x) => x[0] === m)[1]).toUpperCase();
          let reg = r() < s.reg ? e.reg : null; if (reg && r() < s.regTypo) reg = typo(reg);
          let lei = e.lei && r() < s.lei ? e.lei : null; if (lei && r() < s.leiBad) lei = lei.slice(0, 17) + (lei[17] === "A" ? "B" : "A") + lei.slice(18);
          let industry = r() < s.ind ? (r() < s.indWrong ? pick(r, Object.values(ACTS)) : e.industry) : null;
          const rec = { rid: "R" + String(++rid).padStart(6, "0"), src, srcId: src.slice(0, 3) + "-" + digits(r, 7), name: nameFor(e, s), country: e.country, lei, reg, addr, industry, parentRef: null, asOf: today - Math.floor(s.ageDays[0] + r() * (s.ageDays[1] - s.ageDays[0])), truth: e.id };
          if (src === "VENDOR_B") vendorIds[e.id] = vendorIds[e.id] || "VB-" + digits(r, 9), (rec.srcId = vendorIds[e.id]);
          if (e.parent && r() < s.parentRef) {
            let p = byId[e.parent];
            if (s.parentWrong && r() < s.parentWrong) { const sib = entities.filter((x) => x.parent === e.parent && x.id !== e.id); if (sib.length) p = pick(r, sib); }
            rec.parentRef = src === "LEI_REG" ? (p.lei ? { lei: p.lei } : null) : src === "VENDOR_B" ? { vendorId: "pending:" + p.id } : { name: p.core + " " + FORM_TEXT[p.form][0] };
          }
          records.push(rec);
        }
      }
    }
    // resolve vendor parent pointers to the parent's vendor id (or drop if the vendor doesn't hold the parent)
    records.forEach((x) => { if (x.parentRef && x.parentRef.vendorId) { const pid = x.parentRef.vendorId.slice(8); x.parentRef = vendorIds[pid] ? { vendorId: vendorIds[pid] } : null; } });
    return { entities, records, byId };
  }
  return { rng, generate, leiValid, leiCheck, makeLei, SOURCES, ASSUME, FORM_TEXT, ABBR, COUNTRIES };
});
