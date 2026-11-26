/* Due-date engine: given a disbursal date and a borrower's income pattern,
   propose the due date for each instalment so it lands just after money arrives.
   Pure date maths, no data access. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.DueDates = f(); })(this, function () {
  "use strict";
  const DAY = 86400000;
  const d0 = (y, m, d) => new Date(Date.UTC(y, m, d));
  const add = (dt, n) => new Date(dt.getTime() + n * DAY);
  const diff = (a, b) => Math.round((b - a) / DAY);
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const isWeekend = (dt) => dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
  function lastWorkingDay(y, m) { let dt = d0(y, m + 1, 0); while (isWeekend(dt)) dt = add(dt, -1); return dt; }
  // salary paid on a weekend arrives the working day before (common Indian payroll practice)
  function prevWorking(dt) { while (isWeekend(dt)) dt = add(dt, -1); return dt; }

  /* pattern: { type: "monthly", day: 1..28 | "last" } | { type: "weekly", weekday: 0..6 } | { type: "irregular" } */
  function inflowsBetween(pattern, from, to) {
    const out = [];
    if (pattern.type === "monthly") {
      for (let y = from.getUTCFullYear(), m = from.getUTCMonth() - 1; ; m++) {
        const dt = pattern.day === "last" ? lastWorkingDay(y, m) : prevWorking(d0(y, m, pattern.day));
        if (dt > to) break; if (dt >= from) out.push(dt);
      }
    } else if (pattern.type === "weekly") {
      let dt = from; while (dt.getUTCDay() !== pattern.weekday) dt = add(dt, 1);
      for (; dt <= to; dt = add(dt, 7)) out.push(dt);
    }
    return out;
  }

  const POLICY = { tenureDays: 30, window: 7, settleDays: 1 }; // due within +/-7 days of the standard date

  /* Returns instalment due dates. Standard = disbursal + 30k. Aligned = first inflow + 1 settle day
     inside [standard - 7, standard + 7]; falls back to standard when no inflow lands in the window. */
  function schedule(disbursal, pattern, n, policy) {
    const p = Object.assign({}, POLICY, policy || {}); const rows = [];
    let prev = disbursal;
    for (let k = 1; k <= n; k++) {
      const std = add(disbursal, p.tenureDays * k);
      let due = std, aligned = false, inflow = null;
      if (pattern && pattern.type !== "irregular") {
        const lo = add(std, -p.window - p.settleDays), hi = add(std, p.window - p.settleDays);
        const cands = inflowsBetween(pattern, lo, hi).filter((x) => add(x, p.settleDays) > add(prev, 14));
        if (cands.length) { // pick the inflow closest to the standard date
          inflow = cands.reduce((a, b) => Math.abs(diff(add(a, p.settleDays), std)) <= Math.abs(diff(add(b, p.settleDays), std)) ? a : b);
          due = add(inflow, p.settleDays); aligned = true;
        }
      }
      rows.push({ k, standard: iso(std), due: iso(due), shiftDays: diff(std, due), aligned, inflow: inflow && iso(inflow) });
      prev = due;
    }
    return rows;
  }

  /* Flat-rate interest stays fair if it is charged per day: the borrower pays for exactly the days held. */
  function interest(principal, monthlyRate, days) { return principal * monthlyRate * days / 30; }

  return { schedule, inflowsBetween, interest, lastWorkingDay, add, diff, iso, d0, POLICY };
});
