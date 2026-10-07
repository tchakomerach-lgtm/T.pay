import { randomUUID, randomBytes, createHash, createPublicKey, verify } from "node:crypto";
import type { Pool } from "pg";
export type WebAuthnStepUpChallenge={id:string;userId:string;challenge:string;rpId:string;origin:string;expiresAt:string;usedAt?:string};
export interface WebAuthnVerifier {
 verifyAssertion(input:{challenge:WebAuthnStepUpChallenge;credentialId:string;clientDataJSON:Buffer;authenticatorData:Buffer;signature:Buffer;publicKey:Buffer}):Promise<boolean>;
}
export function createStepUpChallenge(input:{userId:string;rpId:string;origin:string;ttlMs?:number}):WebAuthnStepUpChallenge{
 const ttl=Math.min(Math.max(input.ttlMs??120_000,30_000),300_000);
 return {id:randomUUID(),userId:input.userId,challenge:randomBytes(32).toString("base64url"),rpId:input.rpId,origin:input.origin,expiresAt:new Date(Date.now()+ttl).toISOString()};
}
export function assertChallengeUsable(challenge:WebAuthnStepUpChallenge,expected:{userId:string;rpId:string;origin:string},now=new Date()){
 if(challenge.userId!==expected.userId||challenge.rpId!==expected.rpId||challenge.origin!==expected.origin)throw new Error("WEBAUTHN_CHALLENGE_CONTEXT_INVALID");
 if(challenge.usedAt||new Date(challenge.expiresAt)<=now)throw new Error("WEBAUTHN_CHALLENGE_EXPIRED");
}
export function consumeChallenge(challenge:WebAuthnStepUpChallenge,expected:{userId:string;rpId:string;origin:string}):WebAuthnStepUpChallenge{
 assertChallengeUsable(challenge,expected);return {...challenge,usedAt:new Date().toISOString()};
}

export function verifyWebAuthnAssertion(input:{
 challenge:WebAuthnStepUpChallenge;
 clientDataJSON:Buffer;
 authenticatorData:Buffer;
 signature:Buffer;
 publicKeyDer:Buffer;
 algorithm:"ES256"|"Ed25519";
 requireUserVerification?:boolean;
}):{signCount:number;userVerified:boolean}{
 assertChallengeUsable(input.challenge,{userId:input.challenge.userId,rpId:input.challenge.rpId,origin:input.challenge.origin});
 let client:any;
 try{client=JSON.parse(input.clientDataJSON.toString("utf8"));}catch{throw new Error("WEBAUTHN_CLIENT_DATA_INVALID");}
 if(client.type!=="webauthn.get"||client.origin!==input.challenge.origin||client.challenge!==input.challenge.challenge)throw new Error("WEBAUTHN_CLIENT_DATA_INVALID");
 if(input.authenticatorData.length<37)throw new Error("WEBAUTHN_AUTHENTICATOR_DATA_INVALID");
 const rpHash=createHash("sha256").update(input.challenge.rpId).digest();
 if(!rpHash.equals(input.authenticatorData.subarray(0,32)))throw new Error("WEBAUTHN_RP_ID_INVALID");
 const flags=input.authenticatorData[32];
 const userPresent=(flags&0x01)!==0;
 const userVerified=(flags&0x04)!==0;
 if(!userPresent||Boolean(input.requireUserVerification)&&!userVerified)throw new Error("WEBAUTHN_USER_VERIFICATION_REQUIRED");
 const clientHash=createHash("sha256").update(input.clientDataJSON).digest();
 const signed=Buffer.concat([input.authenticatorData,clientHash]);
 const key=createPublicKey({key:input.publicKeyDer,format:"der",type:"spki"});
 const valid=input.algorithm==="Ed25519" ? verify(null,signed,key,input.signature) : verify("sha256",signed,key,input.signature);
 if(!valid)throw new Error("WEBAUTHN_ASSERTION_INVALID");
 return {signCount:input.authenticatorData.readUInt32BE(33),userVerified};
}

export async function createPersistedStepUpChallenge(pool:Pool,input:{userId:string;rpId:string;origin:string;ttlMs?:number}){
 const challenge=createStepUpChallenge(input);
 await pool.query("INSERT INTO tpay_webauthn_stepup_challenges(id,user_id,challenge,rp_id,origin,expires_at) VALUES($1,$2,$3,$4,$5,$6)",[challenge.id,challenge.userId,challenge.challenge,challenge.rpId,challenge.origin,challenge.expiresAt]);
 return challenge;
}
export async function completePersistedStepUp(pool:Pool,input:{sessionId:string;userId:string;challengeId:string;credentialId:string;clientDataJSON:Buffer;authenticatorData:Buffer;signature:Buffer;publicKeyDer:Buffer;algorithm:"ES256"|"Ed25519";requireUserVerification?:boolean}){
 const c=await pool.connect();try{await c.query("BEGIN");
 const row=(await c.query("SELECT * FROM tpay_webauthn_stepup_challenges WHERE id=$1 AND user_id=$2 FOR UPDATE",[input.challengeId,input.userId])).rows[0];
 if(!row)throw new Error("WEBAUTHN_CHALLENGE_NOT_FOUND");
 const challenge:WebAuthnStepUpChallenge={id:String(row.id),userId:String(row.user_id),challenge:String(row.challenge),rpId:String(row.rp_id),origin:String(row.origin),expiresAt:new Date(row.expires_at).toISOString(),...(row.used_at?{usedAt:new Date(row.used_at).toISOString()}: {})};
 const used=consumeChallenge(challenge,{userId:input.userId,rpId:challenge.rpId,origin:challenge.origin});
 verifyWebAuthnAssertion({...input,challenge});
 const key=(await c.query("SELECT privileged_identity_id FROM tpay_privileged_verification_keys WHERE credential_id=$1 AND active=true",[input.credentialId])).rows[0];
 if(!key)throw new Error("WEBAUTHN_CREDENTIAL_NOT_FOUND");
 const identity=(await c.query("SELECT id FROM tpay_privileged_identities WHERE id=$1 AND human_user_id=$2 AND active=true AND expires_at>now()",[key.privileged_identity_id,input.userId])).rows[0];
 if(!identity)throw new Error("PRIVILEGED_IDENTITY_REQUIRED");
 await c.query("UPDATE tpay_webauthn_stepup_challenges SET used_at=now() WHERE id=$1",[input.challengeId]);
 const updated=await c.query("UPDATE identity_sessions SET assurance='step_up',last_seen_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() RETURNING id",[input.sessionId,input.userId]);
 if(!updated.rowCount)throw new Error("SESSION_INVALID");
 await c.query("COMMIT");return used;
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
}
