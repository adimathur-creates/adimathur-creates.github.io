"""
Simulated overdue-resolution book for the "Plan to NOC" analysis.

Nothing here is GoodScore data. Every rate below is an assumption, written down
so a reader can disagree with it. The assumptions come from three public sources:
GoodScore's own five-step "Detect -> Reduce -> Plan -> Close -> Rebuild" page,
its app-store listing, and public user reviews (EMI conversion stories, NOCs,
loans that still show "active" after closure).

Run:  python3 simulate.py  -> writes ../data/*.csv
"""
import numpy as np
import pandas as pd
from pathlib import Path

rng = np.random.default_rng(2026)
OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)

N_USERS = 40_000
START = pd.Timestamp("2026-01-01")
DETECT_END = pd.Timestamp("2026-04-30")      # cohort: overdue detected Jan-Apr 2026
AS_OF = pd.Timestamp("2026-11-10")           # analysis date

def sig(x):
    return 1 / (1 + np.exp(-x))

# ---------------------------------------------------------------- users
tier = rng.choice([1, 2, 3], N_USERS, p=[0.28, 0.40, 0.32])
median_income = np.select([tier == 1, tier == 2], [38_000, 27_000], 21_000)
income_true = np.round(median_income * rng.lognormal(0, 0.45, N_USERS), -2)
sms_income = rng.random(N_USERS) < 0.64                       # salary SMS found
# Without SMS, the app only has what the user typed. People round up.
declared = income_true * rng.lognormal(0.18, 0.30, N_USERS)
income_known = np.where(sms_income, income_true * rng.normal(1, 0.06, N_USERS), declared).round(-2)
payday = np.where(rng.random(N_USERS) < 0.72, rng.integers(1, 8, N_USERS),
          np.where(rng.random(N_USERS) < 0.7, rng.integers(25, 31, N_USERS), rng.integers(8, 25, N_USERS)))
subscribed = START + pd.to_timedelta(rng.integers(0, (DETECT_END - START).days - 7, N_USERS), unit="D")

users = pd.DataFrame({
    "user_id": np.arange(1, N_USERS + 1),
    "city_tier": tier,
    "income_true": income_true,          # never visible to the product; used only to simulate behaviour
    "income_known": income_known,        # what the product sees
    "income_source": np.where(sms_income, "sms", "declared"),
    "payday_dom": payday,
    "subscribed_at": subscribed.date,
})

# ---------------------------------------------------------------- overdue accounts
n_acc = np.minimum(1 + rng.poisson(0.8, N_USERS), 6)
uid = np.repeat(users.user_id.values, n_acc)
A = len(uid)
u = users.set_index("user_id").loc[uid].reset_index()

lender_type = rng.choice(["bank", "nbfc", "digital"], A, p=[0.34, 0.44, 0.22])
product = np.empty(A, dtype=object)
for lt, opts, p in [("bank", ["credit_card", "personal_loan"], [0.55, 0.45]),
                    ("nbfc", ["personal_loan", "consumer_durable", "two_wheeler"], [0.5, 0.3, 0.2]),
                    ("digital", ["app_loan", "bnpl"], [0.8, 0.2])]:
    m = lender_type == lt
    product[m] = rng.choice(opts, m.sum(), p=p)
med = {"credit_card": 62_000, "personal_loan": 145_000, "consumer_durable": 28_000,
       "two_wheeler": 54_000, "app_loan": 18_000, "bnpl": 9_000}
outstanding = np.round(np.array([med[p] for p in product]) * rng.lognormal(0, 0.55, A), -2)
dpd = rng.choice(["30-89", "90-179", "180+"], A, p=[0.38, 0.30, 0.32])
in_network = rng.random(A) < np.select([lender_type == "bank", lender_type == "nbfc"], [0.78, 0.72], 0.55)
detected = pd.to_datetime(u.subscribed_at) + pd.to_timedelta(rng.integers(0, 8, A), unit="D")

