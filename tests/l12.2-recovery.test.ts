import test from "node:test";
import assert from "node:assert/strict";
import {PostgresRecoveryEvidenceRepository} from "../packages/operations/src/recovery-evidence.js";
test("L12.2 stores immutable backup/restore evidence hashes",async()=>{
 const calls:any[]=[]; const repo=new PostgresRecoveryEvidenceRepository({query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return {rowCount:1,rows:[]}}} as any);
 await repo.record({id:"r1",operation:"restore_drill",status:"succeeded",artifactRef:"backup://daily/2026-10-04",checksum:"a".repeat(64),startedAt:"2026-10-04T14:00:00Z",completedAt:"2026-10-04T14:05:00Z",evidenceHash:"b".repeat(64)});
 assert.equal(calls.length,1); assert.equal(calls[0].args.includes("password"),false);
});
test("L12.2 rejects invalid checksums",async()=>{
 const repo=new PostgresRecoveryEvidenceRepository({query:async()=>({rowCount:1,rows:[]})} as any);
 await assert.rejects(()=>repo.record({id:"r1",operation:"backup",status:"started",artifactRef:"x",checksum:"bad",startedAt:"2026-10-04T14:00:00Z",evidenceHash:"b".repeat(64)}),/RECOVERY_EVIDENCE_HASH_INVALID/);
});
