import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AdminSessionLifecycle } from "../packages/security/admin-session-lifecycle.js";
import type { Pool } from "pg";

const digest=(v:string)=>createHash("sha256").update(v).digest();
function fixture(options?:{floor?:string;principal?:string;credential?:boolean;session?:boolean;expired?:boolean;revoked?:boolean}){
 const now=new Date("2026-11-11T12:00:00.000Z");
 const state={inserted:false,revoked:false,audit:0,sessionToken:""};
 const client={
  async query(sql:string,params:unknown[]=[]):Promise<any>{
   const s=sql.trim().replace(/\s+/g," ");
   if(["BEGIN","COMMIT","ROLLBACK"].includes(s))return {rows:[],rowCount:0};
   if(s.includes("FROM tpay_admin_principals"))return {rows:[{status:options?.principal??"active",assurance_floor:options?.floor??"webauthn_uv"}],rowCount:1};
   if(s.includes("FROM tpay_admin_webauthn_credentials"))return {rows:[],rowCount:options?.credential===false?0:1};
   if(s.includes("INSERT INTO tpay_admin_sessions")){state.inserted=true;state.sessionToken=String(params[3]);return {rows:[],rowCount:1};}
   if(s.includes("INSERT INTO tpay_admin_security_audit")){state.audit++;return {rows:[],rowCount:1};}
   if(s.includes("FROM tpay_admin_sessions")&&s.includes("FOR UPDATE"))return {rows:[{id:"session-1",principal_id:"admin-1"}],rowCount:1};
   if(s.includes("UPDATE tpay_admin_sessions SET revoked_at")){state.revoked=true;return {rows:[],rowCount:1};}
   return {rows:[],rowCount:1};
  },release(){}
 };
 const pool={
  connect:async()=>client,
  async query(sql:string,params:unknown[]=[]):Promise<any>{
   const s=sql.trim().replace(/\s+/g," ");
   if(s.includes("FROM tpay_admin_sessions s"))return options?.session===false?{rows:[],rowCount:0}:{rows:[{
    principal_id:"admin-1",session_id:"session-1",credential_id:"credential-1",
    assurance:"webauthn_uv",expires_at:options?.expired?new Date(now.getTime()-1000):new Date(now.getTime()+60000),
    principal_status:options?.principal??"active",credential_status:options?.revoked?"revoked":"active",
    credential_revoked_at:options?.revoked?now:null,session_revoked_at:null,origin:"https://admin.example.test"
   }],rowCount:1};
   return {rows:[],rowCount:1};
  }
 } as unknown as Pool;
 const service=new AdminSessionLifecycle(pool,{adminOrigin:"https://admin.example.test",clock:()=>now});
 return {service,state,now};
}
const verified={verified:true as const,principalId:"admin-1",credentialRef:"credential-1",assurance:"webauthn_uv" as const,signCount:1};

test("P062 issues a short-lived session only from a verified assertion",async()=>{
 const f=fixture();const result=await f.service.issueFromAssertion(verified);
 assert.equal(result.issued,true);
 if(result.issued){assert.equal(result.assurance,"webauthn_uv");assert.equal(new Date(result.expiresAt).getTime()-f.now.getTime(),900000);}
 assert.equal(f.state.inserted,true);assert.equal(f.state.audit,1);
});

test("P062 rejects hardware-key assurance floors without verified attestation",async()=>{
 const f=fixture({floor:"hardware_key"});const result=await f.service.issueFromAssertion(verified);
 assert.deepEqual(result,{issued:false,reason:"HARDWARE_ATTESTATION_REQUIRED"});
 assert.equal(f.state.inserted,false);
});

test("P062 rejects inactive principals and revoked credentials",async()=>{
 const p=fixture({principal:"suspended"});
 assert.deepEqual(await p.service.issueFromAssertion(verified),{issued:false,reason:"ADMIN_PRINCIPAL_INACTIVE"});
 const c=fixture({credential:false});
 assert.deepEqual(await c.service.issueFromAssertion(verified),{issued:false,reason:"WEBAUTHN_CREDENTIAL_REVOKED"});
});

test("P062 rejects a fabricated unverified assertion",async()=>{
 const f=fixture();const result=await f.service.issueFromAssertion({verified:false,reason:"SIGNATURE_INVALID"});
 assert.deepEqual(result,{issued:false,reason:"WEBAUTHN_ASSERTION_NOT_VERIFIED"});
 assert.equal(f.state.inserted,false);
});

test("P062 validates session expiry, principal and credential state",async()=>{
 const f=fixture();
 assert.equal((await f.service.validate("a".repeat(43))).authenticated,true);
 const expired=fixture({expired:true});
 assert.deepEqual(await expired.service.validate("a".repeat(43)),{authenticated:false,reason:"SESSION_EXPIRED"});
 const revoked=fixture({revoked:true});
 assert.deepEqual(await revoked.service.validate("a".repeat(43)),{authenticated:false,reason:"CREDENTIAL_REVOKED"});
 const inactive=fixture({principal:"revoked"});
 assert.deepEqual(await inactive.service.validate("a".repeat(43)),{authenticated:false,reason:"PRINCIPAL_INACTIVE"});
});

test("P062 revokes a session and persists an audit record",async()=>{
 const f=fixture();const result=await f.service.revoke("a".repeat(43),"credential compromise");
 assert.deepEqual(result,{revoked:true});assert.equal(f.state.revoked,true);assert.equal(f.state.audit,1);
});

test("P062 rejects invalid Admin origins and excessive session TTL",()=>{
 assert.throws(()=>new AdminSessionLifecycle({} as Pool,{adminOrigin:"http://admin.example.test"}),/HTTPS_ORIGIN/);
 assert.throws(()=>new AdminSessionLifecycle({} as Pool,{adminOrigin:"https://admin.example.test",ttlSeconds:3600}),/TTL/);
});
