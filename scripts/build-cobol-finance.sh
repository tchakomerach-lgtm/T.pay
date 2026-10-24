#!/usr/bin/env bash
set -euo pipefail
command -v cobc >/dev/null 2>&1 || { echo "cobc (GnuCOBOL) is required" >&2; exit 2; }
mkdir -p dist/cobol
cobc -x -free -Wall -o dist/cobol/tpay-commission cobol/finance-commission.cbl
chmod 0750 dist/cobol/tpay-commission
echo "Built dist/cobol/tpay-commission"
