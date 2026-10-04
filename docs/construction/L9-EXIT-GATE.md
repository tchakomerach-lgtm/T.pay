# Layer 9 exit gate

L9 construction now covers durable field collection, cash reconciliation, progressive KYC/credit eligibility, partner settlement, school-finance orchestration, repayment/recovery, Financial Core settlement, school recovery settlement, provider callback verification, durable KYC verification evidence and recovery outbox events.

Hard exit gates:
1. every L9 construction head has exact-head CI success;
2. PostgreSQL concurrency tests prove tenant isolation and duplicate idempotency under race;
3. provider-specific TMoney/Flooz/PI-SPI/MFI adapters pass contract suites;
4. KYC/underwriting/settlement/recovery are wired to production repositories and handlers;
5. operational dashboards, alerts, notifications and offline reconciliation UI are implemented;
6. licensed partner/regulatory activation is verified before live financial rails.

No source code can manufacture regulatory authorization, provider credentials or live certification. Those are external activation gates.