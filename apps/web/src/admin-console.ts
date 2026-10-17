export type AdminSection="dashboard"|"runtime"|"privileged"|"recovery"|"pam"|"audit";
const sections:[AdminSection,string,string][]=[
["dashboard","Vue d'ensemble","État de confiance, services et risques"],
["runtime","Mode système","Maintenance, lecture seule et dégradé"],
["privileged","Identités privilégiées","JIT, assurance et expiration"],
["recovery","Cyber-résilience","Recovery plane et restauration"],
["pam","PAM / sessions","Broker, sessions et actions privilégiées"],
["audit","Audit","Événements administratifs traçables"]
];
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
export function renderAdminConsole(section:AdminSection="dashboard"):string{
 const active=sections.some(x=>x[0]===section)?section:"dashboard";
 return `<div class="admin-shell">
 <aside class="admin-sidebar"><div class="admin-brand"><span class="brand-mark">↑</span><div><b>T<span>.pay</span></b><small>CONTROL PLANE</small></div></div>
 <div class="admin-classification">L4/L5 · PRIVILEGED</div><nav aria-label="Administration Super Admin">
 ${sections.map(([id,label,desc])=>`<a class="admin-nav ${id===active?"active":""}" href="#admin/${id}"><strong>${id==="dashboard"?"◈":id==="runtime"?"◉":id==="privileged"?"♙":id==="recovery"?"↻":id==="pam"?"⌁":"≡"}</strong><span><b>${label}</b><small>${desc}</small></span></a>`).join("")}
 </nav><div class="admin-lock"><b>Trust boundary</b><span>Actions critiques : step-up + autorisation serveur + audit. Les secrets et clés privées ne sont jamais affichés.</span></div></aside>
 <main class="admin-main"><header class="admin-top"><div><span class="admin-eyebrow">T.Pay Super Admin</span><h1>${esc(sections.find(x=>x[0]===active)?.[1]??"Console")}</h1></div><div class="admin-status" id="admin-status">Vérification de confiance…</div></header>
 <section id="admin-content" class="admin-content"><div class="admin-loading">Chargement du plan de contrôle…</div></section></main></div>`;
}
function api(path:string,init:RequestInit={}):Promise<Response>{return fetch(path,{...init,headers:{"accept":"application/json",...(init.body?{"content-type":"application/json"}:{}),...(init.headers??{})},credentials:"same-origin"});}
function card(title:string,value:string,meta:string,kind="normal"){return `<article class="admin-metric ${kind}"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(meta)}</small></article>`;}
async function load(section:AdminSection,root:HTMLElement){
 const content=root.querySelector<HTMLElement>("#admin-content");
 const status=root.querySelector<HTMLElement>("#admin-status");
 if(!content||!status)return;
 try{
  const r=await api("/v1/admin/overview");
  const j=await r.json() as any;
  if(!r.ok){
   if(r.status===401){
    content.innerHTML=`<div class="admin-login admin-panel"><span class="admin-eyebrow">IDENTITÉ PRIVILÉGIÉE</span><h2>Connexion sécurisée</h2><p>Connectez-vous avec votre compte T.Pay. Les actions Super Admin exigent ensuite un compte L4/L5 et une authentification WebAuthn step-up.</p><form id="admin-login-form"><label for="admin-login-identifier">Identifiant</label><input id="admin-login-identifier" name="loginIdentifier" autocomplete="username" required maxlength="254"/><label for="admin-login-password">Mot de passe</label><input id="admin-login-password" name="password" type="password" autocomplete="current-password" required minlength="1" maxlength="1024"/><button type="submit">Se connecter</button><p id="admin-login-error" role="status"></p></form></div>`;
    status.textContent="Session requise";
    const form=root.querySelector<HTMLFormElement>("#admin-login-form");
    form?.addEventListener("submit",async event=>{
     event.preventDefault();
     const submit=form.querySelector<HTMLButtonElement>('button[type="submit"]');
     const error=root.querySelector<HTMLElement>("#admin-login-error");
     if(submit)submit.disabled=true;
     if(error)error.textContent="Vérification…";
     try{
      const fd=new FormData(form);
      const lr=await api("/v1/auth/login",{method:"POST",body:JSON.stringify({loginIdentifier:String(fd.get("loginIdentifier")??""),password:String(fd.get("password")??"")})});
      const lj=await lr.json() as any;
      if(!lr.ok||!lj.data?.csrfToken)throw new Error(lj?.error?.message??"AUTHENTICATION_FAILED");
      sessionStorage.setItem("tpay.csrf",String(lj.data.csrfToken));
      form.reset();
      await load(section,root);
     }catch(e){if(error)error.textContent=e instanceof Error?e.message:"AUTHENTICATION_FAILED";}
     finally{if(submit)submit.disabled=false;}
    });
    return;
   }
   content.innerHTML=`<div class="admin-denied"><b>403 · Console verrouillée</b><p>Cette interface exige une identité privilégiée L4/L5 et une session WebAuthn step-up.</p><button id="admin-stepup">Activer le step-up FIDO2 / passkey</button></div>`;
   status.textContent="Step-up privilégié requis";
   const btn=root.querySelector<HTMLButtonElement>("#admin-stepup");
   if(btn){
    btn.onclick=async()=>{
     try{
      const csrf=sessionStorage.getItem("tpay.csrf");
      if(!csrf)throw new Error("CSRF_SESSION_MISSING");
      const ch=await api("/v1/admin/auth/webauthn/challenge",{method:"POST",headers:{"x-csrf-token":csrf}});
      const cj=await ch.json() as any;
      if(!ch.ok)throw new Error("CHALLENGE_DENIED");
      const b64=(v:string)=>{const pad="=".repeat((4-v.length%4)%4),s=(v+pad).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(s),x=>x.charCodeAt(0));};
      const browser=globalThis as any;
      if(!browser.PublicKeyCredential||!browser.navigator?.credentials)throw new Error("WEBAUTHN_UNSUPPORTED");
      const cred=await browser.navigator.credentials.get({publicKey:{challenge:b64(cj.data.challenge),rpId:cj.data.rpId,userVerification:"required",timeout:120000}});
      if(!cred)throw new Error("WEBAUTHN_CANCELLED");
      const response=(cred as any).response;
      const enc=(x:ArrayBuffer)=>{const bytes=new Uint8Array(x);let s="";for(const v of bytes)s+=String.fromCharCode(v);return btoa(s).split("+").join("-").split("/").join("_").replace(/=+$/,"");};
      const vr=await api("/v1/admin/auth/webauthn/step-up",{method:"POST",headers:{"x-csrf-token":csrf},body:JSON.stringify({challengeId:cj.data.challengeId,credentialId:(cred as any).id,clientDataJSON:enc(response.clientDataJSON),authenticatorData:enc(response.authenticatorData),signature:enc(response.signature)})});
      if(!vr.ok)throw new Error("WEBAUTHN_VERIFY_FAILED");
      await load(section,root);
     }catch(e){status.textContent=e instanceof Error?e.message:"WEBAUTHN_STEP_UP_FAILED";}
    };
   }
   return;
  }
  status.textContent="● Plan de contrôle connecté";
  const runtime=j.data.runtime;
  let posture:any=null;
  if(section==="recovery"||section==="pam"){
   const pr=await api("/v1/admin/security-posture");
   const pj=await pr.json() as any;
   if(!pr.ok)throw new Error(pj?.error?.message??"SECURITY_POSTURE_UNAVAILABLE");
   posture=pj.data;
  }
  if(section==="dashboard") content.innerHTML=`<div class="admin-grid">${card("Mode système",runtime.mode,"Version "+runtime.version,runtime.mode==="normal"?"good":"critical")}${card("Identité privilégiée",j.data.privileged?.[0]?.level??"—","assurance contrôlée")}${card("Demandes runtime",String(j.data.pendingRequests),"requièrent 2 approbateurs")}${card("Trust model","L4/L5","deny-by-default","good")}</div><div class="admin-panel"><h2>État de confiance</h2><div class="trust-row"><span>Runtime</span><b>${esc(runtime.mode)}</b></div><div class="trust-row"><span>Contrôle d'accès</span><b>Step-up requis</b></div><div class="trust-row"><span>Actions critiques</span><b>Audit + double approbation</b></div><div class="trust-row"><span>Clés privées</span><b>Hors console</b></div></div>`;
  else if(section==="runtime") content.innerHTML=`<div class="admin-panel"><div class="panel-head"><div><h2>Mode système</h2><p>Le mode courant est autoritatif côté serveur. Toute modification passe par une demande expirante et deux approbateurs distincts.</p></div><span class="mode-pill">${esc(runtime.mode)}</span></div><div class="runtime-options">${["normal","degraded","readonly","maintenance"].map(m=>`<button data-runtime="${m}" ${m===runtime.mode?"disabled":""}>${m}</button>`).join("")}</div><p class="admin-note">Maintenance bloque les écritures applicatives ; les routes d'administration restent accessibles uniquement à une identité privilégiée. Aucun contournement du ledger n'est permis.</p></div>`;
  else if(section==="privileged") content.innerHTML=`<div class="admin-panel"><h2>Identités privilégiées actives</h2><div class="admin-table"><div class="tr th"><span>Niveau</span><span>Assurance</span><span>Expiration</span><span>État</span></div>${(j.data.privileged??[]).map((x:any)=>`<div class="tr"><span>${esc(x.level)}</span><span>${esc(x.assurance)}</span><span>${esc(x.expiresAt)}</span><span>ACTIVE</span></div>`).join("")||"<div class=\"admin-empty\">Aucune identité L4/L5 active.</div>"}</div></div>`;
  else if(section==="audit"){
   const ar=await api("/v1/admin/audit?limit=25");const aj=await ar.json() as any;
   content.innerHTML=`<div class="admin-panel"><h2>Journal administratif</h2><div class="admin-table"><div class="tr th"><span>Action</span><span>Cible</span><span>Acteur</span><span>Date</span></div>${(aj.data?.items??[]).map((x:any)=>`<div class="tr"><span>${esc(x.action)}</span><span>${esc(x.targetType)} ${esc(x.targetId??"")}</span><span>${esc(x.actorId??"system")}</span><span>${esc(x.occurredAt)}</span></div>`).join("")||"<div class=\"admin-empty\">Aucun événement.</div>"}</div></div>`;
  }else if(section==="recovery"){
   const states=(posture.recoveryRuns??[]).map((x:any)=>\`<div class="admin-record"><div><b>\${esc(x.incidentId)}</b><small>\${esc(x.lastTransitionAt)}</small></div><span class="admin-state \${x.state==="TRUSTED"||x.state==="MONITORED"?"good":"warn"}">\${esc(x.state)}</span><small>Preuve SHA-256 · \${esc(x.evidenceDigestPrefix)}…</small></div>\`).join("")||'<div class="admin-empty">Aucun run de récupération enregistré.</div>';
   const planes=(posture.recoveryCheckpoints??[]).map((x:any)=>\`<div class="admin-record"><div><b>\${esc(x.plane)}</b><small>Run \${esc(x.recoveryRunId.slice(0,8))}…</small></div><span class="admin-state \${x.verified?"good":"warn"}">\${x.verified?"VÉRIFIÉ":"NON VÉRIFIÉ"}</span><small>\${esc(x.verifiedAt??"Aucune date de vérification")}</small></div>\`).join("")||'<div class="admin-empty">Aucun checkpoint. Aucune restauration ne peut être lancée depuis cette vue.</div>';
   const roots=(posture.rootOperations??[]).map((x:any)=>\`<div class="admin-record"><div><b>\${esc(x.operation)}</b><small>\${esc(x.createdAt)}</small></div><span class="admin-state \${x.status==="EXECUTED"?"good":"warn"}">\${esc(x.status)}</span><small>Quorum \${esc(String(x.quorumRequired))} · digest \${esc(x.digestPrefix)}…</small></div>\`).join("")||'<div class="admin-empty">Aucune opération Root Trust.</div>';
   content.innerHTML=\`<div class="admin-grid">\${card("Runs de récupération",String(posture.recoveryRuns?.length??0),"10 derniers runs observés")}\${card("Checkpoints",String(posture.recoveryCheckpoints?.length??0),"état enregistré")}\${card("Opérations Root Trust",String(posture.rootOperations?.length??0),"10 dernières opérations")}\${card("Findings élevés/critiques",String(posture.openHighFindings),"ouverts",posture.openHighFindings?"critical":"good")}</div><div class="admin-panel"><div class="panel-head"><div><h2>Orchestrateur de récupération</h2><p>Ordre requis : Trust → Identity → Security → Ledger → Payment → Wallet → Core API → Org Data → Media. Vue en lecture seule ; aucune réouverture financière depuis cette interface.</p></div><button class="admin-refresh" data-refresh>Actualiser</button></div><div class="admin-records">\${states}</div></div><div class="admin-panel admin-spaced"><h2>Checkpoints de récupération</h2><p>Un checkpoint non vérifié n'est pas une preuve de restauration.</p><div class="admin-records">\${planes}</div></div><div class="admin-panel admin-spaced"><h2>Journal Root Trust</h2><div class="admin-records">\${roots}</div></div>\`;
  }else if(section==="pam"){
   const sessions=(posture.activeSessions??[]).map((x:any)=>\`<div class="admin-record"><div><b>\${esc(x.resource)} · \${esc(x.action)}</b><small>Démarrée \${esc(x.startedAt)}</small></div><span class="admin-state warn">ACTIVE</span><small>Expire \${esc(x.expiresAt)} · commandes auditées : \${esc(String(x.commandCount))}</small></div>\`).join("")||'<div class="admin-empty">Aucune session privilégiée active.</div>';
   const redteam=(posture.redTeamRuns??[]).map((x:any)=>\`<div class="admin-record"><div><b>\${esc(x.scenario)}</b><small>\${esc(x.scope)} · \${esc(x.startedAt)}</small></div><span class="admin-state \${x.status==="PASSED"?"good":x.status==="FAILED"?"critical":"warn"}">\${esc(x.status)}</span><small>Preuve \${esc(x.evidenceDigestPrefix??"non disponible")}</small></div>\`).join("")||'<div class="admin-empty">Aucun exercice Red Team enregistré.</div>';
   content.innerHTML=\`<div class="admin-grid">\${card("Identités L4/L5",String(posture.activePrivilegedIdentities),"actives et non expirées")}\${card("Sessions PAM",String(posture.activePrivilegedSessions),"sessions non terminées")}\${card("Findings ouverts",String(posture.openHighFindings),"sévérité HIGH / CRITICAL",posture.openHighFindings?"critical":"good")}\${card("Exercices Red Team",String(posture.redTeamRuns?.length??0),"10 derniers runs")}</div><div class="admin-panel"><div class="panel-head"><div><h2>Sessions privilégiées actives</h2><p>Surveillance en lecture seule. La terminaison doit passer par le broker PAM autoritatif, jamais par une action simulée du navigateur.</p></div><button class="admin-refresh" data-refresh>Actualiser</button></div><div class="admin-records">\${sessions}</div></div><div class="admin-panel admin-spaced"><h2>Exercices Red Team</h2><p>Le statut PASSED doit être accompagné d'une preuve vérifiable et d'une couverture définie.</p><div class="admin-records">\${redteam}</div></div>\`;
  }else content.innerHTML=\`<div class="admin-panel"><h2>\${esc(sections.find(x=>x[0]===section)?.[1]??"")}</h2><p>Cette surface reste en lecture seule tant que son endpoint d'autorité et son contrôle d'exécution ne sont pas validés.</p><div class="admin-gate">Action sensible bloquée sans politique serveur, quorum et audit.</div></div>\`;
  root.querySelectorAll<HTMLButtonElement>("[data-refresh]").forEach(b=>b.onclick=()=>void load(section,root));
  root.querySelectorAll<HTMLButtonElement>("[data-runtime]").forEach(b=>b.onclick=async()=>{
   const mode=b.dataset.runtime;if(!mode)return;
   const reason=window.prompt("Justification obligatoire (≥ 8 caractères)");
   if(!reason||reason.length<8)return;
   const csrf=sessionStorage.getItem("tpay.csrf");
   if(!csrf){status.textContent="Step-up/CSRF non disponible";return;}
   const rr=await api("/v1/admin/runtime/change-requests",{method:"POST",headers:{"x-csrf-token":csrf},body:JSON.stringify({mode,reason})});
   status.textContent=rr.ok?"Demande créée — double approbation requise":"Demande refusée par le serveur";
  });
 }catch{
  status.textContent="Plan de contrôle indisponible";
  content.innerHTML=`<div class="admin-denied"><b>503 · Plan de contrôle indisponible</b><p>Aucune action administrative n'est exécutée en mode dégradé de la console.</p></div>`;
 }
}
export function startAdminConsole(root:HTMLElement,section:AdminSection="dashboard"){root.innerHTML=renderAdminConsole(section);void load(section,root);}
