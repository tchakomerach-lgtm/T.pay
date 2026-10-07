export interface HardwareRootKeyProvider{
 readonly kind:"HSM"|"KMS";
 readonly keyRef:string;
 signDigest(digest:string):Promise<Buffer>;
 verifyDigest(digest:string,signature:Buffer):Promise<boolean>;
 attest():Promise<{trusted:boolean;provider:string;keyRef:string;attestationDigest:string}>;
}
export interface RecoveryVault{
 readonly immutable:true;
 createSnapshot(input:{runId:string;manifestDigest:string}):Promise<{snapshotId:string;generation:string}>;
 verifySnapshot(input:{snapshotId:string;manifestDigest:string}):Promise<boolean>;
 restoreToCleanRoom(input:{snapshotId:string;targetId:string}):Promise<{restoreId:string;verified:boolean}>;
}
export function requireHardwareRootProvider(provider:HardwareRootKeyProvider){
 if(!provider||!["HSM","KMS"].includes(provider.kind))throw new Error("HARDWARE_ROOT_PROVIDER_REQUIRED");
}
export function requireImmutableRecoveryVault(vault:RecoveryVault){
 if(!vault?.immutable)throw new Error("IMMUTABLE_RECOVERY_VAULT_REQUIRED");
}
