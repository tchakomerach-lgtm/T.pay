import test from "node:test";
import assert from "node:assert/strict";
import { buildMobileAdapter } from "../apps/design/mobile-adapter.js";

test("mobile adapter reuses the canonical Design Registry", () => {
  const model = buildMobileAdapter({ surface: "phone", fieldMode: "offline" });
  assert.deepEqual(model.spacingScale, [4, 8, 12, 16, 24, 32, 48]);
  assert.equal(model.minTouchTargetPx, 44);
});

test("mobile adapter carries semantic object/action identity without redefining them", () => {
  const model = buildMobileAdapter({
    surface: "tablet",
    fieldMode: "standard",
    object: {
      objectType: "payment",
      objectId: "p-1",
      contextId: "personal",
      title: "Paiement",
      status: "pending",
      sensitivity: "public",
      freshness: "fresh",
      sync: "synced",
      version: 1,
      availableActions: ["view"],
    },
    action: {
      actionId: "a-1",
      verb: "view",
      objectType: "payment",
      objectId: "p-1",
      contextId: "personal",
      state: "idle",
      consequential: false,
    },
  });
  assert.equal(model.objectType, "payment");
  assert.equal(model.actionId, "a-1");
});
