import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { AdminWebAuthnAssertionVerifier } from "../packages/security/admin-webauthn-assertion-verifier.js";
import type { Pool } from "pg";

const sha=(v:Buffer|string)=>createHash("sha256").update(v).digest();
const b64=(v:Buffer)=>v.toString("base64url");
function cbor(value:number|Buffer):Buffer{
 if(typeof value==="number"){
  if(value>=0&&value<24)return Buffer.from([value]);
  if(value<0&&-1-value<24)return Buffer.from([0x20+(-1-value)]);
  throw new Error("test CBOR int unsupported");
 }
 if(value.length<24)return Buffer.concat([Buffer.from([0x40+value.length]),value]);
 throw new Error("test CBOR bytes too long");
}
function cborMap(entries:Array<[number,number|Buffer]>):Buffer{
 const parts: Uint8Array[]=[Buffer.from([0xa0+entries.length])];
 for(const [k,v] of entries)parts.push(cbor(k),cbor(v));
 return Buffer.concat(parts);
}
function fixture(options?:{badSignature?:boolean;expired?:boolean;replay?:boolean;noUv?:boolean;counterReplay?:boolean;hardwareAttested?:boolean;rootActive?:boolean}){
 const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 const jwk=publicKey.export({format:"jwk"});
 const cose=cborMap([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,"base64url")],[-3,Buffer.from(jwk.y!,"base64url")]]);
 const challenge=Buffer.from("challenge-unique-123456789");
 const clientData=Buffer.from(JSON.stringify({type:"webauthn.get",challenge:b64(challenge),origin:"https://admin.example.test",crossOrigin:false}));
 const authData=Buffer.alloc(37);
 sha("admin.example.test").copy(authData,0);
 authData[32]=options?.noUv?1:5;
 authData.writeUInt32BE(options?.counterReplay?8:9,33);
 const signed=Buffer.concat([authData,sha(clientData)]);
 const signature=sign("sha256",signed,privateKey);
 const calls:string[]=[];
 const challengeState={consumed:false};
 const credentialState={counter:options?.counterReplay?8:8,status:"active",audit:false};
 const client={
  async query(sql:string,params:unknown[]=[]):Promise<any>{
   const s=sql.trim().replace(/\s+/g," ");
   calls.push(s.slice(0,65));
   if(s==="BEGIN"||s==="COMMIT"||s==="ROLLBACK")return {rows:[],rowCount:0};
   if(s.includes("FROM tpay_admin_webauthn_challenges")){
    return options?.expired||challengeState.consumed?{rows:[],rowCount:0}:{rows:[{
     challenge_hash:sha(challenge),expected_origin:"https://admin.example.test",
     expected_rp_id:"admin.example.test",expires_at:new Date(Date.now()+60000),consumed_at:null
    }],rowCount:1};
   }
   if(s.includes("FROM tpay_admin_webauthn_credentials")){
    return {rows:[{id:"credential-1",public_key_cose:cose,sign_count:credentialState.counter,status:credentialState.status,revoked_at:null,hardware_attested:options?.hardwareAttested??false,attestation_root_fingerprint:options?.hardwareAttested?"a".repeat(64):null,root_status:options?.rootActive===false?null:(options?.hardwareAttested?"active":null)}],rowCount:1};
   }
   if(s.includes("SET consumed_at=now()")){
    if(challengeState.consumed)return {rows:[],rowCount:0};
    challengeState.consumed=true;return {rows:[],rowCount:1};
   }
   if(s.includes("SET sign_count=GREATEST")){
    credentialState.counter=Math.max(credentialState.counter,Number(params[1]));return {rows:[],rowCount:1};
   }
   return {rows:[],rowCount:1};
  },
  release(){}
 };
 const verifier=new AdminWebAuthnAssertionVerifier({connect:async()=>client} as unknown as Pool);
 return {verifier,challenge,clientData,authData,signature,challengeState,credentialState,privateKey};
}
const input=(f:ReturnType<typeof fixture>,overrides:Record<string,string>={})=>({
 principalId:"admin-1",challengeId:"challenge-row-1",credentialId:b64(Buffer.from("credential-id")),
 clientDataJSON:b64(f.clientData),authenticatorData:b64(f.authData),
 signature:b64(f.signature),...overrides
});

test("P061 verifies a real ES256 assertion and atomically consumes challenge and counter",async()=>{
 const f=fixture();const result=await f.verifier.verifyAuthentication(input(f));
 assert.deepEqual(result,{verified:true,principalId:"admin-1",credentialRef:"credential-1",assurance:"webauthn_uv",signCount:9});
 assert.equal(f.challengeState.consumed,true);assert.equal(f.credentialState.counter,9);
});

test("P061 rejects missing user verification",async()=>{
 const f=fixture({noUv:true});const result=await f.verifier.verifyAuthentication(input(f));
 assert.deepEqual(result,{verified:false,reason:"USER_VERIFICATION_REQUIRED"});
 assert.equal(f.challengeState.consumed,false);
});

test("P061 rejects a consumed or expired challenge",async()=>{
 const f=fixture({expired:true});const result=await f.verifier.verifyAuthentication(input(f));
 assert.deepEqual(result,{verified:false,reason:"CHALLENGE_INVALID_OR_EXPIRED"});
});

test("P061 rejects a forged signature",async()=>{
 const f=fixture();const forged=Buffer.from(f.signature);forged[forged.length-1]=(forged.at(-1) ?? 0)^1;
 const result=await f.verifier.verifyAuthentication(input(f,{signature:b64(forged)}));
 assert.deepEqual(result,{verified:false,reason:"SIGNATURE_INVALID"});
 assert.equal(f.challengeState.consumed,false);
});

test("P061 rejects challenge origin/RP mismatch",async()=>{
 const f=fixture();const wrong=Buffer.from(JSON.stringify({type:"webauthn.get",challenge:b64(f.challenge),origin:"https://evil.example",crossOrigin:false}));
 const result=await f.verifier.verifyAuthentication(input(f,{clientDataJSON:b64(wrong)}));
 assert.deepEqual(result,{verified:false,reason:"ORIGIN_OR_RP_ID_MISMATCH"});
});

test("P061 records a valid-signature counter anomaly and marks the credential suspect",async()=>{
 const f=fixture({counterReplay:true});
 // Set a previously observed non-zero counter equal to this valid signed assertion.
 f.credentialState.counter=8;
 const result=await f.verifier.verifyAuthentication(input(f));
 assert.deepEqual(result,{verified:false,reason:"SIGN_COUNTER_REPLAY"});
 assert.equal(f.credentialState.status,"suspect");
 assert.equal(f.credentialState.audit,true);
});

test("P064 elevates only an attested credential with an active pinned root",async()=>{
 const trusted=fixture({hardwareAttested:true});
 const accepted=await trusted.verifier.verifyAuthentication(input(trusted));
 assert.equal(accepted.verified,true);
 if(accepted.verified)assert.equal(accepted.assurance,"hardware_key");
 const revoked=fixture({hardwareAttested:true,rootActive:false});
 assert.deepEqual(await revoked.verifier.verifyAuthentication(input(revoked)),
  {verified:false,reason:"CREDENTIAL_NOT_FOUND_OR_REVOKED"});
 assert.equal(revoked.challengeState.consumed,false);
});
