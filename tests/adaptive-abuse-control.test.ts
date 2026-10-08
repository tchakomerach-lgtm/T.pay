import test from "node:test"; import assert from "node:assert/strict";
import {AdaptiveRateLimiter,scoreBehavior} from "../packages/security/src/adaptive-abuse-control.js";
test("adaptive limiter blocks bursts and repeated failures",()=>{const x=new AdaptiveRateLimiter({capacity:2,refillPerSecond:1,failureThreshold:2,blockSeconds:60});assert.equal(x.consume("a").allowed,true);assert.equal(x.consume("a").allowed,true);assert.equal(x.consume("a").allowed,false);x.recordFailure("a");x.recordFailure("a");assert.equal(x.consume("a").reason,"BRUTE_FORCE");});
test("behavior score escalates bounded high-risk signals",()=>{assert.equal(scoreBehavior({failureRate:.8,distinctOrganizations:6,requestsPerMinute:200,capabilityDenials:12,replayAttempts:4}).key,"HIGH");});
