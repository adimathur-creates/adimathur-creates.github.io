// Agent-safe Payment Links: a policy gate between a merchant's AI agent and the
// Payment Links / refund tools. The agent proposes; the rules decide; the merchant approves.
// Every decision is one of: AUTO (run it), CONFIRM (merchant taps approve in the app), BLOCK.

const { parseAmounts } = (typeof require !== 'undefined') ? require('./amount.js') : window;

const SEV = { AUTO: 0, CONFIRM: 1, BLOCK: 2 };
const DECISION = ['AUTO', 'CONFIRM', 'BLOCK'];

const DEFAULT_POLICY = {
  scopes: ['read', 'create_link', 'update_link', 'refund'], // what this merchant let the agent do
  defaultExpiryDays: 7,         // ASSUMPTION: applied when the agent sets none
  maxExpiryDays: 365,           // Paytm FAQ: one year is the maximum validity of a link
  outlierMultiple: 3,           // amount above 3x the merchant's p95 link needs a tap
  duplicateRetryMinutes: 2,     // same link again within 2 min = agent retry, return the existing link
  duplicateOpenHours: 24,       // same customer + amount with an unpaid link in 24h = resend, don't recreate
  dailyAgentCreates: 50,        // above this, every new link needs a tap
  burstCreates: 20,             // 20 creates in 10 minutes = block (spam or loop)
  refundsPerHour: 3,            // more agent refunds than this in an hour = block
};

// Wording that should never go out in a link message sent from the merchant's name via SMS/email.
// These phrases are common in payment scams (KYC, OTP, police, lottery, "processing fee" for a refund).
const SCAM_WORDING = /\b(otp|kyc|pan\s*update|account\s*(block|blocked|suspend)|police|cbi|customs|lottery|prize|refund\s*(processing)?\s*fee|processing\s*fee|digital\s*arrest|electricity\s*(will\s*be\s*)?(cut|disconnect)|verify\s*your\s*account)\b/i;
const PARTIAL_WORDS = /\b(partial|part\s*payment|instal?ments?|kisht|kishton|emi|in\s*parts|thoda\s*thoda|advance|token\s*amount|split)\b/i;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readTool(tool) { return /^fetch_|^check_|^get_/.test(tool); }
function scopeFor(tool) {
  if (readTool(tool)) return 'read';
  if (tool === 'create_payment_link') return 'create_link';
  if (tool === 'update_payment_link') return 'update_link';
  if (tool === 'initiate_refund') return 'refund';
  return 'other_write'; // create_qr_code, process_transaction, cancel_subscription ...
}
const inr = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const mask = m => m ? m.slice(0, 2) + 'xxxxxx' + m.slice(-2) : '';
const norm = s => (s || '').toLowerCase().replace(/[^a-z ]/g, '').trim();

// Returns every saved customer the name could refer to (two "Meera Shah"s are common).
function findCustomers(ctx, name) {
  const n = norm(name);
  if (!n) return [];
  const exact = ctx.customers.filter(c => norm(c.name) === n);
  if (exact.length) return exact;
  if (n.split(' ').length === 1) return ctx.customers.filter(c => norm(c.name).split(' ')[0] === n);
  return [];
}

