export type CollectionChannel="cash_agent"|"tmoney"|"flooz"|"pi_spi"|"partner_mfi";
export type CollectionLocation="home"|"work"|"other";
export type AgentStatus="active"|"unavailable"|"suspended";
export interface MfiClientAccount{organizationId:string;clientId:string;partnerMfiId:string;accountRef:string;currency:string;status:"active"|"frozen"|"closed";}
export interface FieldCollectionIntent{collectionId:string;organizationId:string;partnerMfiId:string;clientId:string;agentId:string;amountMinor:bigint;currency:string;channel:CollectionChannel;location:CollectionLocation;latitude?:number;longitude?:number;occurredAt:string;idempotencyKey:string;}
export interface AgentContinuityAssignment{collectionId:string;previousAgentId:string;replacementAgentId:string;reason:"agent_unavailable"|"route_rebalance";planHash:string;}
export function validateCollection(i:FieldCollectionIntent):void{
 if(i.amountMinor<=0n)throw new Error("MFI_COLLECTION_AMOUNT_INVALID");
 if(i.idempotencyKey.length<16)throw new Error("INVALID_IDEMPOTENCY_KEY");
 if(i.channel==="cash_agent"&&!i.agentId)throw new Error("MFI_AGENT_REQUIRED");
 if((i.latitude===undefined)!==(i.longitude===undefined))throw new Error("MFI_LOCATION_INCOMPLETE");
 if(i.latitude!==undefined&&(i.latitude<-90||i.latitude>90||i.longitude! <-180||i.longitude! >180))throw new Error("MFI_LOCATION_INVALID");
}
export function buildClientContinuityQueue(clients:readonly MfiClientAccount[],unavailableAgentId:string):MfiClientAccount[]{
 return clients.filter(c=>c.status==="active").sort((a,b)=>a.clientId.localeCompare(b.clientId)).filter(Boolean);
}
export function chooseCollectionRail(input:{channel:CollectionChannel;partnerSupportsPiSpi:boolean;providerHealthy:boolean}):CollectionChannel{
 if(input.channel==="pi_spi"&&input.partnerSupportsPiSpi&&input.providerHealthy)return "pi_spi";
 if(input.channel==="tmoney"||input.channel==="flooz")return input.providerHealthy?input.channel:"partner_mfi";
 if(input.channel==="partner_mfi")return "partner_mfi";
 return "partner_mfi";
}
