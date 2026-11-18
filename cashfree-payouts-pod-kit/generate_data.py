"""
Generates a FICTIONAL payouts dataset for the Payouts Pod Analytics Kit.

Nothing here is Cashfree data. Merchants, banks, volumes, rates and the
Tuesday incident are invented. Status and reason names are modelled on the
public Cashfree Payouts docs (SUCCESS / FAILED / REVERSED / ERROR and reason
codes such as BENE_BANK_DECLINED) so the SQL reads like real work.

What is planted (so tests can check the SQL finds it):
  1. Tue 10 Nov 2026, 11:00-14:30: "Bank F" degrades on IMPS (and partly UPI).
  2. Tue 10 Nov 2026: merchant M0412 (gaming) runs a withdrawal promo:
     ~4x volume, mostly first payouts to new, unverified beneficiaries.
  3. Tue 10 Nov 2026: merchant M0077 (lending) runs a disbursal batch during
     the Bank F window and retries every failure up to 6 times within minutes,
     inflating attempt counts.
  4. Weeks 3-5: 64 merchants get a merchant-specific failure shock; 24 of
     them churn in weeks 6-8. 12 other merchants churn with no shock.
  5. Merchants that verify beneficiaries (BAV) before the first payout see
     far fewer invalid-account failures and reversals.

Usage: python3 generate_data.py out.db
"""
import sqlite3, sys, math
from datetime import datetime, timedelta
import numpy as np

SEED = 20261110
rng = np.random.default_rng(SEED)

START = datetime(2026, 9, 21)          # Monday
DAYS = 56                              # through Sun 15 Nov 2026
INCIDENT_DAY = datetime(2026, 11, 10)  # Tuesday
BANK_F_START = INCIDENT_DAY + timedelta(hours=11)
BANK_F_END = INCIDENT_DAY + timedelta(hours=14, minutes=30)

BANKS = list("ABCDEFGHIJKL")
BANK_SHARE = np.array([.20, .15, .12, .10, .09, .09, .07, .05, .04, .04, .03, .02])
BANK_SHARE = BANK_SHARE / BANK_SHARE.sum()
# small, stable bank-level differences in base failure
BANK_FAIL_MULT = dict(zip(BANKS, [0.8, 0.9, 1.0, 1.1, 1.0, 1.0, 1.3, 1.2, 1.5, 1.0, 1.8, 2.0]))

MODE_BASE_FAIL = {"IMPS": 0.014, "UPI": 0.018, "NEFT": 0.005, "RTGS": 0.003}

SEGMENTS = {
    # share, mode mix, new-bene prob, invalid-account prob if unverified, amount (median Rs, sigma)
    "lending":     (0.15, {"IMPS": .70, "NEFT": .20, "RTGS": .10}, 0.60, 0.015, (25000, 0.9)),
    "gaming":      (0.20, {"UPI": .60, "IMPS": .40},               0.25, 0.030, (800, 1.0)),
    "gig_wages":   (0.20, {"IMPS": .50, "UPI": .40, "NEFT": .10},  0.05, 0.015, (3500, 0.6)),
    "ecom_refunds":(0.25, {"UPI": .50, "IMPS": .40, "NEFT": .10},  0.40, 0.030, (1200, 0.9)),
    "insurance":   (0.10, {"NEFT": .50, "IMPS": .40, "RTGS": .10}, 0.70, 0.015, (40000, 1.0)),
    "vendor":      (0.10, {"NEFT": .60, "IMPS": .30, "RTGS": .10}, 0.03, 0.015, (60000, 1.1)),
}
TIERS = [("large", 0.05, 100), ("mid", 0.25, 20), ("small", 0.70, 3)]

RETRYABLE = {"BENE_BANK_DECLINED", "BANK_GATEWAY_ERROR", "BAD_CONNECTION", "WAIT_TIME_EXCEEDED"}
BASE_FAIL_REASONS = (["BENE_BANK_DECLINED", "BANK_GATEWAY_ERROR", "BAD_CONNECTION",
                      "WAIT_TIME_EXCEEDED", "ACCOUNT_BLOCKED"],
                     [0.40, 0.25, 0.15, 0.10, 0.10])

N_MERCHANTS = 600


def pick(d):
    keys = list(d.keys()); p = np.array(list(d.values()), dtype=float)
    return keys[rng.choice(len(keys), p=p / p.sum())]


