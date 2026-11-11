import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { Client, Pool } from "pg";
import { AdminWebAuthnAssertionVerifier } from "../packages/security/admin-webauthn-assertion-verifier.js";

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
 return Buffer.concat([
  Buffer.from([0xa5]),
  cborInt(1),cborInt(2),
  cborInt(3),cborInt(-7),
  cborInt(-1),cborInt(1),
  cborInt(-2),cborBytes(x),
  cborInt(-3),cborBytes(y)
 ]);
}

test("P061 live PostgreSQL: assertion challenge is consumed once under concurrent replay",{
 skip:process.env.TPAY_RUN_ADMIN_WEBAUTHN_INTEGRATION!=="1" || !databaseUrl
  ? "Set TPAY_RUN_ADMIN_WEBAUTHN_INTEGRATION=1 with TPAY_DATABASE_URL to run this test"
  : false
},async()=>{
 const admin=new Client({connectionString:databaseUrl});
 const pool=new Pool({connectionString:databaseUrl,max:4});
 const principalId=randomUUID(),credentialRef=randomUUID(),challengeId=randomUUID();
 const credentialId=randomBytes(32),challenge=randomBytes(32);
 const rpId="admin.tpay.test",origin="https://admin.tpay.test";
 const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 const jwk=publicKey.export({format:"jwk"});
 const cose=coseEc2(Buffer.from(jwk.x!,"base64url"),Buffer.from(jwk.y!,"base64url"));
 const clientDataJSON=Buffer.from(JSON.stringify({
  type:"webauthn.get",challenge:challenge.toString("base64url"),origin,crossOrigin:false
 }));
 const authenticatorData=Buffer.alloc(37);
 sha(rpId).copy(authenticatorData,0);
 authenticatorData[32]=0x05; // UP + UV
 authenticatorData.writeUInt32BE(1,33);
 const signature=sign("sha256",Buffer.concat([authenticatorData,sha(clientDataJSON)]),privateKey);
 await admin.connect();
 try{
  await admin.query("BEGIN");
  await admin.query(
   "INSERT INTO tpay_admin_principals(id,subject_ref,status,assurance_floor,activated_at) VALUES($1,$2,'active','hardware_key',now())",
   [principalId,"p061-live-"+principalId]
  );
  await admin.query(
   "INSERT INTO tpay_admin_webauthn_credentials(id,principal_id,credential_id,public_key_cose,status) VALUES($1,$2,$3,$4,'active')",
   [credentialRef,principalId,credentialId,cose]
  );
  await admin.query(
   "INSERT INTO tpay_admin_webauthn_challenges(id,principal_id,challenge_hash,purpose,expected_origin,expected_rp_id,expires_at) VALUES($1,$2,$3,'authentication',$4,$5,now()+interval '2 minutes')",
   [challengeId,principalId,sha(challenge),origin,rpId]
  );
  await admin.query("COMMIT");

  const verifier=new AdminWebAuthnAssertionVerifier(pool);
  const assertion={
   principalId,challengeId,credentialId:credentialId.toString("base64url"),
   clientDataJSON:clientDataJSON.toString("base64url"),
   authenticatorData:authenticatorData.toString("base64url"),
   signature:signature.toString("base64url")
  };
  const results=await Promise.all([
   verifier.verifyAuthentication(assertion),
   verifier.verifyAuthentication(assertion)
  ]);
  assert.equal(results.filter(result=>result.verified).length,1);
  assert.equal(results.filter(result=>!result.verified).length,1);
  const challengeRow=await admin.query(
   "SELECT consumed_at FROM tpay_admin_webauthn_challenges WHERE id=$1",[challengeId]
  );
  assert.ok(challengeRow.rows[0]?.consumed_at);
  const credentialRow=await admin.query(
   "SELECT sign_count,status FROM tpay_admin_webauthn_credentials WHERE id=$1",[credentialRef]
  );
  assert.equal(Number(credentialRow.rows[0]?.sign_count),1);
  assert.equal(credentialRow.rows[0]?.status,"active");
 }catch(error){
  await admin.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{
  await admin.query("DELETE FROM tpay_admin_webauthn_challenges WHERE id=$1",[challengeId]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_webauthn_credentials WHERE id=$1",[credentialRef]).catch(()=>undefined);
  await admin.query("DELETE FROM tpay_admin_principals WHERE id=$1",[principalId]).catch(()=>undefined);
  await pool.end();
  await admin.end();
 }
});
