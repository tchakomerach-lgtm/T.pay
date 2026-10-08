import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {FortressSecurityGateway} from "../packages/security/src/fortress-bridge.js";
import {createDefaultFortressRegistry,FORTRESS_USER_MODULES,ADMIN_SUBVAULTS} from "../packages/security/src/fortress-defaults.js";
import {FortressUserVaultManager} from "../packages/security/src/fortress-user-vault.js";
import {TestOnlyKeyProvider,createVaultKeyMaterial,encryptForVault,decryptForVault} from "../packages/security/src/fortress-crypto.js";
import {generateKeyPairSync} from "node:crypto";
import {createFortressChannelEnvelope,verifyFortressChannelEnvelope,assertPayloadHash} from "../packages/security/src/fortress-channel.js";

test("Fortress creates independent tenant-bound vault identities",()=>{
 const r=createDefaultFortressRegistry("org-a");
 const ai=r.get("ai"); const ledger=r.get("ledger");
 assert.notEqual(ai.keyRef,ledger.keyRef);
 assert.notEqual(ai.namespace,ledger.namespace);
 assert.equal(ai.organizationId,"org-a");
 assert.equal(ledger.organizationId,"org-a");
});

test("Fortress bridge denies AI to Ledger until an explicit controlled bridge exists",async()=>{
 const r=createDefaultFortressRegistry("org-a"); const g=new FortressSecurityGateway(r);
 const op={operationId:"op-1",sourceVaultId:"ai",targetVaultId:"ledger",organizationId:"org-a",actorId:"actor",purpose:"settlement",action:"ledger.post",dataClass:"restricted",capabilityId:"cap-1",correlationId:"c-1",payloadHash:"hash",expiresAt:Date.now()+1000} as const;
 await assert.rejects(()=>g.authorize(op),/FORTRESS_BRIDGE_POLICY_DENIED/);
 g.registerBridge({bridgeId:"ai-ledger-settlement",sourceVaultId:"ai",targetVaultId:"ledger",allowedPurposes:["settlement"],allowedActions:["ledger.post"],allowedDataClasses:["restricted"],maxTtlMs:30_000});
 await g.authorize(op);
});

test("Fortress compromise containment quarantines one vault without granting access elsewhere",()=>{
 const r=createDefaultFortressRegistry("org-a"); const g=new FortressSecurityGateway(r);
 g.quarantineVault("ai");
 assert.throws(()=>r.assertOperational("ai"),/FORTRESS_VAULT_NOT_OPERATIONAL/);
 assert.doesNotThrow(()=>r.assertOperational("ledger"));
});