def build_merchants():
    seg_names = list(SEGMENTS.keys())
    seg_p = np.array([SEGMENTS[s][0] for s in seg_names])
    merchants = []
    for i in range(N_MERCHANTS):
        mid = f"M{i:04d}"
        seg = seg_names[rng.choice(len(seg_names), p=seg_p)]
        tier = TIERS[rng.choice(3, p=[t[1] for t in TIERS])]
        daily = tier[2] * rng.lognormal(0, 0.35)
        uses_bav = rng.random() < 0.35
        # ~60 merchants onboard during the window; the rest are older
        if rng.random() < 0.10:
            onboarded = START + timedelta(days=int(rng.integers(0, DAYS - 14)))
        else:
            onboarded = START - timedelta(days=int(rng.integers(30, 700)))
        merchants.append(dict(merchant_id=mid, segment=seg, tier=tier[0], daily=daily,
                              uses_bav=uses_bav, onboarded_on=onboarded,
                              primary_bank=BANKS[rng.choice(len(BANKS), p=BANK_SHARE)],
                              shock=False, churn=False))
    by_id = {m["merchant_id"]: m for m in merchants}
    # named incident merchants
    by_id["M0412"].update(segment="gaming", tier="large", daily=110, uses_bav=False,
                          onboarded_on=START - timedelta(days=300))
    by_id["M0077"].update(segment="lending", tier="large", daily=90, uses_bav=True,
                          onboarded_on=START - timedelta(days=400))
    # churn / shock assignment among older small+mid merchants
    pool = [m for m in merchants if m["tier"] != "large" and m["onboarded_on"] < START
            and m["merchant_id"] not in ("M0412", "M0077")]
    idx = rng.permutation(len(pool))
    for k, j in enumerate(idx[:76]):
        m = pool[j]
        if k < 24:   m.update(shock=True, churn=True)
        elif k < 36: m.update(shock=False, churn=True)
        else:        m.update(shock=True, churn=False)
    return merchants


def volume_multiplier(m, day_idx, day):
    mult = 1.0
    wd = day.weekday()
    if wd >= 5: mult *= 0.65
    if m["segment"] == "gig_wages" and wd == 4: mult *= 1.8
    if m["churn"]:
        week = day_idx // 7 + 1
        if week >= 6:
            mult *= {6: 0.55, 7: 0.25, 8: 0.08}[min(week, 8)]
    if day < m["onboarded_on"]:
        return 0.0
    if m["merchant_id"] == "M0412" and day == INCIDENT_DAY:
        mult *= 4.0
    return mult


