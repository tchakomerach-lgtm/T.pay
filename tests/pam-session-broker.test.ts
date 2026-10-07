import test from "node:test";
import assert from "node:assert/strict";
import { DenyByDefaultPamPolicy } from "../packages/security/src/pam-session-broker.js";
test("PAM policy denies composition and destructive commands",()=>{
 const p=new DenyByDefaultPamPolicy();
 assert.equal(p.allowCommand({resource:"server",action:"execute",command:"cat /etc/hosts"}).allowed,true);
 assert.equal(p.allowCommand({resource:"server",action:"execute",command:"cat /etc/hosts; rm -rf /"}).allowed,false);
 assert.equal(p.allowCommand({resource:"server",action:"execute",command:"rm -rf /"}).allowed,false);
 assert.equal(p.allowCommand({resource:"server",action:"read",command:"sudo cat /etc/shadow"}).allowed,false);
});
