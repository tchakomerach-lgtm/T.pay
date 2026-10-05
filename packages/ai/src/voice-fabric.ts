import { createHash, randomUUID } from "node:crypto";

export type VoiceRiskLevel = "V0" | "V1" | "V2" | "V3" | "V4" | "V5";
export type VoiceSessionState =
  | "RINGING" | "ACCEPTED" | "CONSENT_CHECK" | "IDENTIFICATION"
  | "TRUST_SCORING" | "INTENT_CAPTURE" | "POLICY_CHECK" | "TOOL_PLAN"
  | "USER_CONFIRMATION" | "STEP_UP_AUTH" | "HUMAN_APPROVAL"
  | "EXECUTION" | "RESULT_CONFIRMATION" | "HANDOFF" | "RESTRICTED"
  | "CONTAINED" | "ENDED";
export type VoiceChannel = "pstn" | "sip" | "webrtc" | "mobile" | "web";
export type VerificationFactor = "account_session" | "passkey" | "push_confirmation" | "totp" | "signed_transaction" | "human_approval";
export type VoiceActionKind =
  | "public_information" | "read_account" | "appointment"
  | "account_change" | "operational_change" | "financial"
  | "credit_decision" | "privileged_admin";

export interface VoiceSession {
  readonly id: string;
  readonly organizationId: string;
  readonly actorId?: string;
  readonly channel: VoiceChannel;
  readonly state: VoiceSessionState;
  readonly risk: VoiceRiskLevel;
  readonly capabilityLeaseId: string;
  readonly startedAt: string;
  readonly expiresAt: string;
}

export interface VoiceTrustAssessment {
  readonly callerIdPresent: boolean;
  readonly callerIdTrusted: false;
  readonly riskScore: number;
  readonly signals: readonly string[];
  readonly assessedAt: string;
}

export interface VoiceConsent {
  readonly recording: "granted" | "denied" | "not_requested";
  readonly transcript: "granted" | "denied" | "not_requested";
  readonly capturedAt?: string;
}

export interface VoiceActionRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly actorId?: string;
  readonly kind: VoiceActionKind;
  readonly risk: VoiceRiskLevel;
  readonly toolName: string;
  readonly target?: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface VoicePolicy {
  readonly minimumFactors: Readonly<Record<VoiceRiskLevel, number>>;
  readonly allowedFactors: Readonly<Record<VoiceRiskLevel, readonly VerificationFactor[]>>;
  readonly humanApprovalRequiredFor: readonly VoiceActionKind[];
}

export interface VoiceAuthorizationResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly requiredFactors: readonly VerificationFactor[];
}

export interface TransactionChallenge {
  readonly id: string;
  readonly sessionId: string;
  readonly actionHash: string;
  readonly expiresAt: string;
}

export interface Appointment {
  readonly id: string;
  readonly organizationId: string;
  readonly resourceId: string;
  readonly actorId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: "confirmed" | "cancelled";
  readonly channel: VoiceChannel;
}

export interface AppointmentRequest {
  readonly organizationId: string;
  readonly resourceId: string;
  readonly actorId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly channel: VoiceChannel;
}

const transitionMap: Readonly<Record<VoiceSessionState, readonly VoiceSessionState[]>> = {
  RINGING: ["ACCEPTED", "ENDED"],
  ACCEPTED: ["CONSENT_CHECK", "ENDED"],
  CONSENT_CHECK: ["IDENTIFICATION", "INTENT_CAPTURE", "RESTRICTED", "ENDED"],
  IDENTIFICATION: ["TRUST_SCORING", "RESTRICTED", "ENDED"],
  TRUST_SCORING: ["INTENT_CAPTURE", "RESTRICTED", "CONTAINED"],
  INTENT_CAPTURE: ["POLICY_CHECK", "HANDOFF", "CONTAINED", "ENDED"],
  POLICY_CHECK: ["TOOL_PLAN", "STEP_UP_AUTH", "HUMAN_APPROVAL", "RESTRICTED", "HANDOFF", "CONTAINED"],
  TOOL_PLAN: ["USER_CONFIRMATION", "EXECUTION", "STEP_UP_AUTH", "HUMAN_APPROVAL", "RESTRICTED"],
  USER_CONFIRMATION: ["EXECUTION", "STEP_UP_AUTH", "HUMAN_APPROVAL", "RESTRICTED"],
  STEP_UP_AUTH: ["HUMAN_APPROVAL", "EXECUTION", "RESTRICTED", "CONTAINED"],
  HUMAN_APPROVAL: ["EXECUTION", "RESTRICTED", "CONTAINED"],
  EXECUTION: ["RESULT_CONFIRMATION", "HANDOFF", "CONTAINED"],
  RESULT_CONFIRMATION: ["HANDOFF", "ENDED"],
  HANDOFF: ["ENDED"],
  RESTRICTED: ["HANDOFF", "ENDED"],
  CONTAINED: ["HANDOFF", "ENDED"],
  ENDED: [],
};

export function transitionVoiceSession(session: VoiceSession, next: VoiceSessionState): VoiceSession {
  if (!transitionMap[session.state].includes(next)) {
    throw new Error("VOICE_INVALID_STATE_TRANSITION");
  }
  return { ...session, state: next };
}

