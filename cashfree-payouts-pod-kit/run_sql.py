"""Runs every SQL file in sql/ against the database and writes results.json.
Queries inside a file are separated by a line '-- name: <query_name>'.
Usage: python3 run_sql.py payouts.db results.json
"""
import sqlite3, json, re, sys, pathlib

def split_named(text):
    parts = re.split(r"^-- name: (\w+)\s*$", text, flags=re.M)
    head, rest = parts[0], parts[1:]
    return head, list(zip(rest[0::2], rest[1::2]))

def main(db, out):
    con = sqlite3.connect(db)
    results = {}
    for f in sorted(pathlib.Path(__file__).parent.joinpath("sql").glob("*.sql")):
        head, named = split_named(f.read_text())
        if not named:
            con.executescript(head)
            continue
        for name, q in named:
            cur = con.execute(q)
            cols = [c[0] for c in cur.description]
            results[name] = {"file": f.name, "columns": cols, "rows": cur.fetchall(), "sql": q.strip()}
    json.dump(results, open(out, "w"), indent=1, default=str)
    return results

if __name__ == "__main__":
    r = main(sys.argv[1], sys.argv[2])
    for k, v in r.items():
        print(f"\n== {k} ({v['file']})")
        print(" | ".join(v["columns"]))
        for row in v["rows"][:12]:
            print(" | ".join(str(x) for x in row))
