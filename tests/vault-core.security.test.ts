import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {decryptVaultObject,encryptVaultObject} from "../packages/security/vault-core.js";

const key=randomBytes(32);
const provider={async decryptDataKey(){return key;}};
const ref={vaultId:"00000000-0000-0000-0000-000000000047",keyVersion:1,kmsKeyRef:"kms://tpay/test/047",algorithm:"AES-256-GCM" as const};

test("P051 vault encrypt/decrypt is authenticated and integrity checked",async()=>{
 const plaintext=Buffer.from("T.Pay coffre secret P051","utf8");
 const object=await encryptVaultObject(provider,ref,plaintext,"tenant-a|vault-047|object-1|v1");
 assert.equal(object.nonce.length,12);
 assert.equal(object.authTag.length,16);
 assert.deepEqual(await decryptVaultObject(provider,ref,object,"tenant-a|vault-047|object-1|v1"),plaintext);
 await assert.rejects(decryptVaultObject(provider,ref,object,"tenant-a|vault-047|object-1|tampered"),/TPAY_VAULT_AAD_MISMATCH/);
});

test("P052 vault rejects ciphertext tampering",async()=>{
 const object=await encryptVaultObject(provider,ref,Buffer.from("secret"),"aad");
 const tampered={...object,ciphertext:Buffer.from(object.ciphertext)};
 tampered.ciphertext[0]=(tampered.ciphertext[0] ?? 0)^1;
 await assert.rejects(decryptVaultObject(provider,ref,tampered,"aad"));
});