export function createVoiceSession(input: {
  organizationId: string;
  actorId?: string;
  channel: VoiceChannel;
  now?: Date;
  ttlMs?: number;
}): VoiceSession {
  const now = input.now ?? new Date();
  const ttlMs = Math.max(30_000, Math.min(input.ttlMs ?? 15 * 60_000, 60 * 60_000));
  return {
    id: randomUUID(),
    organizationId: input.organizationId,
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    channel: input.channel,
    state: "RINGING",
    risk: "V0",
    capabilityLeaseId: randomUUID(),
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export function assessCallerTrust(input: {
  callerIdPresent: boolean;
  claimedActorId?: string;
  accountActorId?: string;
  knownFraudSignal?: boolean;
  now?: Date;
}): VoiceTrustAssessment {
  const signals: string[] = [];
  let score = 0;
  if (input.callerIdPresent) signals.push("caller_id_present");
  if (input.callerIdPresent && input.claimedActorId && input.accountActorId && input.claimedActorId === input.accountActorId) {
    score += 15;
    signals.push("caller_id_matches_account");
  } else if (input.callerIdPresent) {
    signals.push("caller_id_not_proof_of_identity");
  }
  if (input.knownFraudSignal) {
    score += 70;
    signals.push("known_fraud_signal");
  }
  return {
    callerIdPresent: input.callerIdPresent,
    callerIdTrusted: false,
    riskScore: Math.min(100, score),
    signals,
    assessedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function requiredVoiceFactors(
  risk: VoiceRiskLevel,
  policy: VoicePolicy,
  actionKind: VoiceActionKind,
): readonly VerificationFactor[] {
  const allowed = [...policy.allowedFactors[risk]];
  const minimum = policy.minimumFactors[risk];
  const humanRequired = policy.humanApprovalRequiredFor.includes(actionKind);

  if (humanRequired) {
    const withoutHuman = allowed.filter(factor => factor !== "human_approval");
    const selected = withoutHuman.slice(0, Math.max(0, minimum - 1));
    return [...selected, "human_approval"];
  }

  return allowed.slice(0, minimum);
}

export function authorizeVoiceAction(input: {
  request: VoiceActionRequest;
  policy: VoicePolicy;
  verifiedFactors: readonly VerificationFactor[];
}): VoiceAuthorizationResult {
  const required = requiredVoiceFactors(input.request.risk, input.policy, input.request.kind);
  const missing = required.filter(factor => !input.verifiedFactors.includes(factor));
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: "VOICE_STEP_UP_AUTH_REQUIRED",
      requiredFactors: missing,
    };
  }
  return { allowed: true, reason: "VOICE_POLICY_ALLOWED", requiredFactors: required };
}

export function createTransactionChallenge(input: {
  sessionId: string;
  action: VoiceActionRequest;
  now?: Date;
  ttlMs?: number;
}): TransactionChallenge {
  const now = input.now ?? new Date();
  const ttlMs = Math.max(10_000, Math.min(input.ttlMs ?? 120_000, 10 * 60_000));
  const normalized = JSON.stringify({
    organizationId: input.action.organizationId,
    sessionId: input.sessionId,
    kind: input.action.kind,
    toolName: input.action.toolName,
    target: input.action.target ?? null,
    parameters: input.action.parameters,
  });
  return {
    id: randomUUID(),
    sessionId: input.sessionId,
    actionHash: createHash("sha256").update(normalized).digest("hex"),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export function verifyTransactionChallenge(input: {
  challenge: TransactionChallenge;
  signedActionHash: string;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return now.getTime() <= Date.parse(input.challenge.expiresAt)
    && input.signedActionHash === input.challenge.actionHash;
}

export class InMemoryAppointmentScheduler {
  private readonly appointments = new Map<string, Appointment>();

  book(request: AppointmentRequest, id = randomUUID()): Appointment {
    const start = Date.parse(request.startsAt);
    const end = Date.parse(request.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error("VOICE_APPOINTMENT_INTERVAL_INVALID");
    }
    for (const existing of this.appointments.values()) {
      if (
        existing.organizationId === request.organizationId
        && existing.resourceId === request.resourceId
        && existing.status === "confirmed"
        && start < Date.parse(existing.endsAt)
        && end > Date.parse(existing.startsAt)
      ) {
        throw new Error("VOICE_APPOINTMENT_CONFLICT");
      }
    }
    const appointment: Appointment = {
      id,
      organizationId: request.organizationId,
      resourceId: request.resourceId,
      ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      status: "confirmed",
      channel: request.channel,
    };
    this.appointments.set(id, appointment);
    return appointment;
  }

  cancel(organizationId: string, appointmentId: string): Appointment {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment || appointment.organizationId !== organizationId) {
      throw new Error("VOICE_APPOINTMENT_NOT_FOUND");
    }
    const cancelled = { ...appointment, status: "cancelled" as const };
    this.appointments.set(appointmentId, cancelled);
    return cancelled;
  }

  list(organizationId: string): readonly Appointment[] {
    return [...this.appointments.values()].filter(a => a.organizationId === organizationId);
  }
}

export function mapVoiceIntentToRisk(kind: VoiceActionKind): VoiceRiskLevel {
  switch (kind) {
    case "public_information": return "V0";
    case "read_account": return "V1";
    case "appointment": return "V2";
    case "account_change": return "V3";
    case "operational_change": return "V3";
    case "financial": return "V5";
    case "credit_decision": return "V5";
    case "privileged_admin": return "V5";
  }
}
