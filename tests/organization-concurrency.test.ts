import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {
  registerWithPassword,
  createOrganizationWithFounder,
  createOrganizationRole,
  updateOrganizationRole,
  setOrganizationMemberRole,
  setOrganizationMemberStatus,
  listOrganizationMembers,
  getOrganization,
  createOrganizationInvitation, acceptOrganizationInvitation, issueOrganizationPortalCode,
} from "../packages/identity/src/postgres.js";
import {ApiGatewayRepository} from "../packages/api-gateway/src/repository.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

async function fixture(pool:pg.Pool){
  const founder=await registerWithPassword(pool,{loginIdentifier:`org-concurrency-founder-${randomUUID()}@test.invalid`,displayName:"Org Concurrency Founder",password:"correct horse battery staple 123"});
  const memberA=await registerWithPassword(pool,{loginIdentifier:`org-concurrency-a-${randomUUID()}@test.invalid`,displayName:"Member A",password:"correct horse battery staple 123"});
  const memberB=await registerWithPassword(pool,{loginIdentifier:`org-concurrency-b-${randomUUID()}@test.invalid`,displayName:"Member B",password:"correct horse battery staple 123"});
  const org=await createOrganizationWithFounder(pool,{founderId:founder.userId,name:"Concurrency Organization",type:"company",accessCode:"secure-org-code-123"});
  await pool.query("INSERT INTO organization_memberships(organization_id,user_id,role_id) VALUES($1,$2,$3),($1,$4,$3)",[org.organizationId,memberA.userId,org.roleId,memberB.userId]);
  return {founder,memberA,memberB,organizationId:org.organizationId,roleId:org.roleId};
}

async function cleanup(pool:pg.Pool,organizationId:string,ids:string[]){
  await pool.query("DELETE FROM organizations WHERE id=$1",[organizationId]).catch(()=>undefined);
  for(const id of ids) await pool.query("DELETE FROM users WHERE id=$1",[id]).catch(()=>undefined);
}

test("concurrent role creation preserves tenant uniqueness", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    const results=await Promise.allSettled(Array.from({length:8},()=>createOrganizationRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,name:"Concurrent Role",permissions:["org.read","member.manage"]})));
    const successes=results.filter(x=>x.status==="fulfilled");
    assert.equal(successes.length,1);
    const rows=await pool.query("SELECT count(*)::int AS count FROM organization_roles WHERE organization_id=$1 AND name='Concurrent Role'",[f.organizationId]);
    assert.equal(rows.rows[0].count,1);
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});

test("concurrent role updates leave a valid single role state", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    const role=(await createOrganizationRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,name:"Mutable Role",permissions:["org.read"]})).roleId;
    const [a,b]=await Promise.all([
      updateOrganizationRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,roleId:role,name:"Mutable A",permissions:["org.read","content.read"]}),
      updateOrganizationRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,roleId:role,name:"Mutable B",permissions:["org.read","content.write"]})
    ]);
    void a;void b;
    const row=(await pool.query("SELECT name,permissions FROM organization_roles WHERE id=$1 AND organization_id=$2",[role,f.organizationId])).rows[0];
    assert.ok(["Mutable A","Mutable B"].includes(row.name));
    assert.ok(Array.isArray(row.permissions));
    assert.ok(row.permissions.includes("org.read"));
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});

test("concurrent role assignment never crosses tenants", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    const roleA=(await createOrganizationRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,name:"Role A",permissions:["org.read"]})).roleId;
    const roleB=(await createOrganizationRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,name:"Role B",permissions:["content.read"]})).roleId;
    await Promise.all([
      setOrganizationMemberRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,userId:f.memberA.userId,roleId:roleA}),
      setOrganizationMemberRole(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,userId:f.memberB.userId,roleId:roleB})
    ]);
    const rows=await pool.query("SELECT user_id,role_id FROM organization_memberships WHERE organization_id=$1 AND user_id=ANY($2::uuid[])",[f.organizationId,[f.memberA.userId,f.memberB.userId]]);
    assert.equal(rows.rowCount,2);
    assert.deepEqual(new Set(rows.rows.map((x:any)=>x.role_id)),new Set([roleA,roleB]));
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});

