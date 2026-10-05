import {strict as assert} from "node:assert";
import {test} from "node:test";
import {CircuitBreaker,executeWithResilience} from "../packages/api-gateway/src/resilience.js";
import {runHealthProbes} from "../packages/api-gateway/src/health.js";

test("L13.3 retries transient failures and closes circuit on success",async()=>{
  let calls=0;
  const sleeps:number[]=[];
  const result=await executeWithResilience(async()=>{
    calls+=1;
    if(calls<3)throw new Error("ECONNRESET");
    return "ok";
  },{
    timeoutMs:100,
    retry:{maxAttempts:3,baseDelayMs:1,maxDelayMs:4},
    circuit:new CircuitBreaker(3,100),
    sleep:async ms=>{sleeps.push(ms);}
  });
  assert.equal(result,"ok");
  assert.equal(calls,3);
  assert.deepEqual(sleeps,[1,2]);
});

test("L13.3 opens circuit after repeated failures and allows half-open recovery",()=>{
  const circuit=new CircuitBreaker(2,100);
  circuit.onFailure(1000);
  assert.equal(circuit.getState(1000),"closed");
  circuit.onFailure(1001);
  assert.equal(circuit.getState(1001),"open");
  assert.equal(circuit.allow(1050),false);
  assert.equal(circuit.allow(1101),true);
  assert.equal(circuit.getState(1101),"half_open");
  circuit.onSuccess();
  assert.equal(circuit.getState(1101),"closed");
});

test("L13.3 reports readiness separately from degraded health",async()=>{
  const report=await runHealthProbes([
    {name:"postgres",check:async()=>true},
    {name:"provider",check:async()=>false}
  ],"2026-10-05T10:00:00.000Z");
  assert.equal(report.status,"degraded");
  assert.equal(report.ready,false);
});
