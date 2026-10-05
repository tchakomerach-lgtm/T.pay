import { tpayTokens } from "../design/tokens.js";

export type TPayCssVariables = Readonly<Record<`--tpay-${string}`, string>>;

export function buildTpayCssVariables(): TPayCssVariables {
  return {
    "--tpay-color-brand": tpayTokens.color.brand.emerald,
    "--tpay-color-mint": tpayTokens.color.brand.mint,
    "--tpay-color-graphite": tpayTokens.color.brand.graphite,
    "--tpay-color-surface": tpayTokens.color.surface.surface,
    "--tpay-color-cloud": tpayTokens.color.surface.cloud,
    "--tpay-color-line": tpayTokens.color.surface.line,
    "--tpay-color-success": tpayTokens.color.status.success,
    "--tpay-color-warning": tpayTokens.color.status.warning,
    "--tpay-color-danger": tpayTokens.color.status.danger,
    "--tpay-color-info": tpayTokens.color.status.info,
    "--tpay-motion-standard": `${tpayTokens.motion.standardMs}ms`,
    "--tpay-motion-emphasis": `${tpayTokens.motion.emphasisMs}ms`,
    "--tpay-radius-md": `${tpayTokens.shape.radiusMd}px`,
    "--tpay-radius-lg": `${tpayTokens.shape.radiusLg}px`,
    "--tpay-touch-min": `${tpayTokens.target.minTouchPx}px`,
  };
}
