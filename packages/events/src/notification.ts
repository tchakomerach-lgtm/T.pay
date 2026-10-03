import type { DomainEvent } from "./events.js";

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

export async function deliverClaimedNotification(
  store: NotificationStore,
  provider: NotificationProvider,
  intent: NotificationIntent,
  workerId: string,
  now: string
): Promise<void> {
  await provider.send(intent);
  await store.markSent(intent.id, workerId, now);
}
