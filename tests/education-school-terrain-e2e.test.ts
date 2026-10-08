import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { PostgresSchoolRealtimeStore } from "../packages/education/src/postgres-realtime-store.js";
import { PostgresEducationSyncStore } from "../packages/education/src/postgres-sync-fabric.js";
import { computeSyncPayloadHash, type SyncEvent } from "../packages/education/src/sync-fabric.js";
import type { IncomingMessage } from "node:http";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P055 E2E terrain links administration → teacher → student → parent → API → PostgreSQL → offline sync → realtime → audit",{
  skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"
},async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:8});
  const tenant=randomUUID(),org=randomUUID(),otherTenant=randomUUID(),otherOrg=randomUUID();
  const admin=randomUUID(),teacher=randomUUID(),student=randomUUID(),parent=randomUUID(),otherParent=randomUUID();
  const otherStudent=randomUUID(),device=randomUUID();
  const tokens=new Map([
    ["admin-token",{userId:admin,kind:"ADMIN"}],
    ["teacher-token",{userId:teacher,kind:"TEACHER"}],
    ["student-token",{userId:student,kind:"STUDENT"}],
    ["parent-token",{userId:parent,kind:"PARENT"}],
    ["other-parent-token",{userId:otherParent,kind:"PARENT"}],
    ["expired-token",{userId:parent,kind:"PARENT",expired:true}]
  ]);
  const client=await pool.connect();
  try{
    await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    await client.query("BEGIN");
    for(const [actorId,kind] of [[admin,"ADMIN"],[teacher,"TEACHER"],[student,"STUDENT"],[parent,"PARENT"]]){
      await client.query(
        "INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active,data) VALUES($1,$2,$3,$4,true,$5::jsonb)",
        [actorId,tenant,org,kind,JSON.stringify({display_name:kind})]
      );
    }
    await client.query(
      "INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active,data) VALUES($1,$2,$3,'PARENT',true,'{}'::jsonb)",
      [otherParent,otherTenant,otherOrg]
    );
    await client.query(
      "INSERT INTO education_students(student_id,tenant_id,organization_id,lifecycle,data) VALUES($1,$2,$3,'ACTIVE',$4::jsonb)",
      [student,tenant,org,JSON.stringify({
        id:student,name:"Student Terrain",academic_record:{average:15.5},identity_document:"D4-SECRET"
      })]
    );
    await client.query(
      "INSERT INTO education_students(student_id,tenant_id,organization_id,lifecycle,data) VALUES($1,$2,$3,'ACTIVE',$4::jsonb)",
      [otherStudent,otherTenant,otherOrg,JSON.stringify({id:otherStudent,name:"Other Student",academic_record:{average:4}})
    ]);
    await client.query(
      "INSERT INTO education_parent_student_links(tenant_id,organization_id,parent_actor_id,student_id) VALUES($1,$2,$3,$4)",
      [tenant,org,parent,student]
    );
    await client.query("COMMIT");

    const auth=async(req:IncomingMessage)=>{
      const token=String(req.headers.authorization??"").replace(/^Bearer\s+/i,"");
      const entry=tokens.get(token);
      if(!entry)throw new Error("AUTHENTICATION_REQUIRED");
      const expiresAt="expired" in entry ? Date.now()-1 : Date.now()+120000;
      return {
        tenantId:token==="other-parent-token"?otherTenant:tenant,
        principal:{
          userId:entry.userId,organizationId:token==="other-parent-token"?otherOrg:org,
          permissions:["org.read","member.manage"] as const,sessionId:"p055-"+token
        },
        session:{
          sessionId:"p055-"+token,userId:entry.userId,
          organizationId:token==="other-parent-token"?otherOrg:org,
          createdAt:Date.now()-1000,expiresAt,assurance:"standard" as const
        }
      };
    };

    const server=createSchoolApiServer({
      db:pool as any,
      authenticate:auth,
      syncClient:async()=>pool.connect(),
      realtime:undefined
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",()=>resolve()));
    const address=server.address() as {port:number};
    const base=`http://127.0.0.1:${address.port}`;
    const request=async(token:string,path:string,init:RequestInit={})=>{
      const headers=new Headers(init.headers);
      headers.set("authorization",`Bearer ${token}`);
      if(init.body)headers.set("content-type","application/json");
      return fetch(base+path,{...init,headers});
    };

    const own=await request("student-token",`/v1/education/students/${student}`);
    assert.equal(own.status,200);
    const ownBody=await own.json() as any;
    assert.equal(ownBody.data.fields.name,"Student Terrain");
    assert.equal(ownBody.data.fields.academicRecord.average,15.5);
    assert.equal(JSON.stringify(ownBody.data).includes("identity_document"),false);

    const parentRead=await request("parent-token",`/v1/education/students/${student}`);
    assert.equal(parentRead.status,200);

    const unrelated=await request("other-parent-token",`/v1/education/students/${student}`);
    assert.equal(unrelated.status,404);

    const expired=await request("expired-token",`/v1/education/students/${student}`);
    assert.equal(expired.status,400);

    const attendance={
      studentId:student,classId:"class-p055",status:"PRESENT",recordedBy:teacher,
      occurredAt:new Date().toISOString(),source:"TEACHER",version:1
    };
    const attendanceResponse=await request("teacher-token","/v1/education/attendance",{
      method:"POST",headers:{"x-idempotency-key":"p055-attendance-001"},body:JSON.stringify(attendance)
    });
    assert.equal(attendanceResponse.status,200);

    const offline2:SyncEvent={
      eventId:randomUUID(),tenantId:tenant,organizationId:org,deviceId:device,actorId:teacher,
      sequence:2n,occurredAt:new Date().toISOString(),eventType:"attendance",priority:"P1",
      payload:{studentId:student,status:"ABSENT"},payloadHash:computeSyncPayloadHash({studentId:student,status:"ABSENT"}),
      idempotencyKey:"p055-offline-seq-002",schemaVersion:1
    };
    const pending=await request("teacher-token","/v1/education/sync/events",{
      method:"POST",headers:{"x-idempotency-key":"p055-sync-http-002"},body:JSON.stringify({...offline2,sequence:"2"})
    });
    assert.equal(pending.status,200);
    assert.equal((await pending.json() as any).data.state,"PENDING");

    const offline1={...offline2,eventId:randomUUID(),sequence:1n,payload:{studentId:student,status:"PRESENT"},payloadHash:computeSyncPayloadHash({studentId:student,status:"PRESENT"}),idempotencyKey:"p055-offline-seq-001"};
    const accepted=await request("teacher-token","/v1/education/sync/events",{
      method:"POST",headers:{"x-idempotency-key":"p055-sync-http-001"},body:JSON.stringify({...offline1,sequence:"1"})
    });
    assert.equal(accepted.status,200);
    const acceptedBody=await accepted.json() as any;
    assert.equal(acceptedBody.data.state,"ACCEPTED");
    assert.equal(acceptedBody.data.drainedPending,1);

    const syncCounts=await pool.query(
      "SELECT (SELECT count(*) FROM education_sync_inbox WHERE tenant_id=$1 AND organization_id=$2 AND state='ACCEPTED')::int AS inbox,(SELECT count(*) FROM education_sync_outbox WHERE tenant_id=$1 AND organization_id=$2)::int AS outbox",
      [tenant,org]
    );
    assert.deepEqual(syncCounts.rows[0],{inbox:2,outbox:2});

    const realtimeClient=await pool.connect();
    const realtime=await new PostgresSchoolRealtimeStore(realtimeClient).replay(tenant,org,0n);
    realtimeClient.release();
    assert.equal(realtime.state,"OK");
    assert.equal(realtime.events.length,2);
    assert.equal(realtime.events[0]?.streamSequence,"1");
    assert.equal(realtime.events[1]?.streamSequence,"2");

    const audit=await pool.query(
      "SELECT count(*)::int AS count FROM api_request_audit WHERE organization_id=$1 AND route LIKE '/v1/education/%'",
      [org]
    );
    assert.ok(Number(audit.rows[0]?.count)>=4);

    const a=await pool.connect(),b=await pool.connect();
    try{
      const makeEvent=(sequence:bigint,payload:unknown,idempotencyKey:string):SyncEvent=>({
        eventId:randomUUID(),tenantId:tenant,organizationId:org,deviceId,actorId:teacher,sequence,
        occurredAt:new Date().toISOString(),eventType:"attendance",priority:"P1",payload,
        payloadHash:computeSyncPayloadHash(payload),idempotencyKey,schemaVersion:1
      });
      const [r1,r2]=await Promise.all([
        new PostgresEducationSyncStore(a).accept(makeEvent(3n,{studentId:student,status:"LATE"},"p055-concurrent-a")),
        new PostgresEducationSyncStore(b).accept(makeEvent(3n,{studentId:student,status:"EXCUSED"},"p055-concurrent-b"))
      ]);
      assert.deepEqual([r1.state,r2.state].sort(),["ACCEPTED","REJECTED"]);
    }finally{a.release();b.release();}

    const crossTenantRows=await pool.query(
      "SELECT count(*)::int AS count FROM education_students WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3",
      [tenant,org,otherStudent]
    );
    assert.equal(crossTenantRows.rows[0]?.count,0);

    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }finally{
    await client.query("ROLLBACK").catch(()=>undefined);
    await client.query("DELETE FROM api_request_audit WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM api_request_deduplication WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_sync_outbox WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_sync_inbox WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_sync_device_cursors WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_realtime_events WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_realtime_stream_cursors WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_attendance WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_parent_student_links WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_students WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_actors WHERE organization_id=$1",[org]).catch(()=>undefined);
    await client.query("DELETE FROM education_actors WHERE organization_id=$1",[otherOrg]).catch(()=>undefined);
    client.release();
    await pool.end();
  }
});
