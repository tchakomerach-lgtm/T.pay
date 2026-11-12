import { useCallback, useEffect, useMemo, useState } from "react";
import type { TPayApi } from "./api.js";

type SchoolClass = { class_id:string; name:string; grade_level:string; academic_year:string; capacity:number; status:"ACTIVE"|"ARCHIVED"; enrolled_count:number; version:number; };
type SchoolStudent = { student_id:string; display_name:string; lifecycle:string; class_id:string|null; academic_year:string|null; enrollment_state:string|null; };
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
 const totalEnrolled=classes.reduce((sum,item)=>sum+Number(item.enrolled_count||0),0);
 const activeClasses=classes.filter(item=>item.status==="ACTIVE").length;
 return <div className="content school-workspace">
  <section className="school-hero3d"><div><small>SCHOOL OS · ESPACE SCOLAIRE</small><h1>La gestion de l'établissement,<br/><em>en un seul espace.</em></h1><p>Classes, inscriptions et suivi des élèves sous contrôle de l'organisation.</p></div><div className="school-orb3d" aria-hidden="true"><span>É</span></div></section>
  <div className="school-toolbar"><div><small>DONNÉES DE L'ÉTABLISSEMENT</small><h2>Vue scolaire</h2></div><div className="school-toolbar-actions">{updatedAt&&<span className="school-freshness">Actualisé à {new Date(updatedAt).toLocaleTimeString("fr-FR")}</span>}<button type="button" onClick={()=>void load()} disabled={!api||loading}>↻ Actualiser</button></div></div>
  {!api&&<div className="school-alert" role="status"><b>Connexion sécurisée requise</b><p>Aucune session API active. Les listes réelles ne sont pas chargées et aucune donnée de démonstration n'est affichée.</p></div>}
  {error&&<div className="school-alert error" role="alert"><b>Chargement impossible</b><p>{error}</p><button type="button" onClick={()=>void load()}>Réessayer</button></div>}
  <div className="school-metrics" aria-busy={loading}>
   <article className="school-metric3d"><span>Classes actives</span><strong>{loading?"…":api?activeClasses:"—"}</strong><small>Année scolaire filtrable</small></article>
   <article className="school-metric3d"><span>Inscriptions actives</span><strong>{loading?"…":api?totalEnrolled:"—"}</strong><small>État confirmé par l'API</small></article>
   <article className="school-metric3d"><span>Élèves affichés</span><strong>{loading?"…":api?visibleStudents.length:"—"}</strong><small>Maximum 100 par requête</small></article>
  </div>
  <section className="school-section3d"><div className="school-section-heading"><div><small>STRUCTURE PÉDAGOGIQUE</small><h2>Classes et niveaux</h2></div><span>{classes.length} résultat(s)</span></div>
   {loading&&classes.length===0?<div className="school-empty">Chargement des classes…</div>:classes.length===0?<div className="school-empty">Aucune classe enregistrée pour cette organisation.</div>:<div className="school-class-grid">{classes.map(item=><button type="button" key={item.class_id} className={"school-class-card"+(selectedClass===item.class_id?" selected":"")} onClick={()=>setSelectedClass(selectedClass===item.class_id?"all":item.class_id)}><span className="school-class-icon">▦</span><b>{item.name}</b><small>{item.grade_level} · {item.academic_year}</small><span className="school-capacity"><strong>{item.enrolled_count}</strong> / {item.capacity} inscrits</span><i>{selectedClass===item.class_id?"Filtre actif":"Voir les élèves →"}</i></button>)}</div>}
  </section>
  <section className="school-section3d"><div className="school-section-heading"><div><small>REGISTRE SCOLAIRE</small><h2>Élèves et inscriptions</h2></div><span>Consultation sécurisée</span></div>
   <div className="school-student-controls"><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Rechercher un élève…" aria-label="Rechercher un élève"/><select value={selectedClass} onChange={event=>setSelectedClass(event.target.value)} aria-label="Filtrer par classe"><option value="all">Toutes les classes</option>{classes.map(item=><option key={item.class_id} value={item.class_id}>{item.name}</option>)}</select></div>
   <div className="school-table-wrap"><table className="school-table"><thead><tr><th>Élève</th><th>Identifiant</th><th>Classe</th><th>Année scolaire</th><th>Cycle</th></tr></thead><tbody>
    {visibleStudents.map(student=><tr key={student.student_id}><td><b>{student.display_name}</b></td><td>{student.student_id}</td><td>{classes.find(item=>item.class_id===student.class_id)?.name??student.class_id??"Non affecté"}</td><td>{student.academic_year??"—"}</td><td><span className="school-lifecycle">{student.lifecycle}</span></td></tr>)}
    {!loading&&visibleStudents.length===0&&<tr><td colSpan={5} className="school-no-results">Aucun élève correspondant aux critères.</td></tr>}
   </tbody></table></div>
   <p className="school-footnote">Cette première livraison est en lecture seule. Les affectations et transferts seront activés après validation de leurs commandes transactionnelles et de leur audit.</p>
  </section>
 </div>;
}
