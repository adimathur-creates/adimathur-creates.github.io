// Audience Desk engine. One file, used by the web page and by the Composio agent.
// Everything here is deterministic: the same request always gives the same answer.
// All data is synthetic. Nothing here is Tesco's real catalogue or real customer data.

export const CLUBCARD_HOUSEHOLDS = 24_000_000; // public figure, used only to scale sample shares for orientation
export const SAMPLE_SIZE = 40_000;

// ---------- vocabulary ----------
export const CATEGORIES = {
  fresh_produce: { label: "Fresh fruit & veg", words: ["fresh produce", "fruit", "veg", "vegetables", "produce"] },
  bakery: { label: "Bakery", words: ["bakery", "bread", "baked goods"] },
  dairy: { label: "Dairy", words: ["dairy", "milk", "cheese", "yoghurt", "yogurt"] },
  meat_fish: { label: "Meat & fish", words: ["meat", "fish", "poultry", "chicken"] },
  frozen: { label: "Frozen", words: ["frozen"] },
  ready_meals: { label: "Ready meals", words: ["ready meal", "ready meals", "meal for one"] },
  world_foods: { label: "World foods", words: ["world food", "world foods", "international food"] },
  plant_based: { label: "Plant-based", words: ["plant based", "plant-based", "vegan", "meat free", "meat-free"] },
  free_from: { label: "Free-from", words: ["free from", "free-from", "gluten free", "gluten-free", "dairy free"] },
  baby: { label: "Baby", words: ["baby", "nappies", "nappy", "infant", "new parents", "formula"] },
  pet: { label: "Pet", words: ["pet", "dog food", "cat food", "pet food"] },
  alcohol: { label: "Beers, wines & spirits", words: ["wine", "beer", "spirits", "alcohol", "fizz", "prosecco", "champagne", "lager", "gin"] },
  health_beauty: { label: "Health & beauty", words: ["health and beauty", "health & beauty", "pharmacy", "toiletries", "vitamins"] },
  household: { label: "Household", words: ["household", "cleaning", "laundry"] },
  snacks: { label: "Snacks & confectionery", words: ["snacks", "snack", "crisps", "chocolate", "confectionery", "sweets"] },
  coffee_tea: { label: "Coffee & tea", words: ["coffee", "tea"] },
};
const CAT_KEYS = Object.keys(CATEGORIES);

export const CHANNELS = {
  email: { label: "Email", words: ["email", "e-mail"], minSize: 5_000 },
  push: { label: "App push", words: ["app push", "push", "app notification", "in-app"], minSize: 5_000 },
  sms: { label: "SMS", words: ["sms", "text message"], minSize: 5_000 },
  offsite: { label: "Offsite media (e.g. Meta)", words: ["meta", "facebook", "instagram", "pinterest", "offsite", "social", "partner media", "the trade desk"], minSize: 50_000 },
};

// Categories that reveal life stage or health. Targeting on them needs privacy sign-off,
// and they never go to offsite partners. Proposed rule, to confirm with Tesco's policy.
export const SENSITIVE = new Set(["baby", "free_from", "health_beauty"]);

// ---------- seeded random numbers ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(r, lambda) { let L = Math.exp(-lambda), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

// ---------- synthetic households ----------
// Life stage is a hidden driver of what a household buys. It is never a targeting field itself.
const STAGES = [
  { name: "young_single", w: 0.18, cats: { ready_meals: .55, snacks: .6, alcohol: .5, world_foods: .45, plant_based: .3, coffee_tea: .55, bakery: .6, dairy: .75, fresh_produce: .7, meat_fish: .5, frozen: .5, household: .6, health_beauty: .45, pet: .12, free_from: .1, baby: .01 } },
  { name: "couple", w: 0.24, cats: { ready_meals: .4, snacks: .55, alcohol: .65, world_foods: .5, plant_based: .25, coffee_tea: .7, bakery: .75, dairy: .9, fresh_produce: .9, meat_fish: .75, frozen: .55, household: .8, health_beauty: .55, pet: .3, free_from: .12, baby: .02 } },
  { name: "young_family", w: 0.16, cats: { ready_meals: .3, snacks: .75, alcohol: .45, world_foods: .4, plant_based: .2, coffee_tea: .6, bakery: .9, dairy: .97, fresh_produce: .95, meat_fish: .8, frozen: .8, household: .9, health_beauty: .65, pet: .3, free_from: .18, baby: .72 } },
  { name: "older_family", w: 0.17, cats: { ready_meals: .35, snacks: .85, alcohol: .55, world_foods: .45, plant_based: .2, coffee_tea: .65, bakery: .9, dairy: .95, fresh_produce: .9, meat_fish: .85, frozen: .85, household: .9, health_beauty: .6, pet: .38, free_from: .15, baby: .06 } },
  { name: "older", w: 0.25, cats: { ready_meals: .45, snacks: .45, alcohol: .5, world_foods: .2, plant_based: .1, coffee_tea: .85, bakery: .85, dairy: .92, fresh_produce: .9, meat_fish: .7, frozen: .5, household: .75, health_beauty: .6, pet: .33, free_from: .14, baby: .01 } },
];

