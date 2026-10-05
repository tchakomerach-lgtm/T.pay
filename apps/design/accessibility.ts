export type TPayAccessibilityContract = Readonly<{
  visibleLabel: string;
  statusText: string;
  statusIcon: string;
  keyboardReachable: boolean;
  focusVisible: boolean;
  touchTargetPx: number;
  reducedMotionSafe: boolean;
}>;

export function assertAccessibilityContract(contract: TPayAccessibilityContract): void {
  if (!contract.visibleLabel || !contract.statusText || !contract.statusIcon) {
    throw new Error("Accessibility contract requires label, status text and status icon");
  }
  if (!contract.keyboardReachable || !contract.focusVisible) {
    throw new Error("Interactive controls must be keyboard reachable with visible focus");
  }
  if (contract.touchTargetPx < 44) throw new Error("Touch target is below T.Pay minimum");
}