def main(path):
    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.executescript("""
    DROP TABLE IF EXISTS merchants; DROP TABLE IF EXISTS transfers;
    CREATE TABLE merchants(
      merchant_id TEXT PRIMARY KEY, segment TEXT, size_tier TEXT,
      onboarded_on TEXT, uses_bav INTEGER);
    CREATE TABLE transfers(
      transfer_id TEXT PRIMARY KEY, intent_id TEXT, attempt_no INTEGER,
      merchant_id TEXT, bene_id TEXT, is_new_bene INTEGER, bene_bav_verified INTEGER,
      mode TEXT, bene_bank TEXT, amount REAL, created_at TEXT,
      outcome TEXT,          -- final: SUCCESS / FAILED / ERROR / REVERSED
      reason TEXT,           -- reason code for FAILED / ERROR / REVERSED
      resolved_at TEXT,      -- first terminal status (success or failure)
      reversed_at TEXT,      -- when a SUCCESS was reversed by the beneficiary bank
      api_latency_ms INTEGER);
    """)
    merchants = build_merchants()
    cur.executemany("INSERT INTO merchants VALUES (?,?,?,?,?)",
                    [(m["merchant_id"], m["segment"], m["tier"],
                      m["onboarded_on"].strftime("%Y-%m-%d"), int(m["uses_bav"])) for m in merchants])

    rows = []
    tcount = 0
    tid_n = 0
    hour_p = np.array([1,1,1,1,1,2,3,5,7,9,10,10,9,9,9,8,8,7,6,5,4,3,2,1], dtype=float)
    hour_p /= hour_p.sum()

    for m in merchants:
        seg = SEGMENTS[m["segment"]]
        bene_seq = 0
        known_benes = []  # (bene_id, bank, verified)
        for d in range(DAYS):
            day = START + timedelta(days=d)
            lam = m["daily"] * volume_multiplier(m, d, day)
            if lam <= 0: continue
            n = rng.poisson(lam)
            week = d // 7 + 1
            for _ in range(n):
                tcount += 1
                intent_id = f"I{tcount:07d}"
                if m["merchant_id"] == "M0412" and day == INCIDENT_DAY:
                    hour = int(rng.choice(24, p=hour_p)) if rng.random() < 0.3 else int(rng.integers(10, 16))
                elif m["merchant_id"] == "M0077" and day == INCIDENT_DAY and rng.random() < 0.7:
                    hour = int(rng.integers(11, 14))   # disbursal batch during the Bank F window
                else:
                    hour = int(rng.choice(24, p=hour_p))
                created = day + timedelta(hours=hour, seconds=int(rng.integers(0, 3600)))
                # beneficiary
                p_new = seg[2]
                if m["merchant_id"] == "M0412" and day == INCIDENT_DAY: p_new = 0.70
                if not known_benes or rng.random() < p_new:
                    bene_seq += 1
                    bank = BANKS[rng.choice(len(BANKS), p=BANK_SHARE)]
                    if m["shock"] and rng.random() < 0.6: bank = m["primary_bank"]
                    if m["merchant_id"] == "M0077" and day == INCIDENT_DAY and rng.random() < 0.7: bank = "F"
                    verified = int(m["uses_bav"] and rng.random() < 0.92)
                    bene = (f"{m['merchant_id']}-B{bene_seq:05d}", bank, verified)
                    is_new = 1
                    invalid_p = 0.003 if verified else seg[3]
                    if m["merchant_id"] == "M0412" and day == INCIDENT_DAY: invalid_p = 0.09
                    invalid = rng.random() < invalid_p
                else:
                    bene = known_benes[rng.integers(0, len(known_benes))]
                    is_new = 0; invalid = False
                bene_id, bank, verified = bene
                mode = pick(seg[1])
                amount = round(float(rng.lognormal(math.log(seg[4][0]), seg[4][1])), 2)
                if mode == "RTGS": amount = max(amount, 200000.0)

                attempt = 0
                t = created
                while True:
                    attempt += 1
                    tid_n += 1
                    tid = f"T{tid_n:08d}"
                    latency = int(max(60, rng.normal(180, 40)))
                    outcome, reason, reversed_at = "SUCCESS", None, None
                    # merchant-side error: balance
                    if rng.random() < 0.004:
                        outcome, reason = "ERROR", "INSUFFICIENT_BALANCE"
                        resolved = t + timedelta(seconds=1)
                    elif invalid:
                        if rng.random() < 0.6:
                            outcome, reason = "FAILED", "INVALID_ACCOUNT_FAIL"
                            resolved = t + timedelta(seconds=int(rng.integers(5, 60)))
                        else:
                            outcome, reason = "REVERSED", "INVALID_ACCOUNT_REVERSAL"
                            resolved = t + timedelta(seconds=int(rng.integers(5, 60)))
                            reversed_at = resolved + timedelta(hours=float(rng.uniform(2, 24)))
                    else:
                        p_fail = MODE_BASE_FAIL[mode] * BANK_FAIL_MULT[bank]
                        if m["shock"] and 3 <= week <= 5:
                            p_fail = min(0.5, p_fail * 15)
                        in_window = BANK_F_START <= t < BANK_F_END and bank == "F"
                        if in_window and mode == "IMPS": p_fail = 0.45
                        elif in_window and mode == "UPI": p_fail = 0.15
                        if rng.random() < p_fail:
                            if in_window and mode in ("IMPS", "UPI"):
                                reason = "BENE_BANK_DECLINED" if rng.random() < 0.7 else "BANK_GATEWAY_ERROR"
                            else:
                                reason = str(rng.choice(BASE_FAIL_REASONS[0], p=BASE_FAIL_REASONS[1]))
                            outcome = "FAILED"
                        if mode == "NEFT":
                            resolved = t + timedelta(minutes=float(rng.uniform(30, 150)))
                        elif mode == "RTGS":
                            resolved = t + timedelta(minutes=float(rng.uniform(5, 40)))
                        else:
                            # ~2% of instant transfers stay pending for hours
                            if rng.random() < 0.02:
                                resolved = t + timedelta(hours=float(rng.uniform(1, 30)))
                            else:
                                resolved = t + timedelta(seconds=int(rng.integers(2, 40)))
                    rows.append((tid, intent_id, attempt, m["merchant_id"], bene_id, is_new, verified,
                                 mode, bank, amount, t.isoformat(sep=" "), outcome, reason,
                                 resolved.isoformat(sep=" "),
                                 reversed_at.isoformat(sep=" ") if reversed_at else None, latency))
                    # retries
                    if outcome == "FAILED" and reason in RETRYABLE:
                        if m["merchant_id"] == "M0077" and day == INCIDENT_DAY:
                            if attempt < 6:
                                t = resolved + timedelta(seconds=int(rng.integers(20, 120))); continue
                        elif attempt < 3 and rng.random() < 0.7:
                            t = resolved + timedelta(minutes=float(rng.uniform(5, 60))); continue
                    break
                if outcome not in ("FAILED", "REVERSED") or not invalid:
                    if is_new and not invalid:
                        known_benes.append(bene)
                        if len(known_benes) > 400: known_benes.pop(0)
        if len(rows) > 50000:
            cur.executemany("INSERT INTO transfers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
            con.commit()
            rows.clear()
    if rows:
        cur.executemany("INSERT INTO transfers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    cur.executescript("""
      CREATE INDEX ix_t_created ON transfers(created_at);
      CREATE INDEX ix_t_intent ON transfers(intent_id);
      CREATE INDEX ix_t_merchant ON transfers(merchant_id);
    """)
    con.commit()
    # ground truth for tests only (never read by the SQL)
    cur.executescript("DROP TABLE IF EXISTS _ground_truth; CREATE TABLE _ground_truth(merchant_id TEXT, shock INT, churn INT);")
    cur.executemany("INSERT INTO _ground_truth VALUES (?,?,?)",
                    [(m["merchant_id"], int(m["shock"]), int(m["churn"])) for m in merchants])
    con.commit()
    n = cur.execute("SELECT COUNT(*), COUNT(DISTINCT intent_id) FROM transfers").fetchone()
    print(f"transfers={n[0]:,} intents={n[1]:,} merchants={len(merchants)}")
    con.close()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "payouts.db")
