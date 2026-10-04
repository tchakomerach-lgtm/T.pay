import type { Client } from "pg";
import type { DurableCollectionIntent, CashMovement } from "./collection-reconciliation.js";
export class PostgresMicrofinanceCollectionRepository {
 constructor(private readonly client:Client){}
 async findByIdempotency(organizationId:string,idempotencyKey:string):Promise<DurableCollectionIntent|undefined>{
  const result=await this.client.query<any>(
   "SELECT collection_id,organization_id,partner_mfi_id,client_id,agent_id,amount_minor::text,currency,channel,location,latitude,longitude,occurred_at,idempotency_key,status,provider_reference FROM mfi_collection_intents WHERE organization_id=$1 AND idempotency_key=$2",
   [organizationId,idempotencyKey]); const row=result.rows[0]; if(!row)return undefined;
  return {collectionId:row.collection_id,organizationId:row.organization_id,partnerMfiId:row.partner_mfi_id,clientId:row.client_id,agentId:row.agent_id,
   amountMinor:BigInt(row.amount_minor),currency:row.currency,channel:row.channel,location:row.location,
   ...(row.latitude===null?{}:{latitude:row.latitude}),...(row.longitude===null?{}:{longitude:row.longitude}),
   occurredAt:new Date(row.occurred_at).toISOString(),idempotencyKey:row.idempotency_key,status:row.status,
   ...(row.provider_reference===null?{}:{providerReference:row.provider_reference})};
 }
 async appendIntent(intent:DurableCollectionIntent):Promise<boolean>{
  const result=await this.client.query("INSERT INTO mfi_collection_intents(collection_id,organization_id,partner_mfi_id,client_id,agent_id,amount_minor,currency,channel,location,latitude,longitude,occurred_at,idempotency_key,status,provider_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING collection_id",
   [intent.collectionId,intent.organizationId,intent.partnerMfiId,intent.clientId,intent.agentId,intent.amountMinor.toString(),intent.currency,intent.channel,intent.location,intent.latitude??null,intent.longitude??null,intent.occurredAt,intent.idempotencyKey,intent.status,intent.providerReference??null]);
  return result.rowCount===1;
 }
 async listCashMovements(sessionId:string):Promise<readonly CashMovement[]>{
  const result=await this.client.query<any>("SELECT movement_id,session_id,collection_id,direction,amount_minor::text,currency FROM mfi_cash_movements WHERE session_id=$1 ORDER BY occurred_at,movement_id",[sessionId]);
  return result.rows.map((row:any)=>({movementId:row.movement_id,sessionId:row.session_id,...(row.collection_id===null?{}:{collectionId:row.collection_id}),direction:row.direction,amountMinor:BigInt(row.amount_minor),currency:row.currency}));
 }
}
