import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import type {TPayApi} from "./api.js";

type Panel="overview"|"groups"|"members"|"cycles"|"contributions"|"governance"|"incidents";
type TontineGroup={id:string;name:string;country_code:string;currency:string;frequency:string;contribution_mode:string;minimum_amount_minor:string;fixed_amount_minor:string|null;cycle_number:number;max_members:number|null;governance:string;status:string;active_member_count:number;pending_member_count:number;latest_cycle:{id:string;cycleNumber:number;startsOn:string;endsOn:string;status:string}|null;confirmed_contribution_count:number;confirmed_contribution_minor:string;};
type GroupResponse={data?:{items?:TontineGroup[];group?:TontineGroup;replayed?:boolean}};
type TontineRecord=Record<string,unknown>;
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
 const [selectedGroupId,setSelectedGroupId]=useState("");
 const [panelRows,setPanelRows]=useState<TontineRecord[]>([]);
 const [panelLoading,setPanelLoading]=useState(false);
 const [panelError,setPanelError]=useState<string|null>(null);
 const [createOpen,setCreateOpen]=useState(false);
 const [createBusy,setCreateBusy]=useState(false);
 const [createError,setCreateError]=useState<string|null>(null);
 const [inviteClientId,setInviteClientId]=useState("");
 const [inviteBusy,setInviteBusy]=useState(false);
 const [inviteError,setInviteError]=useState<string|null>(null);
 const [decisionBusy,setDecisionBusy]=useState<string|null>(null);
 const [decisionError,setDecisionError]=useState<string|null>(null);
 const [cycleStartsOn,setCycleStartsOn]=useState("");
 const [cycleEndsOn,setCycleEndsOn]=useState("");
 const [cycleRulesVersion,setCycleRulesVersion]=useState("v1");
 const [cycleBusy,setCycleBusy]=useState(false);
 const [cycleError,setCycleError]=useState<string|null>(null);
 const [panelRefresh,setPanelRefresh]=useState(0);
 const [governancePolicy,setGovernancePolicy]=useState<Record<string,unknown>|null>(null);
 const [policyQuorum,setPolicyQuorum]=useState("50");
 const [policyApproval,setPolicyApproval]=useState("66");
 const [policyAbstention,setPolicyAbstention]=useState(false);
 const [policyBusy,setPolicyBusy]=useState(false);
 const [policyError,setPolicyError]=useState<string|null>(null);
 const [proposalType,setProposalType]=useState("rule_change");
 const [proposalPayload,setProposalPayload]=useState('{"reason":"Modification proposée"}');
 const [proposalClosesAt,setProposalClosesAt]=useState(()=>new Date(Date.now()+48*60*60*1000).toISOString().slice(0,16));
 const [proposalBusy,setProposalBusy]=useState(false);
 const [proposalError,setProposalError]=useState<string|null>(null);
 const [voteBusy,setVoteBusy]=useState<string|null>(null);
 const [voteError,setVoteError]=useState<string|null>(null);
 const [caseType,setCaseType]=useState("incident");
 const [caseSeverity,setCaseSeverity]=useState("medium");
 const [caseSummary,setCaseSummary]=useState("");
 const [caseReferenceKind,setCaseReferenceKind]=useState("contribution");
 const [caseReferenceId,setCaseReferenceId]=useState("");
 const [caseBusy,setCaseBusy]=useState(false);
 const [caseError,setCaseError]=useState<string|null>(null);
 const [groupName,setGroupName]=useState("");
 const [groupFrequency,setGroupFrequency]=useState("weekly");
 const [groupMode,setGroupMode]=useState("fixed");
 const [groupMinimum,setGroupMinimum]=useState("500");
 const [groupFixed,setGroupFixed]=useState("500");
 const [groupTarget,setGroupTarget]=useState("");
 const [groupMaxMembers,setGroupMaxMembers]=useState("30");
 const [groupGovernance,setGroupGovernance]=useState("member_vote");
 const loadGroups=useCallback(async(filter=statusFilter)=>{
  if(!api){setGroups([]);return;}
  setLoading(true);setLoadError(null);
  try{
   const query=new URLSearchParams({limit:"100"});
   if(filter!=="all")query.set("status",filter);
   const response=await api.request("/v1/tontine/groups?"+query.toString());
   if(!response.ok)throw new Error("TONTINE_API_HTTP_"+response.status);
   const body=await response.json() as GroupResponse;
   setGroups(Array.isArray(body.data?.items)?body.data.items:[]);
   setUpdatedAt(new Date().toISOString());
  }catch(error){setLoadError(error instanceof Error?error.message:"TONTINE_DATA_UNAVAILABLE");}
  finally{setLoading(false);}
 },[api,statusFilter]);
 const createGroup=useCallback(async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!api||createBusy)return;
  setCreateBusy(true);setCreateError(null);
  try{
   const payload:Record<string,unknown>={name:groupName.trim(),countryCode:"TG",currency:"XOF",frequency:groupFrequency,contributionMode:groupMode,minimumAmountMinor:groupMinimum,governance:groupGovernance};
   if(groupMode==="fixed")payload.fixedAmountMinor=groupFixed;
   if(groupMode==="goal")payload.targetMinor=groupTarget;
   if(groupMaxMembers.trim())payload.maxMembers=Number(groupMaxMembers);
   const response=await api.request("/v1/tontine/groups",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify(payload)});
   const body=await response.json() as {data?:{group?:TontineGroup};error?:{message?:string}};
   if(!response.ok||!body.data?.group?.id)throw new Error(body.error?.message??"TONTINE_GROUP_CREATE_HTTP_"+response.status);
   setCreateOpen(false);setGroupName("");setStatusFilter("all");setActive("groups");setSelectedGroupId(body.data.group.id);
   await loadGroups("all");
  }catch(error){setCreateError(error instanceof Error?error.message:"TONTINE_GROUP_CREATE_FAILED");}
  finally{setCreateBusy(false);}
 },[api,createBusy,groupName,groupFrequency,groupMode,groupMinimum,groupFixed,groupTarget,groupMaxMembers,groupGovernance,loadGroups]);
 const inviteMember=useCallback(async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!api||!selectedGroupId||inviteBusy)return;
  setInviteBusy(true);setInviteError(null);
  try{
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/members",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({clientId:inviteClientId.trim()})});
   const body=await response.json() as {data?:{membership?:{id:string;status:string}};error?:{message?:string}};
   if(!response.ok||!body.data?.membership?.id)throw new Error(body.error?.message??"TONTINE_MEMBER_INVITE_HTTP_"+response.status);
   setInviteClientId("");setPanelRefresh(value=>value+1);
  }catch(error){setInviteError(error instanceof Error?error.message:"TONTINE_MEMBER_INVITE_FAILED");}
  finally{setInviteBusy(false);}
 },[api,selectedGroupId,inviteBusy,inviteClientId]);
 const decideInvitation=useCallback(async(membershipId:string,decision:"accept"|"decline")=>{
  if(!api||!selectedGroupId||decisionBusy)return;
  setDecisionBusy(membershipId);setDecisionError(null);
  try{
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/members/"+encodeURIComponent(membershipId)+"/decision",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({decision})});
   const body=await response.json() as {data?:{membership?:{id:string;status:string}};error?:{message?:string}};
   if(!response.ok||!body.data?.membership?.id)throw new Error(body.error?.message??"TONTINE_MEMBER_DECISION_HTTP_"+response.status);
   setPanelRefresh(value=>value+1);
  }catch(error){setDecisionError(error instanceof Error?error.message:"TONTINE_MEMBER_DECISION_FAILED");}
  finally{setDecisionBusy(null);}
 },[api,selectedGroupId,decisionBusy]);
 const createCase=useCallback(async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!api||!selectedGroupId||caseBusy)return;
  setCaseBusy(true);setCaseError(null);
  try{
   const payload:Record<string,string>={type:caseType,severity:caseSeverity,summary:caseSummary.trim()};
   if(caseReferenceId.trim())payload[caseReferenceKind==="payout"?"payoutId":"contributionId"]=caseReferenceId.trim();
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/cases",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify(payload)});
   const body=await response.json() as {data?:{case?:{id:string;state:string}};error?:{message?:string}};
   if(!response.ok||!body.data?.case?.id)throw new Error(body.error?.message??"TONTINE_CASE_CREATE_HTTP_"+response.status);
   setCaseSummary("");setCaseReferenceId("");setPanelRefresh(value=>value+1);
  }catch(error){setCaseError(error instanceof Error?error.message:"TONTINE_CASE_CREATE_FAILED");}
  finally{setCaseBusy(false);}
 },[api,selectedGroupId,caseBusy,caseType,caseSeverity,caseSummary,caseReferenceKind,caseReferenceId]);
 const generateCycle=useCallback(async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!api||!selectedGroupId||cycleBusy)return;
  setCycleBusy(true);setCycleError(null);
  try{
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/cycles",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({startsOn:cycleStartsOn,endsOn:cycleEndsOn,rulesVersion:cycleRulesVersion.trim()})});
   const body=await response.json() as {data?:{cycle?:{id:string;cycle_number:number}};error?:{message?:string}};
   if(!response.ok||!body.data?.cycle?.id)throw new Error(body.error?.message??"TONTINE_CYCLE_CREATE_HTTP_"+response.status);
   setPanelRefresh(value=>value+1);
  }catch(error){setCycleError(error instanceof Error?error.message:"TONTINE_CYCLE_CREATE_FAILED");}
  finally{setCycleBusy(false);}
 },[api,selectedGroupId,cycleBusy,cycleStartsOn,cycleEndsOn,cycleRulesVersion]);
 const saveGovernancePolicy=useCallback(async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!api||!selectedGroupId||policyBusy)return;
  setPolicyBusy(true);setPolicyError(null);
  try{
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/governance/policy",{method:"PUT",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({quorumPercent:Number(policyQuorum),approvalPercent:Number(policyApproval),allowAbstention:policyAbstention})});
   const body=await response.json() as {data?:{policy?:Record<string,unknown>};error?:{message?:string}};
   if(!response.ok||!body.data?.policy)throw new Error(body.error?.message??"TONTINE_GOVERNANCE_POLICY_HTTP_"+response.status);
   setGovernancePolicy(body.data.policy);setPanelRefresh(value=>value+1);
  }catch(error){setPolicyError(error instanceof Error?error.message:"TONTINE_GOVERNANCE_POLICY_FAILED");}
  finally{setPolicyBusy(false);}
 },[api,selectedGroupId,policyBusy,policyQuorum,policyApproval,policyAbstention]);
 const createProposal=useCallback(async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!api||!selectedGroupId||proposalBusy)return;
  setProposalBusy(true);setProposalError(null);
  try{
   let payload:unknown;try{payload=JSON.parse(proposalPayload);}catch{throw new Error("Le contenu de la proposition doit être un JSON valide.");}
   if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("Le contenu doit être un objet JSON.");
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/governance/proposals",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({type:proposalType,payload,closesAt:new Date(proposalClosesAt).toISOString()})});
   const body=await response.json() as {data?:{proposal?:{id:string}};error?:{message?:string}};
   if(!response.ok||!body.data?.proposal?.id)throw new Error(body.error?.message??"TONTINE_PROPOSAL_CREATE_HTTP_"+response.status);
   setPanelRefresh(value=>value+1);
  }catch(error){setProposalError(error instanceof Error?error.message:"TONTINE_PROPOSAL_CREATE_FAILED");}
  finally{setProposalBusy(false);}
 },[api,selectedGroupId,proposalBusy,proposalType,proposalPayload,proposalClosesAt]);
 const castGovernanceVote=useCallback(async(proposalId:string,choice:"approve"|"reject"|"abstain")=>{
  if(!api||!selectedGroupId||voteBusy)return;
  setVoteBusy(proposalId);setVoteError(null);
  try{
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/governance/proposals/"+encodeURIComponent(proposalId)+"/votes",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({choice})});
   const body=await response.json() as {data?:{vote?:{id:string}};error?:{message?:string}};
   if(!response.ok||!body.data?.vote?.id)throw new Error(body.error?.message??"TONTINE_GOVERNANCE_VOTE_HTTP_"+response.status);
   setPanelRefresh(value=>value+1);
  }catch(error){setVoteError(error instanceof Error?error.message:"TONTINE_GOVERNANCE_VOTE_FAILED");}
  finally{setVoteBusy(null);}
 },[api,selectedGroupId,voteBusy]);
 const finalizeGovernanceProposal=useCallback(async(proposalId:string)=>{
  if(!api||!selectedGroupId||voteBusy)return;
  setVoteBusy(proposalId);setVoteError(null);
  try{
   const response=await api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/governance/proposals/"+encodeURIComponent(proposalId),{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify({})});
   const body=await response.json() as {data?:{proposal?:{id:string}};error?:{message?:string}};
   if(!response.ok||!body.data?.proposal?.id)throw new Error(body.error?.message??"TONTINE_GOVERNANCE_FINALIZE_HTTP_"+response.status);
   setPanelRefresh(value=>value+1);
  }catch(error){setVoteError(error instanceof Error?error.message:"TONTINE_GOVERNANCE_FINALIZE_FAILED");}
  finally{setVoteBusy(null);}
 },[api,selectedGroupId,voteBusy]);
 useEffect(()=>{
  if(active!=="governance"||!api||!selectedGroupId){setGovernancePolicy(null);return;}
  let cancelled=false;
  api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/governance/policy")
   .then(async response=>{if(!response.ok)throw new Error("TONTINE_GOVERNANCE_POLICY_READ_HTTP_"+response.status);const body=await response.json() as {data?:{policy?:Record<string,unknown>|null}};if(!cancelled){const policy=body.data?.policy??null;setGovernancePolicy(policy);if(policy){setPolicyQuorum(String(policy.quorum_percent));setPolicyApproval(String(policy.approval_percent));setPolicyAbstention(policy.allow_abstention===true);}}})
   .catch(error=>{if(!cancelled)setPolicyError(error instanceof Error?error.message:"TONTINE_GOVERNANCE_POLICY_READ_FAILED");});
  return()=>{cancelled=true;};
 },[active,api,selectedGroupId,panelRefresh]);
 useEffect(()=>{void loadGroups();},[loadGroups]);
 useEffect(()=>{
  const firstGroupId=groups[0]?.id;if(firstGroupId&&!groups.some(group=>group.id===selectedGroupId))setSelectedGroupId(firstGroupId);
  if(groups.length===0)setSelectedGroupId("");
 },[groups,selectedGroupId]);
 const panelResource=active==="members"||active==="cycles"||active==="contributions"||active==="governance"||active==="incidents"
  ?active==="incidents"?"cases":active:null;
 useEffect(()=>{
  if(!api||!panelResource||!selectedGroupId){setPanelRows([]);setPanelError(null);return;}
  let cancelled=false;setPanelLoading(true);setPanelError(null);
  api.request("/v1/tontine/groups/"+encodeURIComponent(selectedGroupId)+"/"+panelResource+"?limit=100")
   .then(async response=>{
    if(!response.ok)throw new Error("TONTINE_"+panelResource.toUpperCase()+"_HTTP_"+response.status);
    const body=await response.json() as GroupResponse;
    if(!cancelled)setPanelRows(Array.isArray(body.data?.items)?body.data.items as TontineRecord[]:[]);
   })
   .catch(error=>{if(!cancelled)setPanelError(error instanceof Error?error.message:"TONTINE_DATA_UNAVAILABLE");})
   .finally(()=>{if(!cancelled)setPanelLoading(false);});
  return()=>{cancelled=true;};
 },[api,panelResource,selectedGroupId,panelRefresh]);
 const panelColumns=panelRows.length>0?Object.keys(panelRows[0]??{}):[];
 const current=details[active];
 const progress=useMemo(()=>stages.map((label,index)=>({label,index})),[]);
 return <div className="content tontine-workspace">
  <section className="tontine-hero3d">
   <div className="tontine-hero-copy"><small>T.PAY · COMMUNITY TONTINE</small><h1>La solidarité,<br/><em>structurée et transparente.</em></h1><p>Groupes · cycles · contributions · rotation · gouvernance</p><div className="tontine-hero-tags"><span>Multi-organisation</span><span>Audit traçable</span><span>Financial Core protégé</span></div></div>
   <div className="tontine-orbit" aria-hidden="true"><div className="tontine-orbit-ring ring-a"/><div className="tontine-orbit-ring ring-b"/><div className="tontine-coin">T</div><span className="orbit-dot dot-a"/><span className="orbit-dot dot-b"/><span className="orbit-dot dot-c"/></div>
  </section>
  <div className="tontine-statusbar"><span className="tontine-status-dot"/><b>{api?"SESSION API DISPONIBLE":"API TONTINE NON RACCORDEE"}</b><span>{api?"Lectures authentifiées disponibles : groupes, membres, cycles, cotisations, gouvernance et incidents.":"Interface de travail uniquement · aucune donnée ni opération financière simulée."}</span></div>
  <div className="tontine-nav" role="tablist" aria-label="Espaces de la tontine">{panels.map(p=><button type="button" role="tab" aria-selected={active===p.id} className={active===p.id?"active":""} key={p.id} onClick={()=>setActive(p.id)}><i>{p.symbol}</i>{p.label}</button>)}</div>
  <section className="tontine-section-heading"><div><small>{current.eyebrow}</small><h2>{current.title}</h2><p>{current.description}</p></div><span className="tontine-readonly">LECTURE / CONCEPTION</span></section>
  {api&&<div className="tontine-live-toolbar"><div><b>Portefeuille réel</b><small>{updatedAt?"Actualisé à "+new Date(updatedAt).toLocaleTimeString("fr-FR"):"Chargement des données de l'organisation"}</small></div><div>{groups.length>0&&<select aria-label="Groupe sélectionné" value={selectedGroupId} onChange={e=>setSelectedGroupId(e.target.value)}>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select>}<select aria-label="Filtrer les groupes" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="draft">Brouillons</option><option value="pending_review">En revue</option><option value="paused">Suspendus</option><option value="completed">Terminés</option><option value="cancelled">Annulés</option></select><button type="button" onClick={()=>void loadGroups()} disabled={loading}>↻ Actualiser</button>{active==="groups"&&<button type="button" className="tontine-create-trigger" onClick={()=>{setCreateError(null);setCreateOpen(value=>!value);}}>＋ Nouveau groupe</button>}</div></div>}
  {active==="groups"&&createOpen&&<form className="tontine-create-form" onSubmit={createGroup}>
   <div className="tontine-create-heading"><div><small>NOUVELLE COMMUNAUTÉ · TOGO / XOF</small><h3>Configurer un groupe</h3><p>Le groupe sera créé en brouillon avec le fondateur comme premier membre. Aucun paiement ne sera déclenché.</p></div><button type="button" onClick={()=>setCreateOpen(false)} aria-label="Fermer le formulaire">×</button></div>
   <div className="tontine-create-fields">
    <label>Nom du groupe<input required maxLength={160} value={groupName} onChange={event=>setGroupName(event.target.value)} placeholder="Ex. Solidarité du quartier"/></label>
    <label>Fréquence<select value={groupFrequency} onChange={event=>setGroupFrequency(event.target.value)}><option value="daily">Quotidienne</option><option value="weekly">Hebdomadaire</option><option value="monthly">Mensuelle</option></select></label>
    <label>Mode de cotisation<select value={groupMode} onChange={event=>setGroupMode(event.target.value)}><option value="fixed">Montant fixe</option><option value="variable">Montant variable</option><option value="goal">Objectif collectif</option></select></label>
    <label>Minimum par cotisation (XOF)<input required inputMode="numeric" pattern="[0-9]{1,38}" value={groupMinimum} onChange={event=>setGroupMinimum(event.target.value)}/></label>
    {groupMode==="fixed"&&<label>Montant fixe (XOF)<input required inputMode="numeric" pattern="[0-9]{1,38}" value={groupFixed} onChange={event=>setGroupFixed(event.target.value)}/></label>}
    {groupMode==="goal"&&<label>Objectif (XOF)<input required inputMode="numeric" pattern="[0-9]{1,38}" value={groupTarget} onChange={event=>setGroupTarget(event.target.value)}/></label>}
    <label>Nombre maximum de membres<input inputMode="numeric" type="number" min="2" max="100000" value={groupMaxMembers} onChange={event=>setGroupMaxMembers(event.target.value)}/></label>
    <label>Gouvernance<select value={groupGovernance} onChange={event=>setGroupGovernance(event.target.value)}><option value="member_vote">Vote des membres</option><option value="founder_managed">Gestion par fondateur</option></select></label>
   </div>
   {createError&&<p className="tontine-create-error" role="alert">{createError}</p>}
   <div className="tontine-create-actions"><button type="button" onClick={()=>setCreateOpen(false)} disabled={createBusy}>Annuler</button><button type="submit" disabled={createBusy||!groupName.trim()}>{createBusy?"Création sécurisée…":"Créer le groupe en brouillon"}</button></div>
  </form>}
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
  {active==="members"&&api&&selectedGroupId&&<form className="tontine-member-invite" onSubmit={inviteMember}>
   <div><small>ADHÉSION SÉCURISÉE</small><h3>Inviter un membre</h3><p>L'invitation est enregistrée en attente. Le membre devra accepter avant de devenir actif. La capacité inclut les invitations en attente.</p></div>
   <label>Identifiant client (UUID)<input required value={inviteClientId} onChange={event=>setInviteClientId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off"/></label>
   {inviteError&&<p role="alert" className="tontine-create-error">{inviteError}</p>}
   <button type="submit" disabled={inviteBusy||!inviteClientId.trim()}>{inviteBusy?"Invitation sécurisée…":"Envoyer l'invitation"}</button>
  </form>}
  {active!=="overview"&&active!=="groups"&&<div className="tontine-detail-grid"><article className="tontine-feature-card"><small>CAPACITÉS DU SOUS-MODULE</small><h3>Fonctions prévues et règles métier</h3><ul>{current.items.map(item=><li key={item}>{item}</li>)}</ul></article><article className="tontine-feature-card tontine-record-panel"><small>REGISTRE AUTHENTIFIÉ · {selectedGroupId?"GROUPE SÉLECTIONNÉ":"AUCUN GROUPE"}</small><h3>{active==="members"?"Membres":active==="cycles"?"Cycles & échéances":active==="contributions"?"Cotisations":active==="governance"?"Propositions & votes":"Incidents & litiges"}</h3>
   {active==="cycles"&&api&&selectedGroupId&&<form className="tontine-cycle-command" onSubmit={generateCycle}>
    <div className="tontine-cycle-command-copy"><small>ORCHESTRATION DU CYCLE</small><h4>Générer un cycle sécurisé</h4><p>Le serveur verrouille le groupe, photographie les membres actifs et crée les échéances et l'ordre de rotation dans une transaction PostgreSQL.</p></div>
    <label>Début<input type="date" required value={cycleStartsOn} onChange={event=>setCycleStartsOn(event.target.value)}/></label>
    <label>Fin<input type="date" required min={cycleStartsOn||undefined} value={cycleEndsOn} onChange={event=>setCycleEndsOn(event.target.value)}/></label>
    <label>Version des règles<input required maxLength={64} value={cycleRulesVersion} onChange={event=>setCycleRulesVersion(event.target.value)}/></label>
    <button type="submit" disabled={cycleBusy||!cycleStartsOn||!cycleEndsOn||!cycleRulesVersion.trim()}>{cycleBusy?"Génération atomique…":"Générer le cycle"}</button>
    {cycleError&&<p role="alert" className="tontine-create-error">{cycleError}</p>}
   </form>}
   {active==="governance"&&api&&selectedGroupId&&<div className="tontine-governance-commands">
    <form className="tontine-policy-command" onSubmit={saveGovernancePolicy}>
     <div><small>POLITIQUE DU GROUPE · VERSIONNÉE</small><h4>Quorum et seuil d'approbation</h4><p>{governancePolicy?"Version actuelle : "+String(governancePolicy.policy_version):"Aucune règle configurée. Une politique explicite est obligatoire avant toute proposition."}</p></div>
     <label>Quorum (%)<input type="number" min="1" max="100" required value={policyQuorum} onChange={event=>setPolicyQuorum(event.target.value)}/></label>
     <label>Approbation (%)<input type="number" min="51" max="100" required value={policyApproval} onChange={event=>setPolicyApproval(event.target.value)}/></label>
     <label className="tontine-policy-check"><input type="checkbox" checked={policyAbstention} onChange={event=>setPolicyAbstention(event.target.checked)}/> Autoriser l'abstention</label>
     {policyError&&<p role="alert" className="tontine-create-error">{policyError}</p>}
     <button type="submit" disabled={policyBusy}>{policyBusy?"Enregistrement…":governancePolicy?"Publier la version suivante":"Créer la politique"}</button>
    </form>
    <form className="tontine-proposal-command" onSubmit={createProposal}>
     <div><small>DÉLIBÉRATION DES MEMBRES</small><h4>Ouvrir une proposition</h4><p>Le serveur photographie la politique et le nombre de membres actifs au moment de l'ouverture.</p></div>
     <label>Type<select value={proposalType} onChange={event=>setProposalType(event.target.value)}><option value="rule_change">Modification des règles</option><option value="beneficiary_order">Ordre des bénéficiaires</option><option value="pause">Mise en pause</option><option value="resume">Reprise</option><option value="member_admission">Admission d'un membre</option><option value="member_removal">Retrait d'un membre</option><option value="partner_change">Changement de partenaire</option></select></label>
     <label>Clôture du vote<input type="datetime-local" required value={proposalClosesAt} onChange={event=>setProposalClosesAt(event.target.value)}/></label>
     <label className="tontine-proposal-payload">Détails (JSON)<textarea rows={4} required value={proposalPayload} onChange={event=>setProposalPayload(event.target.value)}/></label>
     {proposalError&&<p role="alert" className="tontine-create-error">{proposalError}</p>}
     <button type="submit" disabled={proposalBusy||!governancePolicy}>{proposalBusy?"Ouverture…":"Soumettre la proposition"}</button>
    </form>
   </div>}
   {active==="incidents"&&api&&selectedGroupId&&<form className="tontine-case-command" onSubmit={createCase}>
    <div><small>OUVERTURE D'UN DOSSIER TRAÇABLE</small><h4>Signaler un incident ou un litige</h4><p>La création ouvre un dossier d'investigation. Elle ne modifie aucun solde et ne déclenche aucun remboursement.</p></div>
    <label>Type de dossier<select value={caseType} onChange={event=>setCaseType(event.target.value)}><option value="incident">Incident opérationnel</option><option value="dispute">Contestation / litige</option><option value="risk_investigation">Investigation risque</option><option value="recovery">Recouvrement</option><option value="refund">Demande de remboursement</option></select></label>
    <label>Gravité<select value={caseSeverity} onChange={event=>setCaseSeverity(event.target.value)}><option value="low">Faible</option><option value="medium">Moyenne</option><option value="high">Élevée</option><option value="critical">Critique</option></select></label>
    <label>Référence financière<select value={caseReferenceKind} onChange={event=>setCaseReferenceKind(event.target.value)}><option value="contribution">Cotisation</option><option value="payout">Décaissement</option></select></label>
    <label>UUID de la référence<input value={caseReferenceId} onChange={event=>setCaseReferenceId(event.target.value)} placeholder="Obligatoire pour un remboursement"/></label>
    <label className="tontine-case-summary">Résumé du dossier<textarea required maxLength={1000} rows={3} value={caseSummary} onChange={event=>setCaseSummary(event.target.value)} placeholder="Décrire les faits observés sans données sensibles…"/></label>
    {caseError&&<p role="alert" className="tontine-create-error">{caseError}</p>}
    <button type="submit" disabled={caseBusy||!caseSummary.trim()||(caseType==="refund"&&!caseReferenceId.trim())}>{caseBusy?"Ouverture sécurisée…":"Ouvrir le dossier"}</button>
   </form>}
   {decisionError&&<p role="alert">{decisionError}</p>}{voteError&&<p role="alert" className="tontine-create-error">{voteError}</p>}{panelLoading?<p>Chargement des données PostgreSQL…</p>:panelError?<p role="alert">{panelError}</p>:panelRows.length===0?<p>{api&&selectedGroupId?"Aucun enregistrement pour ce groupe.":"Une session API authentifiée et un groupe actif sont nécessaires."}</p>:<div className="tontine-record-table"><table><thead><tr>{panelColumns.map(key=><th key={key}>{key.replaceAll("_"," ")}</th>)}{active==="members"&&<th>Décision</th>}{active==="governance"&&<th>Action</th>}</tr></thead><tbody>{panelRows.map((record,index)=><tr key={String(record.id??index)}>{panelColumns.map(key=><td key={key}>{record[key]===null||record[key]===undefined?"—":String(record[key])}</td>)}{active==="members"&&<td>{record.status==="pending"&&record.is_current_user===true?<div className="tontine-member-decisions"><button type="button" disabled={decisionBusy!==null} onClick={()=>void decideInvitation(String(record.id),"accept")}>{decisionBusy===record.id?"Traitement…":"Accepter"}</button><button type="button" disabled={decisionBusy!==null} onClick={()=>void decideInvitation(String(record.id),"decline")}>Refuser</button></div>:record.status==="pending"?"En attente du membre":"—"}</td>}{active==="governance"&&<td>{record.status==="open"?<div className="tontine-member-decisions"><button type="button" disabled={voteBusy!==null} onClick={()=>void castGovernanceVote(String(record.id),"approve")}>{voteBusy===record.id?"…":"Approuver"}</button><button type="button" disabled={voteBusy!==null} onClick={()=>void castGovernanceVote(String(record.id),"reject")}>Rejeter</button>{record.allow_abstention_snapshot===true&&<button type="button" disabled={voteBusy!==null} onClick={()=>void castGovernanceVote(String(record.id),"abstain")}>S'abstenir</button>}{typeof record.closes_at==="string"&&new Date(record.closes_at).getTime()<=Date.now()&&<button type="button" disabled={voteBusy!==null} onClick={()=>void finalizeGovernanceProposal(String(record.id))}>Finaliser</button>}</div>:String(record.status)}</td>}</tr>)}</tbody></table></div>}
   <span className="tontine-record-foot">{panelRows.length} enregistrement(s) affiché(s) · limite 100 · lecture seule</span>
  </article></div>}
  <section className="tontine-integrity"><div><small>GARDE-FOUS NON NÉGOCIABLES</small><b>Tenant isolation · PostgreSQL · idempotence · audit · outbox</b></div><p>Le renderer ne crée pas de groupe, ne collecte pas de cotisation et ne déclenche aucun payout. Les mutations seront activées uniquement après implémentation des routes authentifiées, des permissions, des transactions et des tests PostgreSQL live.</p></section>
 </div>;
}
