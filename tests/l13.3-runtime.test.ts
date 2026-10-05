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

test("L13.3 opens circuit after repeated failures and allows one half-open probe",()=>{
  const circuit=new CircuitBreaker(2,100);
  circuit.onFailure(1000);
  assert.equal(circuit.getState(1000),"closed");
  circuit.onFailure(1001);
  assert.equal(circuit.getState(1001),"open");
  assert.equal(circuit.allow(1050),false);
  assert.equal(circuit.allow(1101),true);
  assert.equal(circuit.allow(1101),false);
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

test("L13.3 times out a hung health dependency without blocking readiness",async()=>{
  const report=await runHealthProbes([
    {name:"postgres",check:async()=>true},
    {name:"hung",check:async()=>new Promise<boolean>(()=>{})}
  ],"2026-10-05T10:00:00.000Z",5);
  assert.equal(report.status,"degraded");
  assert.equal(report.ready,false);
  assert.equal(report.checks.hung,false);
});

test("L13.3 allows shared-device requests without device evidence",async()=>{
  const {ApiRuntimeGate}=await import("../packages/api-gateway/src/runtime-gate.js");
  const {ApiAbuseRepository}=await import("../packages/api-gateway/src/rate-abuse.js");
  const abuse=new ApiAbuseRepository({query:async()=>({rows:[{request_count:"1",max_requests:"60",window_started_at:"2026-10-05T10:01:00.000Z",window_seconds:60}],rowCount:1})});
  const gate=new ApiRuntimeGate(abuse);
  const decision=await gate.evaluate({
    method:"GET",route:"/v1/profile",authClass:"user",channel:"mobile",
    origin:"https://tpay.example",correlationId:"c-shared-device",
    scopeSecrets:{channel:"channel",ip:"ip",actor:"actor"},now:"2026-10-05T10:01:12.000Z"
  });
  assert.equal(decision.allowed,true);
});

test("L13.3 aborts timed operations before retrying",async()=>{
  let calls=0;
  let aborted=false;
  const result=await executeWithResilience(async signal=>{
    calls+=1;
    await new Promise<void>((resolve,reject)=>{
      if(signal.aborted){aborted=true;resolve();return;}
      signal.addEventListener("abort",()=>{aborted=true;resolve();},{once:true});
    });
    if(calls===1)throw new Error("TIMEOUT");
    return "recovered";
  },{
    timeoutMs:5,
    retry:{maxAttempts:2,baseDelayMs:1,maxDelayMs:2},
    circuit:new CircuitBreaker(3,100),
    sleep:async()=>{}
  });
  assert.equal(result,"recovered");
  assert.equal(calls,2);
  assert.equal(aborted,true);
});
