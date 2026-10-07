import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir=join(process.cwd(),"dist","tests");
const files=readdirSync(dir).filter(x=>x.endsWith(".test.js")).sort();
for(const file of files){
 console.log("\n=== TPAY TEST FILE: "+file+" ===");
 const result=spawnSync(process.execPath,["--test","--test-concurrency=1","--test-timeout=120000",join(dir,file)],{stdio:"inherit",env:process.env,timeout:135000});
 if(result.error)throw result.error;
 if(result.status!==0){console.error("FAILED TEST FILE:",file,"status",result.status,"signal",result.signal);process.exit(result.status??1);}
}
console.log("\nALL TEST FILES PASSED:",files.length);
