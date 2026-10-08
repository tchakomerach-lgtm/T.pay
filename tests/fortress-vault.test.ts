import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {sealVaultSecret,openVaultSecret} from "../packages/security/src/fortress-vault.js";
import {requireVaultAccess,assertVaultId} from "../packages/security/src/fortress-vault-policy.js";

const key=randomBytes(32);
const keys={getKey:async(version:string)=>{assert.equal(version,"k1");return key;}};

test("P051 vault seals and opens with tenant/org AAD binding",async()=>{
 const envelope=await sealVaultSecret({tenantId:"t1",organizationId:"o1",secretId:"s1",plaintext:"top-secret",classification:"credential",keyVersion:"k1",keys});
 const opened=await openVaultSecret({tenantId:"t1",organizationId:"o1",secretId:"s1",envelope,keys});
 assert.equal(opened.toString(),"top-secret");
 await assert.rejects(()=>openVaultSecret({tenantId:"t1",organizationId:"o2",secretId:"s1",envelope,keys}),/TPAY_VAULT_AAD_TAMPERED|Unsupported state/);
});

test("P052 vault rejects invalid key material and malformed IDs",async()=>{
 await assert.rejects(()=>sealVaultSecret({tenantId:"t1",organizationId:"o1",secretId:"s1",plaintext:"x",classification:"secret",keyVersion:"k1",keys:{getKey:async()=>Buffer.alloc(31)}}),/TPAY_VAULT_KEY_INVALID/);
 assert.throws(()=>assertVaultId("bad id"),/TPAY_VAULT_ID_INVALID/);
});

test("P053 vault denies cross-scope capability",async()=>{
 await assert.rejects(()=>requireVaultAccess({can:async()=>false},{tenantId:"t1",organizationId:"o1",actorId:"a1",purpose:"runtime"},"secret.read","credential"),/TPAY_VAULT_ACCESS_DENIED/);
});
