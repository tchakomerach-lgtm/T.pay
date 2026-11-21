import React,{useEffect,useMemo,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";

function statusTone(status:string){
 if(status==="TEMPS RÉEL"||status==="API PRÊTE")return "is-good";
 if(status==="DÉMONSTRATION")return "is-demo";
 if(status==="HORS LIGNE"||status==="ERREUR API")return "is-bad";
 return "is-pending";
}

export function SchoolApp({config}:{config:SchoolWebConfig}){
 const client=useMemo(()=>createSchoolWebClient(config),[config]);
 const [events,setEvents]=useState<SchoolWebEvent[]>([]);
 const [status,setStatus]=useState(config.demo?"DÉMONSTRATION":"VÉRIFICATION");
 const [apiStatus,setApiStatus]=useState(config.demo?"MODE DÉMO":"EN ATTENTE");
 const [refreshKey,setRefreshKey]=useState(0);
 const [lastChecked,setLastChecked]=useState<string>("—");

 useEffect(()=>{
  if(config.demo){setStatus("DÉMONSTRATION");setApiStatus("AUCUNE API APPELÉE");return;}
  const controller=new AbortController();
  let active=true;
  setStatus("VÉRIFICATION");
  setApiStatus("CONTRÔLE HTTPS");
  client.health().then(async response=>{
   if(!response.ok)throw new Error("API_READY_HTTP_"+response.status);
   const payload=await response.json() as {status?:string};
   if(!active)return;
   setApiStatus(payload.status==="ready"?"API DISPONIBLE":"RÉPONSE INATTENDUE");
   setLastChecked(new Date().toLocaleTimeString());
   if(payload.status!=="ready")throw new Error("API_READY_INVALID");
   await consumeSchoolSse(config,event=>setEvents(current=>[event,...current].slice(0,30)),controller.signal,()=>{
    if(active)setStatus("TEMPS RÉEL");
   });
   if(active)setStatus("FLUX ARRÊTÉ");
  }).catch(()=>{
   if(active&&!controller.signal.aborted){setStatus("HORS LIGNE");setApiStatus("API INDISPONIBLE");}
  });
  return ()=>{active=false;controller.abort();};
 },[client,config,refreshKey]);

 const host=(()=>{try{return new URL(config.apiBaseUrl).host;}catch{return "Endpoint non défini";}})();
 const statusClass=statusTone(status);
 const h=React.createElement;
 return h("main",{className:"tpay-workspace"},
  h("div",{className:"ambient ambient-one"}),
  h("div",{className:"ambient ambient-two"}),
  h("header",{className:"topbar"},
   h("a",{className:"brand-lockup",href:"#home","aria-label":"T.Pay accueil"},
    h("span",{className:"brand-mark"},h("span",null,"T")),
    h("span",{className:"brand-name"},"T.Pay",h("small",null,"OPERATING SYSTEM"))
   ),
   h("div",{className:"topbar-context"},h("span",{className:"context-dot"}),h("span",null,"ESPACE ORGANISATION"),h("span",{className:"context-divider"}),h("strong",null,"School OS")),
   h("div",{className:"topbar-right"},h("span",{className:"secure-label"},h("span",{className:"secure-dot"}),"CONNEXION SÉCURISÉE"),h("span",{className:"avatar"},"TP"))
  ),
  h("section",{className:"hero"},
   h("div",{className:"hero-copy"},
    h("p",{className:"eyebrow"},"T.PAY EXPERIENCE OS / SCHOOL"),
    h("h1",null,"Votre organisation.",h("br"),h("span",null,"Un seul espace de pilotage.")),
    h("p",{className:"hero-description"},"Un centre de contrôle unifié pour suivre les connexions, les événements autorisés et l’activité opérationnelle de votre établissement."),
    h("div",{className:"hero-actions"},
     h("button",{className:"primary-action",type:"button",onClick:()=>setRefreshKey(value=>value+1),disabled:config.demo},"Vérifier la connexion",h("span",null,"↗")),
     h("span",{className:"hero-note"},config.demo?"Mode visuel sans appel serveur":"Données affichées uniquement après réponse de l’API")
    )
   ),
   h("div",{className:"hero-orbit","aria-hidden":"true"},
    h("div",{className:"orbit-ring ring-a"}),
    h("div",{className:"orbit-ring ring-b"}),
    h("div",{className:"orbit-ring ring-c"}),
    h("div",{className:"orbit-core"},h("span",null,"T"),h("small",null,"PAY")),
    h("span",{className:"orbit-node node-a"}),
    h("span",{className:"orbit-node node-b"}),
    h("span",{className:"orbit-node node-c"})
   )
  ),
  h("section",{className:"section-heading"},
   h("div",null,h("p",{className:"eyebrow"},"ÉTAT DU SYSTÈME"),h("h2",null,"Supervision en direct")),
   h("span",{className:"updated-label"},"Dernier contrôle : ",lastChecked)
  ),
  h("section",{className:"status-grid"},
   h("article",{className:"status-card glass-card"},
    h("div",{className:"card-topline"},h("span",{className:"card-icon icon-server"},"⌘"),h("span",{className:"card-kicker"},"API GATEWAY")),
    h("strong",{className:"card-value"},apiStatus),
    h("span",{className:"card-detail"},host),
    h("div",{className:"card-track"},h("span",{className:apiStatus==="API DISPONIBLE"?"track-ready":""}))
   ),
   h("article",{className:"status-card glass-card"},
    h("div",{className:"card-topline"},h("span",{className:"card-icon icon-pulse"},"⌁"),h("span",{className:"card-kicker"},"ÉVÉNEMENTS")),
    h("strong",{className:"card-value"},String(events.length).padStart(2,"0")),
    h("span",{className:"card-detail"},"Événements reçus dans cette session"),
    h("div",{className:"event-bars","aria-hidden":"true"},...Array.from({length:12},(_,index)=>h("i",{key:index,style:{height:(10+(index*7)%27)+"px"}})))
   ),
   h("article",{className:"status-card glass-card"},
    h("div",{className:"card-topline"},h("span",{className:"card-icon icon-shield"},"◇"),h("span",{className:"card-kicker"},"SESSION")),
    h("strong",{className:"card-value"},config.demo?"NON CONNECTÉ":"JETON REQUIS"),
    h("span",{className:"card-detail"},config.demo?"Aucun compte ni service réel":"Autorisation vérifiée côté serveur"),
    h("span",{className:"security-footnote"},"HTTPS uniquement · aucune mutation financière")
   )
  ),
  h("section",{className:"operations-layout"},
   h("article",{className:"glass-card activity-card"},
    h("div",{className:"panel-heading"},h("div",null,h("p",{className:"eyebrow"},"FLUX TEMPS RÉEL"),h("h2",null,"Activité récente")),h("span",{className:"live-pill "+statusClass},h("i",null),status)),
    config.demo?h("div",{className:"empty-state"},h("span",{className:"empty-symbol"},"◇"),h("strong",null,"Mode démonstration"),h("p",null,"Aucun événement fictif n’est injecté. Connectez un endpoint HTTPS pour afficher les événements réellement reçus.")):
     events.length===0?h("div",{className:"empty-state"},h("span",{className:"empty-symbol"},"⌁"),h("strong",null,status==="TEMPS RÉEL"?"Flux connecté":"En attente du flux"),h("p",null,"Les événements apparaîtront ici lorsqu’ils seront publiés par le serveur.")):
      h("div",{className:"event-list"},...events.map(event=>h("div",{className:"event-item",key:event.id},h("span",{className:"event-indicator"}),h("div",{className:"event-copy"},h("strong",null,event.event),h("small",null,event.id)),h("span",{className:"event-time"},"Reçu"))))
   ),
   h("aside",{className:"glass-card context-card"},
    h("p",{className:"eyebrow"},"GARDE-FOUS ACTIFS"),
    h("h2",null,"La sécurité avant l’action."),
    h("ul",{className:"guard-list"},
     h("li",null,h("span",null,"✓"),"Transport HTTPS obligatoire"),
     h("li",null,h("span",null,"✓"),"Session à durée limitée"),
     h("li",null,h("span",null,"✓"),"Autorisations côté serveur"),
     h("li",null,h("span",null,"✓"),"Flux filtré par organisation"),
     h("li",null,h("span",null,"✓"),"Aucune écriture financière depuis cette interface")
    ),
    h("div",{className:"context-footer"},h("span",null,"ENDPOINT ACTIF"),h("strong",null,host))
   )
  ),
  h("footer",{className:"workspace-footer"},h("span",null,"T.PAY · SCHOOL OS"),h("span",null,"INTERFACE OPÉRATIONNELLE · BUILD EN VALIDATION"))
 );
}
