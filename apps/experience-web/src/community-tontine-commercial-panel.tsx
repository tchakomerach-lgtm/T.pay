import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {TPayApi} from "./api.js";

type Row=Record<string,unknown>;
type ApiBody={data?:{items?:Row[];policy?:Row|null;campaignId?:string;state?:string;grantId?:string;redemption?:Row};error?:{message?:string}};
const recipients=["TPAY","PARTNER","AGENT","RESERVE","TAX","OPTIONAL_SERVICE"] as const;
const channels=["LINK","QR","USSD","AGENT","SOCIAL"] as const;
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const localInput=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
export function CommunityTontineCommercialPanel({api,groupId}:{api:TPayApi|null;groupId:string}){
 const [policies,setPolicies]=useState<Row[]>([]);
 const [roles,setRoles]=useState<Row[]>([]);
 const [campaigns,setCampaigns]=useState<Row[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const [version,setVersion]=useState("v1");
 const [level,setLevel]=useState("CONTRIBUTION");
 const [payer,setPayer]=useState("MEMBER");
 const [memberShare,setMemberShare]=useState("10000");
 const [effectiveFrom,setEffectiveFrom]=useState(()=>localInput(new Date(Date.now()+60000)));
 const [rates,setRates]=useState<Record<string,string>>({TPAY:"0",PARTNER:"0",AGENT:"0",RESERVE:"0",TAX:"0",OPTIONAL_SERVICE:"0"});
 const [enabled,setEnabled]=useState<Record<string,boolean>>({TPAY:true,PARTNER:false,AGENT:false,RESERVE:false,TAX:false,OPTIONAL_SERVICE:false});
 const [reason,setReason]=useState("");
 const [roleActor,setRoleActor]=useState("");
 const [roleName,setRoleName]=useState("PRESIDENT");
 const [rolePermissions,setRolePermissions]=useState("member.invite");
 const [roleFrom,setRoleFrom]=useState(()=>localInput(new Date()));
 const [roleUntil,setRoleUntil]=useState(()=>localInput(new Date(Date.now()+86400000)));
 const [campaignCode,setCampaignCode]=useState("");
 const [campaignTitle,setCampaignTitle]=useState("");
 const [campaignStart,setCampaignStart]=useState(()=>localInput(new Date(Date.now()+60000)));
 const [campaignEnd,setCampaignEnd]=useState(()=>localInput(new Date(Date.now()+7*86400000)));
 const [reward,setReward]=useState("0");
 const [maxRedemptions,setMaxRedemptions]=useState("1");
 const [budget,setBudget]=useState("0");
 const [campaignChannels,setCampaignChannels]=useState<string[]>(["LINK","QR"]);
 const base="/v1/tontine/groups/"+encodeURIComponent(groupId);
 const load=useCallback(async()=>{
  if(!api||!groupId){setPolicies([]);setRoles([]);setCampaigns([]);return;}
  setLoading(true);setError(null);
  try{
   const [p,r,c]=await Promise.all([
    api.request(base+"/commission-policies?state=all&level=CONTRIBUTION&currency=XOF"),
    api.request(base+"/roles"),
    api.request(base+"/promotions")
   ]);
   for(const response of [p,r,c])if(!response.ok)throw new Error("TONTINE_COMMERCIAL_READ_HTTP_"+response.status);
   const [pb,rb,cb]=await Promise.all([p.json(),r.json(),c.json()]) as [ApiBody,ApiBody,ApiBody];
   setPolicies(pb.data?.items??[]);setRoles(rb.data?.items??[]);setCampaigns(cb.data?.items??[]);
  }catch(e){setError(e instanceof Error?e.message:"TONTINE_COMMERCIAL_READ_FAILED");}
  finally{setLoading(false);}
 },[api,groupId,base]);
 useEffect(()=>{void load();},[load]);
 const command=useCallback(async(key:string,path:string,payload:Row)=>{
  if(!api||busy)return;
  setBusy(key);setError(null);setNotice(null);
  try{
   const response=await api.command(path,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":crypto.randomUUID()},body:JSON.stringify(payload)});
   const body=await response.json() as ApiBody;
   if(!response.ok)throw new Error(body.error?.message??"TONTINE_COMMERCIAL_COMMAND_HTTP_"+response.status);
   setNotice("Commande enregistrée. Vérification du registre PostgreSQL…");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"TONTINE_COMMERCIAL_COMMAND_FAILED");}
  finally{setBusy(null);}
 },[api,busy,load]);
 const createPolicy=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const components=recipients.map(recipient=>({recipient,rateBps:Number(rates[recipient]??0),enabled:enabled[recipient]===true}));
  if(components.some(x=>!Number.isInteger(x.rateBps)||x.rateBps<0||x.rateBps>10000)){setError("Chaque taux doit être un entier entre 0 et 10 000 points de base.");return;}
  await command("policy-create",base+"/commission-policies",{version,transactionLevel:level,currency:"XOF",payer,memberShareBps:Number(memberShare),effectiveFrom:new Date(effectiveFrom).toISOString(),components});
 };
 const createRole=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!uuid(roleActor)){setError("L'identifiant du membre doit être un UUID valide.");return;}
  await command("role-create",base+"/roles",{actorId:roleActor,role:roleName,permissions:rolePermissions.split(",").map(x=>x.trim()).filter(Boolean),validFrom:new Date(roleFrom).toISOString(),expiresAt:new Date(roleUntil).toISOString()});
 };
 const createCampaign=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(campaignChannels.length===0){setError("Sélectionner au moins un canal de diffusion.");return;}
  await command("campaign-create",base+"/promotions",{code:campaignCode,title:campaignTitle,startsAt:new Date(campaignStart).toISOString(),endsAt:new Date(campaignEnd).toISOString(),currency:"XOF",rewardMinor:reward,maxRedemptions:Number(maxRedemptions),maxBudgetMinor:budget,allowedChannels:campaignChannels});
 };
 const approvePolicy=(id:string)=>command("policy-approve-"+id,base+"/commission-policies/"+encodeURIComponent(id)+"/approve",{reason});
 const activatePolicy=(id:string)=>command("policy-activate-"+id,base+"/commission-policies/"+encodeURIComponent(id)+"/activate",{reason});
 const approveCampaign=(id:string)=>command("campaign-approve-"+id,base+"/promotions/"+encodeURIComponent(id)+"/approve",{});
 const activateCampaign=(id:string)=>command("campaign-activate-"+id,base+"/promotions/"+encodeURIComponent(id)+"/activate",{});
 const revokeRole=(id:string)=>command("role-revoke-"+id,base+"/roles/"+encodeURIComponent(id)+"/revoke",{});
 const toggleChannel=(channel:string)=>setCampaignChannels(current=>current.includes(channel)?current.filter(x=>x!==channel):[...current,channel]);
 if(!api)return <section className="tontine-commercial"><p>Une session API authentifiée est nécessaire pour gérer les commissions, les rôles et les promotions.</p></section>;
 return <section className="tontine-commercial" aria-busy={loading}>
  <header className="tontine-commercial-header"><div><small>COMMERCIAL GOVERNANCE · XOF</small><h3>Commissions, administration & croissance</h3><p>Les règles sont versionnées, les délégations expirent et les campagnes consomment un budget réservé côté PostgreSQL. Aucune récompense n'est payée par ces écrans.</p></div><button type="button" onClick={()=>void load()} disabled={loading}>↻ Actualiser</button></header>
  {error&&<p className="tontine-create-error" role="alert">{error}</p>}{notice&&<p className="tontine-commercial-notice" role="status">{notice}</p>}
  <div className="tontine-commercial-grid">
   <article className="tontine-feature-card">
    <small>01 · TARIFICATION VERSIONNÉE</small><h4>Créer une politique de commission</h4>
    <p>Les taux sont exprimés en points de base (100 = 1 %). Aucun taux commercial n'est prérempli comme règle officielle.</p>
    <form onSubmit={createPolicy} className="tontine-commercial-form">
     <label>Version<input required maxLength={80} value={version} onChange={e=>setVersion(e.target.value)}/></label>
     <label>Niveau de transaction<select value={level} onChange={e=>setLevel(e.target.value)}><option value="CONTRIBUTION">Cotisation</option><option value="BENEFICIARY_PAYOUT">Décaissement bénéficiaire</option><option value="TRANSFER">Transfert</option><option value="OPTIONAL_SERVICE">Service optionnel</option></select></label>
     <label>Payeur<select value={payer} onChange={e=>{setPayer(e.target.value);setMemberShare(e.target.value==="MEMBER"?"10000":e.target.value==="BENEFICIARY"?"0":"5000");}}><option value="MEMBER">Membre</option><option value="BENEFICIARY">Bénéficiaire</option><option value="SPLIT">Répartition explicite</option></select></label>
     <label>Part membre (points de base)<input type="number" min="0" max="10000" required value={memberShare} onChange={e=>setMemberShare(e.target.value)} disabled={payer!=="SPLIT"}/></label>
     <label>Début d'application<input type="datetime-local" required value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
     <div className="tontine-commercial-rates">{recipients.map(recipient=><div key={recipient}><label><input type="checkbox" checked={enabled[recipient]===true} onChange={e=>setEnabled(old=>({...old,[recipient]:e.target.checked}))}/>{recipient}</label><input aria-label={"Taux "+recipient+" en points de base"} type="number" min="0" max="10000" value={rates[recipient]??"0"} onChange={e=>setRates(old=>({...old,[recipient]:e.target.value}))}/></div>)}</div>
     <button type="submit" disabled={busy!==null||!version.trim()||!effectiveFrom}>{busy==="policy-create"?"Enregistrement…":"Créer en brouillon"}</button>
    </form>
   </article>
   <article className="tontine-feature-card">
    <small>02 · MAKER / CHECKER</small><h4>Politiques et approbations</h4>
    <label className="tontine-commercial-reason">Motif d'approbation / activation<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Justification obligatoire"/></label>
    {policies.length===0?<p>Aucune politique trouvée pour ce groupe.</p>:policies.map(p=><div className="tontine-commercial-record" key={String(p.id)}><div><b>{String(p.version)} · {String(p.transaction_level)}</b><span>{String(p.state)} · {String(p.currency)} · {String(p.policy_hash).slice(0,12)}…</span></div><div className="tontine-commercial-actions">{p.state==="DRAFT"&&<button type="button" disabled={busy!==null||!reason.trim()} onClick={()=>void approvePolicy(String(p.id))}>Approuver</button>}{p.state==="APPROVED"&&<button type="button" disabled={busy!==null||!reason.trim()} onClick={()=>void activatePolicy(String(p.id))}>Activer</button>}</div></div>)}
   </article>
   <article className="tontine-feature-card">
    <small>03 · ADMINISTRATION DÉLÉGUÉE</small><h4>Attribuer un rôle temporaire</h4>
    <form onSubmit={createRole} className="tontine-commercial-form">
     <label>UUID du membre<input required value={roleActor} onChange={e=>setRoleActor(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label>
     <label>Rôle<select value={roleName} onChange={e=>setRoleName(e.target.value)}>{["PRESIDENT","TREASURER","SECRETARY","COLLECTOR","CONTROLLER","MEDIATOR","MEMBER"].map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Permissions (séparées par virgules)<input value={rolePermissions} onChange={e=>setRolePermissions(e.target.value)}/></label>
     <label>Valide à partir du<input type="datetime-local" required value={roleFrom} onChange={e=>setRoleFrom(e.target.value)}/></label>
     <label>Expire le<input type="datetime-local" required min={roleFrom} value={roleUntil} onChange={e=>setRoleUntil(e.target.value)}/></label>
     <button type="submit" disabled={busy!==null||!roleActor.trim()||!rolePermissions.trim()}>Attribuer le rôle</button>
    </form>
    <h5>Registre des délégations</h5>{roles.length===0?<p>Aucune délégation enregistrée.</p>:roles.map(r=><div className="tontine-commercial-record" key={String(r.id)}><div><b>{String(r.role)} · {String(r.actor_id).slice(0,8)}</b><span>{String(r.valid_from)} → {String(r.expires_at)} · {r.revoked_at?"Révoqué":"Historisé"}</span></div>{!r.revoked_at&&<button type="button" disabled={busy!==null} onClick={()=>void revokeRole(String(r.id))}>Révoquer</button>}</div>)}
   </article>
   <article className="tontine-feature-card">
    <small>04 · ACQUISITION COMMUNAUTAIRE</small><h4>Créer une campagne promotionnelle</h4>
    <form onSubmit={createCampaign} className="tontine-commercial-form">
     <label>Code<input required minLength={3} maxLength={64} value={campaignCode} onChange={e=>setCampaignCode(e.target.value.toUpperCase())}/></label>
     <label>Nom de la campagne<input required maxLength={160} value={campaignTitle} onChange={e=>setCampaignTitle(e.target.value)}/></label>
     <label>Début<input type="datetime-local" required value={campaignStart} onChange={e=>setCampaignStart(e.target.value)}/></label>
     <label>Fin<input type="datetime-local" required min={campaignStart} value={campaignEnd} onChange={e=>setCampaignEnd(e.target.value)}/></label>
     <label>Récompense unitaire (XOF)<input type="number" min="0" required value={reward} onChange={e=>setReward(e.target.value)}/></label>
     <label>Nombre maximum de parrainages<input type="number" min="1" max="1000000" required value={maxRedemptions} onChange={e=>setMaxRedemptions(e.target.value)}/></label>
     <label>Budget maximum (XOF)<input type="number" min="0" required value={budget} onChange={e=>setBudget(e.target.value)}/></label>
     <div className="tontine-commercial-channels">{channels.map(channel=><label key={channel}><input type="checkbox" checked={campaignChannels.includes(channel)} onChange={()=>toggleChannel(channel)}/>{channel}</label>)}</div>
     <button type="submit" disabled={busy!==null||!campaignCode.trim()||!campaignTitle.trim()}>Créer la campagne en brouillon</button>
    </form>
   </article>
   <article className="tontine-feature-card">
    <small>05 · CYCLE DE CAMPAGNE</small><h4>Approbation et activation</h4>
    {campaigns.length===0?<p>Aucune campagne enregistrée.</p>:campaigns.map(c=><div className="tontine-commercial-record" key={String(c.id)}><div><b>{String(c.code)} · {String(c.title)}</b><span>{String(c.state)} · {String(c.accepted_redemptions)}/{String(c.max_redemptions)} · Budget réservé {String(c.committed_budget_minor)}/{String(c.max_budget_minor)} XOF</span></div><div className="tontine-commercial-actions">{c.state==="DRAFT"&&<button type="button" disabled={busy!==null} onClick={()=>void approveCampaign(String(c.id))}>Approuver</button>}{c.state==="APPROVED"&&<button type="button" disabled={busy!==null} onClick={()=>void activateCampaign(String(c.id))}>Activer</button>}</div></div>)}
   </article>
  </div>
  <footer className="tontine-commercial-foot">Contrôles : organisation + groupe · maker/checker · permissions temporelles · quotas atomiques · idempotence · audit. La récompense ambassadeur reste soumise à la première cotisation réglée par Financial Core, à la revue anti-fraude et à un décaissement séparément approuvé.</footer>
 </section>;
}
