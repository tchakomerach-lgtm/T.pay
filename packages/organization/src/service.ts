import type { Organization, OrganizationType, UUID } from "../../domain/src/types.js";

export interface OrganizationRepository {
  insert(organization: Organization): Promise<void>;
  findById(id: UUID): Promise<Organization | undefined>;
}

export interface SecretHasher {
  hash(value: string): Promise<string>;
}

export interface OrganizationIdGenerator {
  next(): UUID;
}

export interface Clock {
  now(): string;
}

export interface CreateOrganizationCommand {
  founderId: UUID;
  name: string;
  type: OrganizationType;
  accessCode: string;
}

export async function createOrganization(
  command: CreateOrganizationCommand,
  deps: { repository: OrganizationRepository; hasher: SecretHasher; ids: OrganizationIdGenerator; clock: Clock }
): Promise<Organization> {
  const name = command.name.trim();
  if (name.length < 2 || name.length > 160) throw new Error("INVALID_ORGANIZATION_NAME");
  if (command.accessCode.length < 8 || command.accessCode.length > 128) {
    throw new Error("INVALID_ORGANIZATION_ACCESS_CODE");
  }

  const organization: Organization = {
    id: deps.ids.next(),
    name,
    type: command.type,
    founderId: command.founderId,
    accessCodeHash: await deps.hasher.hash(command.accessCode),
    createdAt: deps.clock.now(),
    status: "active"
  };
  await deps.repository.insert(organization);
  return organization;
}
