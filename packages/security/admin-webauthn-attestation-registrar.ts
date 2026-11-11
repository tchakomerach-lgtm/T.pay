import {
  createHash, createPublicKey, randomUUID, X509Certificate,
  verify as cryptoVerify, type JsonWebKey
} from "node:crypto";
import type { Pool } from "pg";

export type AttestationFailure =
 | "CHALLENGE_INVALID_OR_EXPIRED" | "CLIENT_DATA_INVALID" | "ORIGIN_OR_RP_ID_MISMATCH"
 | "ATTESTATION_OBJECT_INVALID" | "ATTESTATION_FORMAT_NOT_ALLOWED"
 | "AUTHENTICATOR_DATA_INVALID" | "CREDENTIAL_ID_MISMATCH"
 | "ATTESTATION_CHAIN_INVALID" | "ATTESTATION_ROOT_UNTRUSTED"
 | "AAGUID_NOT_ALLOWED" | "ATTESTATION_SIGNATURE_INVALID"
 | "CREDENTIAL_ALREADY_REGISTERED" | "PRINCIPAL_INACTIVE";

export type RegistrationInput = {
 principalId:string; challengeId:string; credentialId:string;
 clientDataJSON:string; attestationObject:string; now?:Date;
};
export type RegistrationResult =
 | {registered:true;credentialRef:string;aaguid:string;rootFingerprint:string;assuranceEvidence:"hardware_attested"}
 | {registered:false;reason:AttestationFailure};

type Cbor=number|string|boolean|null|Buffer|Cbor[]|Map<Cbor,Cbor>;
class Reader{
 offset=0;
 constructor(private readonly b:Buffer){}
 read():Cbor{
  const initial=this.byte(),major=initial>>5,additional=initial&31,n=this.length(additional);
  if(major===0)return n;if(major===1)return -1-n;if(major===2)return this.take(n);
  if(major===3)return this.take(n).toString("utf8");
  if(major===4)return Array.from({length:n},()=>this.read());
  if(major===5){const m=new Map<Cbor,Cbor>();for(let i=0;i<n;i++)m.set(this.read(),this.read());return m;}
  if(major===7&&additional===20)return false;if(major===7&&additional===21)return true;
  if(major===7&&additional===22)return null;
  throw new Error("CBOR_UNSUPPORTED");
 }
 private byte(){if(this.offset>=this.b.length)throw new Error("CBOR_TRUNCATED");return this.b[this.offset++]!;}
 private take(n:number){if(!Number.isSafeInteger(n)||n<0||this.offset+n>this.b.length)throw new Error("CBOR_TRUNCATED");const v=this.b.subarray(this.offset,this.offset+n);this.offset+=n;return v;}
 private length(a:number):number{
  if(a<24)return a;if(a===24)return this.byte();
  if(a===25)return (this.byte()<<8)|this.byte();
  if(a===26)return this.byte()*0x1000000+(this.byte()<<16)+(this.byte()<<8)+this.byte();
  throw new Error("CBOR_LENGTH_UNSUPPORTED");
 }
}
const sha=(v:Buffer|string)=>createHash("sha256").update(v).digest();
const decode=(v:string)=>{if(!/^[A-Za-z0-9_-]+$/.test(v))throw new Error("BASE64URL_INVALID");return Buffer.from(v,"base64url");};
const fail=(reason:AttestationFailure):RegistrationResult=>({registered:false,reason});
const asMap=(v:Cbor|undefined):Map<Cbor,Cbor>=>{if(!(v instanceof Map))throw new Error("CBOR_MAP_REQUIRED");return v;};
const getText=(m:Map<Cbor,Cbor>,k:string):Cbor|undefined=>m.get(k);
const getBytes=(v:Cbor|undefined)=>{if(!Buffer.isBuffer(v))throw new Error("CBOR_BYTES_REQUIRED");return v;};
const getNumber=(v:Cbor|undefined)=>{if(typeof v!=="number")throw new Error("CBOR_NUMBER_REQUIRED");return v;};

