-- P056.1 — least-privilege grants required by the authenticated school API UoW.
-- Role membership is provisioned separately for the dedicated API database login.
GRANT INSERT ON api_request_audit TO tpay_school_runtime;
GRANT SELECT (id,state), UPDATE (state,response_hash,status_code)
  ON api_request_deduplication TO tpay_school_runtime;
