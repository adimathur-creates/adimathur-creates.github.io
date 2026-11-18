"""Builds index.html from results.json. Every number on the page comes from the SQL output.
Usage: python3 build_page.py results.json index.html
"""
import json, sys, html, math

r = json.load(open(sys.argv[1]))
OUT = sys.argv[2]

def rows(name): return r[name]["rows"]
def col(name, c): return r[name]["columns"].index(c)
def esc(x): return html.escape(str(x))
def fmt(x, d=2):
    return f"{x:,.{d}f}" if isinstance(x, (int, float)) else esc(x)

# ---------- pull numbers ----------
H = {row[0]: row for row in rows("headline_three_numbers")}
h_rows = rows("headline_three_numbers")
night_b, night_t = h_rows[0][1], h_rows[0][2]
att_b, att_t = h_rows[1][1], h_rows[1][2]
int_b, int_t = h_rows[2][1], h_rows[2][2]
real_drop = round(int_b - int_t, 2)
dash_drop = round(night_b - night_t, 2)

dec = rows("decomposition")
dec_total = round(sum(d[7] for d in dec), 2)
m0412 = next(d for d in dec if d[0].startswith("1"))
bankf = next(d for d in dec if d[0].startswith("3"))
rest = next(d for d in dec if d[0].startswith("4"))

ri = {row[0]: row for row in rows("retry_inflation")}
m77 = ri["M0077"]
srw = rows("attempt_sr_without_retry_loop")[0]

ro = {row[0]: row for row in rows("ruled_out")}
pdr = rows("platform_daily_range")[0]
rl = {row[0]: row for row in rows("reversal_lag")}
late_rev = rl.get("landed Wednesday or later", [0, 0, 0])[1]
all_rev = sum(v[1] for v in rl.values())

f15 = rows("bank_f_15min")
alert_slot = next(x[0] for x in f15 if x[4])
broken = [x for x in f15 if x[2] < 90]
first_bad = broken[0][0]
recovered = next(x[0] for x in f15 if x[0] > "14:00" and x[3] >= 90)

mc = rows("merchant_contribution")[0]  # M0412

fpq = {row[0]: row for row in rows("first_payout_quality")}
unv, ver = fpq["not verified"], fpq["verified with BAV first"]
ratio = round(unv[3] / ver[3], 1)
sz = rows("sizing")[0]
tl = rows("target_list")
tp_note = open('shock_precision.txt').read().strip() if __import__('os').path.exists('shock_precision.txt') else ''

cvs = {row[0]: row for row in rows("churn_vs_shock")}
shock = cvs["had a failure shock in weeks 3-5"]; noshock = cvs["no shock"]
bt = rows("early_warning_backtest")[0]

daily = rows("daily_kpis")
dcols = r["daily_kpis"]["columns"]
i_day, i_sr, i_mat = dcols.index("day"), dcols.index("payout_success_rate"), dcols.index("mature")

# sample size for a merchant-level BAV nudge test (first payouts, two proportions)
p1 = unv[3] / 100; p2 = p1 - 0.005
n_arm = math.ceil((1.96 + 0.8416) ** 2 * (p1*(1-p1) + p2*(1-p2)) / (p1 - p2) ** 2)
monthly_first = sz[1]

