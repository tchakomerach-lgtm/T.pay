import {createHash} from "node:crypto";
export type ContentTrust="untrusted"|"verified";
export interface QuarantinedContent { readonly contentId:string; readonly source:string; readonly trust:ContentTrust; readonly purpose:string; readonly expiresAt:number; readonly sha256:string; readonly text:string; }
export function quarantineContent(input:{contentId:string;source:string;text:string;purpose:string;expiresAt:number;trust?:ContentTrust},now=Date.now()):QuarantinedContent {
  if(!input.contentId.trim()||!input.source.trim()||!input.purpose.trim()) throw new Error("CONTENT_METADATA_REQUIRED");
  if(input.expiresAt<=now) throw new Error("CONTENT_ALREADY_EXPIRED");
  const text=input.text??"";
  return {...input,trust:input.trust??"untrusted",sha256:createHash("sha256").update(text,"utf8").digest("hex")};
}
export function assertContentUsableAsData(content:QuarantinedContent,now=Date.now()):string {
  if(now>=content.expiresAt) throw new Error("CONTENT_EXPIRED");
  if(content.trust!=="verified") return content.text;
  return content.text;
}
export function assertNotAuthority(content:QuarantinedContent):never { throw new Error("EXTERNAL_CONTENT_CANNOT_AUTHORIZE"); }