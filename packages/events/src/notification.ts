import type { DomainEvent } from "./events.js";
import {sanitizeForExposure} from "../../security/src/fortress-exposure-guard.js";

export type NotificationChannel = "in_app" | "push" | "sms" | "email";

export type NotificationSensitivity = "generic" | "sensitive";

export interface NotificationIntent {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly channel: NotificationChannel;
  readonly template: string;
  readonly eventId: string;
  readonly eventType: DomainEvent["type"];
  readonly sensitivity: NotificationSensitivity;
  readonly createdAt: string;
}

export interface NotificationDelivery {
  readonly id: string;
  readonly intentId: string;
  readonly providerKey: string;
  readonly attempt: number;
}

export interface NotificationStore {
  enqueue(intent: NotificationIntent): Promise<void>;
  claimNext(workerId: string, now: string, leaseUntil: string): Promise<NotificationIntent | null>;
  markSent(id: string, workerId: string, sentAt: string): Promise<void>;
  markFailed(id: string, workerId: string, nextAttemptAt: string): Promise<void>;
}

export interface NotificationProvider {
  readonly key: string;
  send(intent: NotificationIntent): Promise<void>;
}

/** Only template intents cross into delivery providers; nested PII/secrets are scrubbed first. */
export function sanitizeNotificationIntent(intent:NotificationIntent):NotificationIntent{
  const safe=sanitizeForExposure(intent,{
    channel:"notification",
    purpose:"notification-delivery",
    allowedClasses:["internal"],
    maxBytes:16*1024
  });
  const value=safe.value as NotificationIntent;
  if(!/^[a-z0-9_]{1,100}$/i.test(value.template))throw new Error("NOTIFICATION_TEMPLATE_INVALID");
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(value.recipientUserId))throw new Error("NOTIFICATION_RECIPIENT_ID_INVALID");
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(value.organizationId))throw new Error("NOTIFICATION_ORGANIZATION_ID_INVALID");
  return value;
}

export async function deliverClaimedNotification(
  store: NotificationStore,
  provider: NotificationProvider,
  intent: NotificationIntent,
  workerId: string,
  now: string
): Promise<void> {
  await provider.send(sanitizeNotificationIntent(intent));
  await store.markSent(intent.id, workerId, now);
}
