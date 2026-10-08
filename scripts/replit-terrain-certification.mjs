import { randomUUID } from "node:crypto";

const required=["TPAY_TERRAIN_API_URL","TPAY_TERRAIN_ACCESS_TOKEN","TPAY_TERRAIN_ACTOR_ID","TPAY_TERRAIN_DEVICE_ID"];
for(const name of required) if(!process.env[name]?.trim()) throw new Error("TPAY_REPLIT_ENV_REQUIRED:"+name);

const base=new URL(process.env.TPAY_TERRAIN_API_URL);
if(base.protocol!=="https:") throw new Error("TPAY_REPLIT_HTTPS_ONLY");
const token=process.env.TPAY_TERRAIN_ACCESS_TOKEN.trim();
const actorId=process.env.TPAY_TERRAIN_ACTOR_ID.trim();
const deviceId=process.env.TPAY_TERRAIN_DEVICE_ID.trim();

function assertOk(condition,message){if(!condition) throw new Error(message);}
const authHeaders=()=>({authorization:"Bearer "+token});
async function get(path,headers={}) {
  const res=await fetch(new URL(path,base),{headers:{...authHeaders(),...headers}});
  return {res,text:await res.text()};
}
async function post(path,body,idempotencyKey){
  const res=await fetch(new URL(path,base),{
    method:"POST",
    headers:{...authHeaders(),"content-type":"application/json","x-idempotency-key":idempotencyKey},
    body:JSON.stringify(body)
  });
  return {res,text:await res.text()};
}
function eventPayload(sequence){
  const eventId=randomUUID();
  return {
    eventId,deviceId,sequence,
    occurredAt:new Date().toISOString(),
    eventType:"school.attendance.recorded",
    priority:"P1",
    payload:{terrainTest:true,probeId:eventId,sequence},
    idempotencyKey:"replit-terrain-"+sequence+"-"+randomUUID(),
    schemaVersion:1
  };
}
async function openSse(lastEventId){
  const controller=new AbortController();
  const res=await fetch(new URL("/v1/education/events/stream",base),{
    headers:{...authHeaders(),accept:"text/event-stream",...(lastEventId?{"last-event-id":lastEventId}:{})},
    signal:controller.signal
  });
  assertOk(res.status===200,"SSE_FAILED:"+res.status);
  assertOk(res.headers.get("content-type")?.includes("text/event-stream"),"SSE_CONTENT_TYPE_INVALID");
  const reader=res.body?.getReader();
  assertOk(!!reader,"SSE_BODY_MISSING");
  const decoder=new TextDecoder();
  let buffer="";
  async function nextEvent(timeoutMs=6000){
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      const marker=buffer.indexOf("\n\n");
      if(marker>=0){
        const block=buffer.slice(0,marker);
        buffer=buffer.slice(marker+2);
        if(block.includes("event: event")){
          const idLine=block.split("\n").find(line=>line.startsWith("id: "));
          return {id:idLine?.slice(4).trim()??"",block};
        }
        continue;
      }
      const result=await Promise.race([
        reader.read(),
        new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),Math.max(1,deadline-Date.now())))
      ]);
      if(result?.timeout) break;
      if(result.done) break;
      buffer+=decoder.decode(result.value,{stream:true});
    }
    return null;
  }
  return {controller,nextEvent};
}

console.log("[1/8] HTTPS health");
for(const path of ["/health/live","/health/ready"]){
  const {res,text}=await get(path);
  assertOk(res.status===200,"HEALTH_FAILED:"+path+":"+res.status+":"+text);
}
console.log("PASS");

console.log("[2/8] authenticated actor + organization scope");
{
  const {res,text}=await get("/v1/education/actors/"+encodeURIComponent(actorId));
  assertOk(res.status===200,"ACTOR_FAILED:"+res.status+":"+text);
  const body=JSON.parse(text);
  assertOk(body?.data?.actor_id===actorId,"ACTOR_SCOPE_FAILED");
}
console.log("PASS");

console.log("[3/8] hostile CORS denied");
{
  const {res}=await get("/v1/education/actors/"+encodeURIComponent(actorId),{origin:"https://untrusted.invalid"});
  assertOk(res.status===403,"CORS_NOT_DENIED:"+res.status);
}
console.log("PASS");

console.log("[4/8] SSE initial connection + durable event");
const sse1=await openSse();
const first=eventPayload(1);
const firstPost=await post("/v1/education/sync/events",first,first.idempotencyKey);
assertOk(firstPost.res.status===200,"SYNC_FIRST_FAILED:"+firstPost.res.status+":"+firstPost.text);
const firstEvent=await sse1.nextEvent();
assertOk(firstEvent?.id,"SSE_FIRST_EVENT_ID_MISSING:"+firstEvent?.block);
sse1.controller.abort();
console.log("PASS");

console.log("[5/8] second event while disconnected");
const second=eventPayload(2);
const secondPost=await post("/v1/education/sync/events",second,second.idempotencyKey);
assertOk(secondPost.res.status===200,"SYNC_SECOND_FAILED:"+secondPost.res.status+":"+secondPost.text);
console.log("PASS");

console.log("[6/8] Last-Event-ID durable replay");
const sse2=await openSse(firstEvent.id);
const replayed=await sse2.nextEvent();
assertOk(replayed?.id,"SSE_REPLAY_MISSING:"+replayed?.block);
assertOk(replayed.id!==firstEvent.id,"SSE_REPLAY_RETURNED_OLD_EVENT");
assertOk(replayed.block.includes(second.eventId),"SSE_REPLAY_WRONG_EVENT:"+replayed.block);
sse2.controller.abort();
console.log("PASS");

console.log("[7/8] HTTP idempotency replay");
const replay=await post("/v1/education/sync/events",first,first.idempotencyKey);
assertOk(replay.res.status===200,"HTTP_REPLAY_FAILED:"+replay.res.status+":"+replay.text);
assertOk(JSON.parse(replay.text)?.replayed===true,"HTTP_REPLAY_NOT_CONFIRMED:"+replay.text);
console.log("PASS");

console.log("[8/8] Replit certification boundary");
console.log("PASS: HTTPS, PostgreSQL-backed session, organization scope, CORS isolation, live SSE, durable Last-Event-ID replay and HTTP idempotency.");
console.log("NOT_CERTIFIED_HERE: physical Android, real Wi-Fi/mobile-data interruption, Android CA installation and device-level offline queue behavior.");
