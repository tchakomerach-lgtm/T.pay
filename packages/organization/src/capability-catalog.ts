import type { OrganizationType } from "../../domain/src/types.js";

export type CapabilityImplementationState = "implemented" | "contract_only" | "planned" | "restricted" | "disabled";
export type CapabilityProvisioning = "auto_when_implemented" | "opt_in" | "approval_required" | "never_by_default";
export type CapabilityDataClass = "organization_internal" | "commercial" | "personal" | "health_sensitive" | "financial";

export interface OrganizationCapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly scope: "shared" | "pharmacy" | "hospital";
  readonly eligibleOrganizationTypes: readonly OrganizationType[] | "all";
  readonly implementationState: CapabilityImplementationState;
  readonly provisioning: CapabilityProvisioning;
  readonly dataClass: CapabilityDataClass;
  readonly requiredPermissions: readonly string[];
  readonly requiresRegulatoryApproval: boolean;
  readonly description: string;
}

/**
 * Declarative capability registry. It describes what an organization may be
 * provisioned with; it is NOT an authorization engine and never grants access.
 *
 * Keep implementationState honest: the repository currently has shared
 * foundations, but CRM and internal social runtime packages are not yet present.
 */
export const ORGANIZATION_CAPABILITY_CATALOG = [
  { id: "org.crm", label: "CRM", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "commercial", requiredPermissions: ["crm.read", "crm.manage"], requiresRegulatoryApproval: false, description: "Contacts, relationships, leads, service requests and complaints; never a clinical record." },
  { id: "org.internal_social", label: "Réseau social interne", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "organization_internal", requiredPermissions: ["social.read", "social.publish", "social.moderate"], requiresRegulatoryApproval: false, description: "Private organization feed, groups, announcements and moderated collaboration." },
  { id: "org.messaging", label: "Messagerie professionnelle", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "organization_internal", requiredPermissions: ["messaging.read", "messaging.send"], requiresRegulatoryApproval: false, description: "Direct messages, teams and controlled external communications." },
  { id: "org.people", label: "Personnel et équipes", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "personal", requiredPermissions: ["people.read", "people.manage"], requiresRegulatoryApproval: false, description: "Membership, teams, skills, onboarding and offboarding." },
  { id: "org.documents", label: "Documents", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "organization_internal", requiredPermissions: ["documents.read", "documents.manage"], requiresRegulatoryApproval: false, description: "Versioned documents, templates, retention and controlled sharing." },
  { id: "org.calendar", label: "Calendrier et réunions", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "organization_internal", requiredPermissions: ["calendar.read", "calendar.manage"], requiresRegulatoryApproval: false, description: "Personal, team, organization, resource and on-call calendars." },
  { id: "org.workflows", label: "Projets, tâches et workflows", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "organization_internal", requiredPermissions: ["workflow.read", "workflow.manage"], requiresRegulatoryApproval: false, description: "Auditable tasks, approvals, projects and operational workflows." },
  { id: "org.notifications", label: "Notifications", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "personal", requiredPermissions: ["notifications.read", "notifications.manage"], requiresRegulatoryApproval: false, description: "In-app, push, email and contracted SMS delivery with privacy filtering." },
  { id: "org.analytics", label: "Tableaux de bord et analytics", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "opt_in", dataClass: "organization_internal", requiredPermissions: ["analytics.read"], requiresRegulatoryApproval: false, description: "Operational reporting with data minimization and authorized aggregates." },
  { id: "org.ai_assistant", label: "Assistant IA spécialisé", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "opt_in", dataClass: "organization_internal", requiredPermissions: ["ai.use"], requiresRegulatoryApproval: false, description: "Scoped assistance; tools and data access remain server-authorized." },
  { id: "org.partners", label: "Fournisseurs et partenaires", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "commercial", requiredPermissions: ["partners.read", "partners.manage"], requiresRegulatoryApproval: false, description: "Supplier, insurer, institutional and service-provider relationships." },
  { id: "org.billing", label: "Abonnements et facturation", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "financial", requiredPermissions: ["billing.read", "billing.manage"], requiresRegulatoryApproval: false, description: "SaaS subscriptions and invoices, with postings delegated to Financial Core." },
  { id: "org.integrations", label: "API et intégrations", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "opt_in", dataClass: "organization_internal", requiredPermissions: ["integrations.read", "integrations.manage"], requiresRegulatoryApproval: false, description: "Versioned APIs, webhooks and provider adapters." },
  { id: "org.support", label: "Support, réclamations et qualité", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "personal", requiredPermissions: ["support.read", "support.manage"], requiresRegulatoryApproval: false, description: "Service requests, complaints, incident and satisfaction workflows." },
  { id: "org.branding", label: "Identité et marque", scope: "shared", eligibleOrganizationTypes: "all", implementationState: "contract_only", provisioning: "auto_when_implemented", dataClass: "organization_internal", requiredPermissions: ["org.branding.read", "org.branding.manage"], requiresRegulatoryApproval: false, description: "Organization-owned identity resolved through the shared branding registry." },

  { id: "pharmacy.catalog", label: "Catalogue pharmaceutique", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "commercial", requiredPermissions: ["pharmacy.catalog.read", "pharmacy.catalog.manage"], requiresRegulatoryApproval: true, description: "Catalog, product classification, pack sizes and jurisdictional sale restrictions." },
  { id: "pharmacy.inventory", label: "Stocks, lots et péremptions", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "commercial", requiredPermissions: ["pharmacy.inventory.read", "pharmacy.inventory.manage"], requiresRegulatoryApproval: true, description: "Lot-level inventory, FEFO, quarantine, recall and branch transfers." },
  { id: "pharmacy.prescription_review", label: "Vérification d'ordonnances et dispensation", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["pharmacy.prescription.review", "pharmacy.dispense"], requiresRegulatoryApproval: true, description: "Professional review and controlled dispensing; AI cannot approve." },
  { id: "pharmacy.orders", label: "Commandes et réservations", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "commercial", requiredPermissions: ["pharmacy.orders.read", "pharmacy.orders.manage"], requiresRegulatoryApproval: true, description: "Customer orders, reservations, sub-orders and server-owned state transitions." },
  { id: "pharmacy.delivery", label: "Livraison pharmaceutique", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "personal", requiredPermissions: ["pharmacy.delivery.manage"], requiresRegulatoryApproval: true, description: "Mission-scoped courier access, proof of handoff and controlled transport." },
  { id: "pharmacy.duty", label: "Pharmacies de garde", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "organization_internal", requiredPermissions: ["pharmacy.duty.manage", "pharmacy.duty.publish"], requiresRegulatoryApproval: true, description: "Duty schedule with provenance, verification and validity window." },
  { id: "pharmacy.recall", label: "Rappels et incidents qualité", scope: "pharmacy", eligibleOrganizationTypes: ["pharmacy"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["pharmacy.recall.manage"], requiresRegulatoryApproval: true, description: "Lot recall, quarantine, incident evidence and regulator reporting workflow." },

  { id: "hospital.patient_portal", label: "Portail patient", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["patient.portal.manage"], requiresRegulatoryApproval: true, description: "Patient access to published records, appointments and consent controls." },
  { id: "hospital.appointments", label: "Rendez-vous et agenda médical", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.appointments.read", "hospital.appointments.manage"], requiresRegulatoryApproval: true, description: "Professional calendars, slot reservations and appointment lifecycle." },
  { id: "hospital.telehealth", label: "Téléconsultation", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.telehealth.manage"], requiresRegulatoryApproval: true, description: "Secure remote consultation with professional identity and consent." },
  { id: "hospital.admissions", label: "Admissions et hospitalisations", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.admissions.read", "hospital.admissions.manage"], requiresRegulatoryApproval: true, description: "Patient admission, transfers, stays and discharge." },
  { id: "hospital.beds", label: "Lits et capacités", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.beds.read", "hospital.beds.manage"], requiresRegulatoryApproval: true, description: "Transactional bed assignment and service capacity snapshots." },
  { id: "hospital.laboratory", label: "Laboratoire", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.lab.read", "hospital.lab.validate"], requiresRegulatoryApproval: true, description: "Sample chain, result validation and controlled publication." },
  { id: "hospital.imaging", label: "Imagerie médicale", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.imaging.read", "hospital.imaging.validate"], requiresRegulatoryApproval: true, description: "Imaging workflow and authorized DICOM interoperability." },
  { id: "hospital.inpatient_pharmacy", label: "Pharmacie hospitalière", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "health_sensitive", requiredPermissions: ["hospital.pharmacy.read", "hospital.pharmacy.dispense"], requiresRegulatoryApproval: true, description: "Internal hospital stock and dispensing; not an independent commercial pharmacy." },
  { id: "hospital.duty", label: "Services hospitaliers de garde", scope: "hospital", eligibleOrganizationTypes: ["hospital", "clinic"], implementationState: "planned", provisioning: "approval_required", dataClass: "organization_internal", requiredPermissions: ["hospital.duty.manage", "hospital.duty.publish"], requiresRegulatoryApproval: true, description: "Service-specific duty and availability, independently verified." }
] as const satisfies readonly OrganizationCapabilityDefinition[];

export type OrganizationCapabilityId = typeof ORGANIZATION_CAPABILITY_CATALOG[number]["id"];

export interface OrganizationCapabilityManifestEntry extends OrganizationCapabilityDefinition {
  readonly eligible: boolean;
  readonly activation: "not_eligible" | "pending_implementation" | "requires_approval" | "available_for_configuration";
}

/**
 * Returns a declarative manifest only. It must never be used as proof of
 * authorization, regulatory approval, or runtime implementation.
 */
export function getOrganizationCapabilityManifest(
  organizationType: OrganizationType
): readonly OrganizationCapabilityManifestEntry[] {
  return ORGANIZATION_CAPABILITY_CATALOG.map(capability => {
    const eligible = capability.eligibleOrganizationTypes === "all"
      || capability.eligibleOrganizationTypes.includes(organizationType);
    const activation = !eligible
      ? "not_eligible"
      : capability.implementationState !== "implemented"
        ? "pending_implementation"
        : capability.requiresRegulatoryApproval || capability.provisioning === "approval_required"
          ? "requires_approval"
          : "available_for_configuration";
    return { ...capability, eligible, activation };
  });
}

export function assertOrganizationCapabilityEligible(
  organizationType: OrganizationType,
  capabilityId: OrganizationCapabilityId
): OrganizationCapabilityDefinition {
  const capability = ORGANIZATION_CAPABILITY_CATALOG.find(item => item.id === capabilityId);
  if (!capability) throw new Error("ORGANIZATION_CAPABILITY_UNKNOWN");
  const eligible = capability.eligibleOrganizationTypes === "all"
    || capability.eligibleOrganizationTypes.includes(organizationType);
  if (!eligible) throw new Error("ORGANIZATION_CAPABILITY_NOT_ELIGIBLE");
  return capability;
}

export function getSharedOrganizationCapabilities(): readonly OrganizationCapabilityDefinition[] {
  return ORGANIZATION_CAPABILITY_CATALOG.filter(capability => capability.scope === "shared");
}
