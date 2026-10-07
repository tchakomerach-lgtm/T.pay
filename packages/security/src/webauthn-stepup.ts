import { randomUUID, randomBytes, createHash, createPublicKey, verify } from "node:crypto";
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