LENDERS = {"bank": ["HDFC Bank", "ICICI Bank", "Axis Bank", "SBI Card", "Kotak Mahindra Bank", "IDFC First Bank"],
           "nbfc": ["Bajaj Finserv", "Tata Capital", "Home Credit", "HDB Financial", "Hero FinCorp", "L&T Finance"],
           "digital": ["Moneyview", "Stashfin", "SmartCoin", "CASHe", "Branch", "Ram Fincorp"]}
lender = np.array([rng.choice(LENDERS[t]) for t in lender_type])
acct_last4 = rng.integers(1000, 10000, A)
opened = (pd.to_datetime("2021-01-01") + pd.to_timedelta(rng.integers(0, 1500, A), unit="D")).to_period("M").astype(str)

acc = pd.DataFrame({
    "account_id": np.arange(1, A + 1), "user_id": uid, "lender": lender, "lender_type": lender_type,
    "product": product, "outstanding": outstanding, "dpd_bucket": dpd, "in_network": in_network,
    "acct_last4": acct_last4, "opened_month": opened, "detected_at": detected.dt.date,
})
n_user_acc = pd.Series(uid).map(pd.Series(n_acc, index=users.user_id)).values

# ---------------------------------------------------------------- stage 2: lender offer
p_offer = np.where(in_network, np.where(dpd == "30-89", 0.70, 0.88), 0.22)
has_offer = rng.random(A) < p_offer
waiver = np.select([dpd == "30-89", dpd == "90-179"],
                   [rng.uniform(0, 0.08, A), rng.uniform(0.15, 0.35, A)], rng.uniform(0.30, 0.55, A))
waiver = np.round(waiver, 3)
offer_at = detected + pd.to_timedelta(rng.gamma(2, 2.5, A).round().astype(int) + 1, unit="D")
settle_amt = np.round(outstanding * (1 - waiver), -2)

# ---------------------------------------------------------------- stage 3: plan accepted
inc_t, inc_k = u.income_true.values, u.income_known.values
ots_ratio = settle_amt / inc_t
choose_ots = rng.random(A) < sig(2.0 - 1.4 * ots_ratio)
# EMI tenure is sized on the income the PRODUCT knows (the current rule: EMI <= 35% of known income, max 6)
tenure = np.ones(A, dtype=int)
for t in [2, 3, 4, 6]:
    fits = (settle_amt / t <= 0.35 * inc_k) & (tenure == 1) & ~choose_ots
    tenure[fits] = t
tenure[(tenure == 1) & ~choose_ots] = 6
plan_type = np.where(choose_ots, "one_time", "emi")
emi = np.where(choose_ots, settle_amt, np.round(settle_amt / tenure, -1))
afford_true = emi / inc_t
afford_known = emi / inc_k
p_accept = np.where(choose_ots, sig(1.9 - 0.9 * ots_ratio),
                    sig(1.5 - 2.6 * np.maximum(0, afford_true - 0.30) + 0.35 * (waiver > 0.2)))
accepted = has_offer & (rng.random(A) < p_accept)
accept_at = offer_at + pd.to_timedelta(rng.gamma(1.5, 2, A).round().astype(int), unit="D")

# Current default: first due date = acceptance + 7 days, whatever the payday.
first_due = accept_at + pd.Timedelta(days=7)
pay_dom = u.payday_dom.values
days_after_payday = (first_due.dt.day.values - pay_dom) % 30
aligned = days_after_payday <= 5                       # due within 5 days after salary lands
mandate = rng.random(A) < np.select([u.city_tier.values == 1, u.city_tier.values == 2], [0.42, 0.33], 0.26)

