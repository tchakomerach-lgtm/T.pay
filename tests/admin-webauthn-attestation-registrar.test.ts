import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createPrivateKey, generateKeyPairSync, randomUUID, sign } from "node:crypto";
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

const hash=(value:Buffer|string)=>createHash("sha256").update(value).digest();
function cborLength(major:number,length:number):Buffer{
 if(length<24)return Buffer.from([(major<<5)|length]);
 if(length<256)return Buffer.from([(major<<5)|24,length]);
 if(length<65536)return Buffer.from([(major<<5)|25,length>>8,length&255]);
 throw new Error("test CBOR length unsupported");
}
function cbor(value:any):Buffer{
 if(typeof value==="number")return value>=0?cborLength(0,value):cborLength(1,-1-value);
 if(typeof value==="string"){const b=Buffer.from(value);return Buffer.concat([cborLength(3,b.length),b]);}
 if(Buffer.isBuffer(value))return Buffer.concat([cborLength(2,value.length),value]);
 if(Array.isArray(value))return Buffer.concat([cborLength(4,value.length),...value.map(cbor)]);
 if(value instanceof Map){const entries=[...value.entries()];return Buffer.concat([cborLength(5,entries.length),...entries.flatMap(([k,v])=>[cbor(k),cbor(v)])]);}
 throw new Error("test CBOR value unsupported");
}
const testLeafPrivateKey=createPrivateKey(`-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBFfYoswNox1AcarjxbUenLUiJ+DdX1c0TacQg3iP116oAoGCCqGSM49
AwEHoUQDQgAEV4zF7Cw/DA67qC8Wqr2I1/+wihgUj9eT95HhpIdbSMn+6MMKWJ3p
MnNfuTYI1ATkSGG3GXVI9Xz9gaSmvR61VQ==
-----END EC PRIVATE KEY-----`);
const leafDer=Buffer.from("MIICPjCCAeSgAwIBAgIUYMnIo7sPLLEBpi/fSkPM/Jdj1FAwCgYIKoZIzj0EAwIwTDELMAkGA1UEBhMCVEcxGDAWBgNVBAoMD1RQYXkgVGVzdCBUcnVzdDEjMCEGA1UEAwwaVFBheSBBdHRlc3RhdGlvbiBUZXN0IFJvb3QwHhcNMjYxMTExMTc0ODA1WhcNMzYxMTA4MTc0ODA1WjBrMQswCQYDVQQGEwJURzEgMB4GA1UECgwXVFBheSBUZXN0IEF1dGhlbnRpY2F0b3IxIjAgBgNVBAsMGUF1dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xFjAUBgNVBAMMDVRQYXkgVGVzdCBLZXkwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARXjMXsLD8MDruoLxaqvYjX/7CKGBSP15P3keGkh1tIyf7owwpYnekyc1+5NgjUBORIYbcZdUj1fP2BpKa9HrVVo4GEMIGBMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgeAMB0GA1UdDgQWBBTunBAKwH+Rd2UN1/543iIdkH3pejAfBgNVHSMEGDAWgBROJ3CWS7AaV4Iq2/9j7fTp11NjRDAhBgsrBgEEAYLlHAEBBAQSBBAAESIzRFVmd4iZqrvM3e7/MAoGCCqGSM49BAMCA0gAMEUCIBfuK7HD0n096uLrTQ+wEpSNYmxXu7CnWHsOcoaawwuWAiEA0n4ayZCtmb9raXFiZDkVNaY8LX1O+J3Rpryvgps9k/U=","base64");
const rootDer=Buffer.from("MIIB/zCCAaagAwIBAgIUJQW6KIQoGcIOCuArMnV5QVdYG2AwCgYIKoZIzj0EAwIwTDELMAkGA1UEBhMCVEcxGDAWBgNVBAoMD1RQYXkgVGVzdCBUcnVzdDEjMCEGA1UEAwwaVFBheSBBdHRlc3RhdGlvbiBUZXN0IFJvb3QwHhcNMjYxMTExMTc0NzU5WhcNMzYxMTA4MTc0NzU5WjBMMQswCQYDVQQGEwJURzEYMBYGA1UECgwPVFBheSBUZXN0IFRydXN0MSMwIQYDVQQDDBpUUGF5IEF0dGVzdGF0aW9uIFRlc3QgUm9vdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABMW1bL+twzljo3to4vvMhoFSHc4f4gmMqXqp7kywTTzYjFeKxSGHhhNxLdiYIb6ouyceduT0HtPqi4kWlYdjI3OjZjBkMB0GA1UdDgQWBBROJ3CWS7AaV4Iq2/9j7fTp11NjRDAfBgNVHSMEGDAWgBROJ3CWS7AaV4Iq2/9j7fTp11NjRDASBgNVHRMBAf8ECDAGAQH/AgEBMA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAgNHADBEAiBF0XyMJ2MaLKUm9WHm26EURwYB9ChMWcV9+beAdW7/KAIgYTC3ncDKYk2m+Uhe5ZJ/595sJ+TifMCELJdcV1Gq5Nk=","base64");
const trustedRootFingerprint="fc748622c4d7e4c3ec4345b3f27140f3a4fb7aa8f77bd9f0a4b868aac396ed54";
test("P063 accepts a valid packed attestation only with a pinned root and matching certificate AAGUID",async()=>{
 const principalId=randomUUID(),challengeId=randomUUID(),challenge=Buffer.from("p063-registration-challenge");
 const credentialId=Buffer.from("00112233445566778899aabbccddeeff","hex");
 const aaguid=Buffer.from("00112233445566778899aabbccddeeff","hex");
 const rpId="admin.example.test",origin="https://admin.example.test";
 const {publicKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 const jwk=publicKey.export({format:"jwk"});
 const coseKey=cbor(new Map<any,any>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,"base64url")],[-3,Buffer.from(jwk.y!,"base64url")]]));
 const authData=Buffer.concat([hash(rpId),Buffer.from([0x45,0,0,0,0]),aaguid,Buffer.from([0,credentialId.length]),credentialId,coseKey]);
 const clientData=Buffer.from(JSON.stringify({type:"webauthn.create",challenge:challenge.toString("base64url"),origin,crossOrigin:false}));
 const signature=sign("sha256",Buffer.concat([authData,hash(clientData)]),testLeafPrivateKey);
 const attestationObject=cbor(new Map<any,any>([
  ["fmt","packed"],["authData",authData],
  ["attStmt",new Map<any,any>([["alg",-7],["sig",signature],["x5c",[leafDer,rootDer]]])]
 ]));
 const persisted:{credential?:unknown[];audit:boolean;consumed:boolean}={audit:false,consumed:false};
 const client={
  async query(sql:string,params:unknown[]=[]):Promise<any>{
   const q=sql.trim().replace(/\\s+/g," ");
   if(["BEGIN","COMMIT","ROLLBACK"].includes(q))return {rows:[],rowCount:0};
   if(q.includes("set_config"))return {rows:[],rowCount:1};
   if(q.includes("FROM tpay_admin_webauthn_challenges"))return {rows:[{
    challenge_hash:hash(challenge),expected_origin:origin,expected_rp_id:rpId,
    expires_at:new Date(Date.now()+120000),consumed_at:null
   }],rowCount:1};
   if(q.includes("FROM tpay_admin_principals"))return {rows:[{id:principalId}],rowCount:1};
   if(q.includes("FROM tpay_admin_webauthn_attestation_roots"))return {rows:[{
    fingerprint_sha256:trustedRootFingerprint,allowed_aaguids:[aaguid.toString("hex")]
   }],rowCount:1};
   if(q.includes("UPDATE tpay_admin_webauthn_challenges")){persisted.consumed=true;return {rows:[],rowCount:1};}
   if(q.includes("INSERT INTO tpay_admin_webauthn_credentials")){persisted.credential=params;return {rows:[],rowCount:1};}
   if(q.includes("INSERT INTO tpay_admin_security_audit")){persisted.audit=true;return {rows:[],rowCount:1};}
   return {rows:[],rowCount:1};
  },release(){}
 };
 const pool={connect:async()=>client} as unknown as Pool;
 const registrar=new AdminWebAuthnAttestationRegistrar(pool,origin);
 const result=await registrar.register({
  principalId,challengeId,credentialId:credentialId.toString("base64url"),
  clientDataJSON:clientData.toString("base64url"),attestationObject:attestationObject.toString("base64url")
 });
 assert.equal(result.registered,true);
 if(result.registered){
  assert.equal(result.aaguid,aaguid.toString("hex"));
  assert.equal(result.rootFingerprint,trustedRootFingerprint);
  assert.equal(result.assuranceEvidence,"hardware_attested");
 }
 assert.equal(persisted.consumed,true);assert.ok(persisted.credential);assert.equal(persisted.audit,true);
});