export function generatePopulation(n = SAMPLE_SIZE, seed = 20261028) {
  const r = mulberry32(seed);
  const C = CAT_KEYS.length;
  const last = new Uint8Array(n * C).fill(255); // weeks since last purchase, 255 = not in 52 weeks
  const pop = {
    n, last,
    online: new Uint8Array(n), high: new Uint8Array(n), plus: new Uint8Array(n),
    suppressed: new Uint8Array(n), u25: new Uint8Array(n),
    consent: { email: new Uint8Array(n), push: new Uint8Array(n), sms: new Uint8Array(n), offsite: new Uint8Array(n) },
    contacts: { email: new Uint8Array(n), push: new Uint8Array(n), sms: new Uint8Array(n), offsite: new Uint8Array(n) },
  };
  for (let i = 0; i < n; i++) {
    let x = r(), s = STAGES[STAGES.length - 1];
    for (const st of STAGES) { if (x < st.w) { s = st; break; } x -= st.w; }
    const engagement = 0.35 + r() * 0.65; // how much of their shop is with us
    pop.online[i] = r() < (s.name === "young_family" ? 0.32 : s.name === "older" ? 0.12 : 0.22) ? 1 : 0;
    pop.high[i] = r() < 0.1 + 0.25 * engagement + (s.name.includes("family") ? 0.08 : 0) ? 1 : 0;
    pop.plus[i] = r() < 0.03 + 0.1 * engagement ? 1 : 0;
    pop.suppressed[i] = r() < 0.05 ? 1 : 0;
    pop.u25[i] = s.name === "young_single" && r() < 0.35 ? 1 : 0;
    const app = r() < 0.55;
    pop.consent.email[i] = r() < 0.58 ? 1 : 0;
    pop.consent.push[i] = app && r() < 0.62 ? 1 : 0;
    pop.consent.sms[i] = r() < 0.2 ? 1 : 0;
    pop.consent.offsite[i] = r() < 0.6 ? 1 : 0;
    // scheduled contacts this week, heavier for engaged households
    pop.contacts.email[i] = poisson(r, 0.6 + 1.4 * engagement);
    pop.contacts.push[i] = app ? poisson(r, 0.5 + 1.6 * engagement) : 0;
    pop.contacts.sms[i] = poisson(r, 0.15);
    pop.contacts.offsite[i] = 0;
    for (let c = 0; c < C; c++) {
      const p = s.cats[CAT_KEYS[c]] * (0.55 + 0.45 * engagement);
      if (r() >= p) continue;
      const cycle = 1 + Math.floor(r() * 5 / engagement); // typical weeks between purchases
      let w = Math.floor(r() * cycle);
      if (r() < 0.16) w = 6 + Math.floor(r() * 40); // stopped buying this category a while ago
      last[i * C + c] = Math.min(w, 51);
    }
  }
  return pop;
}

// ---------- reading a request ----------
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12, twice: 2 };
const toNum = (s) => (/^\d+$/.test(s) ? +s : NUM[s] ?? null);
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function findWords(text, words) { return words.some((w) => new RegExp(`(^|[^a-z])${esc(w)}([^a-z]|$)`).test(text)); }

