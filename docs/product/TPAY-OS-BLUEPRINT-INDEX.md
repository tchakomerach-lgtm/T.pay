# T.Pay OS — Product and Engineering Blueprint

## Documents
- PRD-001: [Product Requirements](TPAY-PRD-001.md)
- APPFLOW-001: [Application Flows](TPAY-APPFLOW-001.md)
- UXUI-001: [UX/UI Specification](../design/TPAY-UXUI-001.md)
- TRD-001: [Technical Requirements](../architecture/TPAY-TRD-001.md)
- BACKEND-SCHEMA-001: [Backend Data Model](../architecture/TPAY-BACKEND-SCHEMA-001.md)
- IMPLEMENTATION-PLAN-001: [Delivery Plan](../implementation/TPAY-IMPLEMENTATION-PLAN-001.md)

## Source-of-truth hierarchy
1. Applicable law and approved operator contracts.
2. Existing project Bibles and ADRs listed in the Bible consultation registry.
3. Implemented code, migrations and tests for current behavior.
4. This shared cross-domain blueprint.
5. Planning notes and PR descriptions.

When documents disagree, stop the affected slice and resolve through an ADR; do not silently override a domain-specific rule.

## Traceability
Every implemented requirement should link: PRD requirement → appflow/screen → API/domain contract → schema/migration → test → CI run → construction record.

## Status vocabulary
Specified, Implemented, Tested, Integrated, Certified and Enabled are distinct statuses. The presence of these documents does not certify every module as implemented or production-ready.