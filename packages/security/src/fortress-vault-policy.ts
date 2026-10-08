export type VaultScope={
  tenantId:string;
  organizationId:string;
  actorId:string;
  purpose:"runtime"|"integration"|"finance"|"identity"|"security"|"audit";
};

export type VaultCapability="secret.create"|"secret.read"|"secret.rotate"|"secret.revoke";

export interface VaultAuthorization{
  can(scope:VaultScope,capability:VaultCapability,classification:string):Promise<boolean>;
}

export async function requireVaultAccess(
  auth:VaultAuthorization,
  scope:VaultScope,
  capability:VaultCapability,
  classification:string
):Promise<void>{
  if(!scope.tenantId||!scope.organizationId||!scope.actorId)throw new Error("TPAY_VAULT_SCOPE_REQUIRED");
  if(!await auth.can(scope,capability,classification))throw new Error("TPAY_VAULT_ACCESS_DENIED");
}

export const assertVaultId=(id:string)=>{
  if(!/^[A-Za-z0-9._:-]{1,128}$/.test(id))throw new Error("TPAY_VAULT_ID_INVALID");
};
