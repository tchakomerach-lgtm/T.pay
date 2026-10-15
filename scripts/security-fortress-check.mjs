import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const root=process.cwd();
const files=[
  ".github/workflows/ci.yml",
  ".github/workflows/android.yml",
  ".github/workflows/terrain-certification.yml",
  "apps/api-server/src/main.ts",
  "packages/education/src/education-http.ts",
  "packages/security/src/fortress-exposure-guard.ts",
  "packages/security/src/fortress-export.ts",
  "packages/observability/src/telemetry.ts",
  "packages/events/src/notification.ts",
  "packages/integrations/src/secure-http-adapter.ts",
  "packages/ai/src/ai-core.ts",
  "apps/education-web/vite.config.ts",
  "android/tpay-shell/app/src/main/AndroidManifest.xml",
  "android/tpay-shell/app/src/main/java/com/tpay/os/MainActivity.kt",
  "android/tpay-shell/app/src/main/res/xml/network_security_config.xml",
  "migrations/047_tpay_vault_fortress.sql",
  "packages/security/vault-core.ts"
];

const forbidden=[
  [/console\.(log|info|warn|error)\([^\n]*(?:plaintext|secret|accessToken|refreshToken|privateKey|password)/i,"SECRET_LOGGING"],
  [/JSON\.stringify\([^\n]*(?:plaintext|accessToken|refreshToken|privateKey|password)/i,"SECRET_SERIALIZATION"],
  [/insecureHTTPParser\s*:\s*true/,"NODE_INSECURE_HTTP_PARSER"],
  [/rejectUnauthorized\s*:\s*false/,"TLS_CERTIFICATE_VALIDATION_DISABLED"],
  [/MIXED_CONTENT_ALWAYS_ALLOW/,"ANDROID_MIXED_CONTENT_ALLOWED"],
  [/allowFileAccess\s*=\s*true/,"ANDROID_FILE_ACCESS_ENABLED"],
  [/allowContentAccess\s*=\s*true/,"ANDROID_CONTENT_ACCESS_ENABLED"],
  [/access-control-allow-origin["']?\s*[,:]\s*["']?\*["']?/,"CORS_WILDCARD"],
  [/X-XSS-Protection/i,"DEPRECATED_XSS_HEADER"]
];

const required=[
  ["apps/api-server/src/main.ts",/TPAY_DATABASE_TLS_REQUIRED/,"DATABASE_TLS_FAIL_CLOSED"],
  ["migrations/047_tpay_vault_fortress.sql",/CREATE TABLE IF NOT EXISTS tpay_vaults/,"VAULT_SCHEMA_REQUIRED"],
  ["migrations/047_tpay_vault_fortress.sql",/ENABLE ROW LEVEL SECURITY/,"VAULT_RLS_REQUIRED"],
  ["migrations/047_tpay_vault_fortress.sql",/FORCE ROW LEVEL SECURITY/,"VAULT_FORCE_RLS_REQUIRED"],
  ["migrations/047_tpay_vault_fortress.sql",/kms_key_ref text NOT NULL/,"VAULT_KMS_REFERENCE_REQUIRED"],
  ["packages/security/vault-core.ts",/aes-256-gcm/,"VAULT_AES256GCM_REQUIRED"],
  ["packages/security/vault-core.ts",/TPAY_VAULT_DATA_KEY_INVALID/,"VAULT_KEY_LENGTH_GUARD_REQUIRED"],
  ["packages/security/vault-core.ts",/VaultAuditSink/,"VAULT_AUDIT_BOUNDARY_REQUIRED"],
  ["packages/security/src/fortress-exposure-guard.ts",/const API_TOKEN=/,"EXPOSURE_TOKEN_PATTERNS_REQUIRED"],
  ["packages/security/src/fortress-exposure-guard.ts",/const TOGO_LOCAL_PHONE=/,"EXPOSURE_TOGO_PHONE_PATTERN_REQUIRED"],
  ["packages/security/src/fortress-exposure-guard.ts",/FORTRESS_EXPOSURE_DEPTH_LIMIT/,"EXPOSURE_DEPTH_BOUND_REQUIRED"],
  ["packages/security/src/fortress-exposure-guard.ts",/FORTRESS_EXPOSURE_INPUT_SIZE_LIMIT/,"EXPOSURE_INPUT_BOUND_REQUIRED"],
  ["packages/security/src/fortress-exposure-guard.ts",/Object\.defineProperty\(out,key/,"EXPOSURE_PROTOTYPE_POLLUTION_GUARD_REQUIRED"],
  ["packages/security/src/fortress-export.ts",/prepareFortressExport/,"FORTRESS_EXPORT_BOUNDARY_REQUIRED"],
  ["packages/security/src/fortress-export.ts",/FORTRESS_EXPORT_AUTH_CONTEXT_INVALID/,"FORTRESS_EXPORT_IDENTITY_VALIDATION_REQUIRED"],
  ["packages/observability/src/telemetry.ts",/metricName/,"METRIC_DIMENSION_GUARD_REQUIRED"],
  ["packages/integrations/src/secure-http-adapter.ts",/MAX_PROVIDER_REQUEST_BYTES/,"PROVIDER_REQUEST_BOUND_REQUIRED"],
  ["packages/integrations/src/secure-http-adapter.ts",/redirect:"error"/,"PROVIDER_REDIRECT_DENIED_REQUIRED"],
  ["tests/notification-router.test.ts",/rejects recipient identity fields that are not opaque IDs/,"NOTIFICATION_IDENTITY_REGRESSION_REQUIRED"],
  ["tests/fortress-boundary-exposure.test.ts",/metricName\("person@example\.com"/,"METRIC_PII_REGRESSION_REQUIRED"],
  ["packages/observability/src/telemetry.ts",/sanitizeTelemetryContext/,"TELEMETRY_TRACE_CONTEXT_GUARD_REQUIRED"],
  ["packages/events/src/notification.ts",/sanitizeNotificationIntent/,"NOTIFICATION_EXPOSURE_GUARD_REQUIRED"],
  ["packages/integrations/src/secure-http-adapter.ts",/MAX_PROVIDER_RESPONSE_BYTES/,"PROVIDER_RESPONSE_BOUND_REQUIRED"],
  ["packages/integrations/src/secure-http-adapter.ts",/PROVIDER_HEADER_NEWLINE_FORBIDDEN/,"PROVIDER_HEADER_INJECTION_GUARD_REQUIRED"],
  ["packages/ai/src/ai-core.ts",/sanitizeAiRequest/,"AI_PROMPT_RAG_INPUT_GUARD_REQUIRED"],
  ["packages/ai/src/http-provider.ts",/AI_PROVIDER_HEADER_OVERRIDE_FORBIDDEN/,"AI_PROVIDER_HEADER_OVERRIDE_GUARD_REQUIRED"],
  ["packages/ai/src/http-provider.ts",/AI_PROVIDER_RESPONSE_SIZE_LIMIT/,"AI_PROVIDER_RESPONSE_BOUND_REQUIRED"],
  ["packages/ai/src/http-provider.ts",/ai-http-provider-input/,"AI_PROVIDER_INPUT_GUARD_REQUIRED"],
  ["tests/ai-http-provider-security.test.ts",/scrubs direct prompt input and provider output/,"AI_HTTP_PROVIDER_EXPOSURE_REGRESSION_REQUIRED"],
  ["tests/ai-http-provider-security.test.ts",/rejects oversized provider responses/,"AI_HTTP_PROVIDER_SIZE_REGRESSION_REQUIRED"],
  ["scripts/sanitize-ci-log.mjs",/REDACTED_PROVIDER_TOKEN/,"CI_LOG_REDACTION_REQUIRED"],
  [".github/workflows/ci.yml",/Runner assignment diagnostics/,"CI_RUNNER_DIAGNOSTICS_REQUIRED"],
  [".github/workflows/ci.yml",/Upload redacted CI diagnostics/,"CI_DIAGNOSTIC_ARTIFACT_REQUIRED"],
  [".github/workflows/android.yml",/Runner assignment diagnostics/,"ANDROID_RUNNER_DIAGNOSTICS_REQUIRED"],
  ["tests/fortress-exposure-guard.test.ts",/untrusted __proto__/,"EXPOSURE_PROTOTYPE_REGRESSION_REQUIRED"],
  ["tests/fortress-exposure-guard.test.ts",/excessive recursion and oversized untrusted payloads/,"EXPOSURE_RESOURCE_LIMIT_REGRESSION_REQUIRED"],
  ["tests/fortress-exposure-guard.test.ts",/preserves opaque UUIDs while redacting adjacent phone and card values/,"EXPOSURE_UUID_PRESERVATION_REGRESSION_REQUIRED"],
  ["packages/api-gateway/src/api-error.ts",/PUBLIC_ERROR_CODES/,"PUBLIC_API_ERROR_ALLOWLIST_REQUIRED"],
  ["packages/api-gateway/src/api-error.ts",/safeClientError/,"API_ERROR_EXPOSURE_GUARD_REQUIRED"],
  ["packages/education/src/education-http.ts",/envelope\.status/,"HTTP_ERROR_STATUS_NORMALIZATION_REQUIRED"],
  ["packages/ai/src/ai-core.ts",/sanitizeProviderResponse/,"AI_PROVIDER_OUTPUT_GUARD_REQUIRED"],
  ["tests/api-error-exposure.test.ts",/DB_PASSWORD_ROTATION_FAILED/,"API_ERROR_LEAK_REGRESSION_REQUIRED"],
  ["tests/ai-output-exposure.test.ts",/generateRouted/,"AI_ROUTED_OUTPUT_GUARD_TEST_REQUIRED"],
  ["tests/ai-output-exposure.test.ts",/scrubs prompt and RAG context/,"AI_PROMPT_RAG_REGRESSION_REQUIRED"],
  ["tests/fortress-boundary-exposure.test.ts",/logs and traces redact nested PII/,"TELEMETRY_EXPOSURE_REGRESSION_REQUIRED"],
  ["tests/fortress-boundary-exposure.test.ts",/Fortress export requires opaque authenticated actor/,"EXPORT_EXPOSURE_REGRESSION_REQUIRED"],
  ["tests/fortress-boundary-exposure.test.ts",/notification provider receives a scrubbed intent/,"NOTIFICATION_EXPOSURE_REGRESSION_REQUIRED"],
  ["tests/fortress-boundary-exposure.test.ts",/provider adapter bounds response\/request sizes/,"PROVIDER_BOUNDARY_REGRESSION_REQUIRED"],
  ["packages/security/vault-core.ts",/action:"read"/,"VAULT_READ_AUDIT_REQUIRED"],
  ["packages/security/vault-core.ts",/action:"write"/,"VAULT_WRITE_AUDIT_REQUIRED"],
  ["apps/api-server/src/main.ts",/minVersion:\s*["']TLSv1\.3["']/,"API_TLS13_REQUIRED"],
  ["apps/education-web/vite.config.ts",/command===["']serve["'][\s\S]*?TPAY_WEB_HTTPS_CERTIFICATES_REQUIRED/,"WEB_HTTPS_FAIL_CLOSED"],
  ["packages/education/src/education-http.ts",/API_IDEMPOTENCY_KEY_INVALID/,"IDEMPOTENCY_VALIDATION_REQUIRED"],
  ["packages/education/src/education-http.ts",/x-content-type-options/,"SECURITY_HEADERS_REQUIRED"],
  ["packages/education/src/education-http.ts",/strict-transport-security/,"HSTS_REQUIRED"],
  ["android/tpay-shell/app/src/main/AndroidManifest.xml",/usesCleartextTraffic="false"/,"ANDROID_CLEARTEXT_DISABLED"],
  ["android/tpay-shell/app/src/main/res/xml/network_security_config.xml",/cleartextTrafficPermitted="false"/,"ANDROID_NETWORK_CLEARTEXT_DISABLED"],
  [".github/workflows/terrain-certification.yml",/runs-on:\s*\[self-hosted,\s*tpay-terrain\]/,"TERRAIN_RUNNER_ISOLATION_REQUIRED"]
];

const problems=[];
for(const rel of files){
  const text=await readFile(resolve(root,rel),"utf8");
  for(const [pattern,code] of forbidden)if(pattern.test(text))problems.push(code+":"+rel);
}
for(const [rel,pattern,code] of required){
  const text=await readFile(resolve(root,rel),"utf8");
  if(!pattern.test(text))problems.push(code+":"+rel);
}
const ci=await readFile(resolve(root,".github/workflows/ci.yml"),"utf8");
if(!/permissions:\s*\n\s+contents:\s+read/.test(ci))problems.push("CI_LEAST_PRIVILEGE_REQUIRED");
if(!/cancel-in-progress:\s*false/.test(ci))problems.push("CI_AUTHORITATIVE_RUNS_MUST_NOT_BE_CANCELLED");
if(problems.length){
  console.error("TPAY_SECURITY_FORTRESS_FAILED");
  for(const p of problems)console.error(p);
  process.exit(1);
}
console.log("TPAY_SECURITY_FORTRESS_PASS");
console.log("TLS1.3 + HTTPS-only boundaries + Android cleartext denial + CORS/idempotency guards + CI least privilege verified.");
