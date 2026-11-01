import test from "node:test";
import assert from "node:assert/strict";
import {createSchoolWebClient} from "../apps/education-web/src/school-web.js";

test("P045 School web client enforces HTTPS and session expiry",async()=>{
  const config={apiBaseUrl:"https://school.example",session:{accessToken:"short-lived-token",expiresAt:new Date(Date.now()+60000).toISOString()}};
  const client=createSchoolWebClient(config);
  const original=globalThis.fetch;
  let captured:RequestInit|undefined;
  globalThis.fetch=async(_input,init)=>{captured=init;return new Response("{}",{status:200,headers:{"content-type":"application/json"}});};
  try{
    await client.mutate("/v1/education/work-items",{id:"w1"});
    const headers=new Headers(captured?.headers);assert.equal(headers.get("authorization"),"Bearer short-lived-token");assert.ok(headers.get("x-idempotency-key"));
    assert.equal(headers.get("x-tenant-id"),null);
  }finally{globalThis.fetch=original;}
  assert.throws(()=>createSchoolWebClient({apiBaseUrl:"http://school.example",session:config.session}),/WEB_HTTPS_REQUIRED/);
  await assert.rejects(createSchoolWebClient({apiBaseUrl:"https://school.example",session:{...config.session,expiresAt:new Date(Date.now()-1).toISOString()}}).request("/v1/education/actors/current"),/WEB_SESSION_EXPIRED/);
});


test("P057 school web client reads tenant-scoped classes and enrollments from authenticated APIs",async()=>{
  const config={apiBaseUrl:"https://school.example",session:{accessToken:"session-token",expiresAt:new Date(Date.now()+60000).toISOString()}};
  const original=globalThis.fetch;const requests:Array<{url:string;init:RequestInit}>=[];
  globalThis.fetch=async(input,init={})=>{
    requests.push({url:String(input),init});
    const data=requests.length===1?[{class_id:"class-1",academic_year:"2026-2027",code:"6E-A",name:"Sixième A",level:"Collège",capacity:45,status:"ACTIVE",version:1}]:[{enrollment_id:"enroll-1",student_id:"student-1",class_id:"class-1",academic_year:"2026-2027",status:"ACTIVE",enrolled_at:"2026-09-01T00:00:00.000Z",version:1}];
    return new Response(JSON.stringify({ok:true,data}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const client=createSchoolWebClient(config);
    const classes=await client.listClasses("2026-2027");
    const enrollments=await client.listEnrollments("class-1","2026-2027");
    assert.equal(classes[0]?.code,"6E-A");
    assert.equal(enrollments[0]?.student_id,"student-1");
    assert.match(requests[0]!.url,/\/v1\/education\/classes\?academicYear=2026-2027$/);
    assert.match(requests[1]!.url,/\/v1\/education\/enrollments\?/);
    for(const request of requests)assert.equal(new Headers(request.init.headers).get("authorization"),"Bearer session-token");
  }finally{globalThis.fetch=original;}
});

test("P057 school web mutations send only school-domain fields with idempotency keys",async()=>{
  const config={apiBaseUrl:"https://school.example",session:{accessToken:"session-token",expiresAt:new Date(Date.now()+60000).toISOString()}};
  const original=globalThis.fetch;const captured:Array<{url:string;init:RequestInit}>=[];
  globalThis.fetch=async(input,init={})=>{
    captured.push({url:String(input),init});
    const data=captured.length===1?{class_id:"class-2",academic_year:"2026-2027",code:"5E-B",name:"Cinquième B",level:"Collège",capacity:40,status:"ACTIVE",version:1}:{enrollment_id:"enroll-2",student_id:"student-2",class_id:"class-2",academic_year:"2026-2027",status:"ACTIVE",enrolled_at:"2026-09-01T00:00:00.000Z",version:1};
    return new Response(JSON.stringify({ok:true,data}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const client=createSchoolWebClient(config);
    await client.createClass({academicYear:"2026-2027",code:"5E-B",name:"Cinquième B",level:"Collège",capacity:40});
    await client.createEnrollment({studentId:"student-2",classId:"class-2",academicYear:"2026-2027"});
    for(const request of captured){
      const headers=new Headers(request.init.headers);
      assert.ok(headers.get("x-idempotency-key"));
      assert.equal(headers.get("content-type"),"application/json");
      const body=JSON.parse(String(request.init.body));
      assert.equal("amount" in body,false);
      assert.equal("schoolFee" in body,false);
      assert.equal("walletId" in body,false);
    }
  }finally{globalThis.fetch=original;}
});

test("P057 school web client surfaces server authorization denials without pretending success",async()=>{
  const config={apiBaseUrl:"https://school.example",session:{accessToken:"session-token",expiresAt:new Date(Date.now()+60000).toISOString()}};
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,error:{code:"AUTHORIZATION_DENIED"}}),{status:403,headers:{"content-type":"application/json"}});
  try{await assert.rejects(createSchoolWebClient(config).listClasses(),/AUTHORIZATION_DENIED/);}
  finally{globalThis.fetch=original;}
});