# ---------------------------------------------------------------- stage 4/5: payments
emi_rows = []
first_paid = np.zeros(A, bool)
completed = np.zeros(A, bool)
complete_at = pd.Series(pd.NaT, index=range(A))
broke_at_inst = np.zeros(A, int)
p_first = np.where(choose_ots,
                   sig(1.9 - 0.8 * ots_ratio + 0.6 * aligned + 0.5 * mandate),
                   sig(1.7 + 0.9 * aligned + 0.8 * mandate - 4.0 * np.maximum(0, afford_true - 0.25) - 0.35 * (dpd == "180+")))
h_base = -3.3 - 0.8 * aligned - 0.9 * mandate + 5.0 * np.maximum(0, afford_true - 0.25) + 0.3 * (n_user_acc > 2)
draws = rng.random((A, 8))
for i in np.where(accepted)[0]:
    n_inst = 1 if choose_ots[i] else tenure[i]
    ok = draws[i, 0] < p_first[i]
    due = first_due.iloc[i]
    status = "paid" if ok else "missed"
    emi_rows.append((i + 1, 1, due.date(), emi[i], status))
    if not ok:
        broke_at_inst[i] = 1
        continue
    first_paid[i] = True
    last = due
    broke = False
    for k in range(2, n_inst + 1):
        due = due + pd.DateOffset(months=1)
        if due > AS_OF:
            break
        miss = draws[i, k - 1] < sig(h_base[i])
        if miss and draws[i, 7] > 0.35:                 # 35% cure the next month, the rest break
            emi_rows.append((i + 1, k, due.date(), emi[i], "missed"))
            broke_at_inst[i] = k
            broke = True
            break
        emi_rows.append((i + 1, k, due.date(), emi[i], "paid_late" if miss else "paid"))
        last = due
    else:
        if not broke:
            completed[i] = True
            complete_at.iloc[i] = last + pd.Timedelta(days=int(rng.integers(0, 4)))
    if not broke and not completed[i]:
        pass  # still running at AS_OF -> censored

inst = pd.DataFrame(emi_rows, columns=["account_id", "inst_no", "due_date", "amount", "status"])

# ---------------------------------------------------------------- stage 6/7: NOC and bureau reflection
noc_mean = np.select([lender_type == "bank", lender_type == "nbfc"], [9, 14], 21)
noc_fail = rng.random(A) < np.select([lender_type == "bank", lender_type == "nbfc"], [0.04, 0.09], 0.17)
noc_at = pd.to_datetime(complete_at.values) + pd.to_timedelta(rng.gamma(2, noc_mean / 2).round(), unit="D")
noc_ok = completed & ~noc_fail & (noc_at <= AS_OF)
ref_mean = np.select([lender_type == "bank", lender_type == "nbfc"], [32, 41], 55)
ref_fail = rng.random(A) < np.select([lender_type == "bank", lender_type == "nbfc"], [0.06, 0.12], 0.24)
reflect_at = noc_at + pd.to_timedelta(rng.gamma(4, ref_mean / 4).round(), unit="D")
reflected = noc_ok & ~ref_fail & (reflect_at <= AS_OF)
bureau_status = np.where(reflected, np.where(waiver >= 0.05, "SETTLED", "CLOSED"), None)

# Score change 90 days after reflection (or 0 if never reflected)
is_closed = np.array([b == "CLOSED" for b in bureau_status])
score_delta = np.where(~reflected, rng.normal(0, 6, A),
              np.where(is_closed, rng.normal(np.where(dpd == "30-89", 42, 58), 14),
                       rng.normal(16, 11, A)))
score_delta = np.round(score_delta).astype(int)

closures = pd.DataFrame({
    "account_id": acc.account_id,
    "payment_completed_at": complete_at.dt.date.where(completed),
    "noc_issued_at": pd.Series(noc_at.date).where(noc_ok),
    "bureau_reflected_at": pd.Series(reflect_at.date).where(reflected),
    "bureau_status": bureau_status,
    "score_delta_90d": score_delta,
})[completed]

