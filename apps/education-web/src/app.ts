import React,{useEffect,useMemo,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";

type ModuleKey="home"|"organizations"|"social"|"opportunity"|"community-tontine"|"microfinance"|"education"|"wallet"|"marketplace"|"ai"|"admin";
const modules:{key:ModuleKey;label:string;group:string;description:string;state:"active"|"planned";icon:string}[]=[
 {key:"home",label:"Vue d'ensemble",group:"ESPACE",description:"Activité, alertes et tâches prioritaires",state:"active",icon:"◫"},
 {key:"organizations",label:"Organisations",group:"ESPACE",description:"Espaces de travail, équipes et gouvernance",state:"planned",icon:"▦"},
 {key:"social",label:"Réseau social",group:"COMMUNAUTÉ",description:"Publications, groupes et conversations",state:"planned",icon:"◎"},
 {key:"opportunity",label:"Opportunités",group:"COMMUNAUTÉ",description:"Emplois, missions, talents et partenariats",state:"planned",icon:"↗"},
 {key:"community-tontine",label:"Tontine communautaire",group:"FINANCE INCLUSIVE",description:"Groupes autonomes, cycles et gouvernance",state:"planned",icon:"◉"},
 {key:"microfinance",label:"Microfinance",group:"FINANCE INCLUSIVE",description:"Clients, agents, collectes et portefeuille",state:"planned",icon:"⌂"},
 {key:"education",label:"Éducation",group:"ORGANISATIONS MÉTIER",description:"Classes, notes, résultats et bulletins",state:"active",icon:"▤"},
 {key:"wallet",label:"Wallet & paiements",group:"FINANCE",description:"Comptes, paiements et reçus",state:"planned",icon:"◇"},
 {key:"marketplace",label:"Marketplace",group:"ÉCOSYSTÈME",description:"Produits, services et commandes",state:"planned",icon:"⌘"},
 {key:"ai",label:"T.Pay Intelligence",group:"PILOTAGE",description:"Assistants spécialisés et workflows assistés",state:"planned",icon:"✳"},
 {key:"admin",label:"Administration",group:"PILOTAGE",description:"Accès, politiques, audit et configuration",state:"planned",icon:"⚙"}
];
const roles=["Administrateur","Directeur","Enseignant","Parent","Élève"];
export function SchoolApp({config}:{config:SchoolWebConfig}){
 const client=useMemo(()=>createSchoolWebClient(config),[config]);
 const [events,setEvents]=useState<SchoolWebEvent[]>([]);
 const [status,setStatus]=useState(config.demo?"DEMO":"CONNECTING");
 const [active,setActive]=useState<ModuleKey>("home");
 const [role,setRole]=useState("Administrateur");
 const [navOpen,setNavOpen]=useState(false);
 const activeModule=modules.find(item=>item.key===active)!;
 useEffect(()=>{if(config.demo)return;const controller=new AbortController();consumeSchoolSse(config,e=>setEvents(v=>[e,...v].slice(0,20)),controller.signal).then(()=>setStatus("DISCONNECTED")).catch(()=>setStatus("OFFLINE"));return()=>controller.abort();},[config]);
 const openModule=(key:ModuleKey)=>{setActive(key);setNavOpen(false);};
 return React.createElement("div",{className:"tpay-os"},
  React.createElement("aside",{className:`os-sidebar ${navOpen?"is-open":""}`},
   React.createElement("div",{className:"brand-lockup"},React.createElement("span",{className:"brand-mark"},"T"),React.createElement("div",null,React.createElement("strong",null,"T.Pay"),React.createElement("small",null,"OPERATING SYSTEM"))),
   React.createElement("div",{className:"workspace-switch"},React.createElement("span",{className:"workspace-avatar"},"É"),React.createElement("div",null,React.createElement("strong",null,"Établissement"),React.createElement("small",null,"Espace de travail")),React.createElement("span",{className:"chevron"},"⌄")),
   ...["ESPACE","COMMUNAUTÉ","FINANCE INCLUSIVE","ORGANISATIONS MÉTIER","FINANCE","ÉCOSYSTÈME","PILOTAGE"].map(group=>React.createElement("div",{className:"nav-group",key:group},
    React.createElement("p",{className:"nav-label"},group),
    ...modules.filter(item=>item.group===group).map(item=>React.createElement("button",{key:item.key,type:"button",className:`nav-item ${active===item.key?"active":""}`,onClick:()=>openModule(item.key), "aria-current":active===item.key?"page":undefined},
      React.createElement("span",{className:"nav-icon","aria-hidden":true},item.icon),React.createElement("span",{className:"nav-text"},item.label),item.state==="planned"?React.createElement("span",{className:"nav-dot",title:"Module non connecté dans cette interface"}):null
    ))
   )),
   React.createElement("div",{className:"sidebar-bottom"},React.createElement("div",{className:"connection-state"},React.createElement("span",{className:`pulse-dot ${status==="OFFLINE"?"offline":""}`}),React.createElement("span",null,status==="DEMO"?"Démonstration":status==="CONNECTING"?"Connexion…":status==="OFFLINE"?"Hors ligne":"Connecté")),React.createElement("small",null,"T.Pay OS • Interface de travail"))
  ),
  React.createElement("div",{className:"os-main"},
   React.createElement("header",{className:"topbar"},
    React.createElement("button",{className:"mobile-menu",type:"button","aria-label":"Ouvrir la navigation",onClick:()=>setNavOpen(v=>!v)},"☰"),
    React.createElement("div",{className:"breadcrumbs"},React.createElement("span",null,"T.Pay"),React.createElement("span",null,"/"),React.createElement("strong",null,activeModule.label)),
    React.createElement("div",{className:"topbar-actions"},React.createElement("span",{className:"live-pill"},React.createElement("span",{className:"pulse-dot"}),"Temps réel"),React.createElement("button",{className:"icon-button",type:"button","aria-label":"Notifications"},"♧"),React.createElement("div",{className:"user-avatar",title:role},"AD"))
   ),
   React.createElement("main",{className:"workspace"},
    React.createElement("section",{className:"welcome-row"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"ESPACE ORGANISATION • TOGO"),React.createElement("h1",null,activeModule.label),React.createElement("p",{className:"subheading"},activeModule.description)),React.createElement("div",{className:"role-preview"},React.createElement("label",{htmlFor:"role-preview"},"Vue d'interface"),React.createElement("select",{id:"role-preview",value:role,onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>setRole(e.target.value)},roles.map(item=>React.createElement("option",{key:item,value:item},item))),React.createElement("small",null,"Aperçu uniquement — les droits sont vérifiés par l'API"))
    )),
    active==="home"?React.createElement(React.Fragment,null,
     React.createElement("section",{className:"hero-panel"},React.createElement("div",{className:"hero-copy"},React.createElement("span",{className:"hero-kicker"},"VOTRE ESPACE, UNIFIÉ"),React.createElement("h2",null,"Pilotez vos activités.\nGardez le contrôle."),React.createElement("p",null,"Une expérience cohérente pour vos équipes, vos opérations et vos services — avec des accès gouvernés et une traçabilité intégrée."),React.createElement("button",{type:"button",className:"primary-button",onClick:()=>openModule("education")},"Ouvrir l'espace Éducation"," ",React.createElement("span",null,"→"))),React.createElement("div",{className:"hero-orbit","aria-hidden":true},React.createElement("div",{className:"orbit orbit-one"}),React.createElement("div",{className:"orbit orbit-two"}),React.createElement("div",{className:"orbit-core"}),React.createElement("span",{className:"orbit-node node-one"},"T"),React.createElement("span",{className:"orbit-node node-two"},"◎"),React.createElement("span",{className:"orbit-node node-three"},"↗"))),
     React.createElement("div",{className:"section-heading"},React.createElement("div",null,React.createElement("h2",null,"Vos espaces de travail"),React.createElement("p",null,"Accédez aux domaines T.Pay depuis un même environnement.")),React.createElement("span",{className:"section-meta"},"CATALOGUE DES MODULES")),
     React.createElement("section",{className:"module-grid"},modules.filter(item=>item.key!=="home").map(item=>React.createElement("button",{type:"button",key:item.key,className:"module-card",onClick:()=>openModule(item.key)},React.createElement("span",{className:"module-icon"},item.icon),React.createElement("span",{className:"module-copy"},React.createElement("strong",null,item.label),React.createElement("small",null,item.description)),React.createElement("span",{className:item.state==="active"?"module-state connected":"module-state planned"},item.state==="active"?"Interface active":"À connecter"),React.createElement("span",{className:"module-arrow"},"↗")))),
     React.createElement("section",{className:"bottom-grid"},React.createElement("article",{className:"surface-card"},React.createElement("div",{className:"card-heading"},React.createElement("h2",null,"Flux opérationnel"),React.createElement("span",{className:"live-pill"},"LIVE")),events.length===0?React.createElement("p",{className:"empty-state"},config.demo?"Mode démo : aucune donnée réelle ni opération financière n'est chargée.":"En attente d'événements autorisés…"):events.map(e=>React.createElement("div",{key:e.id,className:"event-row"},React.createElement("strong",null,e.event),React.createElement("span",null,e.id)))),React.createElement("article",{className:"surface-card admin-card"},React.createElement("div",{className:"card-heading"},React.createElement("h2",null,"Contrôle & sécurité"),React.createElement("span",{className:"security-mark"},"◇")),React.createElement("p",null,"Les actions sensibles nécessitent une session valide, un contexte organisationnel et les autorisations serveur correspondantes."),React.createElement("ul",null,React.createElement("li",null,"Permissions limitées au contexte actif"),React.createElement("li",null,"Historique et audit des actions"),React.createElement("li",null,"Aucune mutation financière depuis l'interface démo"))))
    ):React.createElement("section",{className:"module-placeholder"},React.createElement("span",{className:"module-icon large"},activeModule.icon),React.createElement("span",{className:activeModule.state==="active"?"module-state connected":"module-state planned"},activeModule.state==="active"?"Domaine scolaire connecté":"Espace référencé — intégration à poursuivre"),React.createElement("h2",null,activeModule.label),React.createElement("p",null,activeModule.state==="active"?"Les opérations scolaires utilisent les API authentifiées et les contrôles d'accès du domaine Éducation.":"Cette entrée reflète le catalogue fonctionnel des Bibles T.Pay. Les écrans métier, API et validations de ce domaine ne sont pas encore raccordés dans cette interface."),React.createElement("button",{type:"button",className:"secondary-button",onClick:()=>openModule("home")},"Retour à la vue d'ensemble"))
   )
  )
 );
}