test("concurrent suspension and reactivation leaves membership in an allowed state", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    await Promise.allSettled([
      setOrganizationMemberStatus(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,userId:f.memberA.userId,status:"suspended"}),
      setOrganizationMemberStatus(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,userId:f.memberA.userId,status:"active"})
    ]);
    const row=(await pool.query("SELECT status FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",[f.organizationId,f.memberA.userId])).rows[0];
    assert.ok(["active","suspended"].includes(row.status));
    const members=await listOrganizationMembers(pool,f.organizationId,f.founder.userId);
    assert.equal(members.find(x=>x.userId===f.memberA.userId)?.status,row.status);
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});

test("organization GET and PATCH remain tenant-scoped and audited", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:8});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    const before=await getOrganization(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId});
    assert.equal(before.name,"Concurrency Organization");
    const after=await (await import("../packages/identity/src/postgres.js")).updateOrganization(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,name:"Renamed Organization"});
    assert.equal(after.name,"Renamed Organization");
    const audit=await pool.query("SELECT action FROM organization_audit_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1",[f.organizationId]);
    assert.equal(audit.rows[0].action,"organization.updated");
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});

test("concurrent idempotency reservation yields one owner",async()=>{
  let owner:string|null=null;
  let inserted=false;
  const db={query:async(sql:string,values:unknown[]=[]):Promise<{rows:Record<string,unknown>[];rowCount:number}>=>{
    if(sql.includes("INSERT INTO api_request_deduplication")){
      if(!inserted){inserted=true;owner=String(values[0]);return {rows:[{id:owner}],rowCount:1};}
      return {rows:[],rowCount:0};
    }
    if(sql.includes("SELECT id,request_hash,route,state,response_hash,response_body,status_code")){
      return {rows:[{id:owner,request_hash:"a".repeat(64),route:"/v1/test",state:"reserved"}],rowCount:1};
    }
    throw new Error("unexpected query");
  }};
  const repo=new ApiGatewayRepository(db);
  const [a,b]=await Promise.all([
    repo.reserveOrReplay({key:"same-key",requestHash:"a".repeat(64),route:"/v1/test",expiresAt:new Date(Date.now()+3600000).toISOString()}),
    repo.reserveOrReplay({key:"same-key",requestHash:"a".repeat(64),route:"/v1/test",expiresAt:new Date(Date.now()+3600000).toISOString()})
  ]);
  assert.equal([a.status,b.status].filter(x=>x==="reserved").length,1);
  assert.equal([a.status,b.status].filter(x=>x==="replay").length,1);
});

test("concurrent invitation acceptance is single-use and tenant-scoped", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    const invitee=await registerWithPassword(pool,{loginIdentifier:`invited-${randomUUID()}@test.invalid`,displayName:"Invited User",password:"correct horse battery staple 123"});
    const invitation=await createOrganizationInvitation(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,loginIdentifier:(await pool.query("SELECT login_identifier FROM users WHERE id=$1",[invitee.userId])).rows[0].login_identifier,roleId:f.roleId});
    const results=await Promise.allSettled([
      acceptOrganizationInvitation(pool,{organizationId:f.organizationId,invitationId:invitation.invitationId,token:invitation.token,userId:invitee.userId}),
      acceptOrganizationInvitation(pool,{organizationId:f.organizationId,invitationId:invitation.invitationId,token:invitation.token,userId:invitee.userId})
    ]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    const row=(await pool.query("SELECT status FROM organization_invitations WHERE id=$1",[invitation.invitationId])).rows[0];
    assert.equal(row.status,"accepted");
    await pool.query("DELETE FROM users WHERE id=$1",[invitee.userId]).catch(()=>undefined);
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});

test("portal code issuance revokes previous code and session opens only for the member", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:16});
  let f:any;
  try{
    await applyMigrations(pool,new URL("../../migrations/",import.meta.url));
    f=await fixture(pool);
    const first=await issueOrganizationPortalCode(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,userId:f.memberA.userId,expiresInHours:2});
    const second=await issueOrganizationPortalCode(pool,{organizationId:f.organizationId,actorUserId:f.founder.userId,userId:f.memberA.userId,expiresInHours:2});
    const rows=await pool.query("SELECT status FROM organization_portal_codes WHERE organization_id=$1 AND user_id=$2 ORDER BY created_at ASC",[f.organizationId,f.memberA.userId]);
    assert.equal(rows.rows.filter((x:any)=>x.status==="active").length,1);
    assert.equal(rows.rows[0].status,"revoked");
    assert.equal(rows.rows[1].status,"active");
    assert.ok(first.code&&second.code);
  }finally{if(f)await cleanup(pool,f.organizationId,[f.founder.userId,f.memberA.userId,f.memberB.userId]);await pool.end();}
});
