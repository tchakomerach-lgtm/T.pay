import {createVaultKeyRef,FortressVaultRegistry,type FortressVaultDescriptor} from "./fortress-vault.js";

const MAIN_VAULTS = [
 ["security","security","restricted"],["recovery","recovery","restricted"],["identity","identity","restricted"],
 ["ai","ai","confidential"],["organization","organization","restricted"],["finance","finance","secret"],
 ["data-rag","data-rag","restricted"],["document","document","confidential"],["social","social","confidential"],
 ["audit-evidence","audit-evidence","restricted"],["offline-field","offline-field","restricted"]
] as const;

const FINANCE_SUBVAULTS = [
 ["ledger","ledger"],["payment","payment"],["wallet","wallet"],["credit","credit"],
 ["provider","provider"],["microfinance","microfinance"],["tontine","tontine"],
 ["finance-commission","finance-commission"],["finance-subsidy","finance-subsidy"]
] as const;

const IDENTITY_SUBVAULTS = [
 ["identity-auth","identity-auth"],["identity-kyc","identity-kyc"],["identity-session","identity-session"]
] as const;

const AI_SUBVAULTS = [
 ["ai-model","ai-model"],["ai-tool","ai-tool"],["ai-memory","ai-memory"]
] as const;

const ORG_SUBVAULTS = [
 ["organization-policy","organization-policy"],["organization-members","organization-members"]
] as const;

const DATA_SUBVAULTS = [
 ["data-knowledge","data-knowledge"],["data-pii","data-pii"]
] as const;

const DOCUMENT_SUBVAULTS = [
 ["document-private","document-private"],["document-public","document-public"]
] as const;

const SOCIAL_SUBVAULTS = [
 ["social-content","social-content"],["social-messaging","social-messaging"]
] as const;

const OFFLINE_SUBVAULTS = [["offline-queue","offline-queue"]] as const;
const AUDIT_SUBVAULTS = [["audit-security","audit-security"],["audit-financial","audit-financial"]] as const;

function registerPrimary(
 registry:FortressVaultRegistry, organizationId:string,
 [id,layer,classification]:readonly [string,any,any]
):void {
 registry.register({
  vaultId:id, layer, namespace:`org:${organizationId}:${id}`, organizationId,
  classification, keyRef:createVaultKeyRef(`${organizationId}:${id}`),
  status:"active", allowedBridges:[], vaultType:"primary",parentVaultId:"general-fortress"
 });
}

function registerSub(
 registry:FortressVaultRegistry, organizationId:string, parentVaultId:string,
 [id,layer]:readonly [string,any]
):void {
 registry.register({
  vaultId:`${parentVaultId}.${id}`, layer, namespace:`org:${organizationId}:${parentVaultId}:${id}`,
  organizationId, classification:"restricted", keyRef:createVaultKeyRef(`${organizationId}:${parentVaultId}:${id}`),
  status:"active", allowedBridges:[], parentVaultId, vaultType:"sub"
 });
}

export function createDefaultFortressRegistry(organizationId:string):FortressVaultRegistry {
 if(!organizationId.trim()) throw new Error("FORTRESS_ORGANIZATION_REQUIRED");
 const registry=new FortressVaultRegistry();
 registry.register({
  vaultId:"general-fortress",layer:"security",namespace:"tpay:fortress:general",classification:"secret",keyRef:"hsm://tpay/fortress/general",status:"active",allowedBridges:[],vaultType:"general"
 });
 registry.register({
  vaultId:"super-admin",layer:"security",namespace:"tpay:fortress:super-admin",classification:"secret",keyRef:"hsm://tpay/super-admin",status:"active",allowedBridges:[],vaultType:"super-admin",parentVaultId:"general-fortress"
 });
 registry.register({
  vaultId:"root-trust",layer:"root-trust",namespace:"root",classification:"secret",
  keyRef:"hsm://tpay/root",status:"active",allowedBridges:[],vaultType:"root"
 });

 for(const primary of MAIN_VAULTS) registerPrimary(registry,organizationId,primary);

 for(const [id,layer] of FINANCE_SUBVAULTS) registerSub(registry,organizationId,"finance",[id,layer]);
 for(const [id,layer] of IDENTITY_SUBVAULTS) registerSub(registry,organizationId,"identity",[id,layer]);
 for(const [id,layer] of AI_SUBVAULTS) registerSub(registry,organizationId,"ai",[id,layer]);
 for(const [id,layer] of ORG_SUBVAULTS) registerSub(registry,organizationId,"organization",[id,layer]);
 for(const [id,layer] of DATA_SUBVAULTS) registerSub(registry,organizationId,"data-rag",[id,layer]);
 for(const [id,layer] of DOCUMENT_SUBVAULTS) registerSub(registry,organizationId,"document",[id,layer]);
 for(const [id,layer] of SOCIAL_SUBVAULTS) registerSub(registry,organizationId,"social",[id,layer]);
 for(const [id,layer] of OFFLINE_SUBVAULTS) registerSub(registry,organizationId,"offline-field",[id,layer]);
 for(const [id,layer] of AUDIT_SUBVAULTS) registerSub(registry,organizationId,"audit-evidence",[id,layer]);

 return registry;
}
