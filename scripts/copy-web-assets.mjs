import {copyFile,mkdir} from "node:fs/promises";
import {dirname,join} from "node:path";
const files=[["apps/web/index.html","dist/apps/web/index.html"],["apps/web/src/styles.css","dist/apps/web/src/styles.css"]];
for(const [source,target] of files){await mkdir(dirname(target),{recursive:true});await copyFile(source,target);}
console.log("T.Pay Web assets copied.");
