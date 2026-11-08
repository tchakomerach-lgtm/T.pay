import test from "node:test";
import assert from "node:assert/strict";

const validCode=(value:string)=>/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(value);
const validCoefficient=(value:number)=>Number.isFinite(value)&&value>0&&value<=100;

test("P056.5 subject codes are canonical uppercase identifiers",()=>{
  assert.equal(validCode("MATH"),true);
  assert.equal(validCode("SCIENCE-01"),true);
  assert.equal(validCode("math"),false);
  assert.equal(validCode(""),false);
  assert.equal(validCode("A".repeat(33)),false);
});
test("P056.5 subject coefficient is finite and bounded",()=>{
  assert.equal(validCoefficient(1),true);
  assert.equal(validCoefficient(0.5),true);
  assert.equal(validCoefficient(0),false);
  assert.equal(validCoefficient(100.01),false);
  assert.equal(validCoefficient(Number.NaN),false);
});
