-- Permit a narrowly scoped bootstrap read of the identity session row.
-- The API sets this transaction-local value only after DeviceTrustRepository validates
-- the bearer credential. The policy exposes only the exact api_session_id row.
DROP POLICY IF EXISTS identity_sessions_validated_api_session_bootstrap ON identity_sessions;
CREATE POLICY identity_sessions_validated_api_session_bootstrap
  ON identity_sessions
  FOR SELECT
  USING (
    api_session_id = NULLIF(current_setting('tpay.api_session_id', true), '')::uuid
  );

COMMENT ON POLICY identity_sessions_validated_api_session_bootstrap ON identity_sessions IS
  'Bootstrap SELECT for exactly one API session already validated by the HTTPS API runtime; tenant and organization context are established immediately after this lookup.';
