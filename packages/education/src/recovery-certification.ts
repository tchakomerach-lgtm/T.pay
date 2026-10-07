import {createHash} from "node:crypto";
export type RecoveryStatus="PASS"|"FAIL"|"UNKNOWN";
export interface BackupArtifact{artifactId:string;tenantId:string;organizationId:string;createdAt:string;sizeBytes:number;sha256:string;schemaVersion:number;encryptionKeyRef:string;retentionUntil:string;}
export interface RestoreVerification{status:RecoveryStatus;artifactId:string;integrityVerified:boolean;tenantVerified:boolean;schemaCompatible:boolean;restoredAt:string;rpoSeconds:number;rtoSeconds:number;recoveryEpoch:bigint;evidenceHash:string;}
const HEX64=/^[a-f0-9]{64}$/;
export function verifyBackupArtifact(a:BackupArtifact,expected:{tenantId:string;organizationId:string;now:string}):void{
 if(!a.artifactId||!a.tenantId||!a.organizationId||!HEX64.test(a.sha256))throw new Error("BACKUP_ARTIFACT_INVALID");
 if(a.tenantId!==expected.tenantId||a.organizationId!==expected.organizationId)throw new Error("BACKUP_SCOPE_MISMATCH");
 if(a.sizeBytes<1||!Number.isSafeInteger(a.sizeBytes))throw new Error("BACKUP_SIZE_INVALID");
 if(a.schemaVersion<1||!a.encryptionKeyRef)throw new Error("BACKUP_CRYPTO_METADATA_INVALID");
 if(Date.parse(a.retentionUntil)<=Date.parse(expected.now))throw new Error("BACKUP_RETENTION_EXPIRED");
}
export function certifyRestore(a:BackupArtifact,expected:{tenantId:string;organizationId:string;now:string;recoveryEpoch:bigint},actual:{integrityVerified:boolean;schemaCompatible:boolean;restoredAt:string;previousRecoveryEpoch:bigint}):RestoreVerification{
 verifyBackupArtifact(a,expected);
 if(actual.previousRecoveryEpoch>expected.recoveryEpoch)throw new Error("RECOVERY_EPOCH_ROLLBACK");
 const rpo=Math.max(0,Math.floor((Date.parse(actual.restoredAt)-Date.parse(a.createdAt))/1000));
 const evidence=createHash("sha256").update(JSON.stringify({artifactId:a.artifactId,sha256:a.sha256,tenantId:a.tenantId,organizationId:a.organizationId,integrityVerified:actual.integrityVerified,schemaCompatible:actual.schemaCompatible,recoveryEpoch:expected.recoveryEpoch.toString()})).digest("hex");
 const status:RecoveryStatus=actual.integrityVerified&&actual.schemaCompatible?"PASS":"FAIL";
 return {status,artifactId:a.artifactId,integrityVerified:actual.integrityVerified,tenantVerified:true,schemaCompatible:actual.schemaCompatible,restoredAt:actual.restoredAt,rpoSeconds:rpo,rtoSeconds:0,recoveryEpoch:expected.recoveryEpoch,evidenceHash:evidence};
}
