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

export const ADMIN_SUBVAULTS = [
 ["administrator-identity","security"],["administrator-authentication","security"],["administrator-sessions","security"],
 ["administrator-super-admin","security"],["administrator-roles","security"],["administrator-permissions","security"],
 ["administrator-policies","security"],["administrator-platform","security"],["administrator-configuration","security"],
 ["administrator-feature-flags","security"],["administrator-approvals","security"],["administrator-security","security"],
 ["administrator-incidents","security"],["administrator-audit","security"],["administrator-evidence","security"],
 ["administrator-compliance","security"],["administrator-keys","security"],["administrator-recovery","security"],
 ["administrator-operations","security"],["administrator-emergency","security"]
] as const;

export const FORTRESS_USER_MODULES = [
 "finance.ledger","finance.payment","finance.wallet","finance.credit","finance.provider","finance.microfinance",
 "finance.tontine","finance.finance-commission","finance.finance-subsidy",
 "identity.identity-auth","identity.identity-kyc","identity.identity-session",
 "ai.ai-model","ai.ai-tool","ai.ai-memory",
 "organization.organization-policy","organization.organization-members",
 "data-rag.data-knowledge","data-rag.data-pii",
 "document.document-private","document.document-public",
 "social.social-content","social.social-messaging",
 "offline-field.offline-queue",
 "audit-evidence.audit-security","audit-evidence.audit-financial"
] as const;

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
  vaultId:"administrator-fortress",layer:"security",namespace:"tpay:fortress:administrator",classification:"secret",keyRef:"hsm://tpay/administrator",status:"active",allowedBridges:[],vaultType:"administrator",parentVaultId:"general-fortress"
 });
 registry.register({
  vaultId:"root-trust",layer:"root-trust",namespace:"root",classification:"secret",
  keyRef:"hsm://tpay/root",status:"active",allowedBridges:[],vaultType:"root"
 });

 for(const primary of MAIN_VAULTS) registerPrimary(registry,organizationId,primary);

 for(const [id,layer] of ADMIN_SUBVAULTS){
  registry.register({
   vaultId:id,layer:layer as any,namespace:`tpay:fortress:administrator:${id}`,classification:"restricted",
   keyRef:`hsm://tpay/administrator/${id}`,status:"active",allowedBridges:[],
   vaultType:"sub",parentVaultId:"administrator-fortress"
  });
 }

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
