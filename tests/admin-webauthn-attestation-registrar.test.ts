import test from "node:test";
import assert from "node:assert/strict";
import { AdminWebAuthnAttestationRegistrar } from "../packages/security/admin-webauthn-attestation-registrar.js";
import type { Pool } from "pg";

const pool={} as Pool;
test("P063 requires a canonical HTTPS Admin origin",()=>{
 assert.throws(()=>new AdminWebAuthnAttestationRegistrar(pool,"http://admin.example.test"),/HTTPS/);
 assert.throws(()=>new AdminWebAuthnAttestationRegistrar(pool,"https://admin.example.test/path"),/HTTPS/);
});
test("P063 rejects malformed registration encodings before database access",async()=>{
 const registrar=new AdminWebAuthnAttestationRegistrar(pool,"https://admin.example.test");
 const result=await registrar.register({principalId:"p",challengeId:"c",credentialId:"***",clientDataJSON:"***",attestationObject:"***"});
 assert.deepEqual(result,{registered:false,reason:"ATTESTATION_OBJECT_INVALID"});
});
test("P063 rejects none and unsupported attestation formats fail-closed",async()=>{
 const registrar=new AdminWebAuthnAttestationRegistrar(pool,"https://admin.example.test");
 const clientData=Buffer.from(JSON.stringify({type:"webauthn.create",challenge:"Y2hhbGxlbmdl",origin:"https://admin.example.test",crossOrigin:false})).toString("base64url");
 // Minimal CBOR map: fmt=none, authData empty, attStmt empty map.
 const object=Buffer.from([0xa3,0x63,0x66,0x6d,0x74,0x64,0x6e,0x6f,0x6e,0x65,0x68,0x61,0x75,0x74,0x68,0x44,0x61,0x74,0x61,0x40,0x67,0x61,0x74,0x74,0x53,0x74,0x6d,0x74,0xa0]).toString("base64url");
 const result=await registrar.register({principalId:"p",challengeId:"c",credentialId:"Y3JlZA",clientDataJSON:clientData,attestationObject:object});
 assert.deepEqual(result,{registered:false,reason:"ATTESTATION_FORMAT_NOT_ALLOWED"});
});
test("P063 rejects client data not bound to the Admin origin",async()=>{
 const registrar=new AdminWebAuthnAttestationRegistrar(pool,"https://admin.example.test");
 const clientData=Buffer.from(JSON.stringify({type:"webauthn.create",challenge:"Y2hhbGxlbmdl",origin:"https://evil.example.test",crossOrigin:false})).toString("base64url");
 const object=Buffer.from([0xa3,0x63,0x66,0x6d,0x74,0x64,0x6e,0x6f,0x6e,0x65,0x68,0x61,0x75,0x74,0x68,0x44,0x61,0x74,0x61,0x40,0x67,0x61,0x74,0x74,0x53,0x74,0x6d,0x74,0xa0]).toString("base64url");
 const result=await registrar.register({principalId:"p",challengeId:"c",credentialId:"Y3JlZA",clientDataJSON:clientData,attestationObject:object});
 assert.deepEqual(result,{registered:false,reason:"CLIENT_DATA_INVALID"});
});
