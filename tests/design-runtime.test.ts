import test from "node:test";
import assert from "node:assert/strict";
import { tpayTokens } from "../apps/design/tokens.js";
import { assertRealtimeState } from "../apps/design/realtime.js";
import { assertContextStack } from "../apps/design/context.js";
import { assertActionContract } from "../apps/design/actions.js";
import { assertAccessibilityContract } from "../apps/design/accessibility.js";
import { assertShellModel } from "../apps/design/shell.js";
import { assertComponentState } from "../apps/design/component-state.js";

test("design tokens preserve the canonical T.Pay palette and motion limits", () => {
  assert.equal(tpayTokens.color.brand.emerald, "#0F8F68");
  assert.equal(tpayTokens.color.status.danger, "#D64545");
  assert.equal(tpayTokens.motion.complexMs, 500);
  assert.equal(tpayTokens.target.minTouchPx, 44);
});

test("realtime state rejects impossible offline/sync combinations", () => {
  assert.throws(() => assertRealtimeState({
    freshness: "offline", sync: "syncing", pendingChanges: 1, conflictCount: 0,
  }));
  assert.throws(() => assertRealtimeState({
    freshness: "fresh", sync: "conflict", pendingChanges: 0, conflictCount: 0,
  }));
});

test("context requires organization binding outside personal context", () => {
  assert.throws(() => assertContextStack({
    active: { kind: "organization", id: "org", label: "Org" },
    ancestors: [],
  }));
});

test("blocked actions require an actionable explanation", () => {
  assert.throws(() => assertActionContract({
    actionId: "a", verb: "payer", objectType: "payment", objectId: "p",
    contextId: "org", state: "blocked", consequential: true,
  }));
});

test("accessibility cannot depend on color alone", () => {
  assert.throws(() => assertAccessibilityContract({
    visibleLabel: "Synchronisation", statusText: "", statusIcon: "sync",
    keyboardReachable: true, focusVisible: true, touchTargetPx: 44, reducedMotionSafe: true,
  }));
  assert.throws(() => assertAccessibilityContract({
    visibleLabel: "Envoyer", statusText: "Prêt", statusIcon: "send",
    keyboardReachable: true, focusVisible: true, touchTargetPx: 40, reducedMotionSafe: true,
  }));
});


test("shell and component state remain fail-closed", () => {
  assert.doesNotThrow(() => assertShellModel({
    activeContextId: "personal",
    primaryDestination: "home",
    destinations: ["home","organizations","social","opportunities","community-tontine","wallet","notifications","search","command-center","settings"],
    unreadNotifications: 0, pendingActions: 0, connection: "online",
  }));
  assert.throws(() => assertComponentState({
    surface: "success", connectivity: "offline", authorization: "allowed", reducedMotion: false,
  }));
});
