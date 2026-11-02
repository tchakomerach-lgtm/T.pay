import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { SchoolRealtimeHub } from "../packages/education/src/school-realtime.js";
import type { Permission } from "../packages/security/src/policy.js";

function makeAuth(permissions: Permission[] = ["org.read","org.manage"]) {
  return {
    principal: { userId:"school-admin", organizationId:"org-school", permissions, sessionId:"session-school" },
    tenantId:"tenant-school",
    session: { sessionId:"session-school", userId:"school-admin", organizationId:"org-school", createdAt:0, expiresAt:Date.now()+60_000, assurance:"standard" as const }
  };
}
async function withServer(db: any, permissions: Permission[], run: (base:string)=>Promise<void>) {
  const server=createSchoolApiServer({db,authenticate:async()=>makeAuth(permissions),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
  await new Promise<void>(resolve=>server.listen(0,resolve));
  const address=server.address() as {port:number};
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
function responseDb() {
  const calls: Array<{sql:string;values:unknown[]}> = [];
  return {
    calls,
    async query(sql:string,values:unknown[] = []) {
      calls.push({sql,values});
      if(sql.includes("INSERT INTO api_request_deduplication")) return {rows:[{id:"idempotency-reservation"}],rowCount:1};
      if(sql.includes("INSERT INTO education_classes")) return {rows:[{class_id:"class-created",code:"6E-A",name:"Sixième A",academic_year:"2026-2027",capacity:45,enrolled_count:0,status:"ACTIVE",version:1}],rowCount:1};
      if(sql.includes("INSERT INTO education_enrollments")) return {rows:[{enrollment_id:"enrollment-created",student_id:"student-1",class_id:"class-1",academic_year:"2026-2027",status:"ACTIVE",version:1}],rowCount:1};
      if(sql.includes("UPDATE education_enrollments SET status=")) return {rows:[{enrollment_id:"enrollment-1",student_id:"student-1",class_id:"class-1",academic_year:"2026-2027",status:values[0],version:2}],rowCount:1};
      return {rows:[],rowCount:0};
    }
  };
}

test("P056 authenticated school class creation is tenant scoped and audited",async()=>{
  const db=responseDb();
  await withServer(db,["org.read","org.manage"],async base=>{
    const res=await fetch(base+"/v1/education/classes",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"class-create-0001"},body:JSON.stringify({academicYear:"2026-2027",code:"6E-A",name:"Sixième A",level:"Collège",capacity:45})});
    const body=await res.json() as any;
    assert.equal(res.status,200,JSON.stringify(body));
    assert.equal(body.data.class_id,"class-created");
    const insert=db.calls.find(x=>x.sql.includes("INSERT INTO education_classes"));
    assert.ok(insert);
    assert.equal(insert.values[1],"tenant-school");
    assert.equal(insert.values[2],"org-school");
    assert.equal(insert.values[8],"school-admin");
  });
});

test("P056 class creation rejects client-supplied finance or unknown fields",async()=>{
  const db=responseDb();
  await withServer(db,["org.read","org.manage"],async base=>{
    const res=await fetch(base+"/v1/education/classes",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"class-finance-0001"},body:JSON.stringify({academicYear:"2026-2027",code:"6E-A",name:"Sixième A",level:"Collège",capacity:45,schoolFee:5000})});
    assert.equal(res.status,400);
    assert.equal(db.calls.some(x=>x.sql.includes("INSERT INTO education_classes")),false);
  });
});

test("P056 enrollment creation rejects cross-domain financial fields",async()=>{
  const db=responseDb();
  await withServer(db,["org.read","org.manage"],async base=>{
    const res=await fetch(base+"/v1/education/enrollments",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-pay-0001"},body:JSON.stringify({studentId:"student-1",classId:"class-1",academicYear:"2026-2027",amount:5000,currency:"XOF"})});
    assert.equal(res.status,400);
    assert.equal(db.calls.some(x=>x.sql.includes("INSERT INTO education_enrollments")),false);
  });
});

test("P056 class and enrollment reads require organization read permission",async()=>{
  const db=responseDb();
  await withServer(db,["member.manage"],async base=>{
    const classes=await fetch(base+"/v1/education/classes");
    const enrollments=await fetch(base+"/v1/education/enrollments");
    assert.equal(classes.status,403);
    assert.equal(enrollments.status,403);
  });
});

test("P056 class and enrollment writes require organization management permission",async()=>{
  const db=responseDb();
  await withServer(db,["org.read"],async base=>{
    const classes=await fetch(base+"/v1/education/classes",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"class-denied-0001"},body:JSON.stringify({academicYear:"2026-2027",code:"6E-A",name:"Sixième A",level:"Collège",capacity:45})});
    const enrollments=await fetch(base+"/v1/education/enrollments",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"enroll-denied-0001"},body:JSON.stringify({studentId:"student-1",classId:"class-1",academicYear:"2026-2027"})});
    assert.equal(classes.status,403);
    assert.equal(enrollments.status,403);
  });
});