function coseKey(encoded:Buffer):boolean{
 const parsed=asMap(new Reader(encoded).read());
 const kty=getNumber(parsed.get(1)),alg=getNumber(parsed.get(3));
 if(kty===2&&alg===-7&&getNumber(parsed.get(-1))===1&&Buffer.isBuffer(parsed.get(-2))&&Buffer.isBuffer(parsed.get(-3)))return true;
 if(kty===3&&alg===-257&&Buffer.isBuffer(parsed.get(-1))&&Buffer.isBuffer(parsed.get(-2)))return true;
 if(kty===1&&alg===-8&&getNumber(parsed.get(-1))===6&&Buffer.isBuffer(parsed.get(-2)))return true;
 return false;
}
function keyForCert(cert:X509Certificate,alg:number){
 const type=cert.publicKey.asymmetricKeyType;
 if(alg===-7&&type==="ec"&&cert.publicKey.asymmetricKeyDetails?.namedCurve==="prime256v1")return "ES256";
 if(alg===-257&&type==="rsa")return "RS256";
 if(alg===-8&&type==="ed25519")return "EdDSA";
 throw new Error("ATTESTATION_ALGORITHM_KEY_MISMATCH");
}
type DerNode={tag:number;contentStart:number;contentEnd:number;next:number};
function derNode(bytes:Buffer,offset:number):DerNode{
 if(offset+2>bytes.length)throw new Error("DER_TRUNCATED");
 const tag=bytes[offset]!,first=bytes[offset+1]!;
 let length:number,contentStart=offset+2;
 if((first&0x80)===0)length=first;
 else{
  const count=first&0x7f;
  if(count===0||count>4||contentStart+count>bytes.length)throw new Error("DER_LENGTH_INVALID");
  length=0;for(let i=0;i<count;i++)length=length*256+bytes[contentStart+i]!;
  if(length<128)throw new Error("DER_NON_CANONICAL_LENGTH");
  contentStart+=count;
 }
 const contentEnd=contentStart+length;
 if(contentEnd>bytes.length)throw new Error("DER_TRUNCATED");
 return {tag,contentStart,contentEnd,next:contentEnd};
}
function oid(bytes:Buffer):string{
 if(bytes.length===0)throw new Error("DER_OID_EMPTY");
 const values:number[]=[];let n=0;
 for(const byte of bytes){n=n*128+(byte&0x7f);if((byte&0x80)===0){values.push(n);n=0;}}
 if(n!==0)throw new Error("DER_OID_TRUNCATED");
 const first=values.shift()??0;
 const firstArc=first<40?0:first<80?1:2;
 const secondArc=first-firstArc*40;
 return [firstArc,secondArc,...values].join(".");
}
function certificateAaguid(cert:X509Certificate):string{
 const raw=cert.raw;
 const certificate=derNode(raw,0);
 if(certificate.tag!==0x30)throw new Error("CERTIFICATE_DER_INVALID");
 const tbs=derNode(raw,certificate.contentStart);
 if(tbs.tag!==0x30)throw new Error("CERTIFICATE_TBS_INVALID");
 let offset=tbs.contentStart;
 while(offset<tbs.contentEnd){
  const field=derNode(raw,offset);
  if(field.tag===0xa3){
   const sequence=derNode(raw,field.contentStart);
   if(sequence.tag!==0x30)throw new Error("CERTIFICATE_EXTENSIONS_INVALID");
   let extOffset=sequence.contentStart;
   while(extOffset<sequence.contentEnd){
    const extension=derNode(raw,extOffset);
    if(extension.tag!==0x30)throw new Error("CERTIFICATE_EXTENSION_INVALID");
    let item=extension.contentStart;
    const oidNode=derNode(raw,item);item=oidNode.next;
    if(oidNode.tag!==0x06)throw new Error("CERTIFICATE_EXTENSION_OID_INVALID");
    const extensionOid=oid(raw.subarray(oidNode.contentStart,oidNode.contentEnd));
    if(extensionOid==="1.3.6.1.4.1.45724.1.1.4"){
     let valueNode=derNode(raw,item);
     if(valueNode.tag===0x01){item=valueNode.next;valueNode=derNode(raw,item);}
     if(valueNode.tag!==0x04)throw new Error("CERTIFICATE_AAGUID_EXTENSION_INVALID");
     const inner=derNode(raw, valueNode.contentStart);
     if(inner.tag!==0x04||inner.contentEnd!==valueNode.contentEnd||inner.contentEnd-inner.contentStart!==16)
      throw new Error("CERTIFICATE_AAGUID_EXTENSION_INVALID");
     return raw.subarray(inner.contentStart,inner.contentEnd).toString("hex");
    }
    extOffset=extension.next;
   }
  }
  offset=field.next;
 }
 throw new Error("CERTIFICATE_AAGUID_EXTENSION_MISSING");
}

