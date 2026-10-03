import { validateCollection, type TontineCollection, type TontineMember } from "./tontine.js";

export interface CollectionRepository {
  findByIdempotencyKey(key: string): Promise<TontineCollection | undefined>;
  append(collection: TontineCollection): Promise<void>;
}

export interface CollectionIdempotency {
  reserve(key: string): Promise<boolean>;
}

export async function postCollection(
  repository: CollectionRepository,
  idempotency: CollectionIdempotency,
  collection: TontineCollection,
  member: TontineMember
): Promise<TontineCollection> {
  validateCollection(collection, member);
  const existing = await repository.findByIdempotencyKey(collection.idempotencyKey);
  if (existing) return existing;
  if (!(await idempotency.reserve(collection.idempotencyKey))) {
    const replay = await repository.findByIdempotencyKey(collection.idempotencyKey);
    if (replay) return replay;
    throw new Error("TONTINE_IDEMPOTENCY_CONFLICT");
  }
  await repository.append(collection);
  return collection;
}
