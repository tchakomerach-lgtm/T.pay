import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {decryptVaultObject,encryptVaultObject} from "../packages/security/vault-core.js";
import type {VaultBoundaryRequest,VaultPermission} from "../packages/security/vault-domain-boundary.js";

const key=randomBytes(32);
const provider={async decryptDataKey(){return key;}};
const ref={vaultId:"00000000-0000-0000-0000-000000000047",keyVersion:1,kmsKeyRef:"kms://tpay/test/047",algorithm:"AES-256-GCM" as const};
const access=(permission:VaultPermission):VaultBoundaryRequest=>({
 plane:"USER",
 vault:{id:ref.vaultId,tenantId:"tenant-a",organizationId:null,vaultClass:"user_module",status:"active"},
 principal:{id:"actor-a",kind:"user",active:true},
 session:{id:"session-a",kind:"user",assurance:"standard",expiresAt:"2026-11-10T13:00:00.000Z",revokedAt:null},
 requestedPermission:permission,
 grant:{vaultId:ref.vaultId,actorId:"actor-a",permission,validFrom:"2026-11-10T12:00:00.000Z",validUntil:"2026-11-10T12:30:00.000Z",revokedAt:null},
 context:{tenantId:"tenant-a",organizationId:null,userSessionId:"session-a",privilegedSessionId:null,now:"2026-11-10T12:10:00.000Z"}
});

test("P051 vault encrypt/decrypt is authenticated and integrity checked behind explicit grants",async()=>{
 const plaintext=Buffer.from("T.Pay coffre secret P051","utf8");
 const object=await encryptVaultObject(provider,ref,plaintext,"tenant-a|vault-047|object-1|v1",access("write"));
 assert.equal(object.nonce.length,12);
 assert.equal(object.authTag.length,16);
 assert.deepEqual(await decryptVaultObject(provider,ref,object,"tenant-a|vault-047|object-1|v1",access("decrypt")),plaintext);
 await assert.rejects(decryptVaultObject(provider,ref,object,"tenant-a|vault-047|object-1|tampered",access("decrypt")),/TPAY_VAULT_AAD_MISMATCH/);
});

test("P052 vault rejects ciphertext tampering",async()=>{
 const object=await encryptVaultObject(provider,ref,Buffer.from("secret"),"aad",access("write"));
 const tampered={...object,ciphertext:Buffer.from(object.ciphertext)};
 tampered.ciphertext[0]=tampered.ciphertext[0]!^1;
 await assert.rejects(decryptVaultObject(provider,ref,tampered,"aad",access("decrypt")));
});

test("Vault cryptography rejects missing or insufficient decrypt authority",async()=>{
 const object=await encryptVaultObject(provider,ref,Buffer.from("secret"),"aad",access("write"));
 await assert.rejects(decryptVaultObject(provider,ref,object,"aad",access("read")),/TPAY_VAULT_ACCESS_DENIED/);
 const expired=access("decrypt");
 expired.grant.validUntil="2026-11-10T12:10:00.000Z";
 await assert.rejects(decryptVaultObject(provider,ref,object,"aad",expired),/TPAY_VAULT_ACCESS_DENIED:GRANT_EXPIRED/);
});