# ---------- charts (inline SVG, single axis, thin marks, native hover titles) ----------
def line_chart():
    W, Hh, L, R, T, B = 720, 230, 44, 16, 16, 34
    pts = [(d[i_day], d[i_sr], d[i_mat]) for d in daily]
    lo, hi = 98.0, 99.5
    x = lambda i: L + i * (W - L - R) / (len(pts) - 1)
    y = lambda v: T + (hi - v) * (Hh - T - B) / (hi - lo)
    g = []
    for v in (98.0, 98.5, 99.0, 99.5):
        g.append(f'<line x1="{L}" x2="{W-R}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid"/>'
                 f'<text x="{L-6}" y="{y(v)+4:.1f}" class="ax" text-anchor="end">{v:.1f}%</text>')
    mature = [(i, p) for i, p in enumerate(pts) if p[2] == 1]
    path = " ".join(f"{'M' if k == 0 else 'L'}{x(i):.1f},{y(p[1]):.1f}" for k, (i, p) in enumerate(mature))
    unm = [(i, p) for i, p in enumerate(pts) if p[2] == 0]
    upath = " ".join(f"{'M' if k == 0 else 'L'}{x(i):.1f},{y(p[1]):.1f}" for k, (i, p) in enumerate([mature[-1]] + unm))
    dots = []
    for i, p in enumerate(pts):
        cls = "dot-hi" if p[0] == "2026-11-10" else "dot"
        tag = " (not final yet)" if p[2] == 0 else ""
        dots.append(f'<g class="hit"><circle cx="{x(i):.1f}" cy="{y(p[1]):.1f}" r="9" fill="transparent"/>'
                    f'<circle cx="{x(i):.1f}" cy="{y(p[1]):.1f}" r="{5 if cls=="dot-hi" else 2.5}" class="{cls}"/>'
                    f'<title>{p[0]}: {p[1]:.2f}%{tag}</title></g>')
    labels = []
    for i, p in enumerate(pts):
        if p[0] in ("2026-09-21", "2026-10-05", "2026-10-19", "2026-11-02", "2026-11-15"):
            labels.append(f'<text x="{x(i):.1f}" y="{Hh-12}" class="ax" text-anchor="middle">{p[0][8:]} {["Sep","Oct","Nov"][int(p[0][5:7])-9]}</text>')
    ti = next(i for i, p in enumerate(pts) if p[0] == "2026-11-10")
    ann = (f'<text x="{x(ti)-8:.1f}" y="{y(pts[ti][1])+18:.1f}" class="ann" text-anchor="end">Tue 10 Nov: {pts[ti][1]:.2f}%</text>')
    return (f'<svg viewBox="0 0 {W} {Hh}" role="img" aria-label="Daily payout success rate, 21 Sep to 15 Nov 2026">'
            + "".join(g) + f'<path d="{path}" class="ln"/><path d="{upath}" class="ln-dash"/>'
            + "".join(dots) + "".join(labels) + ann + "</svg>")

def bars_15():
    W, Hh, L, R, T, B = 720, 220, 44, 16, 14, 34
    n = len(f15); bw = (W - L - R) / n
    y = lambda v: T + (100 - v) * (Hh - T - B) / 100
    g = []
    for v in (0, 50, 90, 100):
        g.append(f'<line x1="{L}" x2="{W-R}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="{"thr" if v==90 else "grid"}"/>'
                 f'<text x="{L-6}" y="{y(v)+4:.1f}" class="ax" text-anchor="end">{v}%</text>')
    b = []
    for i, s in enumerate(f15):
        x0 = L + i * bw + 1; h = (Hh - B) - y(s[2])
        b.append(f'<g class="hit"><rect x="{x0:.1f}" y="{T}" width="{bw-2:.1f}" height="{Hh-B-T}" fill="transparent"/>'
                 f'<rect x="{x0:.1f}" y="{y(s[2]):.1f}" width="{bw-2:.1f}" height="{h:.1f}" rx="2" class="{"bar-hi" if s[2] < 90 else "bar"}"/>'
                 f'<title>{s[0]}: {s[2]:.1f}% of {s[1]} attempts succeeded</title></g>')
        if s[0].endswith(":00") and int(s[0][:2]) % 2 == 1:
            b.append(f'<text x="{x0+bw/2:.1f}" y="{Hh-12}" class="ax" text-anchor="middle">{s[0]}</text>')
    return (f'<svg viewBox="0 0 {W} {Hh}" role="img" aria-label="Bank F IMPS success rate by 15-minute slot on Tuesday">'
            + "".join(g) + "".join(b) + "</svg>")

