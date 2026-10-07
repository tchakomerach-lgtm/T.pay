export type EducationDataClass="D0"|"D1"|"D2"|"D3"|"D4";
export type EducationPurpose="ACADEMIC"|"SAFETY"|"ATTENDANCE"|"BILLING"|"TRANSPORT"|"COMMUNICATION"|"ADMINISTRATION"|"SUPPORT";
export type EducationActorRole="STUDENT"|"PARENT"|"TEACHER"|"ADMIN"|"DIRECTOR"|"FOUNDER"|"AUDITOR"|"SYSTEM";
export interface ChildDataFieldPolicy{field:string;classification:EducationDataClass;purposes:readonly EducationPurpose[];roles:readonly EducationActorRole[];exportable:boolean;aiAllowed:boolean;}
export interface ChildDataRequest{tenantId:string;organizationId:string;actorId:string;actorRole:EducationActorRole;purpose:EducationPurpose;requestedFields:readonly string[];targetStudentId?:string;export:boolean;aiProcessing:boolean;}
export interface ChildDataDecision{allowed:boolean;allowedFields:string[];deniedFields:string[];reasons:string[];policyVersion:string;}
const DEFAULT_POLICY:readonly ChildDataFieldPolicy[]=[
 {field:"student.id",classification:"D1",purposes:["ACADEMIC","ATTENDANCE","ADMINISTRATION","SAFETY"],roles:["STUDENT","PARENT","TEACHER","ADMIN","DIRECTOR","FOUNDER","AUDITOR","SYSTEM"],exportable:true,aiAllowed:true},
 {field:"student.name",classification:"D2",purposes:["ACADEMIC","ATTENDANCE","COMMUNICATION","ADMINISTRATION","SAFETY"],roles:["STUDENT","PARENT","TEACHER","ADMIN","DIRECTOR","FOUNDER","AUDITOR","SYSTEM"],exportable:true,aiAllowed:true},
 {field:"student.contact",classification:"D3",purposes:["COMMUNICATION","SAFETY","ADMINISTRATION"],roles:["PARENT","ADMIN","DIRECTOR","FOUNDER","SYSTEM"],exportable:false,aiAllowed:false},
 {field:"student.identity_document",classification:"D4",purposes:["ADMINISTRATION","SAFETY"],roles:["PARENT","ADMIN","DIRECTOR","FOUNDER","AUDITOR","SYSTEM"],exportable:false,aiAllowed:false},
 {field:"student.safety_event",classification:"D4",purposes:["SAFETY"],roles:["PARENT","TEACHER","ADMIN","DIRECTOR","FOUNDER","AUDITOR","SYSTEM"],exportable:false,aiAllowed:false},
 {field:"student.academic_record",classification:"D3",purposes:["ACADEMIC","ADMINISTRATION"],roles:["STUDENT","PARENT","TEACHER","ADMIN","DIRECTOR","FOUNDER","AUDITOR","SYSTEM"],exportable:true,aiAllowed:true}
];
export function decideChildDataAccess(request:ChildDataRequest,policies:readonly ChildDataFieldPolicy[]=DEFAULT_POLICY):ChildDataDecision{
 const allowed:string[]=[];const denied:string[]=[];const reasons:string[]=[];
 if(!request.tenantId||!request.organizationId||!request.actorId)throw new Error("CHILD_DATA_CONTEXT_REQUIRED");
 for(const field of request.requestedFields){
  const p=policies.find(x=>x.field===field);
  if(!p){denied.push(field);reasons.push(field+":FIELD_NOT_POLICY_REGISTERED");continue;}
  if(!p.roles.includes(request.actorRole)){denied.push(field);reasons.push(field+":ROLE_DENIED");continue;}
  if(!p.purposes.includes(request.purpose)){denied.push(field);reasons.push(field+":PURPOSE_DENIED");continue;}
  if(request.export&&!p.exportable){denied.push(field);reasons.push(field+":EXPORT_DENIED");continue;}
  if(request.aiProcessing&&!p.aiAllowed){denied.push(field);reasons.push(field+":AI_DENIED");continue;}
  allowed.push(field);
 }
 if(request.export&&request.actorRole==="STUDENT"&&request.purpose!=="ACADEMIC"){reasons.push("STUDENT_EXPORT_PURPOSE_RESTRICTED");}
 return {allowed:allowed.length>0&&denied.length===0,allowedFields:allowed,deniedFields:denied,reasons,policyVersion:"education-child-data-v1"};
}