function evaluate(call, ctx, policyIn) {
  const policy = Object.assign({}, DEFAULT_POLICY, ctx.policy || {}, policyIn || {});
  const reasons = [];
  const add = (code, level, msg) => reasons.push({ code, level, msg });
  const a = Object.assign({}, call.args || {});
  const tool = call.tool;
  const prov = call.provenance || { source: 'merchant', text: '' };
  const now = new Date(call.at || ctx.now);
  const scope = scopeFor(tool);

  // R1 scope: reads are free, writes need a scope the merchant granted
  if (scope === 'read') return finish('AUTO', [{ code: 'READ_ONLY', level: 'AUTO', msg: 'Read-only call; no money or message moves.' }]);
  if (!policy.scopes.includes(scope)) add('NO_SCOPE', 'BLOCK', `This merchant has not allowed the agent to ${scope.replace('_', ' ')}.`);

  // R2 provenance: a write must trace back to the merchant's own words, not to text the agent read
  if (prov.source !== 'merchant') add('INSTRUCTION_FROM_DATA', 'BLOCK',
    `The instruction came from ${prov.source.replace('_', ' ')}, not from the merchant. Possible prompt injection.`);

  if (tool === 'create_payment_link') createRules();
  else if (tool === 'update_payment_link') updateRules();
  else if (tool === 'initiate_refund') refundRules();
  else if (scope === 'other_write') add('UNREVIEWED_WRITE', 'CONFIRM', `${tool} is a write action outside Payment Links; needs the merchant's tap.`);

  const worst = reasons.reduce((w, r) => Math.max(w, SEV[r.level]), 0);
  return finish(DECISION[worst], reasons);

  function amountChecks(amount, isRefund) {
    if (!(amount > 0)) { add('BAD_AMOUNT', 'BLOCK', 'Amount is missing or not positive.'); return; }
    const parsed = parseAmounts(prov.text || '');
    const vals = parsed.candidates.map(c => c.value);
    if (prov.source === 'merchant' && prov.text) {
      if (vals.length === 0 && !isRefund) add('AMOUNT_NOT_STATED', 'CONFIRM', `The merchant's message has no amount; the agent chose ${inr(amount)}.`);
      else if (vals.length && !vals.some(v => Math.abs(v - amount) < 0.01)) {
        const fullRefundAsk = isRefund && /\b(full|poora|pura|entire|complete)\b/i.test(prov.text);
        if (!fullRefundAsk) add('AMOUNT_MISMATCH', 'BLOCK', `Merchant said ${vals.map(inr).join(' or ')}; agent proposed ${inr(amount)}.`);
      } else if (parsed.ambiguous && vals.length > 1) add('AMOUNT_AMBIGUOUS', 'CONFIRM', `The message can be read as ${vals.map(inr).join(' / ')} (${parsed.notes.join('; ')}).`);
    }
  }

  function createRules() {
    const amount = Number(a.amount);
    amountChecks(amount, false);
    const st = ctx.linkStats || {};
    if (st.p95 && amount > policy.outlierMultiple * st.p95)
      add('AMOUNT_OUTLIER', 'CONFIRM', `${inr(amount)} is ${(amount / st.p95).toFixed(1)}x this merchant's usual largest link (p95 ${inr(st.p95)}).`);
    if (ctx.monthlyLimitLeft != null && amount > ctx.monthlyLimitLeft)
      add('OVER_ACCEPTANCE_LIMIT', 'BLOCK', `Above the ${inr(ctx.monthlyLimitLeft)} left in this month's acceptance limit; the customer's payment would fail.`);

    // recipient: links with a contact are sent automatically by SMS/email on creation
    const mob = a.customer_mobile ? String(a.customer_mobile).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') : '';
    const em = a.customer_email || '';
    if (a.customer_mobile && !MOBILE_RE.test(mob)) add('BAD_MOBILE', 'BLOCK', `"${a.customer_mobile}" is not a valid Indian mobile number.`);
    if (em && !EMAIL_RE.test(em)) add('BAD_EMAIL', 'BLOCK', `"${em}" is not a valid email.`);
    const matches = findCustomers(ctx, a.recipient_name);
    const textHasContact = (prov.text || '').replace(/\D/g, '').includes(mob) && mob;
    const same = c => (mob && c.mobile === mob) || (em && c.email && em.toLowerCase() === c.email.toLowerCase());
    if (matches.length && (mob || em) && !matches.some(same)) {
      const cust = matches[0];
      const saved = matches.length > 1 ? `${matches.length} saved customers named ${cust.name}, none with` : `${cust.name} is saved with ${mask(cust.mobile) || cust.email}, not`;
      if (textHasContact) add('NEW_CONTACT_FOR_KNOWN_CUSTOMER', 'CONFIRM', `${cust.name} is saved with a different contact; the merchant typed a new one.`);
      else add('CONTACT_MISMATCH', 'BLOCK', `${saved} ${mask(mob) || em}. The link would be sent to someone else.`);
    } else if (!matches.length && (mob || em)) {
      const known = ctx.customers.find(c => (mob && c.mobile === mob) || (em && c.email && c.email.toLowerCase() === em.toLowerCase()));
      if (known && norm(known.name) !== norm(a.recipient_name)) add('CONTACT_BELONGS_TO_OTHER', 'BLOCK', `That contact belongs to ${known.name}, not ${a.recipient_name}.`);
      else if (!known && !textHasContact) add('INVENTED_CONTACT', 'BLOCK', `Contact ${mask(mob) || em} is not in the customer book and not in the merchant's message.`);
      else if (!known) add('NEW_CUSTOMER', 'CONFIRM', `First link to a new contact (${mask(mob) || em}).`);
    }

    // duplicates
    const recent = (ctx.recentLinks || []).filter(l => l.status === 'issued' && Math.abs(l.amount - amount) < 0.01 &&
      ((mob && l.mobile === mob) || (em && l.email === em) || (!mob && !em && norm(l.recipient) === norm(a.recipient_name))));
    for (const l of recent) {
      const mins = (now - new Date(l.createdAt)) / 60000;
      if (mins >= 0 && mins <= policy.duplicateRetryMinutes) { add('DUPLICATE_RETRY', 'BLOCK', `Same link created ${Math.round(mins * 60)}s ago (${l.linkId}). Return that link instead of creating a second one.`); break; }
      if (mins >= 0 && mins <= policy.duplicateOpenHours * 60) { add('OPEN_LINK_EXISTS', 'CONFIRM', `An unpaid ${inr(l.amount)} link (${l.linkId}) went to this customer ${Math.round(mins / 60)}h ago. Resend it instead?`); break; }
    }

    // expiry
    if (!a.expiry) {
      const d = new Date(now.getTime() + policy.defaultExpiryDays * 864e5);
      a.expiry = d.toISOString();
      reasons.push({ code: 'EXPIRY_DEFAULTED', level: 'AUTO', msg: `No expiry given; set to ${policy.defaultExpiryDays} days.` });
    } else {
      const days = (new Date(a.expiry) - now) / 864e5;
      if (Number.isNaN(days)) add('BAD_EXPIRY', 'BLOCK', 'Expiry is not a valid date.');
      else if (days <= 0) add('EXPIRY_IN_PAST', 'BLOCK', 'Expiry is already in the past.');
      else if (days > policy.maxExpiryDays) add('EXPIRY_TOO_LONG', 'BLOCK', `Expiry ${Math.round(days)} days away; links can stay valid for at most one year.`);
    }

    // partial payments only if the merchant asked
    if (a.partial_payment && !PARTIAL_WORDS.test(prov.text || ''))
      add('PARTIAL_NOT_ASKED', 'CONFIRM', 'Agent turned on partial payments, but the merchant did not mention part payments.');

    // message content
    if (SCAM_WORDING.test(a.purpose || '')) add('SCAM_LIKE_WORDING', 'BLOCK', `Purpose "${a.purpose}" uses wording common in payment scams; it would go to the customer under the merchant's name.`);

    // velocity
    const today = (ctx.agentCreatesToday || 0);
    if (today >= policy.dailyAgentCreates) add('DAILY_CAP', 'CONFIRM', `Agent already created ${today} links today.`);
    if ((ctx.agentCreatesLast10Min || 0) >= policy.burstCreates) add('BURST', 'BLOCK', `${ctx.agentCreatesLast10Min} links in 10 minutes; looks like a loop or spam.`);
  }

  function updateRules() {
    const link = (ctx.recentLinks || []).find(l => l.linkId === a.link_id);
    if (!link) { add('LINK_NOT_FOUND', 'BLOCK', `No link ${a.link_id} on this merchant account.`); return; }
    const allowed = ['link_id', 'description', 'expiry'];
    const extra = Object.keys(a).filter(k => !allowed.includes(k));
    if (extra.length) add('FIELD_NOT_UPDATABLE', 'BLOCK', `Only description and expiry can be updated on a link; agent tried to change ${extra.join(', ')}. Expire it and create a new one.`);
    if (link.status !== 'issued') add('LINK_CLOSED', 'BLOCK', `Link is ${link.status}; it cannot be changed.`);
    if (a.expiry) {
      const days = (new Date(a.expiry) - now) / 864e5;
      if (days > policy.maxExpiryDays) add('EXPIRY_TOO_LONG', 'BLOCK', 'New expiry is more than one year away.');
      if (days <= 0) reasons.push({ code: 'EXPIRES_NOW', level: 'CONFIRM', msg: 'This stops the customer from paying. Confirm with the merchant.' });
    }
    if (a.description && SCAM_WORDING.test(a.description)) add('SCAM_LIKE_WORDING', 'BLOCK', `New description "${a.description}" uses scam-like wording.`);
  }

  function refundRules() {
    // money leaves the merchant: never AUTO
    add('MONEY_OUT', 'CONFIRM', 'Refunds move money out of the merchant account; always needs the merchant\'s tap.');
    const o = (ctx.orders || {})[a.order_id];
    if (!o) { add('ORDER_NOT_FOUND', 'BLOCK', `No order ${a.order_id} on this account.`); return; }
    if (o.status !== 'SUCCESS') add('ORDER_NOT_CAPTURED', 'BLOCK', `Order is ${o.status}; there is nothing to refund.`);
    const left = o.amount - (o.refunded || 0);
    const amount = Number(a.amount);
    amountChecks(amount, true);
    if (amount > left + 0.001) add('REFUND_EXCEEDS_CAPTURED', 'BLOCK', `Refund ${inr(amount)} is more than the ${inr(left)} left on this order.`);
    if (a.refund_to || a.vpa || a.account_number || a.upi_id) add('REFUND_REDIRECT', 'BLOCK', 'Refunds go back to the original payment source only. The agent tried to send it somewhere else.');
    if ((ctx.agentRefundsLastHour || 0) >= policy.refundsPerHour) add('REFUND_VELOCITY', 'BLOCK', `${ctx.agentRefundsLastHour} agent refunds in the last hour.`);
    if (!a.ref_id) reasons.push({ code: 'REFID_ADDED', level: 'AUTO', msg: 'Added a unique refund reference so a retry cannot refund twice.' });
    else if ((ctx.usedRefIds || []).includes(a.ref_id)) add('REFID_REUSED', 'BLOCK', `Refund reference ${a.ref_id} was already used; this is a retry.`);
  }

  function finish(decision, rs) {
    return { decision, reasons: rs, args: a, card: decision === 'CONFIRM' ? card() : null };
  }
  function card() {
    if (tool === 'create_payment_link') {
      const to = a.customer_mobile ? `SMS to ${mask(String(a.customer_mobile).replace(/\D/g, '').slice(-10))}` : a.customer_email ? `email to ${a.customer_email}` : 'no message (you share it)';
      return `Send a ${inr(a.amount)} link to ${a.recipient_name || 'customer'} for "${a.purpose || ''}", ${to}, ${a.partial_payment ? 'part payments allowed' : 'single payment'}, expires ${new Date(a.expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`;
    }
    if (tool === 'initiate_refund') return `Refund ${inr(a.amount)} on order ${a.order_id} to the customer's original payment method.`;
    if (tool === 'update_payment_link') return `Change link ${a.link_id}: ${Object.keys(a).filter(k => k !== 'link_id').map(k => k + ' → ' + a[k]).join(', ')}.`;
    return `${tool} with ${JSON.stringify(a)}`;
  }
}

if (typeof module !== 'undefined') module.exports = { evaluate, DEFAULT_POLICY, scopeFor, SCAM_WORDING };
