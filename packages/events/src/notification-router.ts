import type { DomainEvent } from "./events.js";
import type { NotificationIntent, NotificationChannel, NotificationSensitivity } from "./notification.js";

export interface NotificationRecipientResolver {
  resolve(event: DomainEvent): Promise<ReadonlyArray<{ userId: string; organizationId: string; channels: ReadonlyArray<NotificationChannel> }>>;
}

const templates: Partial<Record<DomainEvent["type"], { template: string; sensitivity: NotificationSensitivity }>> = {
  "payment.completed": { template: "payment_completed", sensitivity: "generic" },
  "payment.failed": { template: "payment_failed", sensitivity: "generic" },
  "tontine.contribution_confirmed": { template: "tontine_contribution_confirmed", sensitivity: "generic" },
  "tontine.contribution_missed": { template: "tontine_contribution_missed", sensitivity: "generic" },
  "tontine.beneficiary_paid": { template: "tontine_beneficiary_paid", sensitivity: "generic" }
};

export async function deriveNotificationIntents(eventId: string, event: DomainEvent, resolver: NotificationRecipientResolver, createdAt: string): Promise<ReadonlyArray<NotificationIntent>> {
  const definition = templates[event.type];
  if (!definition) return [];
  const recipients = await resolver.resolve(event);
  return recipients.flatMap((recipient) => recipient.channels.map((channel) => ({
    id: deterministicIntentId(eventId, recipient.userId, channel, definition.template),
    organizationId: recipient.organizationId, recipientUserId: recipient.userId, channel, template: definition.template,
    eventId, eventType: event.type, sensitivity: definition.sensitivity, createdAt
  })));
}

function deterministicIntentId(eventId: string, userId: string, channel: string, template: string): string {
  const input = eventId + ":" + userId + ":" + channel + ":" + template;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) { h1 ^= input.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); }
  const hex = (h1 >>> 0).toString(16).padStart(8, "0");
  return hex + hex + hex + hex.slice(0, 4) + "-0000-4000-8000-000000000000";
}