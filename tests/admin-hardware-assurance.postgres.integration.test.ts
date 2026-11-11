import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { Client, Pool } from "pg";
import { AdminWebAuthnAssertionVerifier } from "../packages/security/admin-webauthn-assertion-verifier.js";
import { AdminSessionLifecycle } from "../packages/security/admin-session-lifecycle.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;
const sha=(value:Buffer|string)=>createHash("sha256").update(value).digest();
function cborInt(value:number):Buffer{
 if(value>=0&&value<24)return Buffer.from([value]);
 if(value<0&&-1-value<24)return Buffer.from([0x20+(-1-value)]);
 throw new Error("test CBOR integer out of range");
}
function cborBytes(value:Buffer):Buffer{
 if(value.length>=24)throw new Error("test CBOR byte string too long");
 return Buffer.concat([Buffer.from([0x40+value.length]),value]);
}
function coseEc2(x:Buffer,y:Buffer):Buffer{
 return Buffer.concat([Buffer.from([0xa5]),cborInt(1),cborInt(2),cborInt(3),cborInt(-7),
  cborInt(-1),cborInt(1),cborInt(-2),cborBytes(x),cborInt(-3),cborBytes(y)]);
}

test("P064 live PostgreSQL: hardware assurance requires an active attestation root and is revoked with it",{
 skip:process.env.TPAY_RUN_ADMIN_SESSION_INTEGRATION!=="1" || !databaseUrl
  ? "Set TPAY_RUN_ADMIN_SESSION_INTEGRATION=1 with TPAY_DATABASE_URL to run this test"
  : false
},async()=>{
 const admin=new Client({connectionString:databaseUrl});
 const pool=new Pool({connectionString:databaseUrl,max:4});
 const principalId=randomUUID(),credentialRef=randomUUID(),challengeId=randomUUID();
 const credentialId=randomBytes(32),challenge=randomBytes(32),rootFingerprint=randomBytes(32).toString("hex");
 const aaguid="00112233445566778899aabbccddeeff";
 const rpId="admin.tpay.test",origin="https://admin.tpay.test";
 const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 const jwk=publicKey.export({format:"jwk"});
 const cose=coseEc2(Buffer.from(jwk.x!,"base64url"),Buffer.from(jwk.y!,"base64url"));
 const clientDataJSON=Buffer.from(JSON.stringify({
  type:"webauthn.get",challenge:challenge.toString("base64url"),origin,crossOrigin:false
 }));
 const authenticatorData=Buffer.alloc(37);sha(rpId).copy(authenticatorData,0);
 authenticatorData[32]=0x05;authenticatorData.writeUInt32BE(1,33);
 const signature=sign("sha256",Buffer.concat([authenticatorData,sha(clientDataJSON)]),privateKey);
 let sessionId:string|undefined,sessionToken:string|undefined;
 await admin.connect();
 try{
  await admin.query("BEGIN");
  await admin.query(
   `INSERT INTO tpay_admin_webauthn_attestation_roots
     (id,fingerprint_sha256,vendor_ref,metadata_version,source_uri,allowed_aaguids,status)
    VALUES($1,$2,'p064-integration-fixture','test-v1','https://metadata.example.test/aaguid',ARRAY[$3],'active')`,
   ["root-"+rootFingerprint,rootFingerprint,aaguid]
  );
  await admin.query(
   "INSERT INTO tpay_admin_principals(id,subject_ref,status,assurance_floor,activated_at) VALUES($1,$2,'active','hardware_key',now())",
   [principalId,"p064-live-"+principalId]
  );
  await admin.query(
   `INSERT INTO tpay_admin_webauthn_credentials
     (id,principal_id,credential_id,public_key_cose,aaguid,status,hardware_attested,
      attestation_format,attestation_root_fingerprint,attested_at)
    VALUES($1,$2,$3,$4,$5,'active',true,'packed',$6,now())`,
   [credentialRef,principalId,credentialId,cose,aaguid,rootFingerprint]
  );
  await admin.query(
   "INSERT INTO tpay_admin_webauthn_challenges(id,principal_id,challenge_hash,purpose,expected_origin,expected_rp_id,expires_at) VALUES($1,$2,$3,'authentication',$4,$5,now()+interval '2 minutes')",
   [challengeId,principalId,sha(challenge),origin,rpId]
  );
  await admin.query("COMMIT");

  const verifier=new AdminWebAuthnAssertionVerifier(pool);
  const sessions=new AdminSessionLifecycle(pool,verifier,{adminOrigin:origin});
  const issued=await sessions.issueFromAssertion({
   principalId,challengeId,credentialId:credentialId.toString("base64url"),
   clientDataJSON:clientDataJSON.toString("base64url"),
   authenticatorData:authenticatorData.toString("base64url"),
   signature:signature.toString("base64url")
  });
  if(!issued.issued)throw new Error("P064_HARDWARE_SESSION_ISSUANCE_FAILED:"+issued.reason);
  sessionId=issued.sessionId;sessionToken=issued.sessionToken;
  assert.equal(issued.assurance,"hardware_key");
  const stored=await admin.query("SELECT assurance FROM tpay_admin_sessions WHERE id=$1",[sessionId]);
  assert.equal(stored.rows[0]?.assurance,"hardware_key");
  assert.equal((await sessions.validate(sessionToken)).authenticated,true);

  await admin.query(
   "UPDATE tpay_admin_webauthn_attestation_roots SET status='revoked',revoked_at=now() WHERE fingerprint_sha256=$1",
   [rootFingerprint]
  );
  assert.deepEqual(await sessions.validate(sessionToken),
   {authenticated:false,reason:"CREDENTIAL_REVOKED"});
 }finally{
  await admin.query("ROLLBACK").catch(()=>undefined);
  if(sessionId)await admin.query("DELETE FROM tpay_admin_sessions WHERE id=$1",[sessionId]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_security_audit WHERE target_ref=$1",[sessionId??""]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_webauthn_challenges WHERE id=$1",[challengeId]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_webauthn_credentials WHERE id=$1",[credentialRef]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_principals WHERE id=$1",[principalId]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_webauthn_attestation_roots WHERE fingerprint_sha256=$1",[rootFingerprint]).catch(()=>undefined);
  await pool.end();await admin.end();
 }
});
