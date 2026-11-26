"""Fictional corporate-client universe with known ground truth.

Everything here is invented: company names, identifiers, cities' assignment,
sources and error rates. Identifier formats are fictional (prefix FX) and are
not real LEIs or registry numbers.
"""
import random
import string

COUNTRIES = {
    "IN": {"forms": ["Private Limited", "Limited"], "cities": ["Bengaluru", "Mumbai", "Pune", "Chennai", "Hyderabad"]},
    "US": {"forms": ["Inc.", "LLC"], "cities": ["New York", "Chicago", "Houston", "Columbus", "Jersey City"]},
    "GB": {"forms": ["Limited", "PLC"], "cities": ["London", "Leeds", "Glasgow", "Bristol"]},
    "SG": {"forms": ["Pte. Ltd."], "cities": ["Singapore"]},
    "DE": {"forms": ["GmbH", "AG"], "cities": ["Frankfurt", "Munich", "Hamburg"]},
    "AE": {"forms": ["LLC", "FZE"], "cities": ["Dubai", "Abu Dhabi"]},
}
TOK_A = ["Arvel", "Brisvane", "Caldra", "Dunmere", "Elvora", "Fennick", "Galtry", "Halvern", "Istara",
         "Jorvane", "Kestril", "Lumora", "Marvane", "Norvel", "Orvane", "Pellam", "Quorra", "Ravelle",
         "Sarnath", "Tavira", "Ulmera", "Veyra", "Wexmoor", "Yarlow", "Zentrel", "Aldane", "Bramora",
         "Corvell", "Delvane", "Estrel", "Fyrona", "Gorvane", "Hesta", "Ilvane", "Kavora", "Lorvane"]
TOK_B = ["Meridian", "Northgate", "Silverline", "Bluestone", "Riverbend", "Oakfield", "Ironvale",
         "Brightwater", "Stonebridge", "Redfern", "Clearpoint", "Highmoor", "Westbrook", "Eastlake",
         "Goldcrest", "Fairhaven", "Kingsway", "Larkspur", "Millbrook", "Pinecrest"]
SECTORS = [("Logistics", "4920"), ("Chemicals", "2011"), ("Software", "6201"), ("Foods", "1079"),
           ("Textiles", "1392"), ("Power", "3511"), ("Pharma", "2120"), ("Metals", "2410"),
           ("Shipping", "5020"), ("Retail", "4711"), ("Infra", "4290"), ("Finance", "6499")]
SOURCES_INTERNAL = ["KYC_ONBOARDING", "CREDIT", "MARKETS", "PAYMENTS"]


def fx_id(rng, prefix, n):
    return prefix + "".join(rng.choice(string.ascii_uppercase + string.digits) for _ in range(n))


def make_universe(seed=7, n_groups=420, n_sponsors=22):
    rng = random.Random(seed)
    entities = []
    used = set()

    def new_name(rng):
        while True:
            a, b = rng.choice(TOK_A), rng.choice(TOK_B)
            if (a, b) not in used:
                used.add((a, b))
                return a, b

    eid = 0

    def add(core, sector, country, parent=None, sponsor=None, kind="operating"):
        nonlocal eid
        eid += 1
        form = rng.choice(COUNTRIES[country]["forms"])
        e = {
            "entity_id": f"E{eid:05d}", "core": core, "sector": sector[0], "industry": sector[1],
            "country": country, "form": form, "name": f"{core} {form}",
            "city": rng.choice(COUNTRIES[country]["cities"]),
            "postcode": str(rng.randint(10000, 99999)),
            "lei": fx_id(rng, "FXL", 17), "reg_no": country + fx_id(rng, "", 8),
            "parent": parent, "sponsor": sponsor, "kind": kind,
            "old_name": None, "old_city": None,
        }
        entities.append(e)
        return e

    # Sponsors (private-equity style funds), each owning portfolio companies.
    sponsors = []
    for _ in range(n_sponsors):
        a, b = new_name(rng)
        s = add(f"{b} Capital Partners Fund {rng.choice(['II', 'III', 'IV'])}", ("Finance", "6430"),
                rng.choice(["US", "GB", "SG"]), kind="sponsor")
        s["form"] = "LP"
        s["name"] = s["core"] + " LP"
        sponsors.append(s)

    # Corporate groups: a holding parent plus subsidiaries that share the brand.
    for _ in range(n_groups):
        a, b = new_name(rng)
        brand = f"{a} {b}" if rng.random() < 0.6 else a + " " + rng.choice(TOK_B)
        home = rng.choice(list(COUNTRIES))
        n_subs = rng.choice([0, 0, 1, 1, 2, 3, 4])
        sponsor = rng.choice(sponsors)["entity_id"] if rng.random() < 0.18 else None
        if n_subs == 0:
            add(f"{brand} {rng.choice(SECTORS)[0]}", rng.choice(SECTORS), home, sponsor=sponsor)
            continue
        parent = add(f"{brand} Holdings", ("Finance", "6420"), home, sponsor=sponsor, kind="holding")
        sectors = rng.sample(SECTORS, k=min(n_subs, len(SECTORS)))
        for i in range(n_subs):
            # Traps: a sibling in the same country with the same brand, or the same
            # subsidiary name registered in two countries.
            country = home if rng.random() < 0.55 else rng.choice(list(COUNTRIES))
            sec = sectors[i]
            add(f"{brand} {sec[0]}", sec, country, parent=parent["entity_id"])
        if rng.random() < 0.25:
            sec = sectors[0]
            other = rng.choice([c for c in COUNTRIES if c != home])
            add(f"{brand} {sec[0]}", sec, other, parent=parent["entity_id"])

    # Corporate actions in the last year: renames and moves.
    for e in entities:
        if e["kind"] != "sponsor" and rng.random() < 0.08:
            e["old_name"] = e["name"]
            new_b = rng.choice(TOK_B)
            tail = "Holdings" if e["kind"] == "holding" else e["sector"]
            e["core"] = e["core"].split(" ")[0] + " " + new_b + " " + tail
            e["name"] = f"{e['core']} {e['form']}"
        if rng.random() < 0.15:
            e["old_city"] = e["city"]
            e["city"] = rng.choice(COUNTRIES[e["country"]]["cities"])
    return entities


