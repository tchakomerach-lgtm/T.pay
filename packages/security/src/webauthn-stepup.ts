import { randomUUID, randomBytes } from "node:crypto";
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
