import {createHash} from "node:crypto";
import {createVaultKeyRef,FortressVaultRegistry,type FortressVaultDescriptor} from "./fortress-vault.js";

export type FortressUserVaultScope = "tenant-user"|"global-admin-user";

function safePart(value:string):string {
 if(!value.trim()) throw new Error("FORTRESS_USER_VAULT_IDENTITY_REQUIRED");
 return value.trim();
}

function stableUserToken(organizationId:string|undefined,userId:string):string {
 return createHash("sha256").update(`${organizationId??"global"}:${userId}`,"utf8").digest("hex").slice(0,32);
}

export function createUserVaultId(moduleVaultId:string,organizationId:string|undefined,userId:string):string {
 return `${moduleVaultId}.user.${stableUserToken(organizationId,userId)}`;
}

export function createUserVaultNamespace(moduleVaultId:string,organizationId:string|undefined,userId:string):string {
 return `user-vault:${organizationId??"global"}:${moduleVaultId}:${stableUserToken(organizationId,userId)}`;
}

export interface FortressUserVaultDescriptor extends FortressVaultDescriptor {
 readonly ownerUserId:string;
 readonly userVaultScope:FortressUserVaultScope;
}

export class FortressUserVaultManager {
 constructor(private readonly registry:FortressVaultRegistry){}

 provision(moduleVaultId:string,userId:string,organizationId?:string):FortressUserVaultDescriptor {
  safePart(moduleVaultId); safePart(userId);
  const parent=this.registry.get(moduleVaultId);
  if(parent.vaultType!=="sub") throw new Error("FORTRESS_USER_PARENT_MUST_BE_MODULE_SUBVAULT");
  if(parent.organizationId!==organizationId) throw new Error("FORTRESS_USER_PARENT_TENANT_MISMATCH");
  const vaultId=createUserVaultId(moduleVaultId,organizationId,userId);
  try { return this.registry.get(vaultId) as FortressUserVaultDescriptor; } catch {}
  const vault:FortressUserVaultDescriptor={
   vaultId,
   layer:parent.layer,
   ...(organizationId===undefined ? {} : {organizationId}),
   namespace:createUserVaultNamespace(moduleVaultId,organizationId,userId),
   classification:parent.classification,
   keyRef:createVaultKeyRef(vaultId),
   status:"active",
   allowedBridges:[],
   parentVaultId:moduleVaultId,
   vaultType:"sub",
   ownerUserId:userId,
   userVaultScope:organizationId ? "tenant-user" : "global-admin-user"
  };
  this.registry.register(vault);
  return vault;
 }

 provisionModules(moduleVaultIds:readonly string[],userId:string,organizationId?:string):readonly FortressUserVaultDescriptor[] {
  return moduleVaultIds.map(moduleId=>this.provision(moduleId,userId,organizationId));
 }

 assertOwner(vaultId:string,userId:string):void {
  const vault=this.registry.get(vaultId) as Partial<FortressUserVaultDescriptor>;
  if(vault.ownerUserId!==userId) throw new Error("FORTRESS_USER_VAULT_OWNER_DENIED");
 }

 listForUser(userId:string):readonly FortressUserVaultDescriptor[] {
  return this.registry.list().filter(v=>{
   const candidate=v as Partial<FortressUserVaultDescriptor>;
   return candidate.ownerUserId===userId;
  }) as FortressUserVaultDescriptor[];
 }
}