test("Fortress rejects cross-tenant operations",async()=>{
 const r=createDefaultFortressRegistry("org-a"); const g=new FortressSecurityGateway(r);
 const op={operationId:"op-2",sourceVaultId:"ai",targetVaultId:"ledger",organizationId:"org-b",actorId:"actor",purpose:"x",action:"x",dataClass:"restricted",capabilityId:"cap",correlationId:"c",payloadHash:"h",expiresAt:Date.now()+1000} as const;
 await assert.rejects(()=>g.authorize(op),/FORTRESS_TENANT_BOUNDARY/);
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


test("Fortress PostgreSQL migration creates RLS-protected vault and bridge tables", {skip: !process.env.TPAY_DATABASE_URL && "TPAY_DATABASE_URL is not configured"}, async()=>{
 const client=new pg.Client({connectionString:process.env.TPAY_DATABASE_URL}); await client.connect();
 try{
  await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const tables=await client.query("SELECT to_regclass('fortress_vaults') AS vaults,to_regclass('fortress_bridge_policies') AS bridges,to_regclass('fortress_user_data_objects') AS user_data");
  assert.equal(tables.rows[0]?.vaults,"fortress_vaults"); assert.equal(tables.rows[0]?.bridges,"fortress_bridge_policies"); assert.equal(tables.rows[0]?.user_data,"fortress_user_data_objects");
  const rls=await client.query("SELECT relrowsecurity FROM pg_class WHERE oid IN ('fortress_vaults'::regclass,'fortress_bridge_policies'::regclass) ORDER BY oid");
  assert.equal(rls.rows.length,2); assert.ok(rls.rows.every(row=>row.relrowsecurity===true));
 } finally {await client.end();}
});


test("Fortress finance is a primary vault with isolated module sub-vaults",()=>{
 const r=createDefaultFortressRegistry("org-fin");
 const finance=r.get("finance");
 const expected=["ledger","payment","wallet","credit","provider","microfinance","tontine","finance-commission","finance-subsidy"];
 assert.equal(finance.vaultType,"primary");
 for(const id of expected){
  const sub=r.get(`finance.${id}`);
  assert.equal(sub.vaultType,"sub");
  assert.equal(sub.parentVaultId,"finance");
  assert.equal(sub.organizationId,"org-fin");
  assert.notEqual(sub.keyRef,finance.keyRef);
  assert.notEqual(sub.namespace,finance.namespace);
 }
});

test("Fortress main cells each own independent sub-vault families",()=>{
 const r=createDefaultFortressRegistry("org-cells");
 const families=[
  ["identity",["identity-auth","identity-kyc","identity-session"]],
  ["ai",["ai-model","ai-tool","ai-memory"]],
  ["organization",["organization-policy","organization-members"]],
  ["data-rag",["data-knowledge","data-pii"]],
  ["document",["document-private","document-public"]],
  ["social",["social-content","social-messaging"]],
  ["offline-field",["offline-queue"]],
  ["audit-evidence",["audit-security","audit-financial"]]
 ] as const;
 for(const [parent,children] of families){
  for(const child of children){
   const sub=r.get(`${parent}.${child}`);
   assert.equal(sub.parentVaultId,parent);
   assert.notEqual(sub.keyRef,r.get(parent).keyRef);
  }
 }
});


test("Fortress general vault contains principals without inheriting their keys",()=>{
 const r=createDefaultFortressRegistry("org-general");
 const general=r.get("general-fortress"); const administrator=r.get("administrator-fortress");
 assert.equal(general.vaultType,"general");
 assert.equal(general.organizationId,undefined);
 assert.equal(administrator.vaultType,"administrator");
 assert.equal(administrator.parentVaultId,"general-fortress");
 assert.equal(administrator.organizationId,undefined);
 assert.notEqual(general.keyRef,administrator.keyRef);
 assert.notEqual(general.keyRef,r.get("finance").keyRef);
 assert.notEqual(administrator.keyRef,r.get("finance").keyRef);
});

test("Administrator is not an implicit bridge to Finance",async()=>{
 const r=createDefaultFortressRegistry("org-sa"); const g=new FortressSecurityGateway(r);
 const op={operationId:"sa-fin-1",sourceVaultId:"administrator-fortress",targetVaultId:"finance.ledger",organizationId:"org-sa",actorId:"super-admin-actor",purpose:"ledger.read",action:"ledger.read",dataClass:"restricted",capabilityId:"cap-sa",correlationId:"c-sa",payloadHash:"hash-sa",expiresAt:Date.now()+1000} as const;
 await assert.rejects(()=>g.authorize(op),/FORTRESS_BRIDGE_POLICY_DENIED/);
});

test("Root Trust quorum requires two distinct approvers and separation of duties",async()=>{
 const {RootTrustQuorum}=await import("../packages/security/src/root-trust-quorum.js");
 const q=new RootTrustQuorum(2);
 const req={operationId:"root-1",actorId:"operator",purpose:"key-rotation",payloadHash:"hash",expiresAt:Date.now()+10_000};
 q.approve(req,"approver-a","security");
 assert.throws(()=>q.assertQuorum(req),/FORTRESS_ROOT_QUORUM_REQUIRED/);
 q.approve(req,"approver-b","security");
 assert.doesNotThrow(()=>q.assertQuorum(req));
 assert.throws(()=>q.approve(req,"operator","security"),/FORTRESS_ROOT_SEPARATION_OF_DUTIES/);
});


test("Fortress Bridge v2 composes ABAC, persistent revocation, replay and audit gates",async()=>{
 const r=createDefaultFortressRegistry("org-gateway");
 const events:string[]=[]; const claimed=new Set<string>();
 const gateway=new FortressSecurityGateway(r,{
  capabilityRevocationStore:{async revoke(){},async isRevoked(id){return id==="revoked-cap";},async revokeAll(){return 1;},async isGloballyRevoked(){return false;}},
  replayStore:{async claim(k){const key=[k.scope,k.actionId,k.payloadHash].join("|"); if(claimed.has(key)) return false; claimed.add(key); return true;},async prune(){return 0;}},
  auditStore:{async append(e){events.push(e.eventType); return "audit-hash";}} as never,
  authorization:{context:{organizationId:"org-gateway",actorId:"actor",agentId:"agent",roles:["finance"],purpose:"ledger.post",dataClasses:["restricted"],requestedAction:"ledger.post",resourceOrganizationId:"org-gateway",actorStatus:"active",deviceTrust:"trusted",sessionAgeMs:1000,policyVersion:"v1"},rule:{action:"ledger.post",requiredRoles:["finance"],allowedDataClasses:["restricted"],policyVersion:"v1"}}
 });
 gateway.registerBridge({bridgeId:"payment-ledger",sourceVaultId:"finance.payment",targetVaultId:"finance.ledger",allowedPurposes:["ledger.post"],allowedActions:["ledger.post"],allowedDataClasses:["restricted"],maxTtlMs:30_000,requiredRoles:["finance"],requiredTrustedDevice:true});
 const base={sourceVaultId:"finance.payment",targetVaultId:"finance.ledger",organizationId:"org-gateway",actorId:"actor",purpose:"ledger.post",action:"ledger.post",dataClass:"restricted",capabilityId:"cap-ok",correlationId:"corr",payloadHash:"payload",expiresAt:Date.now()+1000} as const;
 await gateway.authorize({...base,operationId:"ok-1"});
 assert.deepEqual(events,["FORTRESS_BRIDGE_AUTHORIZED"]);
 await assert.rejects(()=>gateway.authorize({...base,operationId:"ok-1"}),/FORTRESS_REPLAY_DETECTED/);
 await assert.rejects(()=>gateway.authorize({...base,operationId:"revoked-1",capabilityId:"revoked-cap"}),/FORTRESS_CAPABILITY_REVOKED/);
});

test("Finance policy allows payment-to-ledger but not AI-to-ledger by default",async()=>{
 const r=createDefaultFortressRegistry("org-fin-g");
 const g=new FortressSecurityGateway(r);
 g.registerBridge({bridgeId:"finance-payment-ledger",sourceVaultId:"finance.payment",targetVaultId:"finance.ledger",allowedPurposes:["settlement"],allowedActions:["ledger.post"],allowedDataClasses:["restricted"],maxTtlMs:30_000});
 const paymentOp={operationId:"p-1",sourceVaultId:"finance.payment",targetVaultId:"finance.ledger",organizationId:"org-fin-g",actorId:"payment-engine",purpose:"settlement",action:"ledger.post",dataClass:"restricted",capabilityId:"cap-p",correlationId:"c",payloadHash:"h",expiresAt:Date.now()+1000} as const;
 await g.authorize(paymentOp);
 const aiOp={...paymentOp,operationId:"ai-1",sourceVaultId:"ai",capabilityId:"cap-ai"};
 await assert.rejects(()=>g.authorize(aiOp),/FORTRESS_BRIDGE_POLICY_DENIED/);
});


test("Fortress data-plane channel authenticates, binds bridge and rejects replayed sequence",()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const payload=Buffer.from("financial-event");
 const now=Date.now();
 const env=createFortressChannelEnvelope({messageId:"m1",sourceVaultId:"finance.payment",targetVaultId:"finance.ledger",organizationId:"org-channel",bridgeId:"payment-ledger",purpose:"settlement",issuedAt:now,expiresAt:now+5000,sequence:7,payload},privateKey);
 verifyFortressChannelEnvelope(env,publicKey,{organizationId:"org-channel",targetVaultId:"finance.ledger",bridgeId:"payment-ledger",minSequence:7,now});
 assert.doesNotThrow(()=>assertPayloadHash(env,payload));
 assert.throws(()=>verifyFortressChannelEnvelope(env,publicKey,{organizationId:"org-channel",targetVaultId:"finance.ledger",bridgeId:"payment-ledger",minSequence:8,now}),/FORTRESS_CHANNEL_SEQUENCE_REPLAY/);
 assert.throws(()=>verifyFortressChannelEnvelope(env,publicKey,{organizationId:"org-channel",targetVaultId:"finance.wallet",bridgeId:"payment-ledger",minSequence:7,now}),/FORTRESS_CHANNEL_TARGET_MISMATCH/);
});


test("Fortress administrator contains isolated administrative sub-vaults",()=>{
 const r=createDefaultFortressRegistry("org-admin");
 const admin=r.get("administrator-fortress");
 assert.equal(admin.vaultType,"administrator");
 assert.equal(admin.parentVaultId,"general-fortress");
 assert.equal(admin.organizationId,undefined);
 for(const [id] of ADMIN_SUBVAULTS){
  const sub=r.get(id);
  assert.equal(sub.parentVaultId,"administrator-fortress");
  assert.equal(sub.organizationId,undefined);
  assert.notEqual(sub.keyRef,admin.keyRef);
 }
});

test("Every specialized T.Pay module can provision a private cryptographic compartment per user",()=>{
 const r=createDefaultFortressRegistry("org-user");
 const manager=new FortressUserVaultManager(r);
 const vaults=manager.provisionModules(FORTRESS_USER_MODULES,"user-a","org-user");
 assert.equal(vaults.length,FORTRESS_USER_MODULES.length);
 assert.equal(new Set(vaults.map(v=>v.keyRef)).size,vaults.length);
 assert.equal(new Set(vaults.map(v=>v.namespace)).size,vaults.length);
 assert.ok(vaults.every(v=>v.ownerUserId==="user-a" && v.organizationId==="org-user"));
 assert.throws(()=>manager.assertOwner(vaults[0].vaultId,"user-b"),/FORTRESS_USER_VAULT_OWNER_DENIED/);
 assert.doesNotThrow(()=>manager.assertOwner(vaults[0].vaultId,"user-a"));
});

test("Two users never share a module vault, namespace or key reference",()=>{
 const r=createDefaultFortressRegistry("org-isolation");
 const manager=new FortressUserVaultManager(r);
 const a=manager.provisionModules(FORTRESS_USER_MODULES,"user-a","org-isolation");
 const b=manager.provisionModules(FORTRESS_USER_MODULES,"user-b","org-isolation");
 for(let i=0;i<FORTRESS_USER_MODULES.length;i++){
  assert.notEqual(a[i].vaultId,b[i].vaultId);
  assert.notEqual(a[i].namespace,b[i].namespace);
  assert.notEqual(a[i].keyRef,b[i].keyRef);
 }
});

test("A user vault cannot be attached to another tenant module",()=>{
 const r=createDefaultFortressRegistry("org-a");
 const manager=new FortressUserVaultManager(r);
 assert.throws(()=>manager.provision("finance.ledger","user-a","org-b"),/FORTRESS_USER_PARENT_TENANT_MISMATCH/);
});

test("Administrator users also receive isolated compartments without tenant inheritance",()=>{
 const r=createDefaultFortressRegistry("org-admin-users");
 const manager=new FortressUserVaultManager(r);
 const ids=ADMIN_SUBVAULTS.map(([id])=>id);
 const vaults=manager.provisionModules(ids,"admin-user");
 assert.equal(vaults.length,ids.length);
 assert.ok(vaults.every(v=>v.organizationId===undefined && v.userVaultScope==="global-admin-user"));
 assert.equal(new Set(vaults.map(v=>v.keyRef)).size,vaults.length);
});
