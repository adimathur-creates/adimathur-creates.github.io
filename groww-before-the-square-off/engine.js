// Before the Square-off: margin health for MTF positions.
// The rules below come from Groww's public MTF terms and risk policy (see the page for sources).
// Where the policy is ambiguous, the interpretation is stated next to the constant.
// All positions and prices in the simulation are synthetic.

export const POLICY = {
  interestPA: 0.1495,      // advertised rate on Groww's MTF page; the T&C PDF lists 15.75% p.a. under ₹25 lakh
  callAt: 0.85,            // margin call when cover C <= 85%
  restoreTo: 1.0,          // liquidate until C >= 100%
  topUpDays: 1,            // top up by end of T+1 trading day
  liquidateByDays: 4,      // otherwise liquidated by T+4 (risk policy: "currently")
  mtmErosion: 0.8,         // 80% of margin eroded => instant square-off, no notice
  maxLeverage: 4,          // haircut floor 25%
};
// Interpretation: cover C = (position value - funded amount - unpaid interest) / (haircut x position value).
// Groww's policy writes C = B/A x 100 without defining B and A on the public page; this is the standard
// equity-over-required-margin reading. Unpaid interest is treated as added to the funded amount (Cl. 12a allows this).

const DAY = 1 / 365;

// marginShare: how much of the position the user paid for. It can't be below the haircut (max leverage),
// but many users put in more than the minimum.
export function openPosition({ qty, price, haircut, marginShare = haircut }) {
  const value = qty * price;
  const margin = Math.max(haircut, marginShare) * value;
  return { qty, entry: price, haircut, margin, loan: value - margin, interest: 0, days: 0 };
}

export function health(pos, price, haircut = pos.haircut, policy = POLICY) {
  const value = pos.qty * price;
  const debt = pos.loan + pos.interest;
  const equity = value - debt;
  const required = haircut * value;
  const cover = equity / required;
  // price at which cover hits callAt:  qp - D = c*h*q*p  =>  p = D / (q (1 - c h))
  const callPrice = debt / (pos.qty * (1 - policy.callAt * haircut));
  // instant square-off once equity <= (1 - erosion) x initial margin
  const squarePrice = (debt + (1 - policy.mtmErosion) * pos.margin) / pos.qty;
  const breakEven = (pos.loan + pos.interest + pos.margin) / pos.qty; // price that returns the user's own money
  // what fixes a shortfall today: cash, or selling shares (selling repays loan at current price)
  let addCash = 0, sellQty = 0;
  if (cover < policy.restoreTo) {
    addCash = Math.max(0, policy.restoreTo * required - equity);
    // after selling s shares: debt' = D - s p, value' = (q - s) p ; need (value' - debt') >= h * value'
    // => q p - D >= h (q - s) p  =>  s >= q - (q p - D) / (h p)
    sellQty = Math.max(0, Math.ceil(pos.qty - (value - debt) / (haircut * price)));
    if (equity <= 0) sellQty = pos.qty;
  }
  const status = equity <= (1 - policy.mtmErosion) * pos.margin ? "SQUARE_OFF" : cover <= policy.callAt ? "MARGIN_CALL" : cover < 1 ? "THIN" : "HEALTHY";
  return {
    value, debt, equity, required, cover, status,
    callPrice, squarePrice, breakEven,
    dropToCall: 1 - callPrice / price,
    dropToSquare: 1 - squarePrice / price,
    dailyInterest: pos.loan * policy.interestPA * DAY,
    addCash, sellQty,
  };
}

// After entry, how far can the price fall before a call? Depends only on the haircut.
export function dropToCallAtEntry(h, c = POLICY.callAt) { return 1 - (1 - h) / (1 - c * h); }
export function dropToSquareAtEntry(h, e = POLICY.mtmErosion) { return h * e; }
// Rise needed per 30 days just to pay interest, as a share of the stock price
export function monthlyCarry(h, rate = POLICY.interestPA) { return (1 - h) * rate * 30 / 365; }

export function accrue(pos, days = 1, policy = POLICY) {
  pos.interest += pos.loan * policy.interestPA * DAY * days;
  pos.days += days;
}

// ---------- synthetic book ----------
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Stocks in four volatility buckets. Haircuts rise with volatility, like VaR + ELM does.
export const BUCKETS = [
  { name: "Large cap, calm", vol: 0.012, haircut: 0.25, share: 0.3, beta: 0.9 },
  { name: "Large cap, active", vol: 0.018, haircut: 0.3, share: 0.3, beta: 1.0 },
  { name: "Mid cap", vol: 0.025, haircut: 0.4, share: 0.25, beta: 1.15 },
  { name: "Small cap", vol: 0.035, haircut: 0.5, share: 0.15, beta: 1.3 },
];

// One shared market path, with one shock day, so calls cluster the way they do in real sell-offs.
export function marketPath(days, seed, shockDay = 23, shock = -0.045) {
  const r = mulberry32(seed), out = [];
  for (let d = 0; d < days; d++) out.push(d === shockDay ? shock : 0.0002 + 0.009 * gauss(r));
  return out;
}

