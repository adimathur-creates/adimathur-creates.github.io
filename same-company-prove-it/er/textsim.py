"""Text normalisation and similarity helpers (no external libraries)."""
import re

# Legal forms, longest first so "private limited" wins over "limited".
LEGAL_FORMS = [
    ("private limited", "pvt_ltd"), ("pvt. ltd.", "pvt_ltd"), ("pvt ltd", "pvt_ltd"),
    ("pvt limited", "pvt_ltd"), ("p ltd", "pvt_ltd"), ("pte. ltd.", "pte_ltd"),
    ("pte ltd", "pte_ltd"), ("private ltd", "pvt_ltd"), ("public limited company", "plc"),
    ("plc", "plc"), ("limited", "ltd"), ("ltd.", "ltd"), ("ltd", "ltd"),
    ("incorporated", "inc"), ("inc.", "inc"), ("inc", "inc"), ("l.l.c.", "llc"),
    ("llc", "llc"), ("gmbh", "gmbh"), ("ag", "ag"), ("fze", "fze"), ("lp", "lp"),
]
HOLDING_WORDS = {"holdings", "group", "holding"}


def basic(s):
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[(),]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def split_legal_form(name):
    """Return (core name, canonical legal form or '')."""
    s = basic(name)
    for raw, canon in LEGAL_FORMS:
        if s.endswith(" " + raw) or s == raw:
            core = s[: len(s) - len(raw)].strip()
            return clean_core(core), canon
    return clean_core(s), ""


def clean_core(s):
    s = re.sub(r"[.\-'/]", " ", s)
    s = re.sub(r"\bthe\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def jaro(a, b):
    if a == b:
        return 1.0
    la, lb = len(a), len(b)
    if not la or not lb:
        return 0.0
    rng = max(la, lb) // 2 - 1
    am, bm = [False] * la, [False] * lb
    m = 0
    for i, ch in enumerate(a):
        lo, hi = max(0, i - rng), min(i + rng + 1, lb)
        for j in range(lo, hi):
            if not bm[j] and b[j] == ch:
                am[i] = bm[j] = True
                m += 1
                break
    if not m:
        return 0.0
    t, k = 0, 0
    for i in range(la):
        if am[i]:
            while not bm[k]:
                k += 1
            if a[i] != b[k]:
                t += 1
            k += 1
    return (m / la + m / lb + (m - t / 2) / m) / 3


def jaro_winkler(a, b, p=0.1):
    j = jaro(a, b)
    pre = 0
    for x, y in zip(a[:4], b[:4]):
        if x != y:
            break
        pre += 1
    return j + pre * p * (1 - j)


def token_jaccard(a, b):
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def soundish(token):
    """Crude phonetic key: first letter + consonant skeleton, vowels and repeats dropped."""
    if not token:
        return ""
    t = re.sub(r"[^a-z]", "", token.lower())
    if not t:
        return ""
    out = t[0]
    for ch in t[1:]:
        if ch in "aeiouyhw":
            continue
        if out[-1] != ch:
            out += ch
    return out[:4]
