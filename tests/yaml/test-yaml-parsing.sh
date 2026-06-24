#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export SCRIPT_DIR

python3 - <<'PYEOF'
import yaml, sys, os

SCRIPT_DIR = os.environ.get('SCRIPT_DIR', '.')
FIXTURES = os.path.join(SCRIPT_DIR, 'fixtures')

PASS = 0
FAIL = 0

def check(condition, msg):
    global PASS, FAIL
    if condition:
        print(f"PASS: {msg}")
        PASS += 1
    else:
        print(f"FAIL: {msg}")
        FAIL += 1

def no_spurious_quotes(val):
    s = str(val)
    return not (s.startswith('"') and s.endswith('"')) and \
           not (s.startswith("'") and s.endswith("'"))

with open(os.path.join(FIXTURES, 'staging.yml')) as f:
    staging = yaml.safe_load(f)

check(staging['YAML_QUOTED_STRING'] == '5432',
      "YAML-quoted '\"5432\"' parses to string '5432' (no surrounding quotes)")
check(no_spurious_quotes(staging['YAML_QUOTED_STRING']),
      "YAML_QUOTED_STRING has no spurious quote characters")

check(staging['BARE_INTEGER'] == 12345,
      "Bare integer 12345 parses as int 12345")
check(str(staging['BARE_INTEGER']) == '12345',
      "str(12345) == '12345' (no quotes when stringified for Vercel)")

check(staging['QUOTED_BOOLEAN_LIKE'] == 'true',
      "YAML-quoted '\"true\"' parses to string 'true', not bool")

check(staging['BARE_BOOLEAN'] == True,
      "Bare YAML boolean 'true' parses as Python bool True")
check(str(staging['BARE_BOOLEAN']).lower() == 'true',
      "str(True).lower() == 'true' (lowercased for Vercel, not 'True')")

check(staging['PLAIN_STRING'] == 'hello-world',
      "Plain string parses correctly")

check(staging['EMPTY_VALUE'] == '',
      "Empty YAML value is empty string")

for key, val in staging.items():
    check(no_spurious_quotes(val),
          f"staging.{key} = {val!r} has no spurious quote wrapping")

with open(os.path.join(FIXTURES, 'production.yml')) as f:
    production = yaml.safe_load(f)

for key, val in production.items():
    check(no_spurious_quotes(val),
          f"production.{key} = {val!r} has no spurious quote wrapping")

print(f"\n{PASS}/{PASS+FAIL} tests passed")
if FAIL > 0:
    sys.exit(1)
PYEOF