// holdMean: average trading days a position stays open. pMaxLev: share of users who open at maximum leverage.
export function simulate({ n = 4000, days = 60, seed = 7, shock = -0.045, alertAt = 0.025, holdMean = 15, pMaxLev = 0.5, policy = POLICY } = {}) {
  const r = mulberry32(seed);
  const mkt = marketPath(days, seed + 1, 23, shock);
  const ev = { n, days, alertAt, calls: 0, alerted: 0, alerts: 0, posDays: 0, shockDayCalls: 0, closedClean: 0,
    lev: { max: { n: 0, calls: 0 }, lower: { n: 0, calls: 0 } }, byBucket: BUCKETS.map((b) => ({ name: b.name, n: 0, calls: 0 })), leadDays: [] };
  for (let i = 0; i < n; i++) {
    let x = r(), b = BUCKETS[BUCKETS.length - 1];
    for (const k of BUCKETS) { if (x < k.share) { b = k; break; } x -= k.share; }
    const bi = BUCKETS.indexOf(b);
    const max = r() < pMaxLev;
    const marginShare = max ? b.haircut : Math.min(0.9, b.haircut + 0.05 + 0.25 * r());
    let price = 100 + 900 * r();
    const exposure = Math.exp(Math.log(20000) + r() * Math.log(25)); // ₹20k to ₹5 lakh, log-uniform
    const pos = openPosition({ qty: Math.max(1, Math.round(exposure / price)), price, haircut: b.haircut, marginShare });
    const start = Math.floor(r() * 30);
    const hold = Math.max(1, Math.round(-holdMean * Math.log(1 - r()))); // exponential holding time
    const idio = mulberry32(Math.floor(r() * 1e9));
    ev.byBucket[bi].n++; ev.lev[max ? "max" : "lower"].n++;
    let inZone = false, firstAlert = -1, called = false;
    for (let d = start; d < Math.min(days, start + hold); d++) {
      price *= 1 + b.beta * mkt[d] + b.vol * gauss(idio) * (d === 23 ? 1.4 : 1);
      accrue(pos, d % 5 === 4 ? 3 : 1, policy);
      ev.posDays++;
      const h = health(pos, price, b.haircut, policy);
      if (h.status === "MARGIN_CALL" || h.status === "SQUARE_OFF") {
        called = true; ev.calls++; ev.byBucket[bi].calls++; ev.lev[max ? "max" : "lower"].calls++;
        if (d === 23) ev.shockDayCalls++;
        if (firstAlert >= 0 && firstAlert < d) { ev.alerted++; ev.leadDays.push(d - firstAlert); }
        break;
      }
      const z = h.dropToCall <= alertAt;
      if (z && !inZone) { ev.alerts++; if (firstAlert < 0) firstAlert = d; }
      inZone = z;
    }
    if (!called) ev.closedClean++;
  }
  ev.callRate = ev.calls / n;
  ev.lead = ev.alerted / Math.max(1, ev.calls);
  ev.alertsPer100PerWeek = (ev.alerts / Math.max(1, ev.posDays)) * 5 * 100;
  ev.medianLead = ev.leadDays.length ? ev.leadDays.sort((a, b) => a - b)[Math.floor(ev.leadDays.length / 2)] : 0;
  return ev;
}

// What happens to people after a call, under stated behaviour assumptions (sliders on the page).
// pMeet: share who meet a standard call; pAct: share who act on an early alert (top up or trim) and so avoid the call.
export function outcomes(ev, { pMeet, pAct, pPledgeMissBase, pPledgeMissNew, newPositionsPerMonth, slippage, avgExposure }) {
  const k = newPositionsPerMonth / ev.n;
  const callsBase = ev.calls * k;
  const callsNew = callsBase - ev.alerted * k * pAct;
  const forcedBase = callsBase * (1 - pMeet), forcedNew = callsNew * (1 - pMeet);
  const pledgeBase = newPositionsPerMonth * pPledgeMissBase, pledgeNew = newPositionsPerMonth * pPledgeMissNew;
  return {
    callsBase, callsNew, forcedBase, forcedNew, pledgeBase, pledgeNew,
    sellsBase: forcedBase + pledgeBase, sellsNew: forcedNew + pledgeNew,
    lossBase: (forcedBase + pledgeBase) * avgExposure * slippage,
    lossNew: (forcedNew + pledgeNew) * avgExposure * slippage,
  };
}

// If interest is left unpaid, a position whose price never moves still drifts into a call. How long?
export function daysToCallIfFlat(h, marginShare = h, rate = POLICY.interestPA, c = POLICY.callAt) {
  // equity = m V - I ; call when equity = c h V  =>  I = (m - c h) V ; I per day = (1 - m) V rate / 365
  return Math.floor(((marginShare - c * h) * 365) / ((1 - marginShare) * rate));
}
