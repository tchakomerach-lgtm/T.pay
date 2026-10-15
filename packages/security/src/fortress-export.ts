import {sanitizeForExposure} from "./fortress-exposure-guard.js";

export interface FortressExportContext {
  /** Values must come from authenticated server-side authorization, never request payload fields. */
  readonly actorId:string;
  readonly organizationId:string;
  readonly purpose:string;
  readonly maxBytes?:number;
}
export interface FortressPreparedExport {
  readonly payload:unknown;
  readonly audit:{
    readonly actorId:string;
    readonly organizationId:string;
    readonly purpose:string;
    readonly digest:string;
    readonly originalBytes:number;
    readonly outputBytes:number;
    readonly redactedFieldCount:number;
    readonly classification:"internal";
  };
}

/** Fail-closed export preparation. The caller must authorize access before invoking this function. */
export function prepareFortressExport(input:unknown,context:FortressExportContext):FortressPreparedExport{
  if(!context.actorId?.trim()||!context.organizationId?.trim())throw new Error("FORTRESS_EXPORT_AUTH_CONTEXT_REQUIRED");
  if(!context.purpose?.trim())throw new Error("FORTRESS_EXPORT_PURPOSE_REQUIRED");
  const safe=sanitizeForExposure(input,{
    channel:"export",
    actorId:context.actorId,
    organizationId:context.organizationId,
    purpose:context.purpose,
    allowedClasses:["internal"],
    maxBytes:context.maxBytes??8*1024*1024
  });
  return {
    payload:safe.value,
    audit:{
      actorId:context.actorId,
      organizationId:context.organizationId,
      purpose:context.purpose,
      digest:safe.digest,
      originalBytes:safe.originalBytes,
      outputBytes:safe.outputBytes,
      redactedFieldCount:safe.redactedPaths.length,
      classification:"internal"
    }
  };
}
