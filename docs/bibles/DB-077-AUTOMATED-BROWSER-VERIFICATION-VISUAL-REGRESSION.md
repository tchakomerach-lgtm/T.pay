# DB-077 — Automated Browser Verification & Visual Regression Runtime

## Status
IMPLEMENTED ON CONSTRUCTION BRANCH / VERIFICATION GATED.

DB-077 adds a real Playwright browser verification surface on top of DB-075/076 and introduces the mobile adapter contract without forking the Design System.

## Architecture

```
DB-073/074 semantic contracts
        ↓
DB-075 React renderer
        ↓
DB-076 field/runtime safeguards
        ↓
DB-077 browser verification
   ├─ production browser smoke
   ├─ keyboard/focus/live-region checks
   ├─ responsive viewport matrix
   ├─ offline/reconnect simulation
   ├─ deterministic screenshot artifacts
   ├─ layout/geometry visual contract
   └─ mobile semantic adapter
        ↓
Future Flutter renderer
```

## Browser matrix

- Chromium desktop: 1440×900
- Chromium tablet: 768×1024
- Chromium mobile: 393×851

The matrix is intentionally small enough for every PR while covering the principal renderer modes.

## Accessibility verification

The browser gate verifies:
- named navigation;
- keyboard focus;
- visible focus target;
- text status;
- live-region semantics;
- mobile usability.

This is browser-level verification on top of the executable contracts from DB-076.

## Offline/reconnect verification

The browser context can simulate network loss. The renderer must:
- expose “Hors ligne”;
- preserve the current surface;
- never claim server-authoritative success while disconnected;
- return to “En ligne” after reconnection.

## Visual verification

DB-077 creates deterministic screenshots as CI artifacts and verifies core geometry:
- no horizontal overflow;
- non-empty screenshot;
- stable primary object dimensions;
- body remains renderable.

### Golden-pixel gate

A true pixel-diff baseline is deliberately not fabricated. The repository must not receive invented screenshot binaries or hashes that were not produced by the actual renderer.

The next certification action is:
1. run the browser suite on a trusted environment;
2. capture approved desktop/tablet/mobile baselines;
3. commit only reviewed golden images;
4. switch the visual test to `toHaveScreenshot` against those baselines;
5. require zero unexplained pixel drift.

Until that happens, DB-077 is **not** pixel-regression-certified.

## Mobile preparation

`apps/design/mobile-adapter.ts` maps mobile surfaces to the same:
- token registry;
- spacing scale;
- touch target contract;
- universal object identity;
- universal action identity;
- field mode.

No Flutter-specific visual token is introduced.

## CI

CI must install the Playwright Chromium dependency and execute:
- existing TypeScript/domain checks;
- web production build;
- browser verification matrix;
- report/artifact upload on failure.

The browser job is separate from the domain job so a renderer failure is visible as a renderer failure rather than hidden inside generic typecheck output.

## Security boundary

Browser verification does not become authorization. Tests must never encode fake client-side permission grants. Renderer state remains presentation-only.

## Performance gate

DB-077 verifies renderability at constrained viewports. Low-end Android CPU/memory/thermal certification remains a later field evidence gate and must be measured on real hardware.

## Completion criteria

DB-077 is not production-ready until:
- exact-head CI is green;
- browser suite has executed on the exact head;
- screenshot artifacts are reviewed;
- approved golden baselines exist and are compared automatically;
- accessibility and responsive checks pass;
- offline/reconnect checks pass;
- mobile adapter contract tests pass;
- security review and low-end field evidence are recorded.