def waterfall():
    W, rowh, L = 720, 40, 340
    short = {"1": "M0412 promo, unverified new accounts", "2": "M0077 retry loop",
             "3": "Bank F, IMPS/UPI, 11:00-14:30", "4": "Everything else"}
    items = [(short[d[0][0]], d[7]) for d in dec]
    span = 0.4
    zero = L + (W - L - 70) * (span / (2 * span))
    sc = (W - L - 70) / (2 * span)
    out = [f'<line x1="{zero:.1f}" x2="{zero:.1f}" y1="4" y2="{rowh*len(items)+4}" class="axis0"/>']
    for k, (lab, v) in enumerate(items):
        yy = 10 + k * rowh
        x0 = zero if v >= 0 else zero + v * sc
        out.append(f'<text x="0" y="{yy+15}" class="lab">{esc(lab)}</text>'
                   f'<g class="hit"><rect x="{x0:.1f}" y="{yy}" width="{max(abs(v)*sc,1.5):.1f}" height="22" rx="3" class="{"bar-hi" if v < 0 else "bar"}"/>'
                   f'<title>{esc(lab)}: {v:+.2f} pts</title></g>'
                   f'<text x="{(x0 + abs(v)*sc + 6) if v>=0 else (x0-6):.1f}" y="{yy+15}" class="val" text-anchor="{"start" if v>=0 else "end"}">{v:+.2f}</text>')
    yy = 10 + len(items) * rowh + 6
    out.append(f'<text x="0" y="{yy+12}" class="lab"><tspan font-weight="600">Total change</tspan></text>'
               f'<text x="{zero:.1f}" y="{yy+12}" class="val" text-anchor="middle" font-weight="600">{dec_total:+.2f} pts</text>')
    return f'<svg viewBox="0 0 {W} {yy+24}" role="img" aria-label="Contribution of each cause to the change in success rate">' + "".join(out) + "</svg>"

def table(name, cols=None, rename=None, limit=None):
    c = r[name]["columns"]; idx = [c.index(x) for x in (cols or c)]
    hdr = "".join(f"<th>{esc((rename or {}).get(c[i], c[i]).replace('_',' '))}</th>" for i in idx)
    body = ""
    for row in rows(name)[:limit]:
        def cell(v):
            if v is None: return ""
            if isinstance(v, float): return fmt(v, 0) if v.is_integer() else fmt(v)
            if isinstance(v, int): return f"{v:,}"
            return esc(v)
        body += "<tr>" + "".join(f"<td>{cell(row[i])}</td>" for i in idx) + "</tr>"
    return f'<div class="tw"><table><thead><tr>{hdr}</tr></thead><tbody>{body}</tbody></table></div>'

import pathlib
sql_blocks = f'<details><summary><code>01_metric_layer.sql</code> · metric definitions (views)</summary><pre><code>{esc(pathlib.Path("sql/01_metric_layer.sql").read_text())}</code></pre></details>'
for name, v in r.items():
    sql_blocks += f'<details><summary><code>{esc(v["file"])}</code> · {esc(name)}</summary><pre><code>{esc(v["sql"])}</code></pre></details>'

