#!/usr/bin/env bash
set -euo pipefail
command -v cobc >/dev/null 2>&1 || { echo "cobc (GnuCOBOL) is required" >&2; exit 2; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cobc -x -free -Wall -o "$tmp/tpay-commission" cobol/finance-commission.cbl
run() { printf '%s\n' "$1" | "$tmp/tpay-commission"; }
[[ "$(run 'CALC|000000000000010000|01000|000000000000000000|999999999999999999')" == "000000000000001000" ]]
[[ "$(run 'CALC|000000000000010001|02500|000000000000000000|999999999999999999')" == "000000000000002500" ]]
[[ "$(run 'CALC|000000000000000001|00001|000000000000000000|999999999999999999')" == "000000000000000000" ]]
if run 'CALC|000000000000010000|10001|000000000000000000|999999999999999999' >/dev/null 2>&1; then
  echo "invalid rate unexpectedly accepted" >&2; exit 1
fi
if run 'CALC|000000000000010000|01000|000000000000000500|000000000000000100' >/dev/null 2>&1; then
  echo "invalid bounds unexpectedly accepted" >&2; exit 1
fi
echo "COBOL finance commission smoke tests passed"
