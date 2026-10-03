import type { DomainEvent } from "./events.js";

export interface OutboxRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly event: DomainEvent;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly attempts: number;
  readonly publishedAt: string | null;
}

export interface OutboxStore {
  insert(record: OutboxRecord): Promise<void>;
  claimNext(workerId: string, now: string): Promise<OutboxRecord | null>;
  markPublished(id: string, publishedAt: string): Promise<void>;
  markAttemptFailed(id: string, now: string): Promise<void>;
}

export interface EventPublisher { publish(event: DomainEvent): Promise<void>; }

export async function publishClaimedOutbox(store: OutboxStore, publisher: EventPublisher, record: OutboxRecord, now: string): Promise<void> {
  await publisher.publish(record.event);
  await store.markPublished(record.id, now);
}

// Publication is post-commit only. Financial state is never considered committed because an external event was published.