import test from "node:test";
import assert from "node:assert/strict";
import { runSuperAdminRedTeam,assertRedTeamPass } from "../packages/security/src/super-admin-redteam.js";
test("red-team harness rejects an allowed critical bypass",async()=>{const e=await runSuperAdminRedTeam([{name:"root-replay",severity:"CRITICAL",execute:async()=> "ALLOWED"}]);assert.throws(()=>assertRedTeamPass(e),/REDTEAM_CONTROL_BYPASS/);});
test("red-team harness accepts blocked attacks",async()=>{const e=await runSuperAdminRedTeam([{name:"jit-reuse",severity:"HIGH",execute:async()=> "BLOCKED"},{name:"root-replay",severity:"CRITICAL",execute:async()=> "BLOCKED"}]);assert.equal(assertRedTeamPass(e),true);});