function verifyChain(chain:Buffer[],fingerprint:string){
 if(chain.length<2||chain.length>6)throw new Error("ATTESTATION_CHAIN_LENGTH");
 const certs=chain.map(v=>new X509Certificate(v));
 const now=Date.now();
 for(const cert of certs){
  if(Date.parse(cert.validFrom)>now||Date.parse(cert.validTo)<now)throw new Error("ATTESTATION_CERT_EXPIRED");
 }
 if(certs[0]!.ca)throw new Error("ATTESTATION_LEAF_CA_FORBIDDEN");
 for(let i=0;i<certs.length-1;i++){
  const child=certs[i]!,issuer=certs[i+1]!;
  if(!issuer.ca||!child.checkIssued(issuer)||!child.verify(issuer.publicKey))throw new Error("ATTESTATION_CHAIN_SIGNATURE_INVALID");
 }
 const root=certs.at(-1)!;
 if(!root.ca||!root.checkIssued(root)||!root.verify(root.publicKey))throw new Error("ATTESTATION_ROOT_NOT_SELF_SIGNED");
 const actual=root.fingerprint256.replaceAll(":","").toLowerCase();
 if(actual!==fingerprint)throw new Error("ATTESTATION_ROOT_FINGERPRINT_MISMATCH");
 return certs[0]!;
}