# ---------- noise ----------
FORM_VARIANTS = {
    "Private Limited": ["Private Limited", "Pvt Ltd", "Pvt. Ltd.", "PRIVATE LIMITED", "P Ltd", "Pvt Limited"],
    "Limited": ["Limited", "Ltd", "Ltd.", "LIMITED"],
    "Inc.": ["Inc.", "Inc", "Incorporated", "INC"],
    "LLC": ["LLC", "L.L.C.", "llc"],
    "PLC": ["PLC", "plc", "Public Limited Company"],
    "Pte. Ltd.": ["Pte. Ltd.", "Pte Ltd", "PTE LTD"],
    "GmbH": ["GmbH", "GMBH"],
    "AG": ["AG"],
    "FZE": ["FZE"],
    "LP": ["LP", "L.P."],
}


def typo(rng, s):
    if len(s) < 6:
        return s
    i = rng.randint(1, len(s) - 3)
    op = rng.random()
    if op < 0.4:
        return s[:i] + s[i + 1] + s[i] + s[i + 2:]
    if op < 0.7:
        return s[:i] + s[i + 1:]
    return s[:i] + s[i] + s[i:]


def noisy_name(rng, core, form, p_typo=0.08, p_drop=0.06):
    words = core.split(" ")
    if len(words) >= 3 and rng.random() < p_drop and words[-1] not in ("Holdings",):
        words = words[:-1]  # sector word dropped
    if len(words) >= 2 and rng.random() < 0.05:
        words = [words[0] + "-" + words[1]] + words[2:]
    core_n = " ".join(words)
    if rng.random() < 0.05:
        core_n = core_n.replace(" and ", " & ")
    if rng.random() < p_typo:
        core_n = typo(rng, core_n)
    f = rng.choice(FORM_VARIANTS.get(form, [form]))
    s = f"{core_n} {f}"
    if rng.random() < 0.12:
        s = s.upper()
    if rng.random() < 0.04:
        s = "The " + s
    return s


SOURCE_PROFILES = {
    # fill rates and error rates (all invented)
    "KYC_ONBOARDING": dict(p_in=0.80, lei=0.70, reg=0.85, stale_name=0.55, stale_city=0.25, industry_err=0.10, parent=0.0, typo=0.05, dup=0.04),
    "CREDIT":         dict(p_in=0.55, lei=0.55, reg=0.50, stale_name=0.70, stale_city=0.50, industry_err=0.18, parent=0.0, typo=0.10, dup=0.05),
    "MARKETS":        dict(p_in=0.40, lei=0.80, reg=0.20, stale_name=0.60, stale_city=0.55, industry_err=0.20, parent=0.0, typo=0.08, dup=0.03),
    "PAYMENTS":       dict(p_in=0.50, lei=0.25, reg=0.40, stale_name=0.65, stale_city=0.40, industry_err=0.15, parent=0.0, typo=0.12, dup=0.08),
    "VENDOR_A":       dict(p_in=0.72, lei=0.96, reg=0.92, stale_name=0.04, stale_city=0.80, industry_err=0.08, parent=0.78, parent_err=0.01, typo=0.01, dup=0.0, junk=0.03),
    "VENDOR_B":       dict(p_in=0.93, lei=0.60, reg=0.70, stale_name=0.35, stale_city=0.45, industry_err=0.12, parent=0.92, parent_err=0.09, typo=0.04, dup=0.01, junk=0.10),
}


