import {createHash} from "node:crypto";
export interface AuditRecord { readonly sequence:number; readonly timestamp:number; readonly eventType:string; readonly organizationId:string; readonly payloadHash:string; readonly previousHash:string; readonly recordHash:string; }
export class AuditChain {
 private readonly records:AuditRecord[]=[];
 append(input:Omit<AuditRecord,"sequence"|"previousHash"|"recordHash">):AuditRecord{const previousHash=this.records.at(-1)?.recordHash??"GENESIS";const sequence=this.records.length+1;const canonical=JSON.stringify({...input,sequence,previousHash});const recordHash=createHash("sha256").update(canonical,"utf8").digest("hex");const record={...input,sequence,previousHash,recordHash};this.records.push(record);return record;}
 verify():void{let previousHash="GENESIS";for(let i=0;i<this.records.length;i++){const r=this.records[i];if(!r)throw new Error("AUDIT_CHAIN_GAP");if(r.sequence!==i+1||r.previousHash!==previousHash)throw new Error("AUDIT_CHAIN_BROKEN");const {recordHash,...withoutHash}=r;const expected=createHash("sha256").update(JSON.stringify(withoutHash),"utf8").digest("hex");if(expected!==recordHash)throw new Error("AUDIT_RECORD_TAMPERED");previousHash=recordHash;}}
 snapshot():readonly AuditRecord[]{return [...this.records];}
}