test("P056 enrollment creation persists only the authenticated tenant and organization scope",async()=>{
  const db=responseDb();
  await withServer(db,["org.read","org.manage"],async base=>{
    const res=await fetch(base+"/v1/education/enrollments",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-create-0001"},body:JSON.stringify({studentId:"student-1",classId:"class-1",academicYear:"2026-2027"})});
    const body=await res.json() as any;
    assert.equal(res.status,200,JSON.stringify(body));
    assert.equal(body.data.enrollment_id,"enrollment-created");
    const insert=db.calls.find(x=>x.sql.includes("INSERT INTO education_enrollments"));
    assert.ok(insert);
    assert.equal(insert.values[1],"tenant-school");
    assert.equal(insert.values[2],"org-school");
    assert.equal(insert.values[7],"school-admin");
  });
});

test("P056 class and enrollment listing always applies server-derived tenant and organization predicates",async()=>{
  const db=responseDb();
  await withServer(db,["org.read"],async base=>{
    const classes=await fetch(base+"/v1/education/classes?academicYear=2026-2027");
    const enrollments=await fetch(base+"/v1/education/enrollments?classId=class-1&academicYear=2026-2027");
    assert.equal(classes.status,200);
    assert.equal(enrollments.status,200);
    const classQuery=db.calls.find(x=>x.sql.includes("FROM education_classes"));
    const enrollmentQuery=db.calls.find(x=>x.sql.includes("FROM education_enrollments"));
    assert.ok(classQuery);
    assert.ok(enrollmentQuery);
    assert.equal(classQuery.values[0],"tenant-school");
    assert.equal(classQuery.values[1],"org-school");
    assert.equal(enrollmentQuery.values[0],"tenant-school");
    assert.equal(enrollmentQuery.values[1],"org-school");
  });
});


test("P056 enrollment lifecycle transition is tenant-scoped, version-guarded and permission protected",async()=>{
  const db=responseDb();
  await withServer(db,["org.read","org.manage"],async base=>{
    const res=await fetch(base+"/v1/education/enrollments/enrollment-1",{method:"PATCH",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-withdraw-0001"},body:JSON.stringify({status:"WITHDRAWN",expectedVersion:1})});
    const body=await res.json() as any;
    assert.equal(res.status,200,JSON.stringify(body));
    assert.equal(body.data.status,"WITHDRAWN");
    assert.equal(body.data.version,2);
    const update=db.calls.find(x=>x.sql.includes("UPDATE education_enrollments SET status="));
    assert.ok(update);
    assert.match(update.sql,/tenant_id=\$2 AND organization_id=\$3/);
    assert.match(update.sql,/status='ACTIVE' AND version=\$5/);
    assert.deepEqual(update.values,["WITHDRAWN","tenant-school","org-school","enrollment-1",1]);
  });
});

test("P056 enrollment lifecycle rejects invalid terminal transitions and financial fields",async()=>{
  const db=responseDb();
  await withServer(db,["org.read","org.manage"],async base=>{
    const invalid=await fetch(base+"/v1/education/enrollments/enrollment-1",{method:"PATCH",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-invalid-0001"},body:JSON.stringify({status:"ACTIVE",expectedVersion:1})});
    const financial=await fetch(base+"/v1/education/enrollments/enrollment-1",{method:"PATCH",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-finance-0001"},body:JSON.stringify({status:"WITHDRAWN",expectedVersion:1,refundAmount:5000})});
    assert.equal(invalid.status,400);
    assert.equal(financial.status,400);
    assert.equal(db.calls.some(x=>x.sql.includes("UPDATE education_enrollments SET status=")),false);
  });
});

test("P056 enrollment lifecycle requires org.manage",async()=>{
  const db=responseDb();
  await withServer(db,["org.read"],async base=>{
    const res=await fetch(base+"/v1/education/enrollments/enrollment-1",{method:"PATCH",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-denied-0001"},body:JSON.stringify({status:"WITHDRAWN",expectedVersion:1})});
    assert.equal(res.status,403);
    assert.equal(db.calls.some(x=>x.sql.includes("UPDATE education_enrollments SET status=")),false);
  });
});


test("P056 class and enrollment mutations append tenant-scoped realtime events",async()=>{
  const db=responseDb();
  const events:Array<Record<string,unknown>>=[];
  const realtime=new SchoolRealtimeHub();
  const server=createSchoolApiServer({
    db,
    authenticate:async()=>makeAuth(["org.read","org.manage"]),
    syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,
    realtime,
    realtimeStore:{
      append:async(event)=>{events.push(event as unknown as Record<string,unknown>);return 7n;},
      replay:async()=>({state:"OK" as const,events:[],oldestSequence:null,latestSequence:null})
    }
  });
  await new Promise<void>(resolve=>server.listen(0,resolve));
  const address=server.address() as {port:number};
  try{
    const res=await fetch("http://127.0.0.1:"+address.port+"/v1/education/enrollments/enrollment-1",{method:"PATCH",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-event-0001"},body:JSON.stringify({status:"WITHDRAWN",expectedVersion:1})});
    assert.equal(res.status,200);
    assert.equal(events.length,1);
    assert.equal(events[0]?.type,"enrollment.changed");
    assert.equal(events[0]?.tenantId,"tenant-school");
    assert.equal(events[0]?.organizationId,"org-school");
    assert.equal(events[0]?.entityId,"enrollment-1");
    assert.equal((events[0]?.data as Record<string,unknown>)?.status,"WITHDRAWN");
  }finally{
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
