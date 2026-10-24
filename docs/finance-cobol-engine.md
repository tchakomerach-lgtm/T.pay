# T.Pay COBOL finance engine

## Scope

The first COBOL slice is the deterministic commission calculation used by
`packages/finance/src/commission.ts`. Inputs and outputs are integer minor
currency units; no binary floating point is used. The current GnuCOBOL
contract supports amounts up to 18 decimal digits and rates from 0 to 10,000
basis points. Unsupported precision is rejected rather than truncated.

COBOL is not a payment authorization service, ledger database, provider adapter,
or settlement orchestrator. PostgreSQL remains the durable source of truth;
the existing TypeScript API, tenant checks, approval flow, idempotency controls,
and ledger posting remain in place.

## Build and test

Install GnuCOBOL (the CI job installs the Ubuntu `gnucobol` package), then run:

```sh
npm run test:cobol
npm run build:cobol
```

The production binary is written to `dist/cobol/tpay-commission`.

## Explicit activation

To route commission calculations through COBOL, configure both environment
variables in the server runtime:

- `TPAY_FINANCE_ENGINE=cobol`
- `TPAY_COBOL_FINANCE_BIN=/absolute/path/to/tpay-commission`

When COBOL mode is selected but the binary is missing, exits unsuccessfully,
or returns an invalid response, the calculation fails closed. It does not
silently switch to TypeScript. Without the explicit engine setting, the
existing TypeScript calculation remains active for compatibility.

## Production gate

Do not enable COBOL mode in production until the compiler and executable are
included in the actual deployment artifact, the COBOL smoke tests and TypeScript
checks pass on the exact release commit, and commission parity is verified for
the currencies/rules used by the institution. This initial slice intentionally
does not enable COBOL automatically on hosted environments.
