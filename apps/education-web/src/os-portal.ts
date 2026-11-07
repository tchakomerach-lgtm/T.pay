import React from "react";
import "./os-portal.css";

type ModuleItem={name:string;category:string;description:string;state:"Prototype"|"À connecter"|"Fondation";icon:string};
const modules:ModuleItem[]=[
 {name:"School OS",category:"Éducation",description:"Élèves, enseignants, présences, frais et fournitures.",state:"Prototype",icon:"▦"},
 {name:"Tontine",category:"Finance communautaire",description:"Groupes, cycles, cotisations et gouvernance.",state:"À connecter",icon:"◷"},
 {name:"Microfinance",category:"Crédit",description:"Dossiers, décisions, échéanciers et portefeuille.",state:"À connecter",icon:"◈"},
 {name:"Financial Core",category:"Services partagés",description:"Ledger canonique, paiements, commissions et rapprochement.",state:"Fondation",icon:"₣"},
 {name:"Organisations",category:"Espace de travail",description:"Tenants, membres, invitations et permissions.",state:"Fondation",icon:"⌂"},
 {name:"School Subsidy",category:"Financement scolaire",description:"Cahier des charges, fournitures complètes et financement encadré.",state:"À connecter",icon:"◇"},
 {name:"Marketplace & Opportunités",category:"Écosystème",description:"Offres, demandes et mise en relation vérifiée.",state:"À connecter",icon:"⇄"},
 {name:"Social & Growth",category:"Acquisition",description:"Campagnes, QR et connecteurs externes avec consentement.",state:"À connecter",icon:"◎"},
 {name:"Documents & preuves",category:"Confiance",description:"Documents, versions, accès et traçabilité.",state:"À connecter",icon:"▤"},
 {name:"Super Admin",category:"Gouvernance",description:"Santé des services, audits, incidents et configuration.",state:"À connecter",icon:"⬡"}
];
const h=React.createElement;
export function GlobalPortal({onOpenSchool,onExit}:{onOpenSchool:()=>void;onExit:()=>void}){
 return h("div",{className:"os-layout"},
  h("aside",{className:"os-sidebar"},
   h("div",{className:"os-brand"},h("span",{className:"os-mark"},"T"),h("div",null,h("strong",null,"T.Pay OS"),h("small",null,"PLATEFORME UNIFIÉE"))),
   h("div",{className:"os-profile"},h("span",{className:"os-profile-icon"},"U"),h("div",null,h("strong",null,"Espace de démonstration"),h("small",null,"Aucune identité vérifiée"))),
   h("p",{className:"os-nav-label"},"ESPACE DE TRAVAIL"),
   h("nav",null,h("span",{className:"os-nav-active"},"▦  Vue d'ensemble"),h("span",{className:"os-nav-muted"},"⌕  Applications"),h("span",{className:"os-nav-muted"},"♧  Organisations"),h("span",{className:"os-nav-muted"},"◷  Activité"),h("span",{className:"os-nav-muted"},"⚙  Paramètres")),
   h("div",{className:"os-side-note"},h("span",{className:"os-demo-dot"}),h("div",null,h("strong",null,"Mode prototype"),h("small",null,"Données métier non persistées")),h("button",{type:"button",onClick:onExit,"aria-label":"Quitter la démonstration"},"↩"))
  ),
  h("main",{className:"os-main"},
   h("header",{className:"os-topbar"},h("div",null,h("span",{className:"os-crumb"},"T.Pay OS  /  Vue d'ensemble"),h("h1",null,"Votre espace de travail")),h("div",{className:"os-top-actions"},h("span",{className:"os-env"},"DÉMONSTRATION"),h("span",{className:"os-user"},"U"))),
   h("div",{className:"os-content"},
    h("section",{className:"os-hero"},h("div",null,h("p",{className:"os-eyebrow"},"UN SEUL ESPACE · DES SERVICES INTERCONNECTÉS"),h("h2",null,"Bienvenue dans T.Pay OS"),h("p",null,"Accédez aux applications de votre écosystème. Les modules affichés indiquent leur niveau réel d'intégration dans ce prototype.")),h("div",{className:"os-hero-art","aria-hidden":"true"},h("span",{className:"os-orbit os-orbit-a"}),h("span",{className:"os-orbit os-orbit-b"}),h("span",{className:"os-orbit os-orbit-c"}),h("span",{className:"os-hero-core"},"T"))),
    h("div",{className:"os-summary"},h("div",null,h("span",null,"Applications cartographiées"),h("strong",null,String(modules.length))),h("div",null,h("span",null,"Prototype interactif"),h("strong",null,"1")),h("div",null,h("span",null,"Opérations financières réelles"),h("strong",null,"0"))),
    h("div",{className:"os-section-heading"},h("div",null,h("h2",null,"Applications"),h("p",null,"Les fonctionnalités non intégrées sont identifiées explicitement.")),h("span",null,"Catalogue T.Pay OS")),
    h("section",{className:"os-module-grid"},...modules.map(m=>h("article",{className:"os-module-card",key:m.name},h("div",{className:"os-module-top"},h("span",{className:"os-module-icon"},m.icon),h("span",{className:"os-state "+(m.state==="Prototype"?"os-state-live":m.state==="Fondation"?"os-state-foundation":"os-state-pending")},m.state)),h("p",{className:"os-category"},m.category),h("h3",null,m.name),h("p",{className:"os-module-desc"},m.description),m.name==="School OS"?h("button",{type:"button",className:"os-open-button",onClick:onOpenSchool},"Ouvrir le prototype ↗"):h("span",{className:"os-module-foot"},m.state==="Fondation"?"Fondation à vérifier dans les parcours":"Intégration métier à réaliser")))),
    h("section",{className:"os-integrity-note"},h("span",{className:"os-note-icon"},"i"),h("div",null,h("strong",null,"Transparence sur l'état du produit"),h("p",null,"Ce portail est une interface de démonstration. Les cartes ne prouvent pas qu'un service backend est déployé. Aucun paiement, crédit, garantie de microfinance ou financement scolaire réel n'est déclenché."))),
    h("footer",{className:"os-footer"},"T.Pay OS · Architecture unifiée · Sécurité et autorisations à appliquer côté serveur")
   )
  )
 );
}
