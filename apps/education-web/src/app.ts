import React,{useCallback,useEffect,useMemo,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolClass,type SchoolEnrollment,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";

export function SchoolApp({config}:{config:SchoolWebConfig}){
 const client=useMemo(()=>createSchoolWebClient(config),[config.apiBaseUrl,config.session.accessToken,config.session.expiresAt]);
 const [classes,setClasses]=useState<SchoolClass[]>([]);
 const [enrollments,setEnrollments]=useState<SchoolEnrollment[]>([]);
 const [events,setEvents]=useState<SchoolWebEvent[]>([]);
 const [status,setStatus]=useState(config.demo?"DEMO":"CONNECTING");
 const [academicYear,setAcademicYear]=useState("2026-2027");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const refresh=useCallback(async()=>{
  if(config.demo)return;
  setStatus("SYNCHRONISATION");
  try{
   const [classRows,enrollmentRows]=await Promise.all([client.listClasses(academicYear),client.listEnrollments(undefined,academicYear)]);
   setClasses(classRows);setEnrollments(enrollmentRows);setStatus("À JOUR");setError("");
  }catch(reason){setStatus("INDISPONIBLE");setError(reason instanceof Error?reason.message:"SCHOOL_API_ERROR");}
 },[client,config.demo,academicYear]);

 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(config.demo)return;
  const controller=new AbortController();
  consumeSchoolSse(config,event=>{
   setEvents(current=>[event,...current].slice(0,20));
   void refresh();
  },controller.signal).catch(()=>{if(!controller.signal.aborted)setStatus("HORS LIGNE");});
  return()=>controller.abort();
 },[config,refresh]);

 const createClass=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=event.currentTarget;const values=new FormData(form);
  setBusy(true);setError("");setNotice("");
  try{
   await client.createClass({
    academicYear:String(values.get("academicYear")??academicYear),
    code:String(values.get("code")??"").trim(),
    name:String(values.get("name")??"").trim(),
    level:String(values.get("level")??"").trim(),
    capacity:Number(values.get("capacity"))
   });
   setNotice("Classe créée et enregistrée par le serveur.");form.reset();await refresh();
  }catch(reason){setError(reason instanceof Error?reason.message:"EDUCATION_CLASS_CREATE_FAILED");}
  finally{setBusy(false);}
 };

 const createEnrollment=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=event.currentTarget;const values=new FormData(form);
  setBusy(true);setError("");setNotice("");
  try{
   await client.createEnrollment({
    studentId:String(values.get("studentId")??"").trim(),
    classId:String(values.get("classId")??""),
    academicYear:String(values.get("academicYear")??academicYear)
   });
   setNotice("Inscription créée. La capacité et l'unicité sont contrôlées par PostgreSQL.");form.reset();await refresh();
  }catch(reason){setError(reason instanceof Error?reason.message:"EDUCATION_ENROLLMENT_CREATE_FAILED");}
  finally{setBusy(false);}
 };


 const withdrawEnrollment=async(row:SchoolEnrollment)=>{
  if(config.demo||row.status!=="ACTIVE"||busy)return;
  if(!window.confirm("Confirmer le retrait de l'inscription de "+row.student_id+" ? La place sera libérée dans la classe."))return;
  setBusy(true);setError("");setNotice("");
  try{
   await client.transitionEnrollment(row.enrollment_id,{status:"WITHDRAWN",expectedVersion:row.version});
   setNotice("Inscription retirée. Le compteur de capacité a été recalculé par PostgreSQL.");
   await refresh();
  }catch(reason){setError(reason instanceof Error?reason.message:"EDUCATION_ENROLLMENT_WITHDRAW_FAILED");}
  finally{setBusy(false);}
 };
 const field=(label:string,name:string,props:Record<string,unknown>={})=>React.createElement("label",{className:"form-field",key:name},label,React.createElement("input",{name,required:true,...props}));
 const demoMessage=config.demo?React.createElement("p",{className:"notice",role:"status"},"Mode démonstration : aucune donnée réelle n'est chargée et aucune écriture n'est possible."):null;
 const classRows=classes.map(row=>React.createElement("tr",{key:row.class_id},
  React.createElement("td",null,row.code),
  React.createElement("td",null,row.name),
  React.createElement("td",null,row.level),
  React.createElement("td",null,String(row.enrolled_count)+" / "+String(row.capacity)),
  React.createElement("td",null,row.status==="ACTIVE"?"Active":"Archivée")
 ));
 const enrollmentRows=enrollments.map(row=>React.createElement("tr",{key:row.enrollment_id},
  React.createElement("td",null,row.student_id),
  React.createElement("td",null,row.class_code??row.class_id),
  React.createElement("td",null,row.class_name??"—"),
  React.createElement("td",null,row.status==="ACTIVE"?"Active":row.status),
  React.createElement("td",null,new Date(row.enrolled_at).toLocaleDateString("fr-FR")),
  React.createElement("td",null,row.status==="ACTIVE"?React.createElement("button",{type:"button",className:"secondary row-action",disabled:config.demo||busy,"aria-label":"Retirer l'inscription de "+row.student_id,onClick:()=>void withdrawEnrollment(row)},"Retirer"):React.createElement("span",{className:"muted"},"Aucune action"))
 ));

 return React.createElement("main",{className:"school-shell"},
  React.createElement("header",{className:"school-header"},
   React.createElement("div",null,
    React.createElement("p",{className:"eyebrow"},"T.PAY • SCHOOL OS"),
    React.createElement("h1",null,"Gestion scolaire"),
    React.createElement("p",null,"Classes, inscriptions et capacité — les données proviennent de l'API authentifiée de l'organisation.")
   ),
   React.createElement("div",{className:"header-actions"},
    React.createElement("span",{className:"status","aria-live":"polite"},status),
    React.createElement("button",{type:"button",className:"secondary",onClick:()=>void refresh(),disabled:config.demo||busy},"Actualiser")
   )
  ),
  demoMessage,
  error?React.createElement("p",{className:"alert alert-error",role:"alert"},`Erreur : ${error}`):null,
  notice?React.createElement("p",{className:"alert alert-success",role:"status"},notice):null,
  React.createElement("section",{className:"filter-panel"},
   React.createElement("label",{className:"form-field"}, "Année scolaire",
    React.createElement("input",{value:academicYear,onChange:(event:React.ChangeEvent<HTMLInputElement>)=>setAcademicYear(event.target.value),pattern:"[0-9]{4}-[0-9]{4}",inputMode:"numeric","aria-label":"Année scolaire au format AAAA-AAAA"})
   ),
   React.createElement("p",{className:"muted"},"Format : AAAA-AAAA. Les années consécutives sont vérifiées par l'API et PostgreSQL.")
  ),
  React.createElement("section",{className:"operation-grid"},
   React.createElement("article",{className:"panel"},
    React.createElement("div",{className:"panel-heading"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"ADMINISTRATION"),React.createElement("h2",null,"Créer une classe"))),
    React.createElement("form",{className:"data-form",onSubmit:createClass},
     field("Code de classe","code",{maxLength:32,pattern:"[A-Za-z0-9._-]{1,32}",placeholder:"6E-A"}),
     field("Nom de la classe","name",{maxLength:120,placeholder:"Sixième A"}),
     field("Niveau","level",{maxLength:80,placeholder:"Collège"}),
     field("Capacité maximale","capacity",{type:"number",min:1,max:3000,step:1,defaultValue:45}),
     React.createElement("button",{type:"submit",disabled:config.demo||busy},"Créer la classe")
    ),
    React.createElement("p",{className:"muted"},"Droit requis : org.manage. La décision finale est prise côté serveur.")
   ),
   React.createElement("article",{className:"panel"},
    React.createElement("div",{className:"panel-heading"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"SCOLARITÉ"),React.createElement("h2",null,"Inscrire un élève"))),
    React.createElement("form",{className:"data-form",onSubmit:createEnrollment},
     field("Identifiant de l'élève","studentId",{maxLength:128,placeholder:"Identifiant élève"}),
     React.createElement("label",{className:"form-field"},"Classe",
      React.createElement("select",{name:"classId",required:true,defaultValue:"",disabled:classes.length===0||config.demo},
       React.createElement("option",{value:"",disabled:true},"Sélectionner une classe"),
       classes.filter(row=>row.status==="ACTIVE").map(row=>React.createElement("option",{key:row.class_id,value:row.class_id},row.code+" — "+row.name))
      )
     ),
     React.createElement("button",{type:"submit",disabled:config.demo||busy||classes.length===0},"Enregistrer l'inscription")
    ),
    React.createElement("p",{className:"muted"},"L'inscription ne crée aucun frais ni paiement. Toute opération financière reste dans Financial Core.")
   )
  ),
  React.createElement("section",{className:"panel data-panel"},
   React.createElement("div",{className:"panel-heading"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"RÉFÉRENTIEL"),React.createElement("h2",null,"Classes"),React.createElement("p",{className:"muted"},classes.length+" classe(s) pour "+academicYear))),
   classes.length?React.createElement("div",{className:"table-wrap"},React.createElement("table",null,
    React.createElement("thead",null,React.createElement("tr",null,...["Code","Classe","Niveau","Inscrits / capacité","État"].map(x=>React.createElement("th",{key:x,scope:"col"},x)))),
    React.createElement("tbody",null,...classRows)
   )):React.createElement("p",{className:"empty-state"},"Aucune classe retournée pour cette année scolaire.")
  ),
  React.createElement("section",{className:"panel data-panel"},
   React.createElement("div",{className:"panel-heading"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"DOSSIERS ÉLÈVES"),React.createElement("h2",null,"Inscriptions"),React.createElement("p",{className:"muted"},enrollments.length+" inscription(s) pour "+academicYear))),
   enrollments.length?React.createElement("div",{className:"table-wrap"},React.createElement("table",null,
    React.createElement("thead",null,React.createElement("tr",null,...["Élève","Code","Classe","État","Date","Action"].map(x=>React.createElement("th",{key:x,scope:"col"},x)))),
    React.createElement("tbody",null,...enrollmentRows)
   )):React.createElement("p",{className:"empty-state"},"Aucune inscription retournée pour cette année scolaire.")
  ),
  React.createElement("section",{className:"panel live-panel"},
   React.createElement("h2",null,"Activité en temps réel"),
   events.length===0?React.createElement("p",{className:"muted"},"En attente d'événements autorisés…"):events.map(item=>React.createElement("div",{key:item.id,className:"event-row"},React.createElement("strong",null,item.event),React.createElement("span",null,item.id)))
  )
 );
}
