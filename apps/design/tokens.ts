export const TPAY_DESIGN_VERSION = "2026.10";

export const tpayTokens = {
  color: {
    brand: { emerald: "#0F8F68", mint: "#35C99A", graphite: "#17212B" },
    surface: { cloud: "#F6F8FA", surface: "#FFFFFF", line: "#DDE3E8" },
    status: { success: "#0F9D6E", warning: "#D99A00", danger: "#D64545", info: "#2878D7", critical: "#A52828" },
    semantic: { ai: "#7357C8", security: "#3346A8", finance: "#087F8C" },
  },
  motion: {
    instantMs: 80,
    microMs: 160,
    standardMs: 260,
    emphasisMs: 360,
    complexMs: 500,
    drawerMs: 240,
  },
  shape: { radiusSm: 6, radiusMd: 10, radiusLg: 16, radiusXl: 24 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  target: { minTouchPx: 44 },
} as const;

export type TPayDesignTokenRegistry = typeof tpayTokens;