export function parseRequest(raw) {
  const text = " " + raw.toLowerCase().replace(/[’']/g, "'") + " ";
  const spec = { categories: [], recency: null, channel: null, high: false, plus: false, online: null, exclude: [], purpose: raw.trim() };
  const understood = [], questions = [];

  // exclusions first, so "exclude wine buyers" does not become a wine audience
  let body = text;
  const exm = text.match(/\b(exclud(?:e|ing)|except|but not|minus|leave out)\b([^.;]*)/);
  if (exm) {
    const clause = exm[2];
    body = text.replace(exm[0], " ");
    const cm = clause.match(/contacted\s+(?:more than\s+)?(\w+)\s+(?:times?\s+)?(?:or more\s+)?this week|contacted (?:twice|2\+|two or more times)|already contacted|contact(?:ed)? this week/);
    if (cm) {
      const k = cm[1] ? toNum(cm[1]) : 2;
      spec.exclude.push({ type: "contacted", min: k && k > 0 ? k : 2 });
    }
    for (const c of CAT_KEYS) if (findWords(clause, CATEGORIES[c].words)) spec.exclude.push({ type: "category", cat: c });
  }

  // What is being promoted is not who to target: "email about the new gluten-free bakery range"
  // must not add Bakery to the audience. Drop purpose clauses before looking for categories.
  const who = body.replace(/\b(about|offer on|offers on|to promote|promoting|launch(?:ing)? of|for (?:a|an|the|our)\s)[^,;.]*/g, " ");
  for (const c of CAT_KEYS) if (findWords(who, CATEGORIES[c].words)) spec.categories.push(c);
  // "plant-based ready meals" should mean plant-based, not two categories
  if (spec.categories.includes("plant_based") && spec.categories.includes("meat_fish") && /meat[- ]free/.test(body))
    spec.categories = spec.categories.filter((c) => c !== "meat_fish");
  spec.categoryMode = /\band\b/.test(who) && spec.categories.length > 1 && !/\bor\b/.test(who) ? "all" : "any";

  let m;
  if ((m = body.match(/(?:haven't|have not|hasn't|not)\s+(?:bought|shopped|purchased)[^0-9a-z]*(?:[a-z ]{0,40}?)\s(?:in|for)\s+(?:the\s+(?:last|past)\s+)?(\d+|\w+)\s+weeks?/))) {
    spec.recency = { type: "lapsed", weeks: toNum(m[1]) ?? 8 }; understood.push(`Lapsed: no purchase in ${spec.recency.weeks}+ weeks, but bought in the last year`);
  } else if (/\blapsed\b|win[- ]?back|stopped buying/.test(body)) {
    spec.recency = { type: "lapsed", weeks: 8 };
    questions.push("You said lapsed but gave no window. I used 8 weeks, the catalogue standard. Is that right?");
    understood.push("Lapsed: assumed 8+ weeks (please confirm)");
  } else if ((m = body.match(/(?:in|over|within)\s+the\s+(?:last|past)\s+(\d+|\w+)\s+weeks?/)) || (m = body.match(/(?:last|past)\s+(\d+|\w+)\s+weeks?/))) {
    spec.recency = { type: "active", weeks: toNum(m[1]) ?? 12 }; understood.push(`Active: bought in the last ${spec.recency.weeks} weeks`);
  } else if (/\bnever\b/.test(body)) {
    spec.recency = { type: "never" }; understood.push("Never bought in the last 52 weeks");
  } else if (spec.categories.length) {
    spec.recency = { type: "active", weeks: 12 };
    questions.push("No time window given. I used bought in the last 12 weeks. Change it if you meant something else.");
    understood.push("Active: assumed last 12 weeks (please confirm)");
  }

  for (const [k, ch] of Object.entries(CHANNELS)) if (findWords(body, ch.words)) { spec.channel = k; break; }
  if (!spec.channel) questions.push("Which channel is this for (email, app push, SMS, offsite)? Size and consent depend on it.");
  if (/high[- ]value|top spend|big spenders|best customers/.test(body)) spec.high = true;
  if (/clubcard plus/.test(body)) spec.plus = true;
  if (/online (?:shoppers|customers)|shop online|grocery home shopping|\bonline\b/.test(body)) spec.online = 1;
  else if (/store[- ]only|in[- ]store only/.test(body)) spec.online = 0;

  if (!spec.categories.length) questions.push("I could not find a product category. Which categories define this audience?");
  if (spec.categories.length) understood.unshift(`Category: ${spec.categories.map((c) => CATEGORIES[c].label).join(spec.categoryMode === "all" ? " AND " : " OR ")}`);
  if (spec.high) understood.push("Filter: high-value households");
  if (spec.plus) understood.push("Filter: Clubcard Plus members");
  if (spec.online === 1) understood.push("Filter: online shoppers");
  if (spec.online === 0) understood.push("Filter: store-only shoppers");
  if (spec.channel) understood.push(`Channel: ${CHANNELS[spec.channel].label}`);
  for (const e of spec.exclude) understood.push(e.type === "contacted" ? `Exclude: already scheduled for ${e.min}+ contacts on this channel this week` : `Exclude: ${CATEGORIES[e.cat].label} buyers (last 12 weeks)`);
  return { spec, understood, questions };
}

// ---------- membership ----------
function catBought(pop, i, c, rec) {
  const w = pop.last[i * CAT_KEYS.length + CAT_KEYS.indexOf(c)];
  if (!rec || rec.type === "active") return w !== 255 && w < (rec?.weeks ?? 12);
  if (rec.type === "lapsed") return w !== 255 && w >= rec.weeks;
  if (rec.type === "never") return w === 255;
  return false;
}
// behaviour only: categories + time window
export function behaviourMask(pop, spec) {
  const out = new Uint8Array(pop.n);
  if (!spec.categories.length) return out;
  for (let i = 0; i < pop.n; i++) {
    let ok;
    if (spec.recency?.type === "lapsed") {
      // lapsed in every listed category, and not still buying any of them
      ok = spec.categories.every((c) => catBought(pop, i, c, spec.recency));
    } else ok = spec.categoryMode === "all" ? spec.categories.every((c) => catBought(pop, i, c, spec.recency)) : spec.categories.some((c) => catBought(pop, i, c, spec.recency));
    out[i] = ok ? 1 : 0;
  }
  return out;
}
// attribute filters that already exist in the catalogue as reusable filters
export function attributeFilter(pop, spec, mask) {
  const out = new Uint8Array(mask);
  for (let i = 0; i < pop.n; i++) {
    if (!out[i]) continue;
    if (spec.high && !pop.high[i]) out[i] = 0;
    else if (spec.plus && !pop.plus[i]) out[i] = 0;
    else if (spec.online === 1 && !pop.online[i]) out[i] = 0;
    else if (spec.online === 0 && pop.online[i]) out[i] = 0;
  }
  return out;
}
const count = (m) => { let k = 0; for (let i = 0; i < m.length; i++) k += m[i]; return k; };
function overlap(a, b) { let both = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { na += a[i]; nb += b[i]; both += a[i] & b[i]; } return { both, na, nb, jaccard: both / Math.max(1, na + nb - both), coverage: both / Math.max(1, na), precision: both / Math.max(1, nb) }; }
export const scale = (k, pop) => Math.round((k / pop.n) * CLUBCARD_HOUSEHOLDS / 1000) * 1000;

// ---------- illustrative catalogue ----------
// Fictional. It deliberately contains near-duplicates, because that is the problem being solved.
export const CATALOGUE = [
  { id: "SEG-101", name: "Lapsed bakery shoppers (8w)", owner: "Customer Insights", uses90: 41, refreshed: 2, spec: { categories: ["bakery"], recency: { type: "lapsed", weeks: 8 } } },
  { id: "SEG-118", name: "Bread lapsers 6w", owner: "CRM Marketing", uses90: 3, refreshed: 9, spec: { categories: ["bakery"], recency: { type: "lapsed", weeks: 6 } } },
  { id: "SEG-102", name: "Plant-based buyers (12w)", owner: "Customer Insights", uses90: 27, refreshed: 1, spec: { categories: ["plant_based"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-131", name: "Vegan curious (12w)", owner: "Commercial – Fresh", uses90: 0, refreshed: 21, spec: { categories: ["plant_based"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-103", name: "Pet food buyers (12w)", owner: "Customer Insights", uses90: 33, refreshed: 1, spec: { categories: ["pet"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-104", name: "Lapsed pet food buyers (8w)", owner: "CRM Marketing", uses90: 12, refreshed: 2, spec: { categories: ["pet"], recency: { type: "lapsed", weeks: 8 } } },
  { id: "SEG-105", name: "Wine, beer & spirits buyers (12w)", owner: "Commercial – BWS", uses90: 19, refreshed: 1, spec: { categories: ["alcohol"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-106", name: "Baby category buyers (12w)", owner: "Customer Insights", uses90: 8, refreshed: 1, sensitive: true, spec: { categories: ["baby"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-107", name: "Free-from buyers (12w)", owner: "Customer Insights", uses90: 6, refreshed: 1, sensitive: true, spec: { categories: ["free_from"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-108", name: "World foods buyers (12w)", owner: "Commercial – Grocery", uses90: 9, refreshed: 3, spec: { categories: ["world_foods"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-109", name: "Ready meal buyers (4w)", owner: "Commercial – Fresh", uses90: 14, refreshed: 1, spec: { categories: ["ready_meals"], recency: { type: "active", weeks: 4 } } },
  { id: "SEG-110", name: "Coffee & tea buyers (12w)", owner: "Commercial – Grocery", uses90: 5, refreshed: 1, spec: { categories: ["coffee_tea"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-111", name: "Snacking households (4w)", owner: "Tesco Media", uses90: 22, refreshed: 1, spec: { categories: ["snacks"], recency: { type: "active", weeks: 4 } } },
  { id: "SEG-127", name: "Crisps & choc regulars (4w)", owner: "Commercial – Grocery", uses90: 1, refreshed: 14, spec: { categories: ["snacks"], recency: { type: "active", weeks: 4 } } },
  { id: "SEG-112", name: "Frozen buyers (12w)", owner: "Commercial – Frozen", uses90: 7, refreshed: 1, spec: { categories: ["frozen"], recency: { type: "active", weeks: 12 } } },
  { id: "SEG-113", name: "Fresh produce regulars (4w)", owner: "Customer Insights", uses90: 30, refreshed: 1, spec: { categories: ["fresh_produce"], recency: { type: "active", weeks: 4 } } },
  { id: "SEG-114", name: "Lapsed fresh produce (8w)", owner: "CRM Marketing", uses90: 4, refreshed: 2, spec: { categories: ["fresh_produce"], recency: { type: "lapsed", weeks: 8 } } },
  { id: "SEG-115", name: "Household & cleaning buyers (12w)", owner: "Commercial – Grocery", uses90: 0, refreshed: 30, spec: { categories: ["household"], recency: { type: "active", weeks: 12 } } },
];
export const FILTERS = [
  { id: "FLT-01", name: "High-value households", field: "high" },
  { id: "FLT-02", name: "Clubcard Plus members", field: "plus" },
  { id: "FLT-03", name: "Online shoppers", field: "online" },
  { id: "FLT-10", name: "Marketing permission (per channel)", field: "consent" },
  { id: "FLT-11", name: "Contact pressure: scheduled 2+ this week", field: "contacts" },
  { id: "FLT-12", name: "Responsible alcohol: exclude 18–24", field: "u25" },
];

// ---------- the desk ----------
const pct = (x) => `${Math.round(x * 100)}%`;
function recLabel(r) { return !r ? "any time" : r.type === "lapsed" ? `lapsed ${r.weeks}w+` : r.type === "active" ? `bought in last ${r.weeks}w` : "never bought"; }
function specDiff(req, seg) {
  const d = [];
  const a = [...req.categories].sort().join(), b = [...seg.categories].sort().join();
  if (a !== b) d.push(`categories differ (${req.categories.map((c) => CATEGORIES[c].label).join(", ")} vs ${seg.categories.map((c) => CATEGORIES[c].label).join(", ")})`);
  if (recLabel(req.recency) !== recLabel(seg.recency)) d.push(`window differs (${recLabel(req.recency)} vs ${recLabel(seg.recency)})`);
  return d;
}
export function filtersUsed(spec) {
  const f = [];
  if (spec.high) f.push("FLT-01"); if (spec.plus) f.push("FLT-02"); if (spec.online === 1) f.push("FLT-03");
  return f;
}

let _segCache = null;
export function segmentMasks(pop) {
  if (_segCache && _segCache.pop === pop) return _segCache.masks;
  const masks = Object.fromEntries(CATALOGUE.map((s) => [s.id, behaviourMask(pop, { categoryMode: "any", ...s.spec })]));
  _segCache = { pop, masks };
  return masks;
}

export function runDesk(pop, rawOrSpec, opts = {}) {
  const parsed = typeof rawOrSpec === "string" ? parseRequest(rawOrSpec) : { spec: rawOrSpec, understood: [], questions: [] };
  const { spec, understood, questions } = parsed;
  const requestId = opts.requestId || "REQ-" + String(Math.abs(hash(spec.purpose)) % 100000).padStart(5, "0");
  const res = { requestId, spec, understood, questions, matches: [], funnel: [], checks: [], decision: null };
  if (!spec.categories.length) { res.decision = { code: "NEEDS_INFO", title: "Needs more detail", why: "No product category found, so there is nothing to size or match." }; return finish(res, pop, opts); }

  // 1. who the requester actually wants (behaviour + attribute filters)
  const behaviour = behaviourMask(pop, spec);
  const wanted = attributeFilter(pop, spec, behaviour);

  // 2. compare with every catalogue segment, after applying the same reusable filters
  const masks = segmentMasks(pop);
  for (const seg of CATALOGUE) {
    const candidate = attributeFilter(pop, spec, masks[seg.id]);
    const o = overlap(wanted, candidate);
    res.matches.push({ seg, ...o, diff: specDiff(spec, seg.spec) });
  }
  res.matches.sort((a, b) => b.jaccard - a.jaccard || b.seg.uses90 - a.seg.uses90);
  const best = res.matches[0];

  // 3. funnel from wanted audience to reachable audience
  const ch = spec.channel;
  const steps = [["Wanted audience (behaviour + filters)", wanted]];
  const live = new Uint8Array(wanted);
  for (let i = 0; i < pop.n; i++) if (live[i] && pop.suppressed[i]) live[i] = 0;
  steps.push(["Has not opted out of marketing", new Uint8Array(live)]);
  if (ch) { for (let i = 0; i < pop.n; i++) if (live[i] && !pop.consent[ch][i]) live[i] = 0; steps.push([`Gave ${CHANNELS[ch].label} permission`, new Uint8Array(live)]); }
  for (const e of spec.exclude) {
    if (e.type === "contacted" && ch) { for (let i = 0; i < pop.n; i++) if (live[i] && pop.contacts[ch][i] >= e.min) live[i] = 0; steps.push([`Not already scheduled ${e.min}+ times this week`, new Uint8Array(live)]); }
    if (e.type === "category") { const ex = behaviourMask(pop, { categories: [e.cat], recency: { type: "active", weeks: 12 } }); for (let i = 0; i < pop.n; i++) if (live[i] && ex[i]) live[i] = 0; steps.push([`Not a ${CATEGORIES[e.cat].label} buyer`, new Uint8Array(live)]); }
  }
  const alcohol = spec.categories.includes("alcohol");
  if (alcohol) { for (let i = 0; i < pop.n; i++) if (live[i] && pop.u25[i]) live[i] = 0; steps.push(["Responsible alcohol: 18–24 removed", new Uint8Array(live)]); }
  res.funnel = steps.map(([label, m]) => ({ label, sample: count(m), est: scale(count(m), pop) }));
  const final = res.funnel[res.funnel.length - 1];
  res.final = final;

  // 4. governance checks
  const C = (id, name, status, detail) => res.checks.push({ id, name, status, detail });
  const sens = spec.categories.filter((c) => SENSITIVE.has(c));
  if (!ch) C("G1", "Channel permission", "question", "No channel given, so permission cannot be checked. Size shown is before consent.");
  else C("G1", "Channel permission", "pass", `${pct(count(live) / Math.max(1, res.funnel[1].sample))} of the opted-in audience can be reached by ${CHANNELS[ch].label}. The permission filter is applied automatically.`);
  const min = ch ? CHANNELS[ch].minSize : 5000;
  if (final.sample < 30) C("G2", "Minimum audience size", "fail", `Only ${final.sample} households in the sample. Too small to estimate or to release.`);
  else if (final.est < min) C("G2", "Minimum audience size", "fail", `About ${fmt(final.est)} households, below the ${fmt(min)} floor for ${ch ? CHANNELS[ch].label : "owned channels"}. Small audiences risk re-identifying people.`);
  else C("G2", "Minimum audience size", "pass", `About ${fmt(final.est)} households, above the ${fmt(min)} floor.`);
  if (sens.length && ch === "offsite") C("G3", "Sensitive categories", "block", `${sens.map((c) => CATEGORIES[c].label).join(", ")} signals life stage or health. It is not shared with offsite partners.`);
  else if (sens.length) C("G3", "Sensitive categories", "review", `${sens.map((c) => CATEGORIES[c].label).join(", ")} signals life stage or health. Needs privacy sign-off before first use; the desk opens that request.`);
  else C("G3", "Sensitive categories", "pass", "No life-stage or health categories in the definition.");
  if (alcohol) C("G4", "Responsible alcohol", "pass", "18–24 households removed automatically (filter FLT-12).");
  if (ch && ch !== "offsite") {
    let busy = 0; for (let i = 0; i < pop.n; i++) if (live[i] && pop.contacts[ch][i] >= 2) busy++;
    const share = busy / Math.max(1, count(live));
    const excluded = spec.exclude.some((e) => e.type === "contacted");
    if (excluded) C("G5", "Contact pressure", "pass", "Households already scheduled 2+ times this week are excluded.");
    else if (share > 0.25) C("G5", "Contact pressure", "warn", `${pct(share)} of this audience is already scheduled for 2+ ${CHANNELS[ch].label} messages this week. Recommend adding filter FLT-11.`);
    else C("G5", "Contact pressure", "pass", `${pct(share)} already scheduled 2+ times this week. Below the 25% line.`);
  }
  // measurement: 10% holdout and the smallest lift it can detect (5% base response, 95% confidence, 80% power)
  if (final.est > 0) {
    const nT = final.est * 0.9, nC = final.est * 0.1, p = 0.05;
    const mde = 2.8 * Math.sqrt(p * (1 - p) * (1 / nT + 1 / nC));
    res.mde = mde;
    C("G6", "Measurable", mde > 0.01 ? "warn" : "pass", `10% holdout kept back. With a 5% base response it can detect a lift of ${(mde * 100).toFixed(2)} points${mde > 0.01 ? ", which is too coarse; widen the audience or run longer" : ""}.`);
  }

  // 5. decision
  const blocked = res.checks.some((c) => c.status === "block" || c.status === "fail");
  const review = res.checks.some((c) => c.status === "review");
  const reuseOk = best && best.jaccard >= 0.9;
  const filters = filtersUsed(spec);
  if (blocked) {
    const f = res.checks.find((c) => c.status === "block" || c.status === "fail");
    res.decision = { code: "BLOCKED", title: "Can't release this audience", why: f.detail, segment: best?.jaccard >= 0.9 ? best.seg : null };
  } else if (reuseOk) {
    const twins = res.matches.slice(1).filter((m) => m.jaccard >= 0.98).map((m) => m.seg.id);
    res.decision = { code: "REUSE", title: `Reuse ${best.seg.id}`, why: `${best.seg.name} matches ${pct(best.jaccard)} of the households you asked for${filters.length ? ` once filters ${filters.join(", ")} are applied` : ""}. No new build needed.`, segment: best.seg, filters, twins };
    if (twins.length) res.decision.note = `${twins.join(", ")} defines the same households under another name. Pointed you to ${best.seg.id} (more used) and flagged the pair for merging.`;
  } else if (best && best.coverage >= 0.6 && best.diff.length === 1 && /window/.test(best.diff[0])) {
    const w = best.diff[0].replace(/^window differs \((.*)\)$/, "$1");
    res.decision = { code: "EXTEND", title: `Extend ${best.seg.id}`, why: `${best.seg.name} has the same definition with a different time window (${w}). The fix is to make the window a setting on ${best.seg.id}, not to build a near-copy.`, segment: best.seg, filters };
  } else {
    const near = best && best.jaccard >= 0.3;
    res.decision = { code: "BUILD", title: "Build a new segment", why: near ? `Closest existing segment is ${best.seg.name} at ${pct(best.jaccard)} overlap. Not close enough to reuse.` : "Nothing in the catalogue covers this audience.", segment: null, filters, nearest: near ? best.seg : null };
  }
  if (review && res.decision.code !== "BLOCKED") res.decision.review = "Privacy sign-off needed before first use.";
  return finish(res, pop, opts);
}

function finish(res, pop, opts) {
  res.outputs = buildOutputs(res, opts);
  return res;
}

const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "m" : n >= 1000 ? Math.round(n / 1000) + "k" : String(n);
export { fmt };
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }

// ---------- what gets written to Slack, Jira and the log ----------
export function buildOutputs(res, opts = {}) {
  const d = res.decision, s = res.spec;
  const team = opts.team || "Requester";
  const lines = [];
  const icon = { REUSE: ":white_check_mark:", EXTEND: ":wrench:", BUILD: ":hammer_and_wrench:", BLOCKED: ":no_entry:", NEEDS_INFO: ":question:" }[d.code];
  lines.push(`${icon} *${d.title}* (${res.requestId})`);
  lines.push(d.why);
  if (d.note) lines.push(d.note);
  if (d.review) lines.push(`:lock: ${d.review}`);
  if (res.final) lines.push(`Reachable now: about *${fmt(res.final.est)}* households (synthetic estimate).`);
  if (d.code === "REUSE") lines.push(`Self-serve: pick *${d.segment.id}*${d.filters?.length ? ` + ${d.filters.join(" + ")}` : ""} in the audience tool. Consent and holdout are applied for you.`);
  if (d.code === "EXTEND" || d.code === "BUILD") lines.push(`I've raised a story for the Customer Data squad. It goes to the next Planning Pod triage.`);
  for (const c of res.checks.filter((c) => ["warn", "review", "question"].includes(c.status))) lines.push(`• ${c.name}: ${c.detail}`);
  for (const q of res.questions) lines.push(`• Question: ${q}`);
  const slack = lines.join("\n");

  let jira = null;
  if (d.code === "EXTEND" || d.code === "BUILD") {
    const cats = s.categories.map((c) => CATEGORIES[c].label).join(s.categoryMode === "all" ? " + " : " / ");
    const summary = d.code === "EXTEND"
      ? `[Segments] Parameterise window on ${d.segment.id} (${d.segment.name}) to support ${recLabel(s.recency)}`
      : `[Segments] New segment: ${cats}, ${recLabel(s.recency)}${s.high ? ", high value" : ""}${s.plus ? ", Clubcard Plus" : ""}`;
    const ac = [
      `Given the segment is built, when it refreshes weekly, then its size is within ±10% of the desk estimate (about ${fmt(res.final.est)} reachable) or the variance is explained in the ticket.`,
      `Given a household has opted out of marketing or lacks ${s.channel ? CHANNELS[s.channel].label : "channel"} permission, then it never appears in an activated audience.`,
      `Given the audience is activated, then a 10% random holdout is flagged and kept out of every send for the campaign.`,
      `Given the definition is published, then the catalogue entry lists owner, rules in plain English, refresh day and a named sensitive-data status.`,
      `Given size changes by more than 20% week on week, then the owner is alerted before the next activation.`,
    ];
    if (d.code === "EXTEND") ac.unshift(`Given ${d.segment.id} has a window parameter, when a user picks ${s.recency?.weeks ?? "N"} weeks, then the result matches the desk's definition and the existing ${d.segment.id} default is unchanged.`);
    if (s.categories.some((c) => SENSITIVE.has(c))) ac.push("Given the definition uses a sensitive category, then it cannot be activated until privacy sign-off is recorded on this ticket.");
    const description = [
      `*User story*`,
      `As ${team}, I want ${d.code === "EXTEND" ? `to use ${d.segment.name} with a ${recLabel(s.recency)} window` : `an audience of ${cats} households (${recLabel(s.recency)})`}, so that I can run the campaign in my request.`,
      `Original request: "${shortPurpose(s.purpose)}"`,
      ``,
      `*Why not reuse*`,
      d.why,
      ``,
      `*Definition*`,
      `- Categories: ${cats} (${s.categoryMode === "all" ? "all of" : "any of"})`,
      `- Window: ${recLabel(s.recency)}`,
      ...(s.high ? ["- Filter: FLT-01 High-value households"] : []),
      ...(s.plus ? ["- Filter: FLT-02 Clubcard Plus members"] : []),
      ...(s.online === 1 ? ["- Filter: FLT-03 Online shoppers"] : []),
      `- Channel: ${s.channel ? CHANNELS[s.channel].label : "not given (question sent to requester)"}`,
      ``,
      `*Desk estimate (synthetic)*`,
      ...res.funnel.map((f) => `- ${f.label}: ~${fmt(f.est)}`),
      ``,
      `*Acceptance criteria*`,
      ...ac.map((a, i) => `${i + 1}. ${a}`),
      ``,
      `*Governance checks at intake*`,
      ...res.checks.map((c) => `- ${c.id} ${c.name}: ${c.status.toUpperCase()} – ${c.detail}`),
    ].join("\n");
    jira = { project: opts.jiraProject || "CDP", issuetype: "Story", summary, description, labels: ["audience-desk", d.code.toLowerCase(), ...(s.categories.some((c) => SENSITIVE.has(c)) ? ["privacy-review"] : [])] };
  }

  const logRow = [new Date(opts.now ?? Date.now()).toISOString(), res.requestId, team, d.code, d.segment?.id || "", res.final ? res.final.est : "", res.checks.filter((c) => c.status !== "pass").map((c) => c.id + ":" + c.status).join(" ")];
  return { slack, jira, logRow };
}
function shortPurpose(p) { const t = p.replace(/\s+/g, " ").trim(); return t.length > 160 ? t.slice(0, 157) + "…" : t; }

// ---------- catalogue health ----------
export function catalogueHealth(pop) {
  const masks = segmentMasks(pop);
  const pairs = [];
  for (let a = 0; a < CATALOGUE.length; a++) for (let b = a + 1; b < CATALOGUE.length; b++) {
    const o = overlap(masks[CATALOGUE[a].id], masks[CATALOGUE[b].id]);
    if (o.jaccard >= 0.6) pairs.push({ a: CATALOGUE[a], b: CATALOGUE[b], jaccard: o.jaccard });
  }
  pairs.sort((x, y) => y.jaccard - x.jaccard);
  const unused = CATALOGUE.filter((s) => s.uses90 === 0);
  const stale = CATALOGUE.filter((s) => s.refreshed > 7);
  const sizes = CATALOGUE.map((s) => ({ seg: s, est: scale(count(masks[s.id]), pop) }));
  return { pairs, unused, stale, sizes };
}
