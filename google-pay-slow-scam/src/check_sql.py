"""Run sql/metrics.sql block by block in DuckDB, save the output, and fail if the engine/SQL check fails.
Usage (from the project folder): python3 src/check_sql.py"""
import re, sys, json, duckdb
sql = open('sql/metrics.sql').read()
blocks = re.split(r'^-- name: (\w+)\s*$', sql, flags=re.M)[1:]
con = duckdb.connect()
out = []
results = {}
for name, body in zip(blocks[::2], blocks[1::2]):
    rel = con.sql(body)
    if rel is not None:
        df = rel.df()
        out.append(f'== {name} ==\n{df.to_string(index=False)}\n')
        results[name] = json.loads(df.to_json(orient='records'))
        if name == 'check_velocity':
            mism = int(df['mismatches'][0]); checked = int(df['payments_checked'][0])
open('sql/output.txt', 'w').write('\n'.join(out))
json.dump(results, open('sql/output.json', 'w'), indent=1)
print('\n'.join(out))
if mism != 0 or checked == 0:
    sys.exit(f'FAIL: {mism} of {checked} velocity values differ between engine and SQL')
print(f'OK: engine and SQL agree on all {checked} velocity values')
