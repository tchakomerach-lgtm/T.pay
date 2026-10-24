import { execFileSync } from "node:child_process";

const MAX_COBOL_MINOR = 999_999_999_999_999_999n;

export interface CobolCommissionInput {
  baseMinor: bigint;
  rateBps: number;
  minMinor?: bigint;
  maxMinor?: bigint;
}

/**
 * Calls the compiled COBOL fixed-point engine. The caller must opt in by
 * selecting TPAY_FINANCE_ENGINE=cobol; this adapter never silently falls back.
 * Amounts are minor currency units and are never converted through floating point.
 */
export function calculateCommissionWithCobol(input: CobolCommissionInput): bigint {
  const executable = process.env.TPAY_COBOL_FINANCE_BIN;
  if (!executable) throw new Error("COBOL_FINANCE_BINARY_NOT_CONFIGURED");
  if (input.baseMinor < 0n || input.baseMinor > MAX_COBOL_MINOR) {
    throw new Error("COBOL_FINANCE_AMOUNT_OUT_OF_RANGE");
  }
  if (!Number.isInteger(input.rateBps) || input.rateBps < 0 || input.rateBps > 10000) {
    throw new Error("INVALID_COMMISSION_RATE");
  }
  const min = input.minMinor ?? 0n;
  const max = input.maxMinor ?? MAX_COBOL_MINOR;
  if (min < 0n || max < 0n || min > MAX_COBOL_MINOR || max > MAX_COBOL_MINOR) {
    throw new Error("COBOL_FINANCE_AMOUNT_OUT_OF_RANGE");
  }
  if (max < min) throw new Error("INVALID_COMMISSION_BOUNDS");

  const pad = (value: bigint, width: number) => value.toString().padStart(width, "0");
  const request = [
    "CALC",
    pad(input.baseMinor, 18),
    pad(BigInt(input.rateBps), 5),
    pad(min, 18),
    pad(max, 18)
  ].join("|") + "\n";

  let output: string;
  try {
    output = execFileSync(executable, [], {
      input: request,
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    throw new Error("COBOL_FINANCE_ENGINE_FAILED");
  }
  if (!/^\d{18}$/.test(output)) throw new Error("COBOL_FINANCE_INVALID_RESPONSE");
  return BigInt(output);
}
