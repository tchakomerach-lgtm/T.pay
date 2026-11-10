import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const root=process.cwd();
const files=[
  ".github/workflows/ci.yml",
  ".github/workflows/android.yml",
  ".github/workflows/terrain-certification.yml",
  "apps/api-server/src/main.ts",
  "packages/education/src/education-http.ts",
  "apps/education-web/vite.config.ts",
  "android/tpay-shell/app/src/main/AndroidManifest.xml",
  "android/tpay-shell/app/src/main/java/com/tpay/os/MainActivity.kt",
  "android/tpay-shell/app/src/main/res/xml/network_security_config.xml",
  "migrations/047_tpay_vault_fortress.sql",
  "packages/security/vault-core.ts",
  "packages/security/vault-domain-boundary.ts",
  "migrations/120_fortress_admin_plane_isolation.sql"
];

const forbidden=[
  [/console\\.(log|info|warn|error)\\([^\\n]*(?:plaintext|secret|accessToken|refreshToken|privateKey|password)/i,"SECRET_LOGGING"],
  [/JSON\\.stringify\\([^\\n]*(?:plaintext|accessToken|refreshToken|privateKey|password)/i,"SECRET_SERIALIZATION"],
  [/insecureHTTPParser\s*:\s*true/,"NODE_INSECURE_HTTP_PARSER"],
  [/rejectUnauthorized\s*:\s*false/,"TLS_CERTIFICATE_VALIDATION_DISABLED"],
  [/MIXED_CONTENT_ALWAYS_ALLOW/,"ANDROID_MIXED_CONTENT_ALLOWED"],
  [/allowFileAccess\s*=\s*true/,"ANDROID_FILE_ACCESS_ENABLED"],
  [/allowContentAccess\s*=\s*true/,"ANDROID_CONTENT_ACCESS_ENABLED"],
  [/access-control-allow-origin["']?\s*[,:]\s*["']\*["']/,"CORS_WILDCARD"],
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
  ["packages/security/vault-core.ts",/action:"read"/,"VAULT_READ_AUDIT_REQUIRED"],
  ["packages/security/vault-core.ts",/action:"write"/,"VAULT_WRITE_AUDIT_REQUIRED"],
  ["migrations/120_fortress_admin_plane_isolation.sql",/CREATE ROLE tpay_admin_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT/,"ADMIN_DB_ROLE_ISOLATION_REQUIRED"],
  ["migrations/120_fortress_admin_plane_isolation.sql",/current_user = 'tpay_admin_runtime'/,"ADMIN_VAULT_ROLE_POLICY_REQUIRED"],
  ["migrations/120_fortress_admin_plane_isolation.sql",/tpay_super_admin_vault_platform_scope/,"ADMIN_VAULT_PLATFORM_SCOPE_REQUIRED"],
  ["migrations/120_fortress_admin_plane_isolation.sql",/TPAY_VAULT_AUDIT_APPEND_ONLY/,"VAULT_AUDIT_IMMUTABILITY_REQUIRED"],
  ["packages/security/vault-domain-boundary.ts",/ADMIN_PLANE_USER_CONTEXT_FORBIDDEN/,"ADMIN_USER_CONTEXT_SEPARATION_REQUIRED"],
  ["packages/security/vault-domain-boundary.ts",/USER_PLANE_CANNOT_ACCESS_ADMIN_VAULT/,"USER_TO_ADMIN_VAULT_DENIAL_REQUIRED"],
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
for (const workflow of [".github/workflows/ci.yml",".github/workflows/android.yml",".github/workflows/terrain-certification.yml"]) {
  const source = await readFile(resolve(root,workflow),"utf8");
  for (const match of source.matchAll(/^\\s*uses:\\s*([^\\s#]+)/gm)) {
    const reference = match[1].split("@")[1] ?? "";
    if (!/^[a-f0-9]{40}$/.test(reference)) problems.push("CI_ACTION_NOT_PINNED_TO_FULL_SHA:" + workflow + ":" + match[1]);
  }
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
