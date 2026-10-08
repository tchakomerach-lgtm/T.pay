import {createHash,randomUUID} from "node:crypto";

export type VaultAuditAction="create"|"read"|"rotate"|"revoke"|"deny";

export interface VaultAuditEvent{
  id:string;
  occurredAt:string;
  actorId:string;
  tenantId:string;
  organizationId:string;
  secretId:string;
  action:VaultAuditAction;
  keyVersion:string;
  decision:"allow"|"deny";
  previousHash:string|null;
  eventHash:string;
}

export interface VaultAuditSink{append(event:VaultAuditEvent):Promise<void>;}

export async function appendVaultAudit(input:{
  sink:VaultAuditSink; actorId:string; tenantId:string; organizationId:string;
  secretId:string; action:VaultAuditAction; keyVersion:string;
  decision:"allow"|"deny"; previousHash:string|null;
}):Promise<VaultAuditEvent>{
  const base={id:randomUUID(),occurredAt:new Date().toISOString(),actorId:input.actorId,
    tenantId:input.tenantId,organizationId:input.organizationId,secretId:input.secretId,
    action:input.action,keyVersion:input.keyVersion,decision:input.decision,
    previousHash:input.previousHash};
  const eventHash=createHash("sha256").update(JSON.stringify(base)).digest("hex");
  const event={...base,eventHash};
  await input.sink.append(event);
  return event;
}
