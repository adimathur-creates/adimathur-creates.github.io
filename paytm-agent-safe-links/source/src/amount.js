// Indian-English / Hinglish amount parser.
// Returns every rupee amount a merchant's message could mean, and flags ambiguity.
// Design rule: if a human could read the message two ways, the parser returns both.

const WORD_NUM = {
  zero: 0, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, ten: 10, gyarah: 11, barah: 12, pandrah: 15, fifteen: 15,
  bees: 20, twenty: 20, pachchees: 25, pachees: 25, tees: 30, thirty: 30, chaalis: 40, chalis: 40,
  forty: 40, pachaas: 50, pachas: 50, fifty: 50, saath: 60, sixty: 60, sattar: 70, assi: 80,
  nabbe: 90, hundred: 100,
  dedh: 1.5, dhai: 2.5, dhaai: 2.5, adha: 0.5, aadha: 0.5,
};
const WORD_MULT = {
  sau: 100, hundred: 100,
  hazaar: 1000, hazar: 1000, hajar: 1000, thousand: 1000, k: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000, l: 100000,
  crore: 10000000, cr: 10000000,
};
const NOT_AMOUNT_AFTER = /^(baje|pm|am|din|days?|hours?|ghante|ghanta|minutes?|min|mins|tareekh|tarikh|th|st|nd|rd|%|percent|students?|bachche|pieces?|pcs|kg|gm|grams?|litres?|months?|mahine|weeks?|hafte|saal|years?|kisht|kishton|instal?ments?|emis?|parts?)\b/i;
const NOT_AMOUNT_BEFORE = /(id|order|link|invoice|inv|no\.?|number|mobile|phone|ph|call|room|flat|class|batch|roll|pin|otp)\s*[:#]?\s*$/i;

function round2(n) { return Math.round(n * 100) / 100; }

// Indian digit grouping is valid as 1,23,45,678 (last group of 3, others of 2).
// International grouping 1,234,567 is also accepted. Anything else is malformed.
function groupingKind(s) {
  if (!s.includes(',')) return 'none';
  const intPart = s.split('.')[0];
  if (/^\d{1,2}(,\d{2})*,\d{3}$/.test(intPart)) return 'indian';
  if (/^\d{1,3}(,\d{3})+$/.test(intPart)) return 'intl';
  return 'malformed';
}

function parseAmounts(text) {
  const out = []; // {value, raw, ambiguous, note}
  if (!text) return { candidates: [], ambiguous: false, notes: [] };
  const t = ' ' + text.replace(/₹/g, ' rs ').replace(/\s+/g, ' ') + ' ';
  const notes = [];

  // 1) digit-based amounts with optional suffix multiplier
  const re = /(rs\.?|inr|rupees?|rupaye|rupay)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh|lakhs|lac|cr|crore|hazaar|hazar|thousand|sau|hundred)?\b(\s*\/-)?/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const [whole, cur, numRaw, mult] = m;
    const before = t.slice(0, m.index + whole.indexOf(numRaw));
    const after = t.slice(m.index + whole.length).trimStart();
    const digitsOnly = numRaw.replace(/,/g, '');
    // phone numbers, ids, dates, counts are not amounts
    if (/^[6-9]\d{9}$/.test(digitsOnly)) continue;
    if (!cur && NOT_AMOUNT_BEFORE.test(before)) continue;
    if (!cur && /([a-z][-_]?|\d-)$/i.test(before)) continue; // LNK-6990, ORD5103, RF-5103-1
    if (!mult && NOT_AMOUNT_AFTER.test(after)) continue;
    if (!cur && !mult && /^\d{7,}$/.test(digitsOnly) && !numRaw.includes(',')) continue; // long bare ids
    const kind = groupingKind(numRaw);
    let base = parseFloat(digitsOnly);
    if (Number.isNaN(base)) continue;
    let value = base;
    let ambiguous = false; let note = '';
    if (mult) value = base * WORD_MULT[mult.toLowerCase()];
    if (kind === 'malformed') {
      // e.g. "15,00" -> 1,500? 15.00? Typo for 15,000? Return all readings.
      ambiguous = true;
      note = `"${numRaw}" has non-standard comma grouping`;
      const alt = [value];
      if (/^\d+,\d{2}$/.test(numRaw)) { alt.push(parseFloat(numRaw.replace(',', '.'))); alt.push(base * 10); }
      alt.forEach(v => out.push({ value: round2(v), raw: whole.trim(), ambiguous: true, note }));
      continue;
    }
    if (!cur && !mult && base < 10 && /\./.test(numRaw)) {
      // "1.5" with no unit: rupees? thousand? lakh?
      ambiguous = true; note = `"${numRaw}" has no unit`;
      [base, base * 1000, base * 100000].forEach(v => out.push({ value: round2(v), raw: whole.trim(), ambiguous, note }));
      continue;
    }
    out.push({ value: round2(value), raw: whole.trim(), ambiguous, note });
  }

  // 2) word-based amounts: "dedh lakh", "do hazaar paanch sau", "five thousand"
  const words = t.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length) {
    let total = 0; let cur = null; let j = i; let used = false; let sawMult = false;
    let saadhe = false; let sava = false;
    while (j < words.length) {
      const w = words[j];
      if (w === 'saadhe' || w === 'sade' || w === 'saade') { saadhe = true; j++; continue; }
      if (w === 'sava' || w === 'savaa') { sava = true; j++; continue; }
      if (w in WORD_NUM && !(w === 'do' && !(words[j + 1] in WORD_MULT))) {
        // "do" is also a Hindi verb ("link bhej do"); only count it before a multiplier
        cur = (cur || 0) + WORD_NUM[w]; used = true; j++; continue;
      }
      if (w in WORD_MULT && w !== 'k' && w !== 'l' && cur !== null) {
        let base = cur;
        if (saadhe) base += 0.5; if (sava) base += 0.25;
        saadhe = false; sava = false;
        total += base * WORD_MULT[w]; cur = null; sawMult = true; j++; continue;
      }
      break;
    }
    if (used && sawMult) {
      if (cur) total += cur;
      out.push({ value: round2(total), raw: words.slice(i, j).join(' '), ambiguous: false, note: 'spoken amount' });
      i = j;
    } else i = Math.max(j, i + 1);
  }

  // de-duplicate (a digit amount and a word amount can be the same value)
  const seen = new Map();
  for (const c of out) {
    const k = c.value;
    if (!seen.has(k) || (seen.get(k).ambiguous && !c.ambiguous)) seen.set(k, c);
  }
  const candidates = [...seen.values()].filter(c => c.value > 0);
  const ambiguous = candidates.some(c => c.ambiguous);
  candidates.filter(c => c.ambiguous).forEach(c => { if (!notes.includes(c.note)) notes.push(c.note); });
  return { candidates, ambiguous, notes };
}

if (typeof module !== 'undefined') module.exports = { parseAmounts, groupingKind };
if (typeof window !== 'undefined') window.parseAmounts = parseAmounts;
