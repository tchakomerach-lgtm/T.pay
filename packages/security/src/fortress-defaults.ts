import {createVaultKeyRef,FortressVaultRegistry} from "./fortress-vault.js";

export const FORTRESS_VAULT_LAYERS = [
 "security","recovery","identity","ai","organization","finance","ledger","payment","wallet","credit",
 "provider","microfinance","tontine","data-rag","document","social","audit-evidence","offline-field"
] as const;

export function createDefaultFortressRegistry(organizationId:string):FortressVaultRegistry {
 if(!organizationId.trim()) throw new Error("FORTRESS_ORGANIZATION_REQUIRED");
 const registry=new FortressVaultRegistry();
 registry.register({vaultId:"root-trust",layer:"root-trust",namespace:"root",classification:"secret",keyRef:"hsm://tpay/root",status:"active",allowedBridges:[]});
 registry.register({vaultId:"security",layer:"security",namespace:`org:${organizationId}:security`,organizationId,classification:"restricted",keyRef:createVaultKeyRef("security"),status:"active",allowedBridges:[]});
 registry.register({vaultId:"recovery",layer:"recovery",namespace:`org:${organizationId}:recovery`,organizationId,classification:"restricted",keyRef:createVaultKeyRef("recovery"),status:"active",allowedBridges:[]});
 for(const layer of FORTRESS_VAULT_LAYERS.filter(x=>x!=="security"&&x!=="recovery")){
  const id=layer;
  registry.register({vaultId:id,layer,namespace:`org:${organizationId}:${layer}`,organizationId,classification:layer==="ai"||layer==="social"?"confidential":"restricted",keyRef:createVaultKeyRef(id),status:"active",allowedBridges:[]});
 }
 return registry;
}
