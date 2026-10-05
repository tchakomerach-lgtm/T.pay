import {strict as assert} from "node:assert";
import {test} from "node:test";
import {fixedWindowStart,rateScopeHash} from "../packages/api-gateway/src/rate-abuse.js";
test("L13.2 produces deterministic privacy-preserving scope hashes",()=>{assert.equal(rateScopeHash("device-secret").length,64);assert.equal(rateScopeHash("device-secret"),rateScopeHash("device-secret"));});
test("L13.2 aligns fixed windows deterministically",()=>{assert.equal(fixedWindowStart("2026-10-05T10:01:12.000Z",60),"2026-10-05T10:01:00.000Z");});
test("L13.2 rejects unsafe windows",()=>{assert.throws(()=>fixedWindowStart("2026-10-05T10:00:00.000Z",0),/RATE_WINDOW_INVALID/);assert.throws(()=>fixedWindowStart("2026-10-05T10:00:00.000Z",86401),/RATE_WINDOW_INVALID/);});
