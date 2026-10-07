import test from "node:test";
import assert from "node:assert/strict";
import { executeRecoveryDrill } from "../packages/security/src/recovery-drill.js";
const root:any={kind:"HSM",keyRef:"test",attest:async()=>({trusted:true,provider:"test",keyRef:"test",attestationDigest:"x"}),signDigest:async()=>Buffer.alloc(0),verifyDigest:async()=>true};
const vault:any={immutable:true,createSnapshot:async()=>({snapshotId:"s",generation:"1"}),verifySnapshot:async()=>true,restoreToCleanRoom:async()=>({restoreId:"r",verified:true})};
const room:any={independentIdentityBoundary:true,targetId:"clean",assertIsolated:async()=>{}};
test("recovery drill fails closed on unverified plane",async()=>{await assert.rejects(()=>executeRecoveryDrill({runId:"r",manifest:{a:1},planes:[{plane:"TRUST",generation:"1",verified:false}],vault,root,cleanRoom:room,store:{recordPlane:async()=>{},recordBackup:async()=>{}},snapshotId:"s"}),/RECOVERY_PLANE_UNVERIFIED/);});
test("recovery drill requires clean-room restore verification",async()=>{const bad={...vault,restoreToCleanRoom:async()=>({restoreId:"r",verified:false})};await assert.rejects(()=>executeRecoveryDrill({runId:"r",manifest:{a:1},planes:[{plane:"TRUST",generation:"1",verified:true}],vault:bad,root,cleanRoom:room,store:{recordPlane:async()=>{},recordBackup:async()=>{}},snapshotId:"s"}),/CLEAN_ROOM_RESTORE_UNVERIFIED/);});
