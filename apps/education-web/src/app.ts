import React,{useCallback,useEffect,useMemo,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";

type ApiEnvelope<T=unknown>={ok?:boolean;data?:T;error?:{code?:string;message?:string}|string};
type ActorRecord={actor_id:string;organization_id:string;kind:string;active:boolean;data?:Record<string,unknown>;version?:number};
type WorkItemRecord={work_item_id:string;status:string;priority:string;due_at:string|null;owner_actor_id:string|null;version:string|number};
type AttendanceRecord={student_id:string;class_id:string;status:string;occurred_at:string;recorded_by:string;version:string|number};
type ServiceRecord={request_id:string;service_code:string;status:string;priority:string;created_at:string;requester_id:string};

const h=React.createElement;
const navItems=[{id:"overview",label:"Vue générale",icon:"⌂"},{id:"attendance",label:"Présences",icon:"✓"},{id:"work",label:"Tâches",icon:"▤"},{id:"requests",label:"Demandes",icon:"↗"},{id:"activity",label:"Activité temps réel",icon:"◉"}];
const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);
async function responseData<T>(response:Response):Promise<T>{
  const body=await response.json() as ApiEnvelope<T>;
  if(!response.ok||body.ok===false){const code=typeof body.error==="string"?body.error:body.error?.code??body.error?.message??"API_REQUEST_FAILED";throw new Error(String(code));}
  return body.data as T;
}
const short=(value:string)=>value.length>14?value.slice(0,8)+"…"+value.slice(-4):value;
const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"}):"—";

