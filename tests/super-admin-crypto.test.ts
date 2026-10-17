import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { createStepUpChallenge, verifyWebAuthnAssertion } from "../packages/security/src/webauthn-stepup.js";
import { NodeVerificationProvider, assertProductionRootProvider, authorizeRootOperationWithQuorum } from "../packages/security/src/root-trust-provider.js";
test("WebAuthn ES256 assertion verifies cryptographically",()=>{
 const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 const c=createStepUpChallenge({userId:"u",rpId:"admin.tpay.tg",origin:"https://admin.tpay.tg"});
 const client=Buffer.from(JSON.stringify({type:"webauthn.get",challenge:c.challenge,origin:c.origin}));
 const rp=createHash("sha256").update(c.rpId).digest();
 const auth=Buffer.alloc(37);rp.copy(auth,0);auth[32]=0x05;auth.writeUInt32BE(7,33);
 const signed=Buffer.concat([auth,createHash("sha256").update(client).digest()]);
 const signer=createSign("SHA256");signer.update(signed);const signature=signer.sign(privateKey);
 const result=verifyWebAuthnAssertion({challenge:c,clientDataJSON:client,authenticatorData:auth,signature,publicKeyDer:Buffer.from(publicKey.export({type:"spki",format:"der"})),algorithm:"ES256",requireUserVerification:true});
 assert.equal(result.signCount,7);assert.equal(result.userVerified,true);
});
test("production Root Trust rejects software-only provider",()=>{
 const p=new NodeVerificationProvider(); if(process.env.NODE_ENV==="production")assert.throws(()=>assertProductionRootProvider(p),/ROOT_HARDWARE_PROVIDER_REQUIRED/); else assert.doesNotThrow(()=>assertProductionRootProvider(p));
});

test("Root quorum rejects duplicate approver identities before database access",async()=>{
 const provider=new NodeVerificationProvider();
 const approval={actorId:"same",domain:"identity",algorithm:"Ed25519" as const,signature:Buffer.from("x"),publicKeyDer:Buffer.from("x")};
 await assert.rejects(()=>authorizeRootOperationWithQuorum({} as any,{operation:"TEST",request:{nonce:"x"},expiresAt:new Date(Date.now()+30_000),approvals:[approval,{...approval,domain:"security"},{...approval,domain:"infrastructure"}],provider}),/ROOT_DUPLICATE_ACTOR/);
});
test("Root quorum rejects an excessive approval lifetime before database access",async()=>{
 await assert.rejects(()=>authorizeRootOperationWithQuorum({} as any,{operation:"TEST",request:{nonce:"x"},expiresAt:new Date(Date.now()+6*60_000),approvals:[{actorId:"a",domain:"identity",algorithm:"Ed25519",signature:Buffer.from("x")},{actorId:"b",domain:"security",algorithm:"Ed25519",signature:Buffer.from("x")},{actorId:"c",domain:"infrastructure",algorithm:"Ed25519",signature:Buffer.from("x")}],provider:new NodeVerificationProvider()}),/ROOT_APPROVAL_TTL_INVALID/);
});
