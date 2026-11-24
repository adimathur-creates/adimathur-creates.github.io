/* COD confirmation call economics. Expected values per order, per 100 orders.
   Every input is an assumption the seller (or a pilot) replaces. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CodModel = factory();
})(this, function () {
  'use strict';

  var DEFAULTS = {
    margin: 300,        // contribution per delivered COD order, after product cost and forward freight (Rs)
    rtoCost: 250,       // cost of one RTO: forward + return freight + handling (Rs)
    costPerAttempt: 5,  // voice cost per dial attempt (Rs)
    attempts: 1.5,      // average dial attempts per called order
    connect: 0.70,      // share of called orders where someone answers
    bands: [
      { name: 'Low risk',    share: 0.50, rto: 0.08, catchRate: 0.30, saveRate: 0.10, genuineCancel: 0.010 },
      { name: 'Medium risk', share: 0.30, rto: 0.28, catchRate: 0.35, saveRate: 0.15, genuineCancel: 0.015 },
      { name: 'High risk',   share: 0.20, rto: 0.60, catchRate: 0.45, saveRate: 0.15, genuineCancel: 0.025 }
    ]
  };

  // catchRate: of would-be RTOs who answer, share who cancel before dispatch
  // saveRate: of the remaining would-be RTOs who answer, share the call turns into a delivery (address fixed, prepaid, expectations set)
  // genuineCancel: of buyers who would have accepted delivery and answer, share the call talks out of the order

  function perOrder(p, band) {
    var c = p.connect, r = band.rto;
    var caught = c * r * band.catchRate;
    var saved = c * r * (1 - band.catchRate) * band.saveRate;
    var lost = c * (1 - r) * band.genuineCancel;
    var callSpend = p.attempts * p.costPerAttempt;
    var value = caught * p.rtoCost + saved * (p.rtoCost + p.margin) - lost * p.margin - callSpend;
    return {
      value: value, caught: caught, saved: saved, lost: lost, callSpend: callSpend,
      rtoDrop: caught + saved,             // fall in RTO probability for one called order
      deliveredChange: saved - lost        // change in delivery probability for one called order
    };
  }

  // Net value of calling one order with predicted RTO risk r, using a band's call effects
  function valueAtRisk(p, band, r) {
    return perOrder(p, Object.assign({}, band, { rto: r })).value;
  }

  // Risk above which a call pays for itself (linear in r, so solve directly)
  function breakEvenRisk(p, band) {
    var v0 = valueAtRisk(p, band, 0), v1 = valueAtRisk(p, band, 1);
    if (v1 <= v0) return null;
    var r = -v0 / (v1 - v0);
    return Math.max(0, Math.min(1, r));
  }

  // policy: array of booleans, one per band (call this band or not)
  function evaluate(p, policy) {
    var out = { value: 0, rtoBase: 0, rtoAfter: 0, lost: 0, calls: 0, spend: 0, bands: [] };
    p.bands.forEach(function (b, i) {
      var n = 100 * b.share;
      var po = perOrder(p, b);
      var on = !!policy[i];
      var row = {
        name: b.name, called: on, orders: n,
        value: on ? po.value * n : 0,
        rtoBase: b.rto * n,
        rtoAfter: (b.rto - (on ? po.rtoDrop : 0)) * n,
        lost: on ? po.lost * n : 0,
        spend: on ? po.callSpend * n : 0,
        perHundred: po.value * 100
      };
      out.value += row.value; out.rtoBase += row.rtoBase; out.rtoAfter += row.rtoAfter;
      out.lost += row.lost; out.spend += row.spend; out.calls += on ? n : 0;
      out.bands.push(row);
    });
    return out;
  }

  function policies(p) {
    var n = p.bands.length;
    var all = p.bands.map(function () { return true; });
    var none = p.bands.map(function () { return false; });
    var top = p.bands.map(function (_, i) { return i >= n - 2; });
    var pays = p.bands.map(function (b) { return perOrder(p, b).value > 0; });
    return [
      { key: 'none', label: 'Call no one', policy: none, result: evaluate(p, none) },
      { key: 'all', label: 'Call every COD order', policy: all, result: evaluate(p, all) },
      { key: 'top', label: 'Call medium and high risk', policy: top, result: evaluate(p, top) },
      { key: 'pays', label: 'Call only bands where a call pays', policy: pays, result: evaluate(p, pays) }
    ];
  }

  // What a confirmation-rate dashboard would show for the same calls
  function confirmationRate(p, band) {
    var c = p.connect;
    var cancelled = c * (band.rto * band.catchRate + (1 - band.rto) * band.genuineCancel);
    return c > 0 ? (c - cancelled) / c : 0;
  }

  // Orders per arm to detect a change from p1 to p2 (two-sided 5%, 80% power)
  function sampleSize(p1, p2) {
    var z = 1.959964 + 0.841621;
    var d = p1 - p2;
    if (d === 0) return Infinity;
    return Math.ceil(z * z * (p1 * (1 - p1) + p2 * (1 - p2)) / (d * d));
  }

  function clone(p) { return JSON.parse(JSON.stringify(p)); }

  return { DEFAULTS: DEFAULTS, perOrder: perOrder, valueAtRisk: valueAtRisk, breakEvenRisk: breakEvenRisk,
           evaluate: evaluate, policies: policies, confirmationRate: confirmationRate, sampleSize: sampleSize, clone: clone };
});
