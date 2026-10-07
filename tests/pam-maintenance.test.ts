import test from "node:test";
import assert from "node:assert/strict";
import { DenyByDefaultPamPolicy } from "../packages/security/src/pam-session-broker.js";
import { changeMaintenanceAtomically } from "../packages/security/src/maintenance-repository.js";
test("PAM policy denies privileged shell composition",()=>{
 const p=new DenyByDefaultPamPolicy();
 assert.equal(p.allowCommand({resource:"server",action:"execute",command:"cat /etc/hosts"}).allowed,true);
 assert.equal(p.allowCommand({resource:"server",action:"execute",command:"cat /etc/hosts; rm -rf /"}).allowed,false);
 assert.equal(p.allowCommand({resource:"server",action:"execute",command:"rm -rf /"}).allowed,false);
});
test("maintenance repository rejects stale versions before mutation",async()=>{
 const calls:any[]=[];
 const pool:any={connect:async()=>({query:async(sql:string,args?:unknown[])=>{
   calls.push([sql,args]);
   if(sql.includes("SELECT mode,version"))return{rows:[{mode:"normal",version:2}]};
   return{rows:[]};
 },release(){}})};
 await assert.rejects(()=>changeMaintenanceAtomically(pool,{expectedVersion:1,mode:"maintenance",actorId:"a",reason:"valid reason"}),/MAINTENANCE_VERSION_CONFLICT/);
 assert.equal(calls.filter(x=>String(x[0]).startsWith("UPDATE")).length,0);
});
