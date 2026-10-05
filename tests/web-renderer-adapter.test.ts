import test from "node:test";
import assert from "node:assert/strict";
import { buildTpayCssVariables } from "../apps/web-renderer/adapter.js";
import { tpayTokens } from "../apps/design/tokens.js";

test("React renderer derives CSS variables from the canonical Design Registry", () => {
  const variables = buildTpayCssVariables();
  assert.equal(variables["--tpay-color-brand"], tpayTokens.color.brand.emerald);
  assert.equal(variables["--tpay-color-success"], tpayTokens.color.status.success);
  assert.equal(variables["--tpay-touch-min"], "44px");
  assert.equal(variables["--tpay-motion-standard"], "260ms");
});