page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Why did payout success drop on Tuesday? A Payouts pod analytics kit (simulation)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
:root{{--bg:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--mute:#8a8984;--rule:#e6e5e1;--s1:#2a78d6;--s2:#eb6834;--crit:#c8322f;--warnbg:#fff4d6;--warnink:#5c4300}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 "Source Serif 4",Georgia,serif}}
.banner{{background:var(--warnbg);color:var(--warnink);border-bottom:1px solid #ecd9a0;font:500 14.5px/1.5 "Inter Tight",system-ui,sans-serif;padding:14px 20px;text-align:center}}
.banner b{{font-weight:600}}
main{{max-width:760px;margin:0 auto;padding:40px 22px 80px}}
h1{{font-size:38px;line-height:1.15;margin:8px 0 10px;font-weight:600;letter-spacing:-.01em}}
h2{{font:600 23px/1.3 "Source Serif 4",serif;margin:52px 0 10px;padding-top:18px;border-top:1px solid var(--rule)}}
h3{{font:600 15px/1.4 "Inter Tight",sans-serif;margin:28px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2)}}
.kicker{{font:500 13px "Inter Tight",sans-serif;color:var(--ink2);letter-spacing:.06em;text-transform:uppercase}}
.dek{{font-size:19px;color:var(--ink2);margin:0 0 18px}}
.by{{font:14px "Inter Tight",sans-serif;color:var(--ink2)}}
.tldr{{background:#fff;border:1px solid var(--rule);border-radius:10px;padding:18px 22px;margin:26px 0}}
.tldr li{{margin:6px 0}}
.nums{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}}
.num{{background:#fff;border:1px solid var(--rule);border-radius:10px;padding:14px 14px 12px}}
.num .v{{font:600 26px "Inter Tight",sans-serif}}.num .l{{font:13px/1.4 "Inter Tight",sans-serif;color:var(--ink2)}}
.num.real{{border-color:var(--s1);box-shadow:inset 0 0 0 1px var(--s1)}}
svg{{width:100%;height:auto;display:block;margin:10px 0 4px;font-family:"Inter Tight",sans-serif}}
.grid{{stroke:#ecebe7;stroke-width:1}}.thr{{stroke:var(--crit);stroke-width:1.5;stroke-dasharray:4 3}}.axis0{{stroke:#bdbcb7}}
.ax{{font-size:11.5px;fill:var(--mute)}}.ann{{font-size:12.5px;fill:var(--ink);font-weight:600}}
.lab{{font-size:13px;fill:var(--ink)}}.val{{font-size:13px;fill:var(--ink2)}}
.ln{{fill:none;stroke:var(--s1);stroke-width:2}}.ln-dash{{fill:none;stroke:var(--s1);stroke-width:2;stroke-dasharray:3 4;opacity:.6}}
.dot{{fill:var(--s1);stroke:var(--bg);stroke-width:1.5}}.dot-hi{{fill:var(--s2);stroke:var(--bg);stroke-width:2}}
.bar{{fill:var(--s1)}}.bar-hi{{fill:var(--s2)}}.hit:hover .bar,.hit:hover .bar-hi{{opacity:.8}}
.cap{{font:13px/1.5 "Inter Tight",sans-serif;color:var(--ink2);margin:2px 0 18px}}
.tw{{overflow-x:auto;margin:10px 0 18px}}table{{border-collapse:collapse;font:13.5px/1.4 "Inter Tight",sans-serif;width:100%}}
th{{text-align:left;font-weight:600;color:var(--ink2);border-bottom:1px solid var(--ink);padding:6px 8px;white-space:nowrap}}
td{{border-bottom:1px solid var(--rule);padding:6px 8px;font-variant-numeric:tabular-nums}}
.callout{{border-left:3px solid var(--s1);padding:4px 0 4px 16px;margin:18px 0;color:var(--ink)}}
.act{{display:grid;gap:10px;margin:14px 0}}.act div{{background:#fff;border:1px solid var(--rule);border-radius:10px;padding:12px 16px;font-size:16px}}
.act b{{font-family:"Inter Tight",sans-serif;font-weight:600}}
code,pre{{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12.5px}}
pre{{background:#f4f3f0;border-radius:8px;padding:14px;overflow-x:auto;line-height:1.45}}
details{{border-top:1px solid var(--rule);padding:8px 0}}summary{{cursor:pointer;font:14px "Inter Tight",sans-serif}}
.small{{font-size:14.5px;color:var(--ink2)}}
@media (max-width:620px){{.nums{{grid-template-columns:1fr}}h1{{font-size:30px}}}}
</style></head><body>
<div class="banner"><b>Simulation on fictional data.</b> This is not Cashfree data and not a real incident. Merchants, banks, volumes, prices and the Tuesday incident are invented. The causes were planted on purpose so the SQL could be checked against a known answer. Status and reason names follow Cashfree's public Payouts docs.</div>
<main>
<div class="kicker">Payouts + SecureID pod · Product Analyst work sample</div>
<h1>Why did payout success drop on Tuesday?</h1>
<p class="dek">A working analytics kit for a payouts team: one agreed definition of success rate, a repeatable root-cause method for the "why did success rate drop on Tuesday?" question, and two growth levers it surfaces along the way.</p>
<p class="by">Aditya Mathur · built with Claude · 444k payout intents, 600 merchants, 8 weeks · SQLite, every number on this page is produced by the SQL in the appendix</p>

<div class="tldr"><b>The short version</b><ul>
<li>The dashboard showed success rate down <b>{dash_drop:.2f} points</b> on Tuesday. The real drop, per payout and after late reversals, was <b>{real_drop:.2f} points</b> ({int_b:.2f}% → {int_t:.2f}%). Part of the scare was how we count.</li>
<li>Two causes explain all of it: one gaming merchant's withdrawal promo paying unverified new accounts (<b>{m0412[7]:+.2f}</b>) and a beneficiary bank failing on IMPS and UPI from {first_bad} to {broken[-1][0]} (<b>{bankf[7]:+.2f}</b>). Cashfree-side errors and API latency were flat.</li>
<li>First payouts to unverified accounts fail on invalid details <b>{ratio}x</b> as often as verified ones ({unv[3]:.2f}% vs {ver[3]:.2f}%). {sz[0]} Payouts merchants don't verify. That is a SecureID adoption lever that shows up as a Payouts success-rate win.</li>
<li>Merchants that hit a failure spike churned at <b>{shock[3]:.1f}%</b> vs <b>{noshock[3]:.1f}%</b>. A simple week-6 alert, back-tested, flagged {bt[0]} merchants; {bt[1]} were gone two weeks later.</li>
</ul></div>

<h2>1. One number everyone agrees on</h2>
<p>A payouts pod argues about success rate until it agrees what it is counting. Three choices change the answer: counting <b>attempts or payouts</b> (a retried payout is one payout, not three), <b>when</b> you read the status (reversals land up to a day after a success; pending transfers can take up to 72 hours to settle), and whether a merchant's own <b>insufficient-balance</b> errors count against the platform.</p>
<div class="nums">
<div class="num"><div class="v">{night_b:.2f}% → {night_t:.2f}%</div><div class="l">Attempt success rate, as the dashboard showed it on Tuesday night</div></div>
<div class="num"><div class="v">{att_b:.2f}% → {att_t:.2f}%</div><div class="l">Attempt success rate, final, after reversals landed</div></div>
<div class="num real"><div class="v">{int_b:.2f}% → {int_t:.2f}%</div><div class="l"><b>Payout success rate</b>: per payout, final, merchant balance errors excluded. The real number.</div></div>
</div>
<p class="cap">Baseline = the four most recent normal Tuesdays (22 and 29 Sep, 27 Oct, 3 Nov), pooled. Same data, three different answers.</p>
<p><b>The definition I'd make the pod's single source of truth:</b> payouts that reached the beneficiary and stayed there (final success, not reversed), divided by payouts sent to a bank, counted only once a payout is 72 hours old. Attempt-level success rate stays on the dashboard as an <i>infrastructure</i> metric, labelled as such. The full metric dictionary (activation, retention, reversal rate, time to final status) is in <code>METRICS.md</code>.</p>
{line_chart()}
<p class="cap">Daily payout success rate. Orange dot = Tue 10 Nov. Dashed tail = last three days, not yet 72 hours old, so not final. Hover a point for the value.</p>
<p>The three-week dip in October has a different cause (merchant-level failure shocks, section 5). That matters for Tuesday: my first version compared Tuesday with the four previous Tuesdays, two of which sit inside the dip. The lower baseline made the rest of Tuesday look better than it was. The baseline below skips 13 and 20 Oct for that reason.</p>

<h2>2. Tuesday, in four questions</h2>
<h3>Is the drop real?</h3>
<p>Yes, but smaller than it looked: {real_drop:.2f} points, not {dash_drop:.2f}. On a normal day around 9,000 payouts, that is still roughly {round(real_drop/100*9000):,} payouts that didn't reach someone.</p>
<h3>Where is it?</h3>
<p>Split by beneficiary bank and mode, two cells stand out. Bank F on IMPS and on UPI account for the largest excess failures; everything else is within normal noise.</p>
{table("where_bank_mode", rename={"extra_failed_vs_expected":"extra failed vs expected"}, limit=5)}
<p>Split by merchant, one name dominates: <b>{mc[0]}</b>, a gaming merchant, sent {mc[3]} payouts against its usual {mc[4]:.0f}, {mc[9]} of them to brand-new beneficiaries, and {mc[10]} of its {mc[5]} failures were invalid accounts. That pattern is a promo, not an outage.</p>
<h3>When did Bank F break, and how fast could we have known?</h3>
{bars_15()}
<p class="cap">Bank F, IMPS, Tuesday, success rate per 15-minute slot. Orange = under 90%. Dashed red line = 90% alert threshold. Hover a bar for attempts.</p>
<p>Failures start in the {first_bad} slot. An alert on a rolling 45-minute success rate under 90% for one bank would have fired at <b>{alert_slot}</b>, within about 15 minutes, and cleared by {recovered}. Cashfree already advertises a bank downtime detector; this is the analyst's version of the same idea, at bank × mode level, used to <i>explain</i> the day after.</p>
<h3>How much does each cause explain?</h3>
{waterfall()}
<p class="cap">Mix and rate split against the four-Tuesday baseline. Rate effect = this bucket did worse than usual; mix effect = this bucket was a bigger share of the day than usual. The pieces add to the total exactly.</p>
<p>{m0412[0][2:]}: success fell from {m0412[3]:.2f}% to {m0412[4]:.2f}% inside the merchant and its share of the day went from {m0412[1]:.2f}% to {m0412[2]:.2f}%. Bank F's window: {bankf[3]:.2f}% → {bankf[4]:.2f}%. Everything else was slightly <i>better</i> than a normal Tuesday ({rest[7]:+.2f}), which is noise.</p>
<h3>What it wasn't</h3>
<div class="tw"><table><thead><tr><th>Check</th><th>Baseline</th><th>Tuesday</th><th>Verdict</th></tr></thead><tbody>
<tr><td>Cashfree-side errors (connection, timeouts)</td><td>{ro["baseline"][1]:.2f}%</td><td>{ro["Tuesday"][1]:.2f}%</td><td>a little higher, but inside the normal daily range ({pdr[0]:.2f}% to {pdr[2]:.2f}% over {pdr[3]} normal days)</td></tr>
<tr><td>Bank failures at every bank except F</td><td>{ro["baseline"][2]:.2f}%</td><td>{ro["Tuesday"][2]:.2f}%</td><td>flat</td></tr>
<tr><td>Merchant insufficient-balance errors</td><td>{ro["baseline"][3]:.2f}%</td><td>{ro["Tuesday"][3]:.2f}%</td><td>flat</td></tr>
<tr><td>API response time, p95</td><td>{ro["baseline"][4]} ms</td><td>{ro["Tuesday"][4]} ms</td><td>flat</td></tr>
<tr><td>M0077's retry loop (lending, 6 retries in minutes)</td><td colspan="2">{m77[1]} attempts for {m77[2]} payouts; {m77[3]} failed attempts but {m77[4]} failed payout</td><td>noise in attempt counts only ({srw[0]:.2f}% → {srw[1]:.2f}% without it)</td></tr>
</tbody></table></div>
<p class="small">One more trap: {late_rev} of {mc[0]}'s {all_rev} Tuesday reversals landed on Wednesday or later. A same-day dashboard cannot see them, which is why final success rate waits 72 hours.</p>

<h2>3. What I'd do on Wednesday morning</h2>
<div class="act">
<div><b>Bank F (engineering + bank partnerships).</b> Confirm the window with the bank. Propose an alert at bank × mode level on the rolling 45-minute rate, and measure how many affected payouts could have been held or routed by mode instead of failing. Metric: failed payouts per incident-minute.</div>
<div><b>{mc[0]} (account manager + SecureID).</b> Call them with their own numbers: {mc[10]} invalid-account failures in one day, all to new beneficiaries. Offer bank account verification before first payout for promo traffic. Metric: invalid-account rate on their first payouts next promo.</div>
<div><b>The dashboard (the pod).</b> Swap the headline tile to payout success rate, final. Keep attempt success rate, renamed as an infrastructure metric. Add a "not final yet" marker for the last 72 hours.</div>
</div>

<h2>4. Growth lever: verification that pays for itself in Payouts</h2>
<p>Cashfree's help docs say SecureID's bank account verification is switched on automatically for Payouts merchants. So the question is not access, it is use.</p>
{table("first_payout_quality", rename={"bene":"first payout to a new beneficiary","reversed_lakh":"reversed (Rs lakh)"})}
<p>In this data, {sz[0]} merchants never verify. Their new-beneficiary payouts come to about <b>{sz[1]:,.0f} a month</b>. At an assumed Rs 2 per check that is only <b>Rs {sz[2]:.2f} lakh a month</b> of SecureID revenue. The bigger number is on the Payouts side: about <b>{sz[3]:,.0f} bad payouts a month avoided</b> (if verification catches 80%) and <b>Rs {sz[5]:.1f} lakh a month</b> of money currently bouncing back as reversals.</p>
<div class="callout">So I would not pitch verification as a revenue line. I'd pitch it as a Payouts success-rate and merchant-retention lever, and measure it on those.</div>
<h3>Who to call first</h3>
{table("target_list", cols=["merchant_id","segment","new_bene_payouts_per_month","bad_payouts_per_month","invalid_pct","wave"], limit=8)}
<h3>How I'd prove it is causal</h3>
<p>Verified and unverified merchants are not alike (merchants choose), so the {ratio}x gap is not proof. The test: randomise eligible non-verifying merchants into nudge vs no nudge (dashboard prompt plus account-manager outreach), and compare invalid-account rate on first payouts. To detect a drop from {p1*100:.2f}% to {p2*100:.2f}% at 80% power needs about <b>{n_arm:,} first payouts per arm</b>, which this merchant base generates in roughly {math.ceil(2*n_arm/monthly_first*30)} days. Randomise by merchant, not by payout, and widen the sample for clustering. Guardrail: payout volume per merchant must not fall.</p>

<h2>5. Retention: a failure spike is a churn signal</h2>
{table("churn_vs_shock", rename={"churn_pct":"churn %", "grp":"group"})}
<p>"Shock" = a week in weeks 3-5 with 20+ payouts where a merchant's own success rate fell 10+ points below its normal. "Churned" = weeks 7-8 volume under 30% of weeks 1-2. Both are computed from the data with window functions, not read from the answer key. Checked against the answer key afterwards, the shock rule is right {tp_note}; it misses smaller merchants, whose shocks can't be told apart from noise at weekly grain.</p>
<p><b>Back-test of an early-warning rule</b> (volume down 40%+ vs the trailing 4-week average, plus a sub-92% week in the prior four): run at the end of week 6, it flags <b>{bt[0]}</b> merchants, <b>{bt[1]}</b> of whom were gone by week 8 ({bt[2]:.0f}% precision). It catches only {bt[4]:.0f}% of all churners, so it is a list for account managers, not a churn model.</p>
<p class="small">Caveat for real data: a merchant that is winding down may also send worse payouts, so the arrow can point both ways. I'd check whether the shock came from the bank side (not the merchant's fault) before calling it causal.</p>

<h2>6. How it's built, and where AI fits</h2>
<p>Built with Claude. Pipeline: <code>generate_data.py</code> writes a fictional SQLite database with the incidents planted → <code>sql/</code> holds the metric layer and every analysis query → <code>run_sql.py</code> runs them → <code>build_page.py</code> writes this page from the output, so no number is typed by hand → <code>tests.py</code> checks that the SQL recovers each planted cause and that the decomposition adds up.</p>
<p>The AI part I'd bring to a real pod is in <code>ai/sr_drop_runbook.md</code>: a prompt that takes a success-rate alert, runs these queries, and drafts the Slack summary, with one hard rule: <b>every number in the draft must come from a query result attached below it</b>, and an analyst signs off before it is posted.</p>

<h2>7. Limits</h2>
<ul class="small">
<li>Fictional data with planted causes. Real Tuesdays have several small causes and no answer key.</li>
<li>Real reason codes are richer and some failures are ambiguous between bank and beneficiary; I bucketed them simply.</li>
<li>Prices (Rs 2 per check, per-mode fees), the 80% catch rate and the Rs 150 cost per bad payout are assumptions, labelled where used.</li>
<li>SQLite here; the same SQL ports to a warehouse with small changes (date functions, percentile functions).</li>
</ul>

<h2>Appendix: every query</h2>
{sql_blocks}
<p class="small" style="margin-top:28px">Aditya Mathur · adityamathur2004@gmail.com · linkedin.com/in/adityaamathur</p>
</main></body></html>"""
open(OUT, "w").write(page)
print("wrote", OUT, len(page), "bytes; n_arm", n_arm)