export function SchoolApp({config,onDisconnect}:{config:SchoolWebConfig;onDisconnect:()=>void}){
 const client=useMemo(()=>createSchoolWebClient(config),[config.apiBaseUrl,config.session.accessToken,config.session.expiresAt]);
 const [active,setActive]=useState("overview");
 const [connection,setConnection]=useState<"CONNECTING"|"CONNECTED"|"OFFLINE">("CONNECTING");
 const [realtime,setRealtime]=useState("Connexion en cours");
 const [actor,setActor]=useState<ActorRecord|null>(null);
 const [workItems,setWorkItems]=useState<WorkItemRecord[]>([]);
 const [attendance,setAttendance]=useState<AttendanceRecord[]>([]);
 const [requests,setRequests]=useState<ServiceRecord[]>([]);
 const [events,setEvents]=useState<SchoolWebEvent[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const [attendanceForm,setAttendanceForm]=useState({studentId:"",classId:"",status:"PRESENT"});
 const [workPriority,setWorkPriority]=useState("NORMAL");
 const [serviceForm,setServiceForm]=useState({serviceCode:"",priority:"NORMAL"});

 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setConnection("CONNECTING");
  const health=await client.request("/health/ready");
  await responseData(health);
  const [actorResponse,workResponse,attendanceResponse,serviceResponse]=await Promise.all([
   client.request("/v1/education/actors/"+encodeURIComponent(config.actorId)),
   client.request("/v1/education/work-items"),
   client.request("/v1/education/attendance"),
   client.request("/v1/education/service-requests")
  ]);
  const [actorData,workData,attendanceData,serviceData]=await Promise.all([
   responseData<ActorRecord>(actorResponse),responseData<WorkItemRecord[]>(workResponse),
   responseData<AttendanceRecord[]>(attendanceResponse),responseData<ServiceRecord[]>(serviceResponse)
  ]);
  setActor(actorData);setWorkItems(Array.isArray(workData)?workData:[]);
  setAttendance(Array.isArray(attendanceData)?attendanceData:[]);
  setRequests(Array.isArray(serviceData)?serviceData:[]);
  setConnection("CONNECTED");
 },[client,config.actorId]);

 useEffect(()=>{let mounted=true;void refresh().catch(error=>{if(mounted){setConnection("OFFLINE");setNotice({kind:"error",text:messageOf(error)});}});return()=>{mounted=false;};},[refresh]);
 useEffect(()=>{
  if(connection!=="CONNECTED")return;
  const controller=new AbortController();setRealtime("Flux sécurisé connecté");
  consumeSchoolSse(config,event=>{setEvents(previous=>[event,...previous].slice(0,30));void refresh(true).catch(()=>{});},controller.signal)
   .catch(error=>{if(!controller.signal.aborted)setRealtime("Flux indisponible · "+messageOf(error));});
  return()=>controller.abort();
 },[config,connection,refresh]);

 const run=async(action:()=>Promise<unknown>,success:string)=>{
  setBusy(true);setNotice(null);
  try{await action();await refresh(true);setNotice({kind:"success",text:success});}
  catch(error){setNotice({kind:"error",text:messageOf(error)});}
  finally{setBusy(false);}
 };
 const submitAttendance=(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void run(async()=>{
   const response=await client.mutate("/v1/education/attendance",{studentId:attendanceForm.studentId.trim(),classId:attendanceForm.classId.trim(),status:attendanceForm.status,version:1});
   return responseData(response);
  },"Présence enregistrée dans PostgreSQL.");
 };
 const createWork=(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void run(async()=>{
   const response=await client.mutate("/v1/education/work-items",{id:crypto.randomUUID(),priority:workPriority,dueAt:null});
   return responseData(response);
  },"Tâche créée et persistée.");
 };
 const createRequest=(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void run(async()=>{
   const response=await client.mutate("/v1/education/service-requests",{id:crypto.randomUUID(),serviceCode:serviceForm.serviceCode.trim(),priority:serviceForm.priority});
   return responseData(response);
  },"Demande créée et persistée.");
 };
 const workAction=(id:string,action:"claim"|"resolve")=>void run(async()=>{
  const response=await client.mutate("/v1/education/work-items/"+encodeURIComponent(id)+"/"+action,{});
  return responseData(response);
 },action==="claim"?"Tâche prise en charge.":"Tâche clôturée.");

 const actorName=String(actor?.data?.display_name??actor?.data?.name??actor?.actor_id??config.actorId);
 const stat=(label:string,value:string,sub:string,icon:string)=>h("article",{className:"stat-card",key:label},h("div",{className:"stat-icon"},icon),h("span",{className:"stat-label"},label),h("strong",null,value),h("small",null,sub));
 const table=(headers:string[],rows:React.ReactNode[])=>h("div",{className:"table-wrap"},h("table",null,h("thead",null,h("tr",null,headers.map(item=>h("th",{key:item},item)))),h("tbody",null,rows.length?rows:h("tr",null,h("td",{colSpan:headers.length,className:"empty-cell"},"Aucune donnée persistée pour le moment.")))));
 const panel=(title:string,subtitle:string,children:React.ReactNode)=>h("section",{className:"surface-panel"},h("div",{className:"panel-heading"},h("div",null,h("h2",null,title),h("p",null,subtitle))),children);
 const field=(label:string,name:string,placeholder:string,value:string,onChange:(v:string)=>void,required=true)=>h("label",{className:"form-field",key:name},h("span",null,label),h("input",{name,placeholder,value,required,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>onChange(e.target.value)}));
 const selectField=(label:string,value:string,options:string[],onChange:(v:string)=>void)=>h("label",{className:"form-field"},h("span",null,label),h("select",{value,onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>onChange(e.target.value)},options.map(option=>h("option",{key:option,value:option},option))));
 const pageTitle=navItems.find(item=>item.id===active)?.label??"T.Pay";

 let page:React.ReactNode;
 if(active==="overview"){
  page=h(React.Fragment,null,
   h("div",{className:"welcome-card"},h("div",null,h("span",{className:"eyebrow"},"SCHOOL OS · ESPACE OPÉRATIONNEL"),h("h1",null,"Votre établissement, en activité."),h("p",null,"Les actions réalisées ici sont envoyées à l'API et enregistrées dans PostgreSQL.")),h("div",{className:"welcome-orb"},h("span",null,"T."))),
   h("div",{className:"stat-grid"},stat("Tâches ouvertes",String(workItems.filter(x=>x.status==="OPEN").length),"État lu depuis le serveur","▤"),stat("Présences",String(attendance.length),"Enregistrements persistés","✓"),stat("Demandes",String(requests.length),"Demandes de service","↗"),stat("Événements reçus",String(events.length),"Flux temps réel","◉")),
   h("div",{className:"two-panels"},panel("Dernières tâches","Données de l'organisation active",table(["Référence","Priorité","État","Action"],workItems.slice(0,5).map(item=>h("tr",{key:item.work_item_id},h("td",null,short(item.work_item_id)),h("td",null,item.priority),h("td",null,h("span",{className:"state-pill"},item.status)),h("td",null,item.status==="OPEN"?h("button",{className:"table-action",disabled:busy,onClick:()=>workAction(item.work_item_id,"claim")},"Prendre"):item.status==="IN_PROGRESS"&&item.owner_actor_id===config.actorId?h("button",{className:"table-action",disabled:busy,onClick:()=>workAction(item.work_item_id,"resolve")},"Clôturer"):"—"))))),panel("Dernières présences","Historique renvoyé par le serveur",table(["Élève","Classe","Statut","Date"],attendance.slice(0,5).map(item=>h("tr",{key:item.student_id+item.class_id},h("td",null,short(item.student_id)),h("td",null,item.class_id),h("td",null,h("span",{className:"state-pill"},item.status)),h("td",null,dateLabel(item.occurred_at)))))))
  );
 }else if(active==="attendance"){
  page=h("div",{className:"content-grid"},panel("Enregistrer une présence","L'identité de l'agent et l'horodatage sont imposés par le serveur.",h("form",{className:"action-form",onSubmit:submitAttendance},field("Identifiant élève","studentId","ID élève",attendanceForm.studentId,v=>setAttendanceForm(p=>({...p,studentId:v}))),field("Identifiant classe","classId","ID classe",attendanceForm.classId,v=>setAttendanceForm(p=>({...p,classId:v}))),selectField("Statut",attendanceForm.status,["PRESENT","ABSENT","LATE","EXCUSED","UNKNOWN"],v=>setAttendanceForm(p=>({...p,status:v}))),h("button",{className:"primary-button",type:"submit",disabled:busy},"Enregistrer dans PostgreSQL"))),panel("Registre des présences","Les données affichées viennent de l'API.",table(["Élève","Classe","Statut","Enregistré par","Date"],attendance.map(item=>h("tr",{key:item.student_id+item.class_id},h("td",null,short(item.student_id)),h("td",null,item.class_id),h("td",null,item.status),h("td",null,short(item.recorded_by)),h("td",null,dateLabel(item.occurred_at)))))));
 }else if(active==="work"){
  page=h("div",{className:"content-grid"},panel("Créer une tâche","Création idempotente, persistée dans l'espace organisationnel.",h("form",{className:"action-form",onSubmit:createWork},selectField("Priorité",workPriority,["LOW","NORMAL","HIGH","CRITICAL"],setWorkPriority),h("button",{className:"primary-button",type:"submit",disabled:busy},"＋ Créer une tâche")),panel("Gestion des tâches","Prise en charge et clôture contrôlées côté serveur.",table(["Référence","Priorité","État","Responsable","Actions"],workItems.map(item=>h("tr",{key:item.work_item_id},h("td",null,short(item.work_item_id)),h("td",null,item.priority),h("td",null,h("span",{className:"state-pill"},item.status)),h("td",null,item.owner_actor_id?short(item.owner_actor_id):"Non attribuée"),h("td",null,item.status==="OPEN"||item.status==="WAITING"?h("button",{className:"table-action",disabled:busy,onClick:()=>workAction(item.work_item_id,"claim")},"Prendre"):item.status==="IN_PROGRESS"&&item.owner_actor_id===config.actorId?h("button",{className:"table-action",disabled:busy,onClick:()=>workAction(item.work_item_id,"resolve")},"Clôturer"):"—")))))));
 }else if(active==="requests"){
  const requestRows=requests.map(item=>h("tr",{key:item.request_id},h("td",null,short(item.request_id)),h("td",null,item.service_code),h("td",null,item.priority),h("td",null,h("span",{className:"state-pill"},item.status)),h("td",null,dateLabel(item.created_at))));
  const requestForm=h("form",{className:"action-form",onSubmit:createRequest},
   field("Code de service","serviceCode","Ex. SCOLARITE / DOCUMENT",serviceForm.serviceCode,v=>setServiceForm(p=>({...p,serviceCode:v}))),
   selectField("Priorité",serviceForm.priority,["LOW","NORMAL","HIGH","CRITICAL"],v=>setServiceForm(p=>({...p,priority:v}))),
   h("button",{className:"primary-button",type:"submit",disabled:busy},"Soumettre la demande")
  );
  page=h("div",{className:"content-grid"},
   panel("Soumettre une demande","La demande est créée au nom de l'acteur authentifié.",requestForm),
   panel("Suivi des demandes","État réel conservé dans la base de données.",table(["Référence","Service","Priorité","État","Créée le"],requestRows))
  );
 }else{
  page=panel("Flux temps réel","Événements serveur reçus via Server-Sent Events.",h("div",{className:"event-list"},events.length?events.map(event=>h("article",{className:"event-item",key:event.id},h("span",{className:"event-dot"}),h("div",null,h("strong",null,event.event),h("small",null,event.id)),h("time",null,"Live"))):h("p",{className:"empty-cell"},"Aucun événement reçu. Les événements apparaissent après une action enregistrée.")));
 }

 return h("main",{className:"app-shell"},
  h("aside",{className:"sidebar"},
   h("div",{className:"brand-lockup"},h("div",{className:"brand-mark"},"T."),h("div",null,h("strong",null,"T.Pay"),h("small",null,"SCHOOL OS"))),
   h("div",{className:"workspace-card"},h("span",{className:"workspace-icon"},"EL"),h("div",null,h("strong",null,"Organisation active"),h("small",null,short(actor?.organization_id??"Chargement…")))),
   h("nav",{className:"side-nav"},navItems.map(item=>h("button",{key:item.id,className:"nav-link "+(active===item.id?"active":""),onClick:()=>setActive(item.id)},h("span",{className:"nav-symbol"},item.icon),item.label))),
   h("div",{className:"sidebar-bottom"},h("div",{className:"profile-block"},h("div",{className:"avatar"},actorName.slice(0,1).toUpperCase()),h("div",null,h("strong",null,actorName),h("small",null,actor?.kind??"Acteur authentifié"))),h("button",{className:"disconnect-button",onClick:onDisconnect},"Déconnecter"))
  ),
  h("section",{className:"main-area"},
   h("header",{className:"topbar"},h("div",null,h("span",{className:"eyebrow"},"T.PAY / SCHOOL OS"),h("h2",null,pageTitle)),h("div",{className:"topbar-actions"},h("span",{className:"connection-pill "+(connection==="CONNECTED"?"online":connection==="OFFLINE"?"offline":"pending")},h("i"),connection==="CONNECTED"?"API connectée":connection==="OFFLINE"?"Hors ligne":"Connexion…"),h("button",{className:"refresh-button",onClick:()=>void refresh().catch(error=>setNotice({kind:"error",text:messageOf(error)}))},"Actualiser"))),
   notice?h("div",{className:"notice "+notice.kind},notice.text):null,
   h("div",{className:"page-content"},page),
   h("footer",{className:"app-footer"},h("span",null,"T.Pay · Environnement connecté"),h("span",null,realtime))
  )
 );
}
