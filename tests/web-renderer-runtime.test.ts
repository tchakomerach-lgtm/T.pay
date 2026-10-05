import test from "node:test";
import assert from "node:assert/strict";
import { buildTpayCssVariables } from "../apps/web-renderer/adapter.js";
import { deriveDensity, deriveViewport } from "../apps/design/renderer-quality.js";

test("renderer CSS variables are derived from canonical tokens", () => {
  const vars = buildTpayCssVariables();
  assert.equal(vars["--tpay-color-brand"], "#0F8F68");
  assert.equal(vars["--tpay-touch-min"], "44px");
  assert.equal(vars["--tpay-motion-standard"], "260ms");
});

test("field mode remains compact on constrained surfaces", () => {
  assert.equal(deriveDensity(deriveViewport(390), "low-bandwidth"), "compact");
  assert.equal(deriveDensity("tablet", "offline"), "compact");
});

test("desktop standard mode preserves comfortable density", () => {
  assert.equal(deriveDensity("desktop", "standard"), "comfortable");
});
