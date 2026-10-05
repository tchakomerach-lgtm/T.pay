export type TPayRendererAccessibility = Readonly<{
  pageLabel: string;
  liveRegion: boolean;
  keyboardReachableControls: boolean;
  visibleFocus: boolean;
  minTouchTargetPx: number;
  statusUsesText: boolean;
}>;

export function assertRendererAccessibility(model: TPayRendererAccessibility): void {
  if (!model.pageLabel.trim()) throw new Error("Renderer surface requires a page label");
  if (!model.liveRegion) throw new Error("Dynamic status requires a live region");
  if (!model.keyboardReachableControls) throw new Error("Interactive controls must be keyboard reachable");
  if (!model.visibleFocus) throw new Error("Keyboard focus must remain visible");
  if (model.minTouchTargetPx < 44) throw new Error("Interactive targets must be at least 44px");
  if (!model.statusUsesText) throw new Error("Status cannot rely on color alone");
}
