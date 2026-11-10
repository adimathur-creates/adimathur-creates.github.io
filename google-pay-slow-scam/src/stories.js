/* Five scripted payers for the prototype. Names and IDs are invented. */
(function (root) {
  'use strict';
  var DAY = 1440, H = 60;

  function history(kind) {
    var ev = [];
    for (var d = 0; d < 30; d++) {
      var base = d * DAY;
      if (kind === 'kirana') {
        for (var c = 0; c < 15; c++) ev.push({ t: base + 8 * H + c * 40, dir: 'in', amt: 50 + ((d * 37 + c * 53) % 350), cp: 'cust' + d + '_' + c, cpType: 'individual' });
        if (d % 3 === 0) ev.push({ t: base + 15 * H, dir: 'out', amt: 6000, cp: 'sup_regular', cpType: 'individual' });
        ev.push({ t: base + 21 * H, dir: 'out', amt: 400, cp: 'm' + d, cpType: 'merchant' });
      } else {
        var m = kind === 'senior' ? 600 : 300;
        ev.push({ t: base + 10 * H, dir: 'out', amt: m, cp: 'm' + d, cpType: 'merchant' });
        if (d % 5 === 0) ev.push({ t: base + 12 * H, dir: 'out', amt: kind === 'senior' ? 5000 : 1000, cp: 'family', cpType: 'individual' });
        if (d % 7 === 0) ev.push({ t: base + 13 * H, dir: 'in', amt: 800, cp: 'family', cpType: 'individual' });
        if (d % 6 === 0) ev.push({ t: base + 14 * H, dir: 'in', amt: 500, cp: 'friend', cpType: 'individual' });
      }
    }
    return ev;
  }

  function at(day, hh, mm) { return (31 + day) * DAY + hh * H + (mm || 0); }

  var STORIES = [
    {
      id: 'neha', who: 'Neha, 26, Pune', kind: 'Task scam', truth: 'scam', base: 'everyday',
      intro: 'Joined a Telegram "work from home" group. Was paid small amounts for liking videos, then asked to "prepay" tasks.',
      events: [
        { t: at(0, 19, 10), dir: 'in', amt: 300, cp: 'riya.hr', name: 'Riya (HR)', note: 'Paid for liking 3 YouTube videos' },
        { t: at(0, 21, 40), dir: 'in', amt: 450, cp: 'tasks.priya', name: 'Priya (Tasks)', note: 'Second "commission"' },
        { t: at(1, 20, 5), dir: 'out', amt: 1500, cp: 'kumar.s88', name: 'Kumar S', fanIn: 3, note: '"Prepaid task" to unlock higher commission' },
        { t: at(1, 22, 30), dir: 'out', amt: 3600, cp: 'anil.store21', name: 'Anil Store', fanIn: 6, note: 'Next task level' },
        { t: at(2, 19, 20), dir: 'out', amt: 9000, cp: 'rk.enterprises', name: 'RK Enterprises', fanIn: 4, note: '"Merge task", earnings shown as \u20b921,000' },
        { t: at(2, 23, 10), dir: 'out', amt: 24000, cp: 'sunita.d', name: 'Sunita D', fanIn: 9, note: '"Account frozen, pay to release your earnings"' },
        { t: at(3, 11, 0), dir: 'out', amt: 60000, cp: 'mohd.irfan', name: 'Mohd Irfan', fanIn: 2, flagged: true, note: '"Final tax to withdraw"' }
      ]
    },
    {
      id: 'ramesh', who: 'Ramesh, 58, Nagpur', kind: 'Stock-tips group', truth: 'scam', base: 'senior',
      intro: 'Added to a WhatsApp "VIP stock tips" group. Told to deposit on a trading app that shows fake profits.',
      events: [
        { t: at(0, 11, 0), dir: 'out', amt: 15000, cp: 'vikas.capital', name: 'Vikas Capital', fanIn: 2, note: 'First deposit on the "trading app"' },
        { t: at(2, 16, 0), dir: 'in', amt: 3000, cp: 'arjun.k', name: 'Arjun K', note: 'App shows \u20b942,000 profit. A \u20b93,000 "withdrawal" arrives, from a different person' },
        { t: at(3, 10, 30), dir: 'out', amt: 30000, cp: 'meena.traders', name: 'Meena Traders', fanIn: 5, note: '"IPO allotment" deposit' },
        { t: at(5, 12, 0), dir: 'out', amt: 50000, cp: 'deepak.s', name: 'Deepak S', fanIn: 7, note: 'Top-up to "unlock" the IPO' },
        { t: at(6, 18, 0), dir: 'out', amt: 100000, cp: 'gupta.agencies', name: 'Gupta Agencies', fanIn: 12, flagged: true, note: '"Margin call", pay or lose everything' },
        { t: at(8, 10, 0), dir: 'out', amt: 100000, cp: 'navin.r', name: 'Navin R', fanIn: 18, note: '"Exit fee" to withdraw' }
      ]
    },
    {
      id: 'arjun', who: 'Arjun, 29, Bengaluru', kind: 'Moving to a new flat', truth: 'genuine', base: 'everyday',
      intro: 'Genuine. Pays a token, a deposit and a broker, all to people he has never paid before.',
      events: [
        { t: at(0, 18, 0), dir: 'out', amt: 10000, cp: 'suresh.landlord', name: 'Suresh R (landlord)', fanIn: 0, note: 'Token advance' },
        { t: at(1, 11, 0), dir: 'out', amt: 90000, cp: 'suresh.landlord', name: 'Suresh R (landlord)', fanIn: 0, note: 'Security deposit, same landlord' },
        { t: at(1, 11, 30), dir: 'out', amt: 15000, cp: 'nikhil.broker', name: 'Nikhil (broker)', fanIn: 1, note: 'Brokerage' }
      ]
    },
    {
      id: 'meena', who: 'Meena, 41, Madurai', kind: 'Runs a kirana store', truth: 'genuine', base: 'kirana',
      intro: 'Genuine. Gets paid by about 15 customers a day on her personal UPI ID, and is trying two new suppliers.',
      events: [
        { t: at(0, 15, 0), dir: 'out', amt: 12000, cp: 'balaji.agencies', name: 'Balaji Agencies', fanIn: 2, note: 'New supplier, first order' },
        { t: at(3, 15, 0), dir: 'out', amt: 18000, cp: 'murugan.oils', name: 'Sri Murugan Oils', fanIn: 1, note: 'Another new supplier' }
      ]
    },
    {
      id: 'kabir', who: 'Kabir, 34, Gurugram', kind: 'Real investing', truth: 'genuine', base: 'everyday',
      intro: 'Genuine. Tops up his broker and mutual fund. Both use SEBI-verified @valid UPI IDs.',
      events: [
        { t: at(0, 10, 0), dir: 'out', amt: 50000, cp: 'broker.brk@validhdfc', name: 'His broker (@valid)', cpType: 'valid', note: 'Adds money to his trading account' },
        { t: at(1, 10, 0), dir: 'out', amt: 25000, cp: 'fund.mf@validicici', name: 'His mutual fund (@valid)', cpType: 'valid', note: 'Lump-sum investment' }
      ]
    }
  ];

  function play(E, story, cfg) {
    var st = E.createState(0);
    history(story.base).forEach(function (e) { E.observe(st, e); });
    return story.events.map(function (raw) {
      var e = { t: raw.t, dir: raw.dir, amt: raw.amt, cp: raw.cp, cpType: raw.cpType || 'individual', fanIn: raw.fanIn || 0, flagged: !!raw.flagged };
      var res = null, tier = 0;
      if (e.dir === 'out') { res = E.scorePayment(st, e, cfg); tier = E.decide(st, e, res.score, res.tier, cfg); }
      var step = { raw: raw, e: e, res: res, tier: tier, base: E.baselineMonthly(st, e.t) };
      E.observe(st, e);
      return step;
    });
  }

  var api = { STORIES: STORIES, history: history, play: play };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlowScamStories = api;
})(typeof window !== 'undefined' ? window : this);
