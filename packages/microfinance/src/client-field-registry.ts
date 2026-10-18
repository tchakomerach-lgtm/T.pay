import { createHash } from "node:crypto";

/**
 * Institution-owned field profile. This module plans continuity only: it never
 * authorizes or posts money and never treats GPS as proof of customer identity.
 * planHash is a deterministic integrity binding, NOT a digital signature or
 * an authorization token. A server command must revalidate and approve a plan.
 */
export interface CustomerFieldLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  method: "gps" | "map_pin" | "verified_address";
  consentRecorded: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  landmark?: string;
  addressLabel?: string;
  referencePhotoId?: string;
}

export interface CustomerFieldProfile {
  organizationId: string;
  customerId: string;
  active: boolean;
  location?: CustomerFieldLocation;
  preferredWindow?: { startMinute: number; endMinute: number };
  primaryAgentId?: string;
  secondaryAgentId?: string;
  routeId?: string;
  lastVisitedAt?: string;
  openException: boolean;
}

export interface FieldAgentCandidate {
  agentId: string;
  organizationId: string;
  available: boolean;
  authorizedForCollections: boolean;
  heartbeatAt: string;
  latitude: number;
  longitude: number;
  activeClientCount: number;
  maxActiveClients: number;
  maxRouteDistanceKm: number;
}

export interface FieldRouteAssignment {
  organizationId: string;
  customerId: string;
  previousAgentId?: string;
  nextAgentId: string;
  reason: "agent_unavailable" | "unassigned" | "coverage_gap";
  distanceKm: number;
  planHash: string;
  requiresSupervisorApproval: true;
}

export interface FieldRegistryValidation {
  valid: boolean;
  issues: string[];
  findabilityScore: number;
  locationStatus: "missing" | "needs_review" | "captured" | "verified";
}

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

function isFiniteCoordinate(value: number, limit: number): boolean {
  return Number.isFinite(value) && value >= -limit && value <= limit;
}

export function validateCustomerFieldLocation(
  location: CustomerFieldLocation | undefined,
): FieldRegistryValidation {
  const issues: string[] = [];
  if (!location) {
    return { valid: false, issues: ["LOCATION_MISSING"], findabilityScore: 0, locationStatus: "missing" };
  }

  const capturedAtMs = Date.parse(location.capturedAt);
  const accuracyValid = Number.isFinite(location.accuracyMeters) && location.accuracyMeters >= 0;
  const coordinateValid = isFiniteCoordinate(location.latitude, MAX_LATITUDE)
    && isFiniteCoordinate(location.longitude, MAX_LONGITUDE);
  const verifiedAtMs = location.verifiedAt === undefined ? Number.NaN : Date.parse(location.verifiedAt);
  const hasVerifier = typeof location.verifiedBy === "string" && location.verifiedBy.trim().length > 0;
  const hasVerificationTime = Number.isFinite(verifiedAtMs);

  if (!location.consentRecorded) issues.push("LOCATION_CONSENT_REQUIRED");
  if (!isFiniteCoordinate(location.latitude, MAX_LATITUDE)) issues.push("LATITUDE_INVALID");
  if (!isFiniteCoordinate(location.longitude, MAX_LONGITUDE)) issues.push("LONGITUDE_INVALID");
  if (!accuracyValid) issues.push("GPS_ACCURACY_INVALID");
  if (!Number.isFinite(capturedAtMs)) issues.push("CAPTURE_TIMESTAMP_INVALID");
  if ((location.landmark?.trim().length ?? 0) < 8 && (location.addressLabel?.trim().length ?? 0) < 8) {
    issues.push("LANDMARK_OR_ADDRESS_REQUIRED");
  }
  if (location.verifiedBy !== undefined && !hasVerifier) issues.push("VERIFIER_INVALID");
  if (location.verifiedAt !== undefined && !hasVerificationTime) issues.push("VERIFICATION_TIMESTAMP_INVALID");
  if (hasVerifier !== hasVerificationTime) issues.push("VERIFICATION_PAIR_INCOMPLETE");
  if (hasVerificationTime && Number.isFinite(capturedAtMs) && verifiedAtMs < capturedAtMs) {
    issues.push("VERIFICATION_PRECEDES_CAPTURE");
  }
  if (hasVerifier && (!accuracyValid || location.accuracyMeters > 100)) issues.push("VERIFICATION_ACCURACY_TOO_LOW");
  if (location.method === "verified_address" && !location.addressLabel?.trim()) issues.push("VERIFIED_ADDRESS_LABEL_REQUIRED");

  const score = Math.min(100,
    (coordinateValid ? 35 : 0)
    + (accuracyValid && location.accuracyMeters <= 25 ? 20 : accuracyValid && location.accuracyMeters <= 100 ? 10 : 0)
    + (location.addressLabel?.trim() ? 15 : 0)
    + (location.landmark?.trim() ? 15 : 0)
    + (location.referencePhotoId?.trim() ? 5 : 0)
    + (hasVerifier && hasVerificationTime && accuracyValid && location.accuracyMeters <= 100 ? 10 : 0));

  const verified = issues.length === 0 && hasVerifier && hasVerificationTime && coordinateValid
    && location.consentRecorded && accuracyValid && location.accuracyMeters <= 100;
  const locationStatus = verified ? "verified"
    : issues.length > 0 || !accuracyValid || location.accuracyMeters > 100 ? "needs_review" : "captured";
  return { valid: issues.length === 0, issues, findabilityScore: score, locationStatus };
}