PREFIX = {"KYC_ONBOARDING": "KYC", "CREDIT": "CRD", "MARKETS": "MKT", "PAYMENTS": "PAY",
          "VENDOR_A": "VNA", "VENDOR_B": "VNB"}


def vendor_key(src, truth):
    """A vendor's own permanent ID for the company it describes (fictional)."""
    import zlib
    return f"{PREFIX[src]}#{zlib.crc32((src + truth).encode()) % 10**8:08d}"


def make_records(entities, seed=11, vendor_b_seed=None, sources=None, id_offset=0):
    rng = random.Random(seed)
    by_id = {e["entity_id"]: e for e in entities}
    recs = []
    sources = sources or list(SOURCE_PROFILES)
    for src in sources:
        prof = SOURCE_PROFILES[src]
        r2 = random.Random(vendor_b_seed) if (src == "VENDOR_B" and vendor_b_seed is not None) else rng
        n = 0
        for e in entities:
            p_in = prof["p_in"] if src.startswith("VENDOR") else prof["p_in"] * (1.0 if e["kind"] != "holding" else 0.7)
            if r2.random() >= p_in:
                continue
            copies = 2 if r2.random() < prof["dup"] else 1
            for _ in range(copies):
                n += 1
                if src == "VENDOR_A":
                    yr, mo = r2.choice([2024, 2025, 2025]), r2.randint(1, 12)
                elif src == "VENDOR_B":
                    yr, mo = r2.choice([2025, 2026, 2026]), r2.randint(1, 10)
                else:
                    yr, mo = 2026, r2.randint(1, 11)
                as_of = f"{yr}-{mo:02d}-{r2.randint(1, 28):02d}"
                age = (2026 - yr) * 12 + (11 - mo)          # months before Nov 2026
                stale_mult = 0.35 if age <= 4 else (1.0 if age <= 10 else 1.6)
                use_old = e["old_name"] and r2.random() < min(0.95, prof["stale_name"] * stale_mult)
                if use_old:
                    # old_name is "<core> <form>"; split form back off
                    core_old = e["old_name"][: -len(e["form"]) - 1]
                    name = noisy_name(r2, core_old, e["form"], p_typo=prof["typo"])
                else:
                    name = noisy_name(r2, e["core"], e["form"], p_typo=prof["typo"])
                lei = e["lei"] if r2.random() < prof["lei"] else ""
                if lei and r2.random() < 0.012:
                    # wrong identifier copied from a sibling or a random entity
                    sib = [x for x in entities if x["parent"] and x["parent"] == e["parent"] and x is not e]
                    lei = (r2.choice(sib) if sib else r2.choice(entities))["lei"]
                reg = e["reg_no"] if r2.random() < prof["reg"] else ""
                if reg and r2.random() < 0.01:
                    reg = typo(r2, reg)
                city = e["old_city"] if (e["old_city"] and r2.random() < min(0.95, prof["stale_city"] * stale_mult)) else e["city"]
                industry = e["industry"] if r2.random() >= prof["industry_err"] else r2.choice(SECTORS)[1]
                parent_lei = ""
                if prof["parent"] and e["parent"] and r2.random() < prof["parent"]:
                    p = by_id[e["parent"]]
                    if r2.random() < prof.get("parent_err", 0):
                        p = r2.choice([x for x in entities if x["kind"] == "holding"])
                    parent_lei = p["lei"]
                recs.append({
                    "rec_id": f"{PREFIX[src]}-{id_offset+len(recs)+1:05d}", "source": src, "name": name,
                    "country": e["country"], "city": city, "postcode": e["postcode"] if r2.random() > 0.1 else "",
                    "lei": lei, "reg_no": reg, "industry": industry, "parent_lei": parent_lei,
                    "as_of": as_of,
                    "key": vendor_key(src, e["entity_id"]) if src.startswith("VENDOR") else None,
                    "_truth": e["entity_id"],
                })
        # junk: vendor rows for companies outside the client universe
        if prof.get("junk"):
            for _ in range(int(len(entities) * prof["junk"])):
                c = rng.choice(list(COUNTRIES))
                core = f"{rng.choice(TOK_A)}{rng.choice(['ex', 'an', 'or'])} {rng.choice(TOK_B)} {rng.choice(SECTORS)[0]}"
                form = rng.choice(COUNTRIES[c]["forms"])
                recs.append({
                    "rec_id": f"{PREFIX[src]}-{id_offset+len(recs)+1:05d}", "source": src, "name": f"{core} {form}",
                    "country": c, "city": rng.choice(COUNTRIES[c]["cities"]), "postcode": str(rng.randint(10000, 99999)),
                    "lei": fx_id(rng, "FXL", 17), "reg_no": c + fx_id(rng, "", 8), "industry": rng.choice(SECTORS)[1],
                    "parent_lei": "", "as_of": "2026-10-01", "key": None, "_truth": "OUT_OF_SCOPE-" + str(id_offset + len(recs)),
                })
    return recs