export class AdminWebAuthnAttestationRegistrar{
 constructor(private readonly pool:Pool,private readonly adminOrigin:string){
  const origin=new URL(adminOrigin);
  if(origin.protocol!=="https:"||origin.origin!==adminOrigin)throw new Error("ADMIN_ORIGIN_MUST_BE_HTTPS");
 }
 async register(input:RegistrationInput):Promise<RegistrationResult>{
  let credentialId:Buffer,clientDataBytes:Buffer,clientData:any,attestationBytes:Buffer,attestation:Map<Cbor,Cbor>;
  try{
   credentialId=decode(input.credentialId);clientDataBytes=decode(input.clientDataJSON);
   clientData=JSON.parse(clientDataBytes.toString("utf8"));attestationBytes=decode(input.attestationObject);
   const outerReader=new Reader(attestationBytes);
   attestation=asMap(outerReader.read());
   if(outerReader.offset!==attestationBytes.length)throw new Error("ATTESTATION_OBJECT_TRAILING_BYTES");
  }catch{return fail("ATTESTATION_OBJECT_INVALID");}
  if(clientData?.type!=="webauthn.create"||clientData?.origin!==this.adminOrigin||
     (clientData?.crossOrigin!==undefined&&typeof clientData.crossOrigin!=="boolean")||
     clientData?.crossOrigin===true||typeof clientData?.challenge!=="string")
   return fail("CLIENT_DATA_INVALID");
  let challenge:Buffer;try{challenge=decode(clientData.challenge);}catch{return fail("CLIENT_DATA_INVALID");}
  const fmt=getText(attestation,"fmt"),authData=getText(attestation,"authData"),stmt=getText(attestation,"attStmt");
  if(fmt!=="packed")return fail("ATTESTATION_FORMAT_NOT_ALLOWED");
  let auth:Buffer,statement:Map<Cbor,Cbor>;
  try{auth=getBytes(authData);statement=asMap(stmt);}catch{return fail("ATTESTATION_OBJECT_INVALID");}
  if(auth.length<55)return fail("AUTHENTICATOR_DATA_INVALID");
  const flags=auth[32]!;
  if((flags&0x01)===0||(flags&0x04)===0||(flags&0x40)===0||(flags&0x22)!==0)return fail("AUTHENTICATOR_DATA_INVALID");
  const rootHash=auth.subarray(0,32);
  const aaguid=auth.subarray(37,53).toString("hex");
  const credentialLength=auth.readUInt16BE(53);
  if(credentialLength<16||credentialLength>1023||auth.length<55+credentialLength+1||
     aaguid==="00000000000000000000000000000000")return fail("AUTHENTICATOR_DATA_INVALID");
  const embeddedCredential=auth.subarray(55,55+credentialLength);
  if(!embeddedCredential.equals(credentialId))return fail("CREDENTIAL_ID_MISMATCH");
  const coseStart=55+credentialLength;
  let coseEnd:number;
  try{const reader=new Reader(auth.subarray(coseStart));reader.read();coseEnd=coseStart+reader.offset;
   if(!coseKey(auth.subarray(coseStart,coseEnd)))return fail("AUTHENTICATOR_DATA_INVALID");
   if(flags&0x80){const extensions=new Reader(auth.subarray(coseEnd));if(!(extensions.read() instanceof Map)||coseEnd+extensions.offset!==auth.length)return fail("AUTHENTICATOR_DATA_INVALID");}
   else if(coseEnd!==auth.length)return fail("AUTHENTICATOR_DATA_INVALID");
  }catch{return fail("AUTHENTICATOR_DATA_INVALID");}
  const client=new URL(this.adminOrigin);
  if(!rootHash.equals(sha(client.hostname)))return fail("ORIGIN_OR_RP_ID_MISMATCH");
  const algValue=statement.get("alg"),sigValue=statement.get("sig"),x5cValue=statement.get("x5c");
  let alg:number,sig:Buffer,chain:Buffer[];
  try{
   alg=getNumber(algValue);sig=getBytes(sigValue);
   if(!Array.isArray(x5cValue)||x5cValue.some(x=>!Buffer.isBuffer(x)))throw new Error("X5C_INVALID");
   chain=x5cValue as Buffer[];
  }catch{return fail("ATTESTATION_OBJECT_INVALID");}
  const db=await this.pool.connect();
  const credentialRef=randomUUID();
  const now=input.now??new Date();
  try{
   await db.query("BEGIN");
   await db.query("SELECT set_config('tpay.admin_principal_id',$1,true)",[input.principalId]);
   const challengeRow=await db.query<{challenge_hash:Buffer;expected_origin:string;expected_rp_id:string;expires_at:Date;consumed_at:Date|null}>(
    `SELECT challenge_hash,expected_origin,expected_rp_id,expires_at,consumed_at FROM tpay_admin_webauthn_challenges
      WHERE id=$1 AND principal_id=$2 AND purpose='registration' FOR UPDATE`,[input.challengeId,input.principalId]);
   const row=challengeRow.rows[0];
   if(challengeRow.rowCount!==1||!row||row.consumed_at||row.expires_at<=now||!sha(challenge).equals(row.challenge_hash)){
    await db.query("ROLLBACK");return fail("CHALLENGE_INVALID_OR_EXPIRED");
   }
   if(row.expected_origin!==this.adminOrigin||row.expected_rp_id!==client.hostname||!rootHash.equals(sha(row.expected_rp_id))){
    await db.query("ROLLBACK");return fail("ORIGIN_OR_RP_ID_MISMATCH");
   }
   const principal=await db.query("SELECT id FROM tpay_admin_principals WHERE id=$1 AND status='active' FOR UPDATE",[input.principalId]);
   if(principal.rowCount!==1){await db.query("ROLLBACK");return fail("PRINCIPAL_INACTIVE");}
   const roots=await db.query<{fingerprint_sha256:string;allowed_aaguids:string[]}>(
    "SELECT fingerprint_sha256,allowed_aaguids FROM tpay_admin_webauthn_attestation_roots WHERE status='active'");
   let leaf:X509Certificate|undefined,rootFingerprint:string|undefined,chainTrusted=false;
   for(const root of roots.rows){
    try{
     const chainLeaf=verifyChain(chain,root.fingerprint_sha256);
     chainTrusted=true;
     if(certificateAaguid(chainLeaf)!==aaguid)continue;
     if(!root.allowed_aaguids.includes(aaguid))continue;
     leaf=chainLeaf;rootFingerprint=root.fingerprint_sha256;break;
    }catch{/* Try another explicitly trusted root; never fall back to self-attestation. */}
   }
   if(!leaf||!rootFingerprint){await db.query("ROLLBACK");return fail(chainTrusted?"AAGUID_NOT_ALLOWED":"ATTESTATION_ROOT_UNTRUSTED");}
   let algorithm:string;
   try{algorithm=keyForCert(leaf,alg);}catch{await db.query("ROLLBACK");return fail("ATTESTATION_CHAIN_INVALID");}
   const signed=Buffer.concat([auth,sha(clientDataBytes)]);
   const valid=algorithm==="EdDSA"?cryptoVerify(null,signed,leaf.publicKey,sig):cryptoVerify("sha256",signed,leaf.publicKey,sig);
   if(!valid){await db.query("ROLLBACK");return fail("ATTESTATION_SIGNATURE_INVALID");}
   const backupEligible=(flags&0x08)!==0,backupState=(flags&0x10)!==0;
   if(backupState&&!backupEligible){await db.query("ROLLBACK");return fail("AUTHENTICATOR_DATA_INVALID");}
   const consumed=await db.query("UPDATE tpay_admin_webauthn_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now()",[input.challengeId]);
   if(consumed.rowCount!==1){await db.query("ROLLBACK");return fail("CHALLENGE_INVALID_OR_EXPIRED");}
   try{
    await db.query(
     `INSERT INTO tpay_admin_webauthn_credentials
       (id,principal_id,credential_id,public_key_cose,sign_count,aaguid,backup_eligible,backup_state,status,
        hardware_attested,attestation_format,attestation_root_fingerprint,attested_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',true,'packed',$9,now())`,
     [credentialRef,input.principalId,credentialId,auth.subarray(coseStart,coseEnd),auth.readUInt32BE(33),aaguid,backupEligible,backupState,rootFingerprint]);
   }catch(error){
    if((error as {code?:string}).code==="23505"){await db.query("ROLLBACK");return fail("CREDENTIAL_ALREADY_REGISTERED");}
    throw error;
   }
   await db.query(
    `INSERT INTO tpay_admin_security_audit(id,actor_principal_id,session_id,action,target_ref,outcome,reason_code,correlation_id,evidence_sha256)
     VALUES($1,$2,NULL,'webauthn.hardware_attestation.enrolled',$3,'created','PACKED_ATTESTATION_CHAIN_VERIFIED',$4,$5)`,
    [randomUUID(),input.principalId,credentialRef,randomUUID(),sha(Buffer.concat([auth,sha(clientDataBytes),sig]))]);
   await db.query("COMMIT");
   return {registered:true,credentialRef,aaguid,rootFingerprint,assuranceEvidence:"hardware_attested"};
  }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{db.release();}
 }
}
