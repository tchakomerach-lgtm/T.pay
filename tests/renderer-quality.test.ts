import test from "node:test";
import assert from "node:assert/strict";
import { assertRendererRuntime, deriveViewport, deriveDensity, assertComponentStateCompatibility } from "../apps/design/renderer-quality.js";

test("viewport boundaries are deterministic", () => {
  assert.equal(deriveViewport(320), "mobile");
  assert.equal(deriveViewport(639), "mobile");
  assert.equal(deriveViewport(640), "tablet");
  assert.equal(deriveViewport(1023), "tablet");
  assert.equal(deriveViewport(1024), "desktop");
});

test("invalid viewport dimensions fail closed", () => {
  assert.throws(() => deriveViewport(0));
  assert.throws(() => deriveViewport(Number.NaN));
});

test("field and mobile surfaces use compact density", () => {
  assert.equal(deriveDensity("mobile", "standard"), "compact");
  assert.equal(deriveDensity("desktop", "low-bandwidth"), "compact");
  assert.equal(deriveDensity("desktop", "standard"), "comfortable");
});

test("offline cannot claim a remote loading state", () => {
  assert.throws(() => assertRendererRuntime({
    connection:"offline", load:"loading", density:"compact", viewport:"mobile",
    reducedMotion:true, queuedActions:0, conflicts:0,
  }));
});

test("reduced-motion is enforced at the runtime boundary", () => {
  assert.throws(() => assertComponentStateCompatibility({
    surface:"default", connectivity:"online", authorization:"allowed", reducedMotion:false,
  }, {
    connection:"online", load:"ready", density:"comfortable", viewport:"desktop",
    reducedMotion:true, queuedActions:0, conflicts:0,
  }));
});
