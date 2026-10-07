import type { RecoveryVault, HardwareRootKeyProvider } from "./trust-recovery-adapters.js";
import { requestDigest } from "./super-admin-control.js";

export type RecoveryPlane="TRUST"|"IDENTITY"|"SECURITY"|"LEDGER"|"PAYMENT"|"WALLET"|"CORE_API"|"ORG_DATA"|"MEDIA";
export interface RecoveryDrillStore{
 recordPlane(input:{runId:string;plane:RecoveryPlane;generation:string;digest:string;verified:boolean}):Promise<void>;
 recordBackup(input:{runId:string;storageClass:"IMMUTABLE"|"WORM"|"OFFLINE";locationRef:string;manifestDigest:string;encrypted:boolean;restoreTested:boolean}):Promise<void>;
}
export interface CleanRoom{
 readonly independentIdentityBoundary:true;
 readonly targetId:string;
 assertIsolated():Promise<void>;
}
export async function executeRecoveryDrill(input:{
 runId:string;
 manifest:unknown;
 planes:ReadonlyArray<{plane:RecoveryPlane;generation:string;verified:boolean}>;
 vault:RecoveryVault;
 root:HardwareRootKeyProvider;
 cleanRoom:CleanRoom;
 store:RecoveryDrillStore;
 snapshotId:string;
}){
 if(!input.cleanRoom.independentIdentityBoundary)throw new Error("CLEAN_ROOM_INDEPENDENCE_REQUIRED");
 await input.cleanRoom.assertIsolated();
 const attestation=await input.root.attest();
 if(!attestation.trusted)throw new Error("ROOT_ATTESTATION_FAILED");
 const manifestDigest=requestDigest(input.manifest);
 const snapshot=await input.vault.verifySnapshot({snapshotId:input.snapshotId,manifestDigest});
 if(!snapshot)throw new Error("RECOVERY_SNAPSHOT_INVALID");
 for(const p of input.planes){
  if(!p.verified)throw new Error("RECOVERY_PLANE_UNVERIFIED:"+p.plane);
  await input.store.recordPlane({runId:input.runId,plane:p.plane,generation:p.generation,digest:manifestDigest,verified:true});
 }
 const restored=await input.vault.restoreToCleanRoom({snapshotId:input.snapshotId,targetId:input.cleanRoom.targetId});
 if(!restored.verified)throw new Error("CLEAN_ROOM_RESTORE_UNVERIFIED");
 await input.store.recordBackup({runId:input.runId,storageClass:"IMMUTABLE",locationRef:input.snapshotId,manifestDigest,encrypted:true,restoreTested:true});
 return{runId:input.runId,manifestDigest,attestation,restoreId:restored.restoreId,status:"VERIFIED" as const};
}
export function assertProductionRecoveryInfrastructure(input:{vault:RecoveryVault;root:HardwareRootKeyProvider;cleanRoom:CleanRoom}){
 if(process.env.NODE_ENV!=="production")return;
 if(input.root.kind!=="HSM"&&input.root.kind!=="KMS")throw new Error("RECOVERY_HARDWARE_ROOT_REQUIRED");
 if(!input.vault.immutable)throw new Error("RECOVERY_IMMUTABLE_VAULT_REQUIRED");
 if(!input.cleanRoom.independentIdentityBoundary)throw new Error("RECOVERY_CLEAN_ROOM_REQUIRED");
}
