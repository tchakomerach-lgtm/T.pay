import { createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const MAX_MEM = 128 * 1024 * 1024;

function scrypt(secret:string,salt:Buffer,length:number,opts:{N:number;r:number;p:number;maxmem:number}):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    scryptCallback(secret,salt,length,opts,(error,derived)=>{
      if(error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}
async function deriveSecret(secret:string,salt:Buffer,length=KEY_LENGTH):Promise<Buffer>{
  return scrypt(secret.normalize("NFKC"),salt,length,{N,r:R,p:P,maxmem:MAX_MEM});
}
export async function hashSecret(secret:string):Promise<string>{
  if(secret.length<8||secret.length>1024)throw new Error("INVALID_SECRET");
  const salt=randomBytes(16),derived=await deriveSecret(secret,salt);
  return `scrypt$N=${N},r=${R},p=${P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}
function parseEncoded(encoded:string):{n:number;r:number;p:number;salt:Buffer;expected:Buffer}|null{
  const parts=encoded.split("$");
  if(parts.length!==4||parts[0]!=="scrypt")return null;
  const params=Object.fromEntries((parts[1]??"").split(",").map(item=>item.split("=") as [string,string]));
  const n=Number(params.N),r=Number(params.r),p=Number(params.p);
  const salt=Buffer.from(parts[2]??"","base64url"),expected=Buffer.from(parts[3]??"","base64url");
  if(!Number.isSafeInteger(n)||!Number.isSafeInteger(r)||!Number.isSafeInteger(p)||expected.length!==KEY_LENGTH||salt.length!==16)return null;
  return {n,r,p,salt,expected};
}
export async function verifySecret(secret:string,encoded:string):Promise<boolean>{
  const parsed=parseEncoded(encoded); if(!parsed)return false;
  const derived=await scrypt(secret.normalize("NFKC"),parsed.salt,parsed.expected.length,{N:parsed.n,r:parsed.r,p:parsed.p,maxmem:MAX_MEM});
  return timingSafeEqual(parsed.expected,derived);
}
export async function hashPassword(password:string):Promise<string>{
  if(password.length<12||password.length>1024)throw new Error("INVALID_PASSWORD");
  return hashSecret(password);
}
export async function verifyPassword(password:string,encoded:string):Promise<boolean>{
  return verifySecret(password,encoded);
}
export function generateOpaqueToken(bytes=32):string{
  if(bytes<16)throw new Error("TOKEN_ENTROPY_TOO_LOW");
  return randomBytes(bytes).toString("base64url");
}
export function sha256Hex(value:string):string{return createHash("sha256").update(value).digest("hex");}
export function normalizeLoginIdentifier(value:string):string{
  const normalized=value.trim().normalize("NFKC").toLowerCase();
  if(normalized.length<3||normalized.length>254)throw new Error("INVALID_LOGIN_IDENTIFIER");
  return normalized;
}
