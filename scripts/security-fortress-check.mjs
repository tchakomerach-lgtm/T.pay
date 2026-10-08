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
  "android/tpay-shell/app/src/main/res/xml/network_security_config.xml"
];

const forbidden=[
  [/insecureHTTPParser\s*:\s*true/,"NODE_INSECURE_HTTP_PARSER"],
  [/rejectUnauthorized\s*:\s*false/,"TLS_CERTIFICATE_VALIDATION_DISABLED"],
  [/MIXED_CONTENT_ALWAYS_ALLOW/,"ANDROID_MIXED_CONTENT_ALLOWED"],
  [/allowFileAccess\s*=\s*true/,"ANDROID_FILE_ACCESS_ENABLED"],
  [/allowContentAccess\s*=\s*true/,"ANDROID_CONTENT_ACCESS_ENABLED"],
  [/access-control-allow-origin["']?\s*[,:]\s*["']\*["']/,"CORS_WILDCARD"],
  [/X-XSS-Protection/i,"DEPRECATED_XSS_HEADER"]
];

const required=[
  ["apps/api-server/src/main.ts",/minVersion:\s*["']TLSv1\.3["']/,"API_TLS13_REQUIRED"],
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
