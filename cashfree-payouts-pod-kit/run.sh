#!/usr/bin/env bash
# Rebuilds everything from scratch: data -> SQL -> tests -> page.
set -euo pipefail
cd "$(dirname "$0")"
python3 generate_data.py payouts.db
python3 run_sql.py payouts.db results.json > /dev/null
python3 tests.py payouts.db results.json
python3 build_page.py results.json index.html
