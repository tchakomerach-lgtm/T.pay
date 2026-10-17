import test from "node:test";
import assert from "node:assert/strict";
import {shouldAnimateUi} from "../apps/education-web/src/motion-policy.js";

test("DB-078 disables nonessential motion when reduced motion is requested",()=>{
  assert.equal(shouldAnimateUi({reducedMotion:true,saveData:false}),false);
});
test("DB-078 disables nonessential motion for data saver and constrained devices",()=>{
  assert.equal(shouldAnimateUi({reducedMotion:false,saveData:true}),false);
  assert.equal(shouldAnimateUi({reducedMotion:false,saveData:false,deviceMemory:2}),false);
  assert.equal(shouldAnimateUi({reducedMotion:false,saveData:false,hardwareConcurrency:2}),false);
});
test("DB-078 keeps motion optional when capability signals are absent or adequate",()=>{
  assert.equal(shouldAnimateUi({reducedMotion:false,saveData:false}),true);
  assert.equal(shouldAnimateUi({reducedMotion:false,saveData:false,deviceMemory:4,hardwareConcurrency:8}),true);
});
