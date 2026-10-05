import test from "node:test";
import assert from "node:assert/strict";
import { assertRendererAccessibility } from "../apps/design/renderer-accessibility.js";

test("renderer accessibility baseline is valid", () => {
  assert.doesNotThrow(() => assertRendererAccessibility({
    pageLabel:"T.Pay Accueil", liveRegion:true, keyboardReachableControls:true,
    visibleFocus:true, minTouchTargetPx:44, statusUsesText:true,
  }));
});

test("renderer rejects color-only status and undersized controls", () => {
  assert.throws(() => assertRendererAccessibility({
    pageLabel:"T.Pay", liveRegion:true, keyboardReachableControls:true,
    visibleFocus:true, minTouchTargetPx:43, statusUsesText:true,
  }));
  assert.throws(() => assertRendererAccessibility({
    pageLabel:"T.Pay", liveRegion:true, keyboardReachableControls:true,
    visibleFocus:true, minTouchTargetPx:44, statusUsesText:false,
  }));
});
