import test from "node:test";
import assert from "node:assert/strict";
import {PostgresSecurityRateLimiter} from "../packages/security/src/rate-limit.js";
import {PostgresSecurityIncidentRepository} from "../packages/security/src/incident-repository.js";
test("L12.1 rate limiter rejects malformed unhashed keys",async()=>{
 const repo=new PostgresSecurityRateLimiter({query:async()=>({rows:[]})} as any);
 await assert.rejects(()=>repo.consume("plain-ip","2026-10-04T14:00:00Z",60,10),/SECURITY_SCOPE_KEY_INVALID/);
});
test("L12.1 rate limiter computes deny after atomic increment",async()=>{
 const repo=new PostgresSecurityRateLimiter({query:async()=>({rows:[{window_started_at:"2026-10-04T14:00:00Z",request_count:11}]})} as any);
 const d=await repo.consume("a".repeat(64),"2026-10-04T14:00:10Z",60,10);
 assert.equal(d.allowed,false); assert.equal(d.count,11);
});
test("L12.1 incidents store evidence hash rather than sensitive payload",async()=>{
 const calls:any[]=[]; const repo=new PostgresSecurityIncidentRepository({query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return {rowCount:1,rows:[]}}} as any);
 await repo.append({id:"i1",category:"prompt_injection",severity:"high",evidenceHash:"a".repeat(64),correlationId:"c1",createdAt:"2026-10-04T14:00:00Z"});
 assert.equal(calls[0].args.includes("prompt"),false);
});
