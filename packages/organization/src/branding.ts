import type { OrganizationLogo, OrganizationLogoSource, UUID } from "../../domain/src/types.js";

export interface OrganizationLogoRepository {
  insert(logo: OrganizationLogo): Promise<void>;
  findActive(organizationId: UUID): Promise<OrganizationLogo | undefined>;
  archiveActive(organizationId: UUID, archivedAt: string): Promise<void>;
  activate(organizationId: UUID, logoId: UUID, activatedAt: string): Promise<void>;
}

export interface LogoAssetScanner {
  sanitizeAndScan(input: {
    organizationId: UUID;
    source: OrganizationLogoSource;
    assetRef: string;
    mimeType: OrganizationLogo["mimeType"];
  }): Promise<{ sanitizedAssetRef: string; sha256: string }>;
}

export interface OrganizationBrandingTransaction {
  archiveActive(organizationId: UUID, archivedAt: string): Promise<void>;
  insert(logo: OrganizationLogo): Promise<void>;
  activate(organizationId: UUID, logoId: UUID, activatedAt: string): Promise<void>;
  saveBranding(input: { organizationId: UUID; activeLogoId: UUID; logoVersion: number; updatedAt: string }): Promise<void>;
}
export interface OrganizationBrandingUnitOfWork {
  run<T>(work: (tx: OrganizationBrandingTransaction) => Promise<T>): Promise<T>;
}

export interface OrganizationBrandingRepository {
  save(input: { organizationId: UUID; activeLogoId: UUID; logoVersion: number; updatedAt: string }): Promise<void>;
}

export interface BrandingIdGenerator { next(): UUID; }
export interface BrandingClock { now(): string; }

export async function registerOrganizationLogo(
  input: {
    organizationId: UUID;
    source: OrganizationLogoSource;
    assetRef: string;
    mimeType: OrganizationLogo["mimeType"];
    replaceActive: boolean;
  },
  deps: {
    logos: OrganizationLogoRepository;
    branding: OrganizationBrandingRepository;
    unitOfWork?: OrganizationBrandingUnitOfWork;
    scanner: LogoAssetScanner;
    ids: BrandingIdGenerator;
    clock: BrandingClock;
  }
): Promise<OrganizationLogo> {
  const active = await deps.logos.findActive(input.organizationId);
  if (active && !input.replaceActive) throw new Error("ACTIVE_ORGANIZATION_LOGO_EXISTS");

  const now = deps.clock.now();
  const sanitized = await deps.scanner.sanitizeAndScan(input);
  if (!sanitized.sanitizedAssetRef || !sanitized.sha256) throw new Error("LOGO_SANITIZATION_REQUIRED");



  const logo: OrganizationLogo = {
    id: deps.ids.next(),
    organizationId: input.organizationId,
    source: input.source,
    originalAssetRef: input.assetRef,
    sanitizedAssetRef: sanitized.sanitizedAssetRef,
    mimeType: input.mimeType,
    sha256: sanitized.sha256,
    version: (active?.version ?? 0) + 1,
    status: "active",
    createdAt: now,
    activatedAt: now
  };
  const write = async (tx: OrganizationBrandingTransaction) => {
    if (active) await tx.archiveActive(input.organizationId, now);
    await tx.insert(logo);
    await tx.activate(input.organizationId, logo.id, now);
    await tx.saveBranding({ organizationId: input.organizationId, activeLogoId: logo.id, logoVersion: logo.version, updatedAt: now });
  };
  if (deps.unitOfWork) await deps.unitOfWork.run(write);
  else await write({ archiveActive: deps.logos.archiveActive, insert: deps.logos.insert, activate: deps.logos.activate, saveBranding: deps.branding.save });
  return logo;
}
