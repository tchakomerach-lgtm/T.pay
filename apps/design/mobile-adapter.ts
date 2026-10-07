import type { TPayUniversalObject } from "./objects.js";
import type { TPayActionContract } from "./actions.js";
import type { TPayFieldMode } from "./field-mode.js";
import { tpayTokens } from "./tokens.js";

export type TPayMobileSurface = "phone" | "tablet";

export type TPayMobileAdapterInput = Readonly<{
  surface: TPayMobileSurface;
  fieldMode: TPayFieldMode;
  object?: TPayUniversalObject;
  action?: TPayActionContract;
}>;

export type TPayMobileAdapterOutput = Readonly<{
  surface: TPayMobileSurface;
  fieldMode: TPayFieldMode;
  spacingScale: readonly number[];
  minTouchTargetPx: number;
  objectType?: string;
  actionId?: string;
}>;

/**
 * Semantic adapter only. Flutter/mobile renderers consume these contracts;
 * they never define a second token or action system.
 */
export function buildMobileAdapter(input: TPayMobileAdapterInput): TPayMobileAdapterOutput {
  return {
    surface: input.surface,
    fieldMode: input.fieldMode,
    spacingScale: tpayTokens.spacing.values,
    minTouchTargetPx: tpayTokens.target.minTouchPx,
    ...(input.object ? { objectType: input.object.objectType } : {}),
    ...(input.action ? { actionId: input.action.actionId } : {}),
  };
}