offers = pd.DataFrame({"account_id": acc.account_id, "offered_at": offer_at.dt.date, "waiver_pct": waiver,
                       "settlement_amount": settle_amt})[has_offer]
plans = pd.DataFrame({"account_id": acc.account_id, "accepted_at": accept_at.dt.date, "plan_type": plan_type,
                      "tenure_months": np.where(choose_ots, 1, tenure), "instalment": emi,
                      "first_due_date": first_due.dt.date, "autopay_mandate": mandate})[accepted]

# ---------------------------------------------------------------- support tickets and cancellations
# "I paid, it still shows active": tickets cluster where payment is done but bureau hasn't moved by day 45.
c = acc[["account_id", "user_id"]].copy()
c["completed"] = completed
c["gap45"] = completed & ~(reflected & ((reflect_at - pd.to_datetime(complete_at.values)).days <= 45))
c = c[c.completed & (pd.to_datetime(complete_at.values) + pd.Timedelta(days=45) <= AS_OF)]
ticket = rng.random(len(c)) < np.where(c.gap45, 0.52, 0.07)
tickets = pd.DataFrame({"ticket_id": np.arange(1, ticket.sum() + 1), "user_id": c.user_id.values[ticket],
                        "account_id": c.account_id.values[ticket],
                        "category": np.where(c.gap45.values[ticket], "paid_still_showing_active", "other")})
ug = c.groupby("user_id").gap45.any()
cancel = pd.DataFrame({"user_id": ug.index, "had_gap45": ug.values})
cancel["cancelled_within_60d"] = rng.random(len(cancel)) < np.where(cancel.had_gap45, 0.27, 0.09)

# ---------------------------------------------------------------- raw bureau tradelines (data-quality trap)
VARIANTS = {"HDFC Bank": ["HDFC BANK LTD", "HDFC Bank", "HDFC BANK LIMITED"], "SBI Card": ["SBI CARDS & PAYMENT", "SBI Card"],
            "Bajaj Finserv": ["BAJAJ FINANCE LTD", "Bajaj Finserv"], "Moneyview": ["WHIZDM FINANCE", "Moneyview"]}
rows = []
for b, p in [("CIBIL", 0.95), ("EXPERIAN", 0.70), ("CRIF", 0.60)]:
    m = rng.random(A) < p
    for i in np.where(m)[0]:
        name = rng.choice(VARIANTS.get(lender[i], [lender[i], lender[i].upper()]))
        mask = rng.choice([f"XXXXXXXX{acct_last4[i]}", f"****{acct_last4[i]}", f"{acct_last4[i]}"])
        rows.append((b, int(uid[i]), name, mask, opened[i], round(outstanding[i] * rng.normal(1, 0.03), -1), dpd[i]))
tradelines = pd.DataFrame(rows, columns=["bureau", "user_id", "lender_name_raw", "account_no_masked",
                                         "opened_month", "reported_outstanding", "dpd_bucket"])

# ---------------------------------------------------------------- write
users.drop(columns=["income_true"]).to_csv(OUT / "users.csv", index=False)
users[["user_id", "income_true"]].to_csv(OUT / "_sim_truth_income.csv", index=False)
acc.to_csv(OUT / "overdue_accounts.csv", index=False)
offers.to_csv(OUT / "offers.csv", index=False)
plans.to_csv(OUT / "plans.csv", index=False)
inst.to_csv(OUT / "instalments.csv", index=False)
closures.to_csv(OUT / "closures.csv", index=False)
tickets.to_csv(OUT / "support_tickets.csv", index=False)
cancel.to_csv(OUT / "subscription_outcomes.csv", index=False)
tradelines.to_csv(OUT / "bureau_tradelines_raw.csv", index=False)
print({k: len(v) for k, v in dict(users=users, accounts=acc, offers=offers, plans=plans, instalments=inst,
                                    closures=closures, tickets=tickets, tradelines=tradelines).items()})
