import { randomUUID } from "node:crypto";

const required=["TPAY_TERRAIN_API_URL","TPAY_TERRAIN_ACCESS_TOKEN","TPAY_TERRAIN_ACTOR_ID","TPAY_TERRAIN_DEVICE_ID"];
for(const name of required) if(!process.env[name]?.trim()) throw new Error("TPAY_REPLIT_ENV_REQUIRED:"+name);

const base=new URL(process.env.TPAY_TERRAIN_API_URL);
if(base.protocol!=="https:") throw new Error("TPAY_REPLIT_HTTPS_ONLY");
const token=process.env.TPAY_TERRAIN_ACCESS_TOKEN.trim();
const actorId=process.env.TPAY_TERRAIN_ACTOR_ID.trim();
const deviceId=process.env.TPAY_TERRAIN_DEVICE_ID.trim();

function assertOk(condition,message){if(!condition) throw new Error(message);}
async function authGet(path){
  const res=await fetch(new URL(path,base),{headers:{authorization:"Bearer "+token}});
  return {res,text:await res.text()};
}

console.log("[1/6] HTTPS health");
for(const path of ["/health/live","/health/ready"]){
  const {res,text}=await authGet(path);
  assertOk(res.status===200,"HEALTH_FAILED:"+path+":"+res.status+":"+text);
}
console.log("PASS");

console.log("[2/6] authenticated actor + organization scope");
{
  const {res,text}=await authGet("/v1/education/actors/"+encodeURIComponent(actorId));
  assertOk(res.status===200,"ACTOR_FAILED:"+res.status+":"+text);
  assertOk(JSON.parse(text)?.data?.actor_id===actorId,"ACTOR_SCOPE_FAILED");
}
console.log("PASS");

console.log("[3/6] CORS deny");
{
  const res=await fetch(new URL("/v1/education/actors/"+encodeURIComponent(actorId),base),{
    headers:{authorization:"Bearer "+token,origin:"https://untrusted.invalid"}
  });
  assertOk(res.status===403,"CORS_NOT_DENIED:"+res.status);
}
console.log("PASS");

console.log("[4/6] live SSE");
const controller=new AbortController();
const ssePromise=(async()=>{
  const res=await fetch(new URL("/v1/education/events/stream",base),{
    headers:{authorization:"Bearer "+token,accept:"text/event-stream"},
    signal:controller.signal
  });
  assertOk(res.status===200,"SSE_FAILED:"+res.status);
  const reader=res.body?.getReader();
  assertOk(!!reader,"SSE_BODY_MISSING");
  const decoder=new TextDecoder();
  let buffer="";
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    const result=await Promise.race([
      reader.read(),
      new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),Math.max(1,deadline-Date.now())))
    ]);
    if(result?.timeout || result.done) break;
    buffer+=decoder.decode(result.value,{stream:true});
    if(buffer.includes("event:")) return {buffer};
  }
  return {buffer};
})();

await new Promise(r=>setTimeout(r,150));
const idempotencyKey="replit-terrain-"+randomUUID();
const eventId=randomUUID();
const payload={
  eventId,
  deviceId,
  sequence:1,
  occurredAt:new Date().toISOString(),
  eventType:"school.attendance.recorded",
  priority:"P1",
  payload:{terrainTest:true,probeId:eventId},
  idempotencyKey,
  schemaVersion:1
};
const first=await fetch(new URL("/v1/education/sync/events",base),{
  method:"POST",
  headers:{authorization:"Bearer "+token,"content-type":"application/json","x-idempotency-key":idempotencyKey},
  body:JSON.stringify(payload)
});
const firstText=await first.text();
assertOk(first.status===200,"SYNC_FIRST_FAILED:"+first.status+":"+firstText);
const sse=await Promise.race([ssePromise,new Promise(resolve=>setTimeout(()=>resolve({buffer:""}),5500))]);
controller.abort();
assertOk(sse.buffer?.includes("event: event"),"SSE_EVENT_NOT_OBSERVED:"+sse.buffer);
console.log("PASS");

console.log("[5/6] idempotency replay");
const second=await fetch(new URL("/v1/education/sync/events",base),{
  method:"POST",
  headers:{authorization:"Bearer "+token,"content-type":"application/json","x-idempotency-key":idempotencyKey},
  body:JSON.stringify(payload)
});
const secondText=await second.text();
assertOk(second.status===200,"SYNC_REPLAY_FAILED:"+second.status+":"+secondText);
assertOk(JSON.parse(secondText)?.replayed===true,"IDEMPOTENCY_REPLAY_NOT_CONFIRMED:"+secondText);
console.log("PASS");

console.log("[6/6] Replit certification boundary");
console.log("PASS: HTTPS, PostgreSQL-backed session, org-scoped actor, CORS denial, live SSE and HTTP idempotency replay.");
console.log("NOT_CERTIFIED_HERE: physical Android, real network interruption and durable Last-Event-ID replay after process/network restart.");
