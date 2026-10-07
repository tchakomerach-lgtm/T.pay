CREATE UNIQUE INDEX IF NOT EXISTS uq_tpay_root_operation_digest ON tpay_root_operations(request_digest) WHERE status IN ('AUTHORIZED','EXECUTED');
ALTER TABLE tpay_root_operations ADD COLUMN IF NOT EXISTS quorum_required integer NOT NULL DEFAULT 3 CHECK(quorum_required>=3);
