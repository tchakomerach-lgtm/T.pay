# DB-078 — GSAP motion integration

Status: implementation branch; production certification pending CI and device evidence.
Date: 2026-10-17
Branch: `construction/db-078-gsap-motion`

## Scope
- Add GSAP 3.15 as a production dependency with no additional runtime dependency.
- Apply one restrained entrance sequence to the existing React School OS command center.
- Load GSAP as a separate dynamic chunk only when motion is allowed.
- Revert GSAP context on unmount and tolerate import failure without breaking the interface.
- Respect `prefers-reduced-motion`, Save-Data, device memory <= 2 GB, and <= 2 logical CPU cores.
- Add accessible names/labels to the workspace grid, live stream panel, and status region.
- Keep live event updates unanimated; no animation is allowed to imply a payment, authorization, or workflow result.
- Do not add Three.js: no current 3D product requirement justifies its runtime cost.

## Design constraints
Existing Design Bible tokens remain authoritative. This change introduces no colors, timing tokens, components, or competing design system. The only entrance duration is 260 ms, matching the existing standard motion token.

## Validation required
1. `npm run check`
2. `npm run security:fortress`
3. `npm run web:build`
4. GitHub Actions on the exact PR head SHA.
5. Browser reduced-motion/data-saver checks and a real low-end Android device run.
6. Verify animation cleanup after unmount and that the static UI remains functional if GSAP fails to load.

## Rollback
Revert this PR or remove the GSAP dependency and the `motion-policy.ts` import/effect. No database, API, or financial state is changed.

## CI observation — exact head b86ee1e0310e0778158982339441643423632957
GitHub Actions created PR-triggered runs for both `T.Pay CI` (run 39011627155) and `T.Pay Android` (run 39011627144). Both failed immediately with `runner_id: 0`, empty `steps`, no runner name, and no downloadable logs. Reruns of both workflows reproduced the same infrastructure failure. An earlier exact head also showed the same failure pattern. Therefore no source compilation, unit test, security check, web build, or Android test is evidenced by these runs. The current blocker is Actions runner assignment/availability; do not infer a code failure or code success from an empty job.
## Evidence boundary
A source commit is not a passing build. This record does not certify CI, pixel baselines, Android performance, or production readiness.
