import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {TPayApi} from "./api.js";

type ProtectionTier={tier:string;premiumRateBps:number;coveredInstallments:number;gracePeriodDays:number;waitingPeriodDays:number;maxClaimMinor:string};
type ProtectionPolicy={id:string;version:string;state:string;currency:string;proposalOrigin:string;insurerPartnerId:string;insurerLicenseReference:string;insurerContractReference:string;insurerLicenseVerified:boolean;insurerContractVerified:boolean;effectiveFrom:string;policyHash:string;tiers:ProtectionTier[]};
type ApiBody={data?:{items?:ProtectionPolicy[];policyId?:string;state?:string};error?:{code?:string;message?:string}};
const defaultTiers:ProtectionTier[]=[
 {tier:"ESSENTIEL",premiumRateBps:100,coveredInstallments:1,gracePeriodDays:7,waitingPeriodDays:14,maxClaimMinor:"10000000"},
 {tier:"EQUILIBRE",premiumRateBps:200,coveredInstallments:2,gracePeriodDays:14,waitingPeriodDays:14,maxClaimMinor:"20000000"},
 {tier:"RENFORCE",premiumRateBps:300,coveredInstallments:3,gracePeriodDays:21,waitingPeriodDays:30,maxClaimMinor:"30000000"}
];
const validUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function CommunityTontineProtectionPanel({api,groupId}:{api:TPayApi|null;groupId:string}){
 const [items,setItems]=useState<ProtectionPolicy[]>([]);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const [version,setVersion]=useState("v1");
 const [insurerPartnerId,setInsurerPartnerId]=useState("");
 const [licenseReference,setLicenseReference]=useState("");
 const [contractReference,setContractReference]=useState("");
 const [licenseEvidenceReference,setLicenseEvidenceReference]=useState("");
 const [licenseEvidenceSha256,setLicenseEvidenceSha256]=useState("");
 const [contractEvidenceReference,setContractEvidenceReference]=useState("");
 const [contractEvidenceSha256,setContractEvidenceSha256]=useState("");
 const [effectiveFrom,setEffectiveFrom]=useState(()=>new Date(Date.now()+60000).toISOString().slice(0,16));
 const base="/v1/tontine/groups/"+encodeURIComponent(groupId)+"/protection-policies";
 const load=useCallback(async()=>{
  if(!api||!groupId){setItems([]);return;}
  setLoading(true);setError(null);
  try{
   const response=await api.request(base);
   const body=await response.json() as ApiBody;
   if(!response.ok)throw new Error(body.error?.code??"TONTINE_PROTECTION_READ_HTTP_"+response.status);
   setItems(body.data?.items??[]);
  }catch(e){setError(e instanceof Error?e.message:"TONTINE_PROTECTION_READ_FAILED");}
  finally{setLoading(false);}
 },[api,base,groupId]);
 useEffect(()=>{void load();},[load]);
 const command=useCallback(async(path:string,payload:Record<string,unknown>)=>{
  if(!api||busy)return;
  setBusy(true);setError(null);setNotice(null);
  try{
   const response=await api.command(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const body=await response.json() as ApiBody;
   if(!response.ok)throw new Error(body.error?.code??"TONTINE_PROTECTION_COMMAND_HTTP_"+response.status);
   setNotice("Proposition enregistrée. La couverture reste inactive jusqu'à vérification de l'assureur et approbation indépendante.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"TONTINE_PROTECTION_COMMAND_FAILED");}
  finally{setBusy(false);}
 },[api,busy,load]);
 const create=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!validUuid(insurerPartnerId)){setError("L'identifiant partenaire assureur doit être un UUID valide.");return;}
  void command(base,{version,insurerPartnerId,insurerLicenseReference:licenseReference,insurerContractReference:contractReference,currency:"XOF",effectiveFrom:new Date(effectiveFrom).toISOString(),tiers:defaultTiers});
 };
 if(!api)return <section className="tontine-protection"><p>Une session API authentifiée est requise. Aucun contrat ni montant fictif n'est affiché.</p></section>;
 return <section className="tontine-protection" aria-busy={loading||busy}>
  <header><small>CT-042 · CONTINUITÉ DU CYCLE</small><h3>Protection facultative de la tontine</h3><p>Trois gammes indicatives, consentement explicite et décision réservée à l'assureur agréé. T.Pay orchestre le parcours sans porter le risque.</p></header>
  <div className="tontine-protection-tiers">
   {defaultTiers.map(tier=><article key={tier.tier}><small>{tier.tier}</small><strong>{tier.premiumRateBps/100}%</strong><span>par échéance</span><p>Plafond indicatif : {tier.coveredInstallments} échéance(s)</p><p>Grâce : {tier.gracePeriodDays} j · Attente : {tier.waitingPeriodDays} j</p></article>)}
  </div>
  <p className="tontine-protection-warning">Tarifs non actuariels et non commercialisables. Aucune prime n'est prélevée. Activation impossible sans agrément, contrat signé et vérification documentée.</p>
  {error&&<p role="alert" className="tontine-protection-error">{error}</p>}
  {notice&&<p role="status" className="tontine-protection-notice">{notice}</p>}
  <form onSubmit={create} className="tontine-protection-form">
   <h4>Proposer une police au groupe</h4>
   <label>Version<input required maxLength={80} value={version} onChange={e=>setVersion(e.target.value)}/></label>
   <label>UUID de l'assureur partenaire<input required value={insurerPartnerId} onChange={e=>setInsurerPartnerId(e.target.value)} placeholder="UUID du partenaire agréé"/></label>
   <label>Référence d'agrément<input required value={licenseReference} onChange={e=>setLicenseReference(e.target.value)}/></label>
   <label>Référence du contrat signé<input required value={contractReference} onChange={e=>setContractReference(e.target.value)}/></label>
   <label>Date d'effet proposée<input type="datetime-local" required value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
   <button type="submit" disabled={busy||!version.trim()||!licenseReference.trim()||!contractReference.trim()}>{busy?"Enregistrement…":"Créer une proposition (brouillon)"}</button>
  </form>
  <div className="tontine-protection-register">
   <div><h4>Registre des polices</h4><button type="button" onClick={()=>void load()} disabled={loading}>Actualiser</button></div>
   {loading&&items.length===0?<p>Chargement du registre PostgreSQL…</p>:items.length===0?<p>Aucune police enregistrée pour ce groupe.</p>:<div className="tontine-record-table"><table><thead><tr><th>Version</th><th>État</th><th>Assureur vérifié</th><th>Contrat vérifié</th><th>Hash</th><th>Action</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.version}</td><td>{item.state}</td><td>{item.insurerLicenseVerified?"Oui":"En attente"}</td><td>{item.insurerContractVerified?"Oui":"En attente"}</td><td><code>{item.policyHash.slice(0,12)}…</code></td><td>{item.state==="DRAFT"&&!item.insurerLicenseVerified&&!item.insurerContractVerified?<div className="tontine-protection-evidence">
<label>Référence privée du justificatif d’agrément<input aria-label="Référence privée du justificatif d’agrément" value={licenseEvidenceReference} onChange={e=>setLicenseEvidenceReference(e.target.value)} placeholder="Référence du coffre documentaire"/></label>
<label>SHA-256 du justificatif d’agrément<input aria-label="SHA-256 du justificatif d’agrément" value={licenseEvidenceSha256} onChange={e=>setLicenseEvidenceSha256(e.target.value)} placeholder="64 caractères hexadécimaux" maxLength={64}/></label>
<label>Référence privée du contrat signé<input aria-label="Référence privée du contrat signé" value={contractEvidenceReference} onChange={e=>setContractEvidenceReference(e.target.value)} placeholder="Référence du coffre documentaire"/></label>
<label>SHA-256 du contrat signé<input aria-label="SHA-256 du contrat signé" value={contractEvidenceSha256} onChange={e=>setContractEvidenceSha256(e.target.value)} placeholder="64 caractères hexadécimaux" maxLength={64}/></label>
<button type="button" disabled={busy||!licenseEvidenceReference.trim()||!/^[a-f0-9]{64}$/i.test(licenseEvidenceSha256)||!contractEvidenceReference.trim()||!/^[a-f0-9]{64}$/i.test(contractEvidenceSha256)} onClick={()=>void command(base+"/"+encodeURIComponent(item.id)+"/verify-insurer",{licenseEvidenceReference,licenseEvidenceSha256,contractEvidenceReference,contractEvidenceSha256})}>Enregistrer la vérification indépendante</button>
</div>:item.state==="DRAFT"&&item.insurerLicenseVerified&&item.insurerContractVerified?<button type="button" disabled={busy} onClick={()=>void command(base+"/"+encodeURIComponent(item.id)+"/approve",{})}>Soumettre au contrôle maker/checker</button>:item.state==="APPROVED"&&item.insurerLicenseVerified&&item.insurerContractVerified?<button type="button" disabled={busy} onClick={()=>void command(base+"/"+encodeURIComponent(item.id)+"/activate",{})}>Activer la version</button>:<span>Vérifications requises</span>}</td></tr>)}</tbody></table></div>}
  </div>
 </section>;
}
