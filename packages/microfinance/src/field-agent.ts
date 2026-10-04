import { createHash } from "node:crypto";

export interface CollectionRouteClient {
  clientId: string; latitude: number; longitude: number; addressLabel?: string;
  priority: "normal" | "overdue" | "high_risk"; lastCollectionAt?: string; assignedAgentId?: string;
}
export interface AgentAvailability { agentId: string; available: boolean; lastHeartbeatAt: string; }
export interface Reassignment {
  clientId: string; previousAgentId?: string; nextAgentId: string; reason: "agent_unavailable" | "unassigned";
  planHash: string;
}
export function buildContinuityQueue(clients: readonly CollectionRouteClient[], agents: readonly AgentAvailability[]): CollectionRouteClient[] {
  const active=new Set(agents.filter(a=>a.available).map(a=>a.agentId));
  return clients.filter(c=>c.assignedAgentId===undefined || !active.has(c.assignedAgentId))
    .sort((a,b)=>Number(b.priority==="high_risk")-Number(a.priority==="high_risk") || a.clientId.localeCompare(b.clientId));
}
export function buildReassignmentPlan(
  clients: readonly CollectionRouteClient[],
  agents: readonly AgentAvailability[]
): readonly Reassignment[] {
  const active=agents.filter(a=>a.available).map(a=>a.agentId).sort();
  if(active.length===0) return [];
  const queue=buildContinuityQueue(clients,agents);
  return queue.map((client,index)=>{
    const nextAgentId=active[index%active.length];
    const reason=client.assignedAgentId===undefined ? "unassigned" : "agent_unavailable";
    const planHash=createHash("sha256").update([client.clientId,client.assignedAgentId??"",nextAgentId,reason].join("|")).digest("hex");
    return {clientId:client.clientId, ...(client.assignedAgentId===undefined ? {} : {previousAgentId:client.assignedAgentId}), nextAgentId,reason,planHash};
  });
}
