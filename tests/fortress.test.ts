import test from "node:test";
import assert from "node:assert/strict";
import {FortressSecurityGateway} from "../packages/security/src/fortress-bridge.js";
import {createDefaultFortressRegistry} from "../packages/security/src/fortress-defaults.js";
import {TestOnlyKeyProvider,createVaultKeyMaterial,encryptForVault,decryptForVault} from "../packages/security/src/fortress-crypto.js";

test("Fortress creates independent tenant-bound vault identities",()=>{
 const r=createDefaultFortressRegistry("org-a");
 const ai=r.get("ai"); const ledger=r.get("ledger");
 assert.notEqual(ai.keyRef,ledger.keyRef);
 assert.notEqual(ai.namespace,ledger.namespace);
 assert.equal(ai.organizationId,"org-a");
 assert.equal(ledger.organizationId,"org-a");
});

test("Fortress bridge denies AI to Ledger until an explicit controlled bridge exists",()=>{
 const r=createDefaultFortressRegistry("org-a"); const g=new FortressSecurityGateway(r);
 const op={operationId:"op-1",sourceVaultId:"ai",targetVaultId:"ledger",organizationId:"org-a",actorId:"actor",purpose:"settlement",action:"ledger.post",dataClass:"restricted",capabilityId:"cap-1",correlationId:"c-1",payloadHash:"hash",expiresAt:Date.now()+1000} as const;
 assert.throws(()=>g.authorize(op),/FORTRESS_BRIDGE_POLICY_DENIED/);
 r.get("ai").allowedBridges.push;
});

test("Fortress compromise containment quarantines one vault without granting access elsewhere",()=>{
 const r=createDefaultFortressRegistry("org-a"); const g=new FortressSecurityGateway(r);
 g.quarantineVault("ai");
 assert.throws(()=>r.assertOperational("ai"),/FORTRESS_VAULT_NOT_OPERATIONAL/);
 assert.doesNotThrow(()=>r.assertOperational("ledger"));
});

test("Fortress rejects cross-tenant operations",()=>{
 const r=createDefaultFortressRegistry("org-a"); const g=new FortressSecurityGateway(r);
 const op={operationId:"op-2",sourceVaultId:"ai",targetVaultId:"ledger",organizationId:"org-b",actorId:"actor",purpose:"x",action:"x",dataClass:"restricted",capabilityId:"cap",correlationId:"c",payloadHash:"h",expiresAt:Date.now()+1000} as const;
 assert.throws(()=>g.authorize(op),/FORTRESS_TENANT_BOUNDARY/);
});

test("Fortress uses wrapped per-vault DEKs and zeroes plaintext after wrapping",async()=>{
 const p=new TestOnlyKeyProvider();
 const a=await createVaultKeyMaterial(p,"ai","key-ai");
 const l=await createVaultKeyMaterial(p,"ledger","key-ledger");
 assert.notEqual(a.wrappedDek,l.wrappedDek);
 const dek=await p.unwrapKey("ai",a.wrappedDek);
 assert.equal(dek.length,32); dek.fill(0);
});

test("Fortress ciphertext cannot cross a vault boundary",async()=>{
 const p=new TestOnlyKeyProvider();
 const ai=await createVaultKeyMaterial(p,"ai","key-ai");
 const ledger=await createVaultKeyMaterial(p,"ledger","key-ledger");
 const ciphertext=await encryptForVault(p,ai,Buffer.from("ledger-secret"));
 await assert.rejects(()=>decryptForVault(p,ledger,ciphertext));
 const plaintext=await decryptForVault(p,ai,ciphertext);
 assert.equal(plaintext.toString(),"ledger-secret"); plaintext.fill(0);
});

test("Fortress external KMS adapter fails closed until configured",async()=>{
 const {ExternalKmsKeyProvider}=await import("../packages/security/src/fortress-crypto.js");
 await assert.rejects(()=>new ExternalKmsKeyProvider().wrapKey("ledger",Buffer.alloc(32)),/FORTRESS_KMS_PROVIDER_NOT_CONFIGURED/);
});
