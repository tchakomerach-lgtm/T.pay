import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt";
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

export function hashOrganizationAccessCode(code:string):string {
  if(!/^[0-9A-Za-z@._-]{6,64}$/.test(code)) throw new Error("ORG_ACCESS_CODE_INVALID");
  const salt=randomBytes(16);
  const key=scryptSync(code,salt,KEY_LENGTH,{N,r:R,p:P,maxmem:32*1024*1024});
  return [PREFIX,N,R,P,salt.toString("base64url"),key.toString("base64url")].join("$");
}

export function verifyOrganizationAccessCode(code:string, encoded:string):boolean {
  try {
    const [prefix,n,r,p,saltText,keyText]=encoded.split("$");
    if(prefix!==PREFIX||!n||!r||!p||!saltText||!keyText) return false;
    const salt=Buffer.from(saltText,"base64url");
    const expected=Buffer.from(keyText,"base64url");
    if(expected.length!==KEY_LENGTH) return false;
    const actual=scryptSync(code,salt,expected.length,{N:Number(n),r:Number(r),p:Number(p),maxmem:32*1024*1024});
    return timingSafeEqual(actual,expected);
  } catch { return false; }
}
