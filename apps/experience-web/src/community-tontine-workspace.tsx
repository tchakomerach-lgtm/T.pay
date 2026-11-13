import {useCallback,useEffect,useMemo,useState} from "react";
import type {TPayApi} from "./api.js";

type Panel="overview"|"groups"|"members"|"cycles"|"contributions"|"governance"|"incidents";
type TontineGroup={id:string;name:string;country_code:string;currency:string;frequency:string;contribution_mode:string;minimum_amount_minor:string;fixed_amount_minor:string|null;cycle_number:number;max_members:number|null;governance:string;status:string;active_member_count:number;pending_member_count:number;latest_cycle:{id:string;cycleNumber:number;startsOn:string;endsOn:string;status:string}|null;confirmed_contribution_count:number;confirmed_contribution_minor:string;};
type GroupResponse={data?:{items?:TontineGroup[]}};
const panels:{id:Panel;label:string;symbol:string}[]=[
 {id:"overview",label:"Vue générale",symbol:"◈"},{id:"groups",label:"Groupes",symbol:"◎"},{id:"members",label:"Membres",symbol:"♙"},
 {id:"cycles",label:"Cycles & rotations",symbol:"↻"},{id:"contributions",label:"Cotisations",symbol:"₣"},{id:"governance",label:"Gouvernance",symbol:"⬡"},{id:"incidents",label:"Incidents",symbol:"⚑"}
];
const stages=["Groupe configuré","Membres vérifiés","Cycle planifié","Cotisations rapprochées","Bénéficiaire validé","Décaissement confirmé"];
const details:Record<Panel,{eyebrow:string;title:string;description:string;items:string[]}> = {
 overview:{eyebrow:"PILOTAGE COMMUNAUTAIRE",title:"La confiance se pilote, chaque cycle à la fois.",description:"Une vue unifiée des groupes, des engagements, des rotations et des contrôles. Les indicateurs restent vides tant que l'API réelle n'est pas raccordée.",items:["Suivi du cycle et des échéances","Vue des contributions rapprochées","Contrôle des bénéficiaires et des validations"]},
 groups:{eyebrow:"STRUCTURE",title:"Groupes de tontine",description:"Créer et administrer des communautés avec des règles explicites, un responsable identifié et un périmètre organisationnel isolé.",items:["Identité, nom et description du groupe","Fréquence, montant et devise du cycle","Minimum de membres et règles d'adhésion","Statut : préparation, actif, suspendu ou clôturé"]},
 members:{eyebrow:"ADHÉSIONS & IDENTITÉ",title:"Registre des membres",description:"Chaque adhésion est rattachée à un groupe et à une organisation. Les changements de statut doivent rester historisés et auditables.",items:["Invitation et acceptation d'adhésion","Vérification d'identité et statut KYC","Suspension, révocation et réactivation contrôlées","Historique des rôles et des autorisations"]},
 cycles:{eyebrow:"CALENDRIER & ROTATION",title:"Cycles et ordre de passage",description:"Le moteur de rotation doit calculer les échéances de façon déterministe et empêcher les doubles attributions dans un même tour.",items:["Calendrier des périodes et dates limites","Ordre de bénéficiaires versionné","Éligibilité recalculée avant chaque attribution","Reprise après incident sans double paiement"]},
 contributions:{eyebrow:"COLLECTE & RAPPROCHEMENT",title:"Cotisations et preuves",description:"Une intention de paiement n'est jamais une cotisation confirmée. Seule une preuve fournisseur vérifiée puis rapprochée peut faire évoluer le statut.",items:["Canaux Mobile Money et collecte agent","Clé d'idempotence et protection anti-rejeu","Reçus et preuves de paiement vérifiables","Écarts envoyés en rapprochement, jamais corrigés silencieusement"]},
 governance:{eyebrow:"CONTRÔLE & SÉPARATION DES RÔLES",title:"Gouvernance et validations",description:"Les actions sensibles appliquent le principe du double contrôle, les permissions temporelles et la séparation préparateur / approbateur.",items:["Rôles président, trésorier, secrétaire et membre","Permissions limitées à l'organisation et dans le temps","Préparateur différent de l'approbateur","Journal d'audit immuable et décisions traçables"]},
 incidents:{eyebrow:"EXCEPTIONS & CONTINUITÉ",title:"Incidents, litiges et reprise",description:"Les interruptions réseau et les désaccords doivent être traités comme des états métier explicites, sans transfert financier aveugle.",items:["Retard de cotisation et relance contrôlée","Contestations, preuves et décisions","Opérations terrain hors ligne signées et expirables","Remboursement exclusivement via Financial Core"]}
};
export function CommunityTontineWorkspace({api}:{api:TPayApi|null}){
 const [active,setActive]=useState<Panel>("overview");
 const [groups,setGroups]=useState<TontineGroup[]>([]);
 const [loading,setLoading]=useState(false);
 const [loadError,setLoadError]=useState<string|null>(null);
 const [updatedAt,setUpdatedAt]=useState<string|null>(null);
 const [statusFilter,setStatusFilter]=useState("all");
 const loadGroups=useCallback(async()=>{
  if(!api){setGroups([]);return;}
  setLoading(true);setLoadError(null);
  try{
   const query=new URLSearchParams({limit:"100"});
   if(statusFilter!=="all")query.set("status",statusFilter);
   const response=await api.request("/v1/tontine/groups?"+query.toString());
   if(!response.ok)throw new Error("TONTINE_API_HTTP_"+response.status);
   const body=await response.json() as GroupResponse;
   setGroups(Array.isArray(body.data?.items)?body.data.items:[]);
   setUpdatedAt(new Date().toISOString());
  }catch(error){setLoadError(error instanceof Error?error.message:"TONTINE_DATA_UNAVAILABLE");}
  finally{setLoading(false);}
 },[api,statusFilter]);
 useEffect(()=>{void loadGroups();},[loadGroups]);
 const current=details[active];
 const progress=useMemo(()=>stages.map((label,index)=>({label,index})),[]);
 return <div className="content tontine-workspace">
  <section className="tontine-hero3d">
   <div className="tontine-hero-copy"><small>T.PAY · COMMUNITY TONTINE</small><h1>La solidarité,<br/><em>structurée et transparente.</em></h1><p>Groupes · cycles · contributions · rotation · gouvernance</p><div className="tontine-hero-tags"><span>Multi-organisation</span><span>Audit traçable</span><span>Financial Core protégé</span></div></div>
   <div className="tontine-orbit" aria-hidden="true"><div className="tontine-orbit-ring ring-a"/><div className="tontine-orbit-ring ring-b"/><div className="tontine-coin">T</div><span className="orbit-dot dot-a"/><span className="orbit-dot dot-b"/><span className="orbit-dot dot-c"/></div>
  </section>
  <div className="tontine-statusbar"><span className="tontine-status-dot"/><b>{api?"SESSION API DISPONIBLE":"API TONTINE NON RACCORDEE"}</b><span>{api?"Lecture authentifiée disponible pour le portefeuille des groupes ; les commandes métier restent à raccorder.":"Interface de travail uniquement · aucune donnée ni opération financière simulée."}</span></div>
  <div className="tontine-nav" role="tablist" aria-label="Espaces de la tontine">{panels.map(p=><button type="button" role="tab" aria-selected={active===p.id} className={active===p.id?"active":""} key={p.id} onClick={()=>setActive(p.id)}><i>{p.symbol}</i>{p.label}</button>)}</div>
  <section className="tontine-section-heading"><div><small>{current.eyebrow}</small><h2>{current.title}</h2><p>{current.description}</p></div><span className="tontine-readonly">LECTURE / CONCEPTION</span></section>
  {api&&<div className="tontine-live-toolbar"><div><b>Portefeuille réel</b><small>{updatedAt?"Actualisé à "+new Date(updatedAt).toLocaleTimeString("fr-FR"):"Chargement des données de l'organisation"}</small></div><div><select aria-label="Filtrer les groupes" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="draft">Brouillons</option><option value="pending_review">En revue</option><option value="paused">Suspendus</option><option value="completed">Terminés</option><option value="cancelled">Annulés</option></select><button type="button" onClick={()=>void loadGroups()} disabled={loading}>↻ Actualiser</button></div></div>}
  {loadError&&<div className="tontine-live-error" role="alert"><b>Chargement des groupes impossible</b><span>{loadError}</span><button type="button" onClick={()=>void loadGroups()}>Réessayer</button></div>}
  {active==="groups"&&<section className="tontine-live-groups" aria-busy={loading}>
   {loading&&groups.length===0?<div className="tontine-live-empty">Chargement des groupes…</div>:groups.length===0?<div className="tontine-live-empty">{api?"Aucun groupe de tontine enregistré pour cette organisation.":"Une session API authentifiée est nécessaire pour afficher les groupes réels."}</div>:groups.map(group=><article className="tontine-live-group" key={group.id}>
    <div className="tontine-live-group-top"><span className="tontine-live-group-icon">◎</span><span className={"tontine-live-state state-"+group.status}>{group.status.replace("_"," ")}</span></div>
    <h3>{group.name}</h3><p>{group.frequency} · {group.contribution_mode} · {group.currency}</p>
    <div className="tontine-live-stats"><div><small>Membres actifs</small><b>{group.active_member_count}</b></div><div><small>En attente</small><b>{group.pending_member_count}</b></div><div><small>Cycle</small><b>{group.latest_cycle?.cycleNumber??group.cycle_number}</b></div></div>
    <div className="tontine-live-foot"><span>Minimum {Number(group.minimum_amount_minor).toLocaleString("fr-FR")} {group.currency}</span><span>{group.confirmed_contribution_count} cotisations confirmées</span></div>
   </article>)}
  </section>}
  {active==="overview"&&<div className="tontine-live-kpis">
   <article><small>GROUPES ENREGISTRÉS</small><b>{api?groups.length:"—"}</b><span>Données retournées par PostgreSQL</span></article>
   <article><small>MEMBRES ACTIFS</small><b>{api?groups.reduce((n,g)=>n+Number(g.active_member_count||0),0):"—"}</b><span>Somme des groupes visibles</span></article>
   <article><small>COTISATIONS CONFIRMÉES</small><b>{api?groups.reduce((n,g)=>n+Number(g.confirmed_contribution_count||0),0):"—"}</b><span>Statut confirmé en base</span></article>
  </div>}
  {active==="overview"&&<div className="tontine-overview-grid">
   <article className="tontine-feature-card feature-main"><small>CHAÎNE OPÉRATIONNELLE</small><h3>Du groupe au règlement confirmé</h3><p>Chaque étape possède ses propres contrôles. Un statut ne peut pas être sauté par une simple action d'interface.</p><div className="tontine-stage-list">{progress.map((stage,i)=><div className="tontine-stage" key={stage.label}><span>{String(i+1).padStart(2,"0")}</span><b>{stage.label}</b><i>{i===0?"Configuration":i===1?"Identité":i===2?"Planification":i===3?"Rapprochement":i===4?"Double contrôle":"Financial Core"}</i></div>)}</div></article>
   <article className="tontine-feature-card"><small>PRINCIPES FINANCIERS</small><h3>Pas de raccourci sur les fonds</h3><ul><li>Le ledger reste l'autorité comptable.</li><li>La collecte est idempotente et rapprochée.</li><li>Les décaissements sont réservés et validés.</li><li>Une panne ne déclenche jamais un second transfert aveugle.</li></ul><div className="tontine-lock">◈ &nbsp; Financial Core · transaction atomique</div></article>
   <article className="tontine-feature-card"><small>GOUVERNANCE</small><h3>Une responsabilité par action</h3><ul><li>Identité et organisation vérifiées.</li><li>Permissions limitées et temporaires.</li><li>Préparateur ≠ approbateur.</li><li>Audit conservé avec l'événement.</li></ul><div className="tontine-lock">⬡ &nbsp; Séparation des rôles</div></article>
  </div>}
  {active!=="overview"&&active!=="groups"&&<div className="tontine-detail-grid"><article className="tontine-feature-card"><small>CAPACITÉS DU SOUS-MODULE</small><h3>Fonctions prévues et règles métier</h3><ul>{current.items.map(item=><li key={item}>{item}</li>)}</ul></article><article className="tontine-empty-card"><div className="tontine-empty-icon">{panels.find(p=>p.id===active)?.symbol}</div><b>Aucun enregistrement chargé</b><p>Le point d'accès API de ce sous-module n'est pas encore disponible dans le serveur courant. Aucun groupe, membre, montant ou statut fictif n'est affiché.</p><span>En attente du service métier authentifié</span></article></div>}
  <section className="tontine-integrity"><div><small>GARDE-FOUS NON NÉGOCIABLES</small><b>Tenant isolation · PostgreSQL · idempotence · audit · outbox</b></div><p>Le renderer ne crée pas de groupe, ne collecte pas de cotisation et ne déclenche aucun payout. Les mutations seront activées uniquement après implémentation des routes authentifiées, des permissions, des transactions et des tests PostgreSQL live.</p></section>
 </div>;
}
