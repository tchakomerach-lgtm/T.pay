import {readFile,writeFile} from "node:fs/promises";

const [, , inputPath, outputPath]=process.argv;
if(!inputPath||!outputPath){
  console.error("usage: node scripts/sanitize-ci-log.mjs <input> <output>");
  process.exit(2);
}
let text=await readFile(inputPath,"utf8");
const patterns=[
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,"[REDACTED_PRIVATE_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,"Bearer [REDACTED]"],
  [/\b(?:eyJ[A-Za-z0-9_-]{8,}\.){2}[A-Za-z0-9_-]{8,}\b/g,"[REDACTED_JWT]"],
  [/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g,"[REDACTED_PROVIDER_TOKEN]"],
  [/\b(?:password|passwd|secret|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[^\s,;]+/gi,"[REDACTED_SECRET_ASSIGNMENT]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,"[REDACTED_EMAIL]"],
  [/(?<!\w)(?:\+?228[ -]?)?(?:2[2-8](?:[ -]?\d){6}|[79](?:[ -]?\d){7})(?!\w)/g,"[REDACTED_PHONE]"],
  [/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g,"[REDACTED_NUMERIC_IDENTIFIER]"]
];
for(const [pattern,replacement] of patterns)text=text.replace(pattern,replacement);
await writeFile(outputPath,text,{encoding:"utf8",mode:0o600});
