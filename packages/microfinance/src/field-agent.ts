export interface CollectionRouteClient {
  clientId: string;
  latitude: number;
  longitude: number;
  addressLabel?: string;
  priority: "normal" | "overdue" | "high_risk";
  lastCollectionAt?: string;
  assignedAgentId?: string;
}

export interface AgentAvailability {
  agentId: string;
  available: boolean;
  lastHeartbeatAt: string;
}

export function buildContinuityQueue(
  clients: readonly CollectionRouteClient[],
  agents: readonly AgentAvailability[]
): CollectionRouteClient[] {
  const active = new Set(agents.filter(a => a.available).map(a => a.agentId));
  return clients
    .filter(c => c.assignedAgentId === undefined || !active.has(c.assignedAgentId))
    .sort((a,b) => Number(b.priority === "high_risk") - Number(a.priority === "high_risk"));
}
