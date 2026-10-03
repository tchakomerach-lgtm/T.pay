export type UUID = string & { readonly __brand: "UUID" };
export type OrganizationType = "school"|"university"|"microfinance"|"company"|"restaurant"|"hotel"|"shop"|"supermarket"|"clinic"|"hospital"|"pharmacy"|"laboratory"|"professional_firm"|"cooperative"|"farm"|"agricultural_operation"|"ngo"|"association"|"public_administration"|"transport_company"|"real_estate_agency"|"industry"|"media"|"sports_club"|"cultural_center"|"startup"|"sme"|"pmi"|"other";
export type OrganizationLogoSource = "uploaded"|"generated";
export type OrganizationLogoStatus = "pending_scan"|"active"|"rejected"|"archived";
export interface OrganizationLogo { id:UUID; organizationId:UUID; source:OrganizationLogoSource; originalAssetRef:string; sanitizedAssetRef:string; mimeType:"image/svg+xml"|"image/png"|"image/jpeg"|"image/webp"; sha256:string; version:number; status:OrganizationLogoStatus; createdAt:string; activatedAt?:string; archivedAt?:string; }
export interface OrganizationBranding { organizationId:UUID; activeLogoId?:UUID; logoVersion:number; updatedAt:string; }
export interface Organization { id:UUID; name:string; type:OrganizationType; founderId:UUID; accessCodeHash:string; createdAt:string; status:"active"|"suspended"|"closed"; branding?:OrganizationBranding; }
export interface User { id:UUID; displayName:string; status:"active"|"suspended"|"deleted"; }
export interface Role { id:UUID; organizationId:UUID; name:string; permissions:readonly string[]; }