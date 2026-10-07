# Super Admin production gate matrix

| Gate | Repository control | External certification still required |
|---|---|---|
| WebAuthn step-up | challenge persistence, context binding, ES256/Ed25519 assertion verification, session promotion | real registered passkeys + browser/device certification |
| PAM/JIT | atomic one-shot consumption, privileged session, termination | production session broker connectors and command/JEA enforcement |
| Root quorum | 3 actors, 3 domains, signed digests, replay uniqueness | HSM/KMS signing + hardware attestation |
| Recovery | ordered planes, atomic transitions, checkpoints, backup manifest | independent clean-room environment and restore drill |
| Immutable backup | encrypted + restore-tested manifest contract | actual immutable/WORM/offline storage certification |
| Red team | adversarial unit matrix + evidence tables | independent penetration/red-team execution |
| CI | exact commit workflow tracking | GitHub Actions green run |

A gate is not marked production-ready merely because its software contract exists. Provider-backed and operational controls require evidence from the real deployment environment.
