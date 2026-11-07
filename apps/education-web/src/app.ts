import React,{useEffect,useMemo,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";
type AttendanceStatus="PRESENT"|"ABSENT"|"LATE"|"EXCUSED";
type Student={id:string;name:string;status:AttendanceStatus};
const demoStudents:Student[]=[
 {id:"STU-001",name:"Ama K.",status:"PRESENT"},{id:"STU-002",name:"Koffi A.",status:"LATE"},
 {id:"STU-003",name:"Esi D.",status:"PRESENT"},{id:"STU-004",name:"Kodjo M.",status:"ABSENT"},
 {id:"STU-005",name:"Akouvi S.",status:"EXCUSED"},{id:"STU-006",name:"Yaw T.",status:"PRESENT"}
];
const statusLabel:Record<AttendanceStatus,string>={PRESENT:"Présent",ABSENT:"Absent",LATE:"En retard",EXCUSED:"Excusé"};
export function SchoolApp({config}:{config:SchoolWebConfig}){
 const client=useMemo(()=>createSchoolWebClient(config),[config]);
 const [events,setEvents]=useState<SchoolWebEvent[]>([]);
 const [connection,setConnection]=useState(config.demo?"DEMO":"CONNECTING");
 const [students,setStudents]=useState(demoStudents);
 const [classId,setClassId]=useState(config.demo?"6E-A":"");
 const [studentId,setStudentId]=useState("");
 const [recordStatus,setRecordStatus]=useState<AttendanceStatus>("PRESENT");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{if(config.demo)return;const controller=new AbortController();consumeSchoolSse(config,e=>setEvents(v=>[e,...v].slice(0,20)),controller.signal).then(()=>setConnection("DISCONNECTED")).catch(()=>setConnection("OFFLINE"));return()=>controller.abort();},[config]);
 const counts=useMemo(()=>({present:students.filter(s=>s.status==="PRESENT").length,absent:students.filter(s=>s.status==="ABSENT").length,late:students.filter(s=>s.status==="LATE").length,excused:students.filter(s=>s.status==="EXCUSED").length}),[students]);
 const updateDemo=(id:string,status:AttendanceStatus)=>setStudents(v=>v.map(s=>s.id===id?{...s,status}:s));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!classId.trim()||!studentId.trim())return;setBusy(true);setNotice("");
  try{
   if(config.demo){setStudents(v=>{const found=v.some(s=>s.id===studentId);return found?v.map(s=>s.id===studentId?{...s,status:recordStatus}:s):[...v,{id:studentId,name:studentId,status:recordStatus}];});setNotice("Présence enregistrée dans la démonstration locale uniquement.");}
   else{const response=await client.mutate("/v1/education/attendance",{studentId,classId,organizationId:"",status:recordStatus,occurredAt:new Date().toISOString(),source:"TEACHER",version:1});if(!response.ok)throw new Error("HTTP_"+response.status);setNotice("Présence transmise à l’API. Vérifie le retour serveur avant clôture.");}
   setStudentId("");
  }catch(error){setNotice("Échec de l’enregistrement : "+String(error));}finally{setBusy(false);}
 };
 return React.createElement("main",{className:"school-shell"},
  React.createElement("header",{className:"school-header"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"T.PAY • SCHOOL OS"),React.createElement("h1",null,"Pilotage scolaire"),React.createElement("p",null,"Registre des présences et suivi opérationnel de l’établissement.")),React.createElement("span",{className:"status"},connection)),
  React.createElement("section",{className:"role-grid"},[["Présents",counts.present],["Absents",counts.absent],["En retard",counts.late],["Excusés",counts.excused]].map(([label,value])=>React.createElement("article",{key:String(label),className:"metric-card"},React.createElement("span",null,label),React.createElement("strong",null,value)))),
  React.createElement("section",{className:"attendance-layout"},
   React.createElement("article",{className:"live-panel attendance-panel"},React.createElement("div",{className:"section-heading"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"SUIVI QUOTIDIEN"),React.createElement("h2",null,"Registre des présences")),React.createElement("span",{className:"count-pill"},students.length+" élèves")),
    React.createElement("div",{className:"attendance-list"},students.map(s=>React.createElement("div",{key:s.id,className:"student-row"},React.createElement("div",null,React.createElement("strong",null,s.name),React.createElement("small",null,s.id)),React.createElement("div",{className:"status-actions"},(["PRESENT","LATE","ABSENT","EXCUSED"] as AttendanceStatus[]).map(status=>React.createElement("button",{key:status,type:"button",className:"status-button "+(s.status===status?"selected "+status.toLowerCase():""),onClick:()=>config.demo?updateDemo(s.id,status):setNotice("Pour modifier un relevé réel, utilise le formulaire de transmission ci-contre.")},statusLabel[status]))))))),
   React.createElement("article",{className:"live-panel record-panel"},React.createElement("p",{className:"eyebrow"},"NOUVELLE SAISIE"),React.createElement("h2",null,"Enregistrer une présence"),React.createElement("form",{className:"record-form",onSubmit:submit},React.createElement("label",null,"Classe",React.createElement("input",{value:classId,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setClassId(e.target.value),placeholder:"Ex. 6E-A",required:true})),React.createElement("label",null,"Identifiant élève",React.createElement("input",{value:studentId,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setStudentId(e.target.value),placeholder:"Identifiant de l'élève",required:true})),React.createElement("label",null,"Statut",React.createElement("select",{value:recordStatus,onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>setRecordStatus(e.target.value as AttendanceStatus)},(["PRESENT","ABSENT","LATE","EXCUSED"] as AttendanceStatus[]).map(s=>React.createElement("option",{key:s,value:s},statusLabel[s])))),React.createElement("button",{type:"submit",disabled:busy},busy?"Enregistrement…":"Enregistrer")) ,notice?React.createElement("p",{className:"notice"},notice):null,React.createElement("p",{className:"notice"},config.demo?"Données fictives, conservées uniquement dans la mémoire de cette page.":"Transmission HTTPS avec clé d’idempotence et session active."))),
  React.createElement("section",{className:"live-panel"},React.createElement("h2",null,"Flux opérationnel"),events.length===0?React.createElement("p",null,config.demo?"Mode démo actif : les saisies ne sont pas envoyées au serveur.":"En attente d’événements autorisés…"):events.map(e=>React.createElement("div",{key:e.id,className:"event-row"},React.createElement("strong",null,e.event),React.createElement("span",null,e.id))))
 );
}
