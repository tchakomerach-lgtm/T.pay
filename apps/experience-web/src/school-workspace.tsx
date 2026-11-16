import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { TPayApi } from "./api.js";

type SchoolClass = { class_id:string; name:string; grade_level:string; academic_year:string; capacity:number; status:"ACTIVE"|"ARCHIVED"; enrolled_count:number; version:number; };
type SchoolStudent = { student_id:string; display_name:string; lifecycle:string; enrollment_id:string|null; class_id:string|null; academic_year:string|null; enrollment_state:string|null; };
type ApiList<T> = { data?: { items?: T[] } };
async function readItems<T>(response:Response):Promise<T[]> {
 if(!response.ok) throw new Error("SCHOOL_API_HTTP_"+response.status);
 const body=await response.json() as ApiList<T>;
 return Array.isArray(body.data?.items)?body.data.items:[];
}
export function SchoolWorkspace({api}:{api:TPayApi|null}) {
 const [classes,setClasses]=useState<SchoolClass[]>([]);
 const [students,setStudents]=useState<SchoolStudent[]>([]);
 const [selectedClass,setSelectedClass]=useState("all");
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [updatedAt,setUpdatedAt]=useState<string|null>(null);
 const [className,setClassName]=useState("");
 const [gradeLevel,setGradeLevel]=useState("");
 const [academicYear,setAcademicYear]=useState("2026-2027");
 const [classCapacity,setClassCapacity]=useState("45");
 const [newStudentId,setNewStudentId]=useState("");
 const [newStudentClass,setNewStudentClass]=useState("");
 const [transferTarget,setTransferTarget]=useState("");
 const [withdrawReason,setWithdrawReason]=useState("Retrait demandé par l'administration");
 const load=useCallback(async()=>{
  if(!api)return;
  setLoading(true);setError(null);
  try{
   const classResponse=await api.request("/v1/education/classes");
   const query=new URLSearchParams({limit:"100"});
   if(selectedClass!=="all")query.set("classId",selectedClass);
   const studentResponse=await api.request("/v1/education/students?"+query.toString());
   const [nextClasses,nextStudents]=await Promise.all([readItems<SchoolClass>(classResponse),readItems<SchoolStudent>(studentResponse)]);
   setClasses(nextClasses);setStudents(nextStudents);setUpdatedAt(new Date().toISOString());
  }catch(cause){setError(cause instanceof Error?cause.message:"SCHOOL_DATA_UNAVAILABLE");}
  finally{setLoading(false);}
 },[api,selectedClass]);
 useEffect(()=>{void load();},[load]);
 const visibleStudents=useMemo(()=>{
  const needle=search.trim().toLocaleLowerCase("fr");
  if(!needle)return students;
  return students.filter(s=>s.display_name.toLocaleLowerCase("fr").includes(needle)||s.student_id.toLocaleLowerCase("fr").includes(needle));
 },[students,search]);
 const sendCommand=useCallback(async(path:string,method:"POST"|"PATCH",payload:Record<string,unknown>)=>{
  if(!api)throw new Error("SCHOOL_API_SESSION_REQUIRED");
  const response=await api.request(path,{method,headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify(payload)});
  if(!response.ok){let code="SCHOOL_COMMAND_HTTP_"+response.status;try{const body=await response.json() as {error?:{code?:string};message?:string};code=body.error?.code??body.message??code;}catch{}throw new Error(code);}
  return response.json();
 },[api]);
 const perform=useCallback(async(path:string,method:"POST"|"PATCH",payload:Record<string,unknown>)=>{
  setError(null);
  try{await sendCommand(path,method,payload);await load();}
  catch(cause){setError(cause instanceof Error?cause.message:"SCHOOL_COMMAND_FAILED");}
 },[sendCommand,load]);
 const submitClass=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void perform("/v1/education/classes","POST",{name:className,gradeLevel,academicYear,capacity:Number(classCapacity)}).then(()=>{setClassName("");setGradeLevel("");});
 };
 const submitEnrollment=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void perform("/v1/education/enrollments","POST",{studentId:newStudentId,classId:newStudentClass,academicYear}).then(()=>setNewStudentId(""));
 };
 const transfer=(student:SchoolStudent)=>{if(!student.enrollment_id||!transferTarget)return;void perform("/v1/education/enrollments/"+encodeURIComponent(student.enrollment_id)+"/transfer","POST",{targetClassId:transferTarget});};
 const withdraw=(student:SchoolStudent)=>{if(!student.enrollment_id)return;void perform("/v1/education/enrollments/"+encodeURIComponent(student.enrollment_id)+"/withdraw","POST",{reason:withdrawReason});};
 const totalEnrolled=classes.reduce((sum,item)=>sum+Number(item.enrolled_count||0),0);
 const activeClasses=classes.filter(item=>item.status==="ACTIVE").length;
 return <div className="content school-workspace">
  <section className="school-hero3d"><div><small>SCHOOL OS · ESPACE SCOLAIRE</small><h1>La gestion de l'établissement,<br/><em>en un seul espace.</em></h1><p>Classes, inscriptions et suivi des élèves sous contrôle de l'organisation.</p></div><div className="school-orb3d" aria-hidden="true"><span>É</span></div></section>
  <div className="school-toolbar"><div><small>DONNÉES DE L'ÉTABLISSEMENT</small><h2>Vue scolaire</h2></div><div className="school-toolbar-actions">{updatedAt&&<span className="school-freshness">Actualisé à {new Date(updatedAt).toLocaleTimeString("fr-FR")}</span>}<button type="button" onClick={()=>void load()} disabled={!api||loading}>↻ Actualiser</button></div></div>
  {!api&&<div className="school-alert" role="status"><b>Connexion sécurisée requise</b><p>Aucune session API active. Les listes réelles ne sont pas chargées et aucune donnée de démonstration n'est affichée.</p></div>}
  {error&&<div className="school-alert error" role="alert"><b>Chargement impossible</b><p>{error}</p><button type="button" onClick={()=>void load()}>Réessayer</button></div>}
  {api&&<section className="school-command-grid" aria-label="Commandes scolaires">
   <form className="school-command-card" onSubmit={submitClass}>
    <div><small>STRUCTURE</small><h3>Créer une classe</h3></div>
    <label>Nom de la classe<input required maxLength={120} value={className} onChange={e=>setClassName(e.target.value)} placeholder="Ex. 6e A"/></label>
    <div className="school-command-row"><label>Niveau<input required maxLength={80} value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)} placeholder="6e"/></label><label>Capacité<input required type="number" min="1" max="5000" value={classCapacity} onChange={e=>setClassCapacity(e.target.value)}/></label></div>
    <label>Année scolaire<input required pattern="\\d{4}[-/]\\d{4}" value={academicYear} onChange={e=>setAcademicYear(e.target.value)} /></label>
    <button type="submit" disabled={loading}>Créer la classe</button>
   </form>
   <form className="school-command-card" onSubmit={submitEnrollment}>
    <div><small>INSCRIPTION</small><h3>Inscrire un élève</h3></div>
    <label>Identifiant élève<input required value={newStudentId} onChange={e=>setNewStudentId(e.target.value)} placeholder="Identifiant existant"/></label>
    <label>Classe<select required value={newStudentClass} onChange={e=>setNewStudentClass(e.target.value)}><option value="">Sélectionner une classe</option>{classes.filter(item=>item.status==="ACTIVE").map(item=><option key={item.class_id} value={item.class_id}>{item.name} · {item.academic_year}</option>)}</select></label>
    <label>Année scolaire<input required pattern="\\d{4}[-/]\\d{4}" value={academicYear} onChange={e=>setAcademicYear(e.target.value)}/></label>
    <button type="submit" disabled={loading||classes.length===0}>Valider l'inscription</button>
   </form>
  </section>}
  <div className="school-metrics" aria-busy={loading}>
   <article className="school-metric3d"><span>Classes actives</span><strong>{loading?"…":api?activeClasses:"—"}</strong><small>Année scolaire filtrable</small></article>
   <article className="school-metric3d"><span>Inscriptions actives</span><strong>{loading?"…":api?totalEnrolled:"—"}</strong><small>État confirmé par l'API</small></article>
   <article className="school-metric3d"><span>Élèves affichés</span><strong>{loading?"…":api?visibleStudents.length:"—"}</strong><small>Maximum 100 par requête</small></article>
  </div>
  <section className="school-section3d"><div className="school-section-heading"><div><small>STRUCTURE PÉDAGOGIQUE</small><h2>Classes et niveaux</h2></div><span>{classes.length} résultat(s)</span></div>
   {loading&&classes.length===0?<div className="school-empty">Chargement des classes…</div>:classes.length===0?<div className="school-empty">Aucune classe enregistrée pour cette organisation.</div>:<div className="school-class-grid">{classes.map(item=><button type="button" key={item.class_id} className={"school-class-card"+(selectedClass===item.class_id?" selected":"")} onClick={()=>setSelectedClass(selectedClass===item.class_id?"all":item.class_id)}><span className="school-class-icon">▦</span><b>{item.name}</b><small>{item.grade_level} · {item.academic_year}</small><span className="school-capacity"><strong>{item.enrolled_count}</strong> / {item.capacity} inscrits</span><i>{selectedClass===item.class_id?"Filtre actif":"Voir les élèves →"}</i></button>)}</div>}
  </section>
  <section className="school-section3d"><div className="school-section-heading"><div><small>REGISTRE SCOLAIRE</small><h2>Élèves et inscriptions</h2></div><span>Consultation sécurisée</span></div>
   <div className="school-student-controls"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Rechercher un élève…" aria-label="Rechercher un élève"/><input value={withdrawReason} onChange={event=>setWithdrawReason(event.target.value)} aria-label="Motif du retrait" placeholder="Motif du retrait"/><select value={selectedClass} onChange={event=>setSelectedClass(event.target.value)} aria-label="Filtrer par classe"><option value="all">Toutes les classes</option>{classes.map(item=><option key={item.class_id} value={item.class_id}>{item.name}</option>)}</select></div>
   <div className="school-table-wrap"><table className="school-table"><thead><tr><th>Élève</th><th>Identifiant</th><th>Classe</th><th>Année scolaire</th><th>Cycle</th><th>Actions</th></tr></thead><tbody>
    {visibleStudents.map(student=><tr key={student.student_id}><td><b>{student.display_name}</b></td><td>{student.student_id}</td><td>{classes.find(item=>item.class_id===student.class_id)?.name??student.class_id??"Non affecté"}</td><td>{student.academic_year??"—"}</td><td><span className="school-lifecycle">{student.lifecycle}</span></td><td className="school-actions">{student.enrollment_id&&<><select aria-label={"Classe cible pour "+student.display_name} value={transferTarget} onChange={e=>setTransferTarget(e.target.value)}><option value="">Transférer vers…</option>{classes.filter(item=>item.status==="ACTIVE"&&item.class_id!==student.class_id).map(item=><option key={item.class_id} value={item.class_id}>{item.name}</option>)}</select><button type="button" disabled={!transferTarget} onClick={()=>transfer(student)}>Transférer</button><button type="button" className="school-danger-action" onClick={()=>withdraw(student)}>Retirer</button></>}</td></tr>)}
    {!loading&&visibleStudents.length===0&&<tr><td colSpan={6} className="school-no-results">Aucun élève correspondant aux critères.</td></tr>}
   </tbody></table></div>
   <p className="school-footnote">Les créations, inscriptions, transferts et retraits sont envoyés aux commandes PostgreSQL transactionnelles. Chaque commande exige une session active, une permission adaptée, une clé d’idempotence et une trace d’audit.</p>
  </section>
 </div>;
}