export function haversineDistanceKm(
  from: Pick<CustomerFieldLocation, "latitude" | "longitude">,
  to: Pick<FieldAgentCandidate, "latitude" | "longitude">,
): number {
  if (!isFiniteCoordinate(from.latitude, MAX_LATITUDE)
    || !isFiniteCoordinate(from.longitude, MAX_LONGITUDE)
    || !isFiniteCoordinate(to.latitude, MAX_LATITUDE)
    || !isFiniteCoordinate(to.longitude, MAX_LONGITUDE)) {
    throw new Error("FIELD_LOCATION_INVALID");
  }
  const radians = (degrees: number): number => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function buildFieldContinuityPlan(
  profiles: readonly CustomerFieldProfile[],
  agents: readonly FieldAgentCandidate[],
  options: { now: string; maxHeartbeatAgeMinutes: number; planExpiresAt: string },
): readonly FieldRouteAssignment[] {
  const nowMs = Date.parse(options.now);
  const expiresMs = Date.parse(options.planExpiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    throw new Error("FIELD_PLAN_EXPIRY_INVALID");
  }
  if (!Number.isFinite(options.maxHeartbeatAgeMinutes) || options.maxHeartbeatAgeMinutes <= 0) {
    throw new Error("FIELD_HEARTBEAT_POLICY_INVALID");
  }

  // Keep reachability separate from capacity: a healthy but full primary agent
  // represents a coverage gap, not an unavailable agent.
  const reachableAgents = agents.filter((agent) => {
    const heartbeat = Date.parse(agent.heartbeatAt);
    return agent.available
      && agent.authorizedForCollections
      && agent.organizationId.length > 0
      && Number.isFinite(heartbeat)
      && heartbeat <= nowMs
      && nowMs - heartbeat <= options.maxHeartbeatAgeMinutes * 60_000
      && Number.isFinite(agent.activeClientCount)
      && agent.activeClientCount >= 0
      && Number.isFinite(agent.maxActiveClients)
      && agent.maxActiveClients > 0
      && Number.isFinite(agent.maxRouteDistanceKm)
      && agent.maxRouteDistanceKm > 0
      && isFiniteCoordinate(agent.latitude, MAX_LATITUDE)
      && isFiniteCoordinate(agent.longitude, MAX_LONGITUDE);
  }).sort((a, b) => a.agentId.localeCompare(b.agentId));

  const activeAgents = reachableAgents.filter((agent) => agent.activeClientCount < agent.maxActiveClients);
  const workloads = new Map(activeAgents.map((agent) => [agent.agentId, agent.activeClientCount]));
  const plans: FieldRouteAssignment[] = [];
  const queue = profiles
    .filter((profile) => profile.active && (
      profile.primaryAgentId === undefined
      || !activeAgents.some((agent) => agent.agentId === profile.primaryAgentId && agent.organizationId === profile.organizationId)
    ))
    .sort((a, b) => Number(b.openException) - Number(a.openException)
      || a.customerId.localeCompare(b.customerId));

  for (const profile of queue) {
    if (!profile.location || !profile.location.consentRecorded) continue;
    const validLocation = validateCustomerFieldLocation(profile.location);
    if (!validLocation.valid) continue;

    const candidates = activeAgents
      .filter((agent) => agent.organizationId === profile.organizationId
        && (workloads.get(agent.agentId) ?? agent.maxActiveClients) < agent.maxActiveClients)
      .map((agent) => ({
        agent,
        distanceKm: haversineDistanceKm(profile.location!, agent),
      }))
      .filter(({ agent, distanceKm }) => distanceKm <= agent.maxRouteDistanceKm)
      .sort((a, b) => {
        const loadA = (workloads.get(a.agent.agentId) ?? 0) / a.agent.maxActiveClients;
        const loadB = (workloads.get(b.agent.agentId) ?? 0) / b.agent.maxActiveClients;
        const scoreA = a.distanceKm + loadA * 2;
        const scoreB = b.distanceKm + loadB * 2;
        return scoreA - scoreB || a.agent.agentId.localeCompare(b.agent.agentId);
      });

    const selected = candidates[0];
    if (!selected) continue;
    const reason = profile.primaryAgentId === undefined ? "unassigned"
      : reachableAgents.some((agent) => agent.agentId === profile.primaryAgentId && agent.organizationId === profile.organizationId)
        ? "coverage_gap" : "agent_unavailable";
    const binding = [
      profile.organizationId,
      profile.customerId,
      profile.primaryAgentId ?? "",
      selected.agent.agentId,
      reason,
      selected.distanceKm.toFixed(3),
      profile.location.latitude.toFixed(6),
      profile.location.longitude.toFixed(6),
      profile.location.capturedAt,
      selected.agent.heartbeatAt,
      selected.agent.activeClientCount,
      selected.agent.maxActiveClients,
      options.planExpiresAt,
    ].join("|");
    plans.push({
      organizationId: profile.organizationId,
      customerId: profile.customerId,
      ...(profile.primaryAgentId === undefined ? {} : { previousAgentId: profile.primaryAgentId }),
      nextAgentId: selected.agent.agentId,
      reason,
      distanceKm: Number(selected.distanceKm.toFixed(3)),
      planHash: createHash("sha256").update(binding).digest("hex"),
      requiresSupervisorApproval: true,
    });
    workloads.set(selected.agent.agentId, (workloads.get(selected.agent.agentId) ?? 0) + 1);
  }
  return plans;
}
