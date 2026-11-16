const modules = [
  {id:"home",label:"Vue d’ensemble",icon:"⌂",group:"Espace de travail",desc:"Le cockpit unifié de l’écosystème T.Pay."},
  {id:"organizations",label:"Organisations",icon:"▦",group:"Espace de travail",desc:"Création, identité, équipes et espaces de travail."},
  {id:"education",label:"School OS",icon:"▤",group:"Verticales",desc:"Gestion scolaire, pédagogie, familles et documents."},
  {id:"subsidy",label:"School Subsidy",icon:"◈",group:"Verticales",desc:"Financement garanti, fournitures et recouvrement progressif."},
  {id:"microfinance",label:"Microfinance",icon:"⌁",group:"Verticales",desc:"Clients, agents, agences, portefeuille et remboursements."},
  {id:"tontine",label:"Tontine communautaire",icon:"◉",group:"Verticales",desc:"Groupes, cotisations, gouvernance et bénéficiaires."},
  {id:"finance",label:"Financial Core",icon:"₣",group:"Finance",desc:"Paiements, ledger, commissions et rapprochement."},
  {id:"wallet",label:"Wallet",icon:"▣",group:"Finance",desc:"Comptes, mouvements simulés et reçus."},
  {id:"marketplace",label:"Marketplace",icon:"◇",group:"Économie",desc:"Catalogue, commandes, fournisseurs et achats."},
  {id:"opportunity",label:"Opportunité & Work",icon:"↗",group:"Économie",desc:"Compétences, matching, contrats et missions."},
  {id:"social",label:"Réseau social",icon:"◎",group:"Économie",desc:"Publications, communautés et modération."},
  {id:"investment",label:"Investment Core",icon:"▥",group:"Finance",desc:"Éducation, opportunités, risques et scénarios."},
  {id:"ai",label:"AI Core",icon:"✳",group:"Intelligence",desc:"Orchestration d’agents, politiques et validation humaine."},
  {id:"documents",label:"Documents",icon:"▧",group:"Pilotage",desc:"Modèles versionnés, identité et traçabilité documentaire."},
  {id:"workflows",label:"Workflows & projets",icon:"⇢",group:"Pilotage",desc:"Tâches, étapes, dépendances et validations."},
  {id:"calendar",label:"Temps & réservations",icon:"▦",group:"Pilotage",desc:"Calendriers, réunions et arbitrage des ressources."},
  {id:"superadmin",label:"Super Admin",icon:"⬡",group:"Gouvernance",desc:"Politiques, permissions, audit et continuité."},
  {id:"ecosystem",label:"Autres verticales",icon:"＋",group:"Écosystème",desc:"Agriculture, transport, santé, hôtellerie et services."}
];

const seed = {
  students:[
    {name:"Ama Mensah",ref:"ELV-2026-001",class:"6e A",status:"Inscrit"},
    {name:"Koffi Adjo",ref:"ELV-2026-002",class:"5e B",status:"Inscrit"},
    {name:"Esi Afi",ref:"ELV-2026-003",class:"Terminale C",status:"À vérifier"}
  ],
  clients:[
    {name:"Kodjo A.",ref:"CLI-0041",agency:"Lomé Centre",status:"Actif"},
    {name:"Akossiwa D.",ref:"CLI-0042",agency:"Agoè",status:"KYC à revoir"},
    {name:"Yao K.",ref:"CLI-0043",agency:"Lomé Centre",status:"Actif"}
  ],
  posts:[
    {author:"Équipe T.Pay",body:"Bienvenue dans le réseau de démonstration T.Pay OS.",time:"À l’instant"},
    {author:"École Lumière",body:"Les inscriptions pour la rentrée sont ouvertes.",time:"Il y a 2 h"}
  ],
  events:[
    {title:"Espace de démonstration initialisé",detail:"Données fictives chargées",time:"Maintenant"}
  ],
  tasks:[
    {title:"Valider le dossier de rentrée",owner:"Direction",status:"À valider"},
    {title:"Contrôler les packs de fournitures",owner:"Comptabilité",status:"En cours"},
    {title:"Préparer le rapport mensuel",owner:"Gestionnaire",status:"À faire"}
  ]
};

const storageKey = "tpay-investor-demo-v1";
let state = loadState();
let active = "home";
let search = "";
let modal = null;
let tourStep = -1;

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||"null");
    return saved && saved.data ? saved : {data:structuredClone(seed),org:"École Lumière",context:"Organisation",lastReset:new Date().toISOString()};
  }catch{return {data:structuredClone(seed),org:"École Lumière",context:"Organisation",lastReset:new Date().toISOString()};}
}
function persist(){localStorage.setItem(storageKey,JSON.stringify(state));}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v){return new Intl.NumberFormat("fr-FR").format(v)+" F CFA";}
function eventLog(title,detail="Action de démonstration enregistrée"){
  state.data.events.unshift({title,detail,time:new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})});
  state.data.events=state.data.events.slice(0,12);persist();
}
function badge(text,kind="neutral"){return '<span class="badge '+kind+'">'+esc(text)+'</span>';}
function metric(label,value,change,icon){return '<article class="metric"><div class="metric-top"><span>'+label+'</span><span class="metric-icon">'+icon+'</span></div><strong>'+value+'</strong><small>'+change+'</small></article>';}
function button(label,action,kind="primary"){return '<button class="btn '+kind+'" data-action="'+action+'">'+label+'</button>';}
function moduleById(id){return modules.find(m=>m.id===id)||modules[0];}
function nav(){
  const groups=[...new Set(modules.map(m=>m.group))];
  return groups.map(g=>'<div class="nav-group"><div class="nav-label">'+g+'</div>'+modules.filter(m=>m.group===g).map(m=>'<button class="nav-item '+(active===m.id?'active':'')+'" data-nav="'+m.id+'"><span class="nav-icon">'+m.icon+'</span><span>'+m.label+'</span>'+(m.id==="superadmin"?'<i class="nav-dot"></i>':'')+'</button>').join("")+'</div>').join("");
}
function shell(){
  const m=moduleById(active);
  return '<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">T.</div><div><b>T.Pay</b><small>OPERATING SYSTEM</small></div></div><div class="workspace-switch"><span class="workspace-avatar">EL</span><span><b>'+esc(state.org)+'</b><small>'+esc(state.context)+'</small></span><span class="chevron">⌄</span></div><nav>'+nav()+'</nav><div class="sidebar-bottom"><div class="sync-state"><span class="pulse"></span><span>Mode démonstration</span></div><button class="nav-item" data-action="tour"><span class="nav-icon">▷</span><span>Visite investisseur</span></button><div class="profile"><div class="avatar">TA</div><div><b>Administrateur démo</b><small>Accès de démonstration</small></div><span>•••</span></div></div></aside><main class="main"><header class="topbar"><div class="crumb"><span>Workspace</span><b>/</b><strong>'+m.label+'</strong></div><div class="top-actions"><label class="search"><span>⌕</span><input id="global-search" placeholder="Rechercher dans T.Pay..." value="'+esc(search)+'"></label><button class="icon-btn" data-action="notifications" aria-label="Notifications">♧<i></i></button><button class="icon-btn" data-action="help" aria-label="Aide">?</button><div class="avatar small">TA</div></div></header><div class="demo-banner"><span>●</span><b>ENVIRONNEMENT INVESTISSEUR</b><span>Données fictives · Actions simulées · Aucun mouvement d\'argent réel</span><button data-action="reset">Réinitialiser la démo</button></div><section class="page" id="page">'+renderPage()+'</section><footer class="footer"><span>T.Pay OS · Investor Prototype</span><span>Prototype non financier · Version de démonstration</span></footer></main></div>'+(modal?renderModal():"")+(tourStep>=0?renderTour():"");
}
function renderPage(){
  const m=moduleById(active);
  if(active==="home")return dashboard();
  if(active==="organizations")return organizations();
  if(active==="education")return education();
  if(active==="subsidy")return subsidy();
  if(active==="microfinance")return microfinance();
  if(active==="tontine")return tontine();
  if(active==="finance")return finance();
  if(active==="wallet")return wallet();
  if(active==="marketplace")return marketplace();
  if(active==="opportunity")return opportunity();
  if(active==="social")return social();
  if(active==="investment")return investment();
  if(active==="ai")return aiCore();
  if(active==="documents")return documents();
  if(active==="workflows")return workflows();
  if(active==="calendar")return calendar();
  if(active==="superadmin")return superadmin();
  return ecosystem();
}
function pageHead(kicker,title,sub,actions=""){return '<div class="page-head"><div><div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p>'+sub+'</p></div><div class="head-actions">'+actions+'</div></div>';}
function panel(title,content,extra=""){return '<section class="panel"><div class="panel-head"><h3>'+title+'</h3>'+extra+'</div>'+content+'</section>';}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';}
function dashboard(){
  const ev=state.data.events.slice(0,5).map(e=>'<div class="activity-row"><span class="activity-dot"></span><div><b>'+esc(e.title)+'</b><small>'+esc(e.detail)+'</small></div><time>'+esc(e.time)+'</time></div>').join("");
  return pageHead("PILOTAGE GLOBAL","Votre écosystème, <em>en un seul endroit.</em>","La vue opérationnelle unifiée des organisations, des services et des flux T.Pay.",button("Lancer la visite","tour"))+
  '<div class="welcome-strip"><div><span class="welcome-chip">T.PAY OS</span><h2>Bonjour, Administrateur.</h2><p>Voici l’activité de votre espace de démonstration.</p></div><div class="welcome-right"><span>Contexte actif</span><b>'+esc(state.org)+'</b><small>Dernière synchronisation : à l’instant</small></div></div>'+
  '<div class="metric-grid">'+metric("Organisations actives","24","+ 3 ce mois","▦")+metric("Utilisateurs démo","1 284","+ 12,8 %","♙")+metric("Opérations simulées","8 492","Flux multi-domaines","↗")+metric("Volume illustratif",money(28450000),"XOF · valeur fictive","₣")+'</div>'+
  '<div class="section-title"><div><h2>Applications T.Pay</h2><p>Un système modulaire, unifié par les mêmes règles d’identité et de gouvernance.</p></div><span class="muted">18 espaces</span></div><div class="app-grid">'+modules.filter(x=>x.id!=="home").map(m=>'<button class="app-card" data-nav="'+m.id+'"><span class="app-icon">'+m.icon+'</span><b>'+m.label+'</b><small>'+m.desc+'</small><span class="app-open">Ouvrir →</span></button>').join("")+'</div>'+
  '<div class="two-col">'+panel("Activité récente",ev||'<p class="empty">Aucune activité.</p>', '<span class="muted">Journal démo</span>')+panel("Parcours de valeur T.Pay",'<div class="value-flow">'+["Identité","Organisation","Opérations","Financial Core","Partenaires","IA & Gouvernance"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div><p class="hint">Une chaîne de valeur intégrée, avec des frontières métier et financières explicites.</p>')+'</div>';
}
function organizations(){
  return pageHead("ORGANIZATION OS","Les organisations deviennent des <em>espaces de travail.</em>","Créez une structure, configurez son identité et activez ses applications.",button("＋ Créer une organisation","create-org"))+
  '<div class="metric-grid">'+metric("Organisations","24","Tous secteurs","▦")+metric("Membres","1 284","Multi-rôles","♙")+metric("Espaces configurés","19","Workspaces","⌂")+metric("Documents générés","6 420","Modèles versionnés","▧")+'</div>'+
  panel("Répertoire des organisations",table(["Organisation","Secteur","Membres","État",""],[
  ["École Lumière","Éducation","420",badge("Active","success"),button("Ouvrir","open-school","text")],
  ["SFD Solidarité","Microfinance","86",badge("Active","success"),button("Ouvrir","open-mfi","text")],
  ["AgroNova Togo","Agriculture","34",badge("Configuration","warning"),button("Configurer","open-eco","text")],
  ["Hôtel Marina","Hôtellerie","58",badge("Active","success"),button("Ouvrir","open-eco","text")]
  ]))+'<div class="two-col">'+panel("Modules préparés à la création",'<div class="check-list">'+["Page publique et mini-site","Réseau social interne","ERP / CRM et équipes","Documents avec logo et filigrane","Wallet et Financial Core","Assistant IA spécialisé","Marketplace et recrutement","Tableaux de bord et workflows"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>')+panel("Identité de marque",'<div class="brand-preview"><div class="logo-preview">EL</div><div><b>École Lumière</b><small>Logo propagé dans l’espace et les documents</small></div></div><p class="hint">Le logo, les couleurs et les modèles documentaires sont liés à l’organisation et versionnés.</p>')+'</div>';
}
function education(){
 const rows=state.data.students.map(s=>'<tr><td><b>'+esc(s.name)+'</b><small>'+esc(s.ref)+'</small></td><td>'+esc(s.class)+'</td><td>'+badge(s.status,s.status==="Inscrit"?"success":"warning")+'</td><td><button class="link-btn" data-action="edit-student" data-ref="'+esc(s.ref)+'">Voir</button></td></tr>');
 return pageHead("SCHOOL OS","La gestion scolaire, <em>sans rupture.</em>","De l’inscription à l’évaluation, des familles aux documents pédagogiques.",button("＋ Ajouter un élève","add-student"))+
 '<div class="tabs">'+["Vue générale","Élèves","Enseignants","Classes","Notes & bulletins","Présences","Familles"].map((x,i)=>'<button class="tab '+(i===0?"selected":"")+'" data-tab="'+x+'">'+x+'</button>').join("")+'</div>'+
 '<div class="metric-grid">'+metric("Élèves inscrits",state.data.students.length,"Données de démonstration","♙")+metric("Enseignants","32","Affectations suivies","♧")+metric("Classes","18","Année 2026–2027","▤")+metric("Présence du jour","94,2 %","Taux illustratif","✓")+'</div>'+
 panel("Registre des élèves",table(["Élève","Classe","Statut","Dossier"],rows))+
 '<div class="two-col">'+panel("Chaîne pédagogique",'<div class="value-flow vertical">'+["Année scolaire","Classes & affectations","Élèves & responsables","Présences & évaluations","Validation des notes","Bulletins & relevés"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>')+panel("Documents scolaires",'<div class="document-card"><span>▤</span><div><b>Bulletin trimestriel</b><small>Modèle versionné · Logo établissement</small></div>'+badge("Aperçu","info")+'</div><div class="document-card"><span>▧</span><div><b>Relevé de notes</b><small>Coefficients et périodes configurables</small></div>'+badge("Aperçu","info")+'</div><p class="hint">Les frais scolaires passent exclusivement par le Financial Core.</p>')+'</div>';
}
function subsidy(){
 return pageHead("SCHOOL SUBSIDY","Financer l’année scolaire, <em>progressivement.</em>","Un mécanisme de garantie microfinance, d’approvisionnement et de récupération encadrée.",button("＋ Nouvelle demande","new-subsidy"))+
 '<div class="metric-grid">'+metric("Demandes suivies","12","États distincts","▧")+metric("Budget annuel indicatif",money(18500000),"Cahier des charges","₣")+metric("Packs fournitures","640","Par classe","▣")+metric("Commission cible","1–5 %","Négociable","↗")+'</div>'+
 '<div class="subsidy-flow">'+["École lance un appel","Microfinance étudie et garantit","Cahier des charges financé","Packs remis aux élèves","Tontine journalière de remboursement","Récupération sur écolages"].map((x,i)=>'<div class="subsidy-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>'+
 panel("Dossiers de financement",table(["Établissement","Garant","Montant indicatif","Récupération","Statut"],[
 ["École Lumière","SFD Solidarité",money(8500000),"Écolages + tontine",badge("Étude","warning")],
 ["Institut Horizon","Microfinance Espoir",money(6200000),"Écolages + tontine",badge("Préparation","info")],
 ["Groupe Scolaire Avenir","SFD Solidarité",money(3800000),"Écolages + tontine",badge("Brouillon","neutral")]
 ]))+'<p class="notice-box">Démonstration : aucun prêt, garantie, paiement ou remboursement réel n’est engagé. Le financement et la récupération exigent des contrats, autorisations et écritures Financial Core.</p>';
}
function microfinance(){
 const rows=state.data.clients.map(c=>'<tr><td><b>'+esc(c.name)+'</b><small>'+esc(c.ref)+'</small></td><td>'+esc(c.agency)+'</td><td>'+badge(c.status,c.status==="Actif"?"success":"warning")+'</td><td><button class="link-btn" data-action="client-detail">Dossier</button></td></tr>');
 return pageHead("MICROFINANCE OS","Le réseau terrain, <em>piloté de bout en bout.</em>","Clients, agents, superviseurs, agences, SFD et partenaires.",button("＋ Ajouter un client","add-client"))+
 '<div class="metric-grid">'+metric("Clients",state.data.clients.length,"Registre de démonstration","♙")+metric("Portefeuille illustratif",money(94500000),"XOF fictifs","₣")+metric("Agents terrain","42","Réseau multi-agences","♧")+metric("Dossiers à revoir","7","KYC / conformité","!")+'</div>'+
 panel("Registre clients",table(["Client","Agence","Statut KYC","Action"],rows))+
 '<div class="two-col">'+panel("Chaîne de responsabilité",'<div class="value-flow vertical">'+["Client","Agent","Superviseur","Agence","SFD","T.Pay — orchestration"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>')+panel("Cycle opérationnel",'<div class="check-list">'+["Enrôlement et KYC","Instruction et approbation humaine","Décaissement partenaire","Échéancier et recouvrement","Rapprochement des collectes","Qualité du portefeuille"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>')+'</div>';
}
function tontine(){
 return pageHead("COMMUNITY TONTINE","La confiance devient <em>un réseau organisé.</em>","Groupes communautaires, cycles, gouvernance, bénéficiaires et rapprochement.",button("＋ Créer un groupe","create-group"))+
 '<div class="metric-grid">'+metric("Groupes actifs","86","Démonstration","◉")+metric("Membres","2 430","Identités fictives","♙")+metric("Cotisations simulées",money(12800000),"XOF illustratifs","₣")+metric("Cycles en cours","24","Règles versionnées","↻")+'</div>'+
 panel("Groupes communautaires",table(["Groupe","Cycle","Membres","Prochain bénéficiaire","État"],[
 ["Solidarité Agoè","Hebdomadaire","18","Ama Mensah",badge("En cours","success")],
 ["Femmes Entrepreneures","Mensuel","24","Akossiwa D.",badge("En cours","success")],
 ["Jeunes Bâtisseurs","Objectif","12","À déterminer",badge("Gouvernance","warning")]
 ]))+
 '<div class="two-col">'+panel("Règles de gouvernance",'<div class="check-list">'+["Adhésion et rôles","Quorum et décisions","Rotation déterministe","Calcul du pool net après frais","KYC et approbation du bénéficiaire","Gestion des litiges et remboursements"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>')+panel("Séparation des mécanismes",'<div class="separation"><div><b>Tontine journalière</b><small>Remboursement progressif des packs et dispositifs convenus.</small></div><div><b>Tontine communautaire</b><small>Épargne collective, cycle et rotation des bénéficiaires.</small></div></div><p class="hint">Les deux domaines restent distincts et s’appuient sur le Financial Core pour toute écriture financière.</p>')+'</div>';
}
function finance(){
 return pageHead("FINANCIAL CORE","Une vérité comptable, <em>plusieurs services.</em>","Le moteur canonique des écritures, des règlements, des commissions et du rapprochement.",button("Simuler une opération","simulate-payment"))+
 '<div class="metric-grid">'+metric("Écritures démo","12 842","Ledger illustratif","▤")+metric("Paiements simulés",money(42600000),"Aucun fonds réel","₣")+metric("Rapprochement","98,4 %","Taux fictif","✓")+metric("Exceptions","12","À investiguer","!")+'</div>'+
 '<div class="two-col">'+panel("Cycle de règlement",'<div class="value-flow vertical">'+["Intention de contribution","Payment Intent","Adaptateur partenaire","Webhook signé / anti-rejeu","Transaction Ledger atomique","Commission snapshot","Reçu & rapprochement"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>')+panel("Contrôles non négociables",'<div class="check-list">'+["Ledger append-only et équilibré","Idempotence et anti-rejeu","Autorisation côté serveur","Séparation des moteurs financiers","Réconciliation et gestion des exceptions","Validation humaine des opérations sensibles"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>')+'</div>'+
 panel("Moteurs financiers distincts",'<div class="engine-grid">'+["Wallet","Paiements","Crédit","Commissions","Subventions","Règlements"].map(x=>'<div class="engine-card"><span>◈</span><b>'+x+'</b><small>Service métier séparé</small></div>').join("")+'</div>')+
 '<p class="notice-box">Aucune connexion TMoney, Flooz ou banque n’est activée dans cette démonstration. Les adaptateurs de production doivent respecter les contrats opérateurs et les contrôles signés.</p>';
}
function wallet(){
 return pageHead("WALLET","Les comptes et mouvements, <em>clairement séparés.</em>","Une interface unifiée au-dessus des services financiers autorisés.",button("＋ Simuler un mouvement","simulate-payment"))+
 '<div class="wallet-card"><div><span>Solde de démonstration</span><h2>'+money(1250000)+'</h2><small>Compte fictif · XOF</small></div><div class="wallet-mark">T.</div></div>'+
 '<div class="metric-grid">'+metric("Entrées simulées",money(840000),"Période démo","↙")+metric("Sorties simulées",money(420000),"Période démo","↗")+metric("Transactions","28","Journal fictif","▤")+metric("Statut","Simulation","Aucun transfert réel","●")+'</div>'+
 panel("Historique illustratif",table(["Référence","Opération","Montant","État"],[
 ["TX-DEMO-001","Contribution tontine","+ 25 000 F",badge("Simulé","info")],
 ["TX-DEMO-002","Pack fournitures","− 18 500 F",badge("Simulé","info")],
 ["TX-DEMO-003","Règlement partenaire","+ 42 000 F",badge("En attente","warning")]
 ]));
}
function marketplace(){
 return pageHead("MARKETPLACE","L’offre et la demande, <em>connectées.</em>","Catalogue, fournisseurs, commandes, achats et logistique.",button("＋ Ajouter un produit","add-product"))+
 '<div class="metric-grid">'+metric("Produits","1 240","Catalogue fictif","◇")+metric("Fournisseurs","86","Partenaires démo","▦")+metric("Commandes","324","Cycle de commande","▤")+metric("Volume indicatif",money(9600000),"XOF fictifs","₣")+'</div>'+
 '<div class="product-grid">'+[["Pack scolaire 6e","Fournitures","18 500 F"],["Kit solaire rural","Énergie","42 000 F"],["Céréales locales","Agriculture","8 500 F"],["Service comptable","Services","Sur devis"]].map((p,i)=>'<article class="product-card"><div class="product-art art-'+i+'">'+["▤","☼","⌁","▧"][i]+'</div><div><small>'+p[1]+'</small><b>'+p[0]+'</b><strong>'+p[2]+'</strong></div><button data-action="order-product" data-name="'+p[0]+'">Simuler commande</button></article>').join("")+'</div>'+
 panel("Chaîne d’approvisionnement",'<div class="value-flow">'+["Demande","Validation","Commande","Livraison","Réception","Règlement"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>');
}
function opportunity(){
 return pageHead("OPPORTUNITY & WORK","Les compétences deviennent des <em>opportunités.</em>","Du profil à la mission, au contrat, à la livraison et à la confiance.",button("＋ Publier une opportunité","new-opportunity"))+
 '<div class="metric-grid">'+metric("Profils qualifiés","3 420","Compétences déclarées","♙")+metric("Opportunités","128","Offres fictives","↗")+metric("Missions actives","74","Workflows suivis","▤")+metric("Matching","86 %","Score indicatif","✳")+'</div>'+
 panel("Opportunités récentes",table(["Mission","Compétences","Type","Candidatures","État"],[
 ["Comptable PME","Comptabilité · Excel","Mission","12",badge("Ouverte","success")],
 ["Développeur mobile","Flutter · API","Emploi","8",badge("Matching","info")],
 ["Agent terrain","KYC · Collecte","Mission","24",badge("Sélection","warning")]
 ]))+
 '<div class="value-flow">'+["Profil & compétences","Matching explicable","Sélection humaine","Contrat & workflow","Livraison","Validation & paiement","Réputation"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>';
}
function social(){
 const posts=state.data.posts.map(p=>'<article class="post"><div class="post-top"><div class="avatar">'+esc(p.author.slice(0,2).toUpperCase())+'</div><div><b>'+esc(p.author)+'</b><small>'+esc(p.time)+' · Espace organisation</small></div></div><p>'+esc(p.body)+'</p><div class="post-actions"><button data-action="like-post">♡ J’aime</button><button data-action="comment-post">Commenter</button><span>Publication de démonstration</span></div></article>').join("");
 return pageHead("SOCIAL & GROWTH","Les communautés au cœur de <em>l’activité.</em>","Réseaux internes, groupes, communication et croissance commerciale.",button("＋ Nouvelle publication","new-post"))+
 '<div class="two-col social-layout">'+panel("Fil de l’organisation",posts)+panel("Espaces communautaires",'<div class="community"><b>Équipe pédagogique</b><small>42 membres · Privé</small>'+badge("Actif","success")+'</div><div class="community"><b>Entrepreneurs du Togo</b><small>1 240 membres · Public</small>'+badge("Modéré","info")+'</div><div class="community"><b>Parents d’élèves</b><small>380 membres · Restreint</small>'+badge("Actif","success")+'</div><p class="hint">Consentement, rôles, modération et règles de publication gouvernent les interactions.</p>')+'</div>';
}
function investment(){
 return pageHead("INVESTMENT CORE","Investir avec des informations <em>traçables.</em>","Éducation financière, opportunités, risques, liquidité et scénarios.",button("Simuler un scénario","investment-scenario"))+
 '<div class="metric-grid">'+metric("Opportunités suivies","18","Données de démonstration","◇")+metric("Portefeuille fictif",money(2500000),"Aucun actif réel","₣")+metric("Profil de risque","Modéré","Exemple pédagogique","◉")+metric("Scénarios","3","Stress / central / optimiste","▥")+'</div>'+
 panel("Analyse d’une opportunité",'<div class="investment-card"><div><span class="eyebrow">PROJET AGRICOLE · EXEMPLE</span><h3>Chaîne de valeur du soja</h3><p>Projet illustratif de financement d’équipements et de stockage.</p></div><div class="risk-grid"><div><small>Horizon indicatif</small><b>36 mois</b></div><div><small>Liquidité</small><b>Limitée</b></div><div><small>Risque</small>'+badge("Élevé","warning")+'</div><div><small>Provenance</small><b>À vérifier</b></div></div></div>')+
 panel("Garde-fous investissement",'<div class="check-list">'+["Éducation et compréhension du risque","Provenance et qualité des données","Liquidité et horizon","Scénarios défavorables","Aucune promesse de rendement","Exécution via partenaires autorisés uniquement"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>')+
 '<p class="notice-box">Les rendements ne sont jamais garantis. Ce prototype ne réalise aucune souscription, transaction boursière ou gestion d’actifs.</p>';
}
function aiCore(){
 return pageHead("T.PAY AI CORE","Une intelligence gouvernée, <em>pas un chatbot isolé.</em>","Les agents proposent, les politiques autorisent, les humains décident.",button("＋ Nouvelle analyse","ai-analysis"))+
 '<div class="metric-grid">'+metric("Agents spécialisés","12","Orchestration centralisée","✳")+metric("Actions préparées","48","Validation requise","▤")+metric("Approbations humaines","16","Contrôle explicite","✓")+metric("Actions financières autonomes","0","Interdites par conception","⊘")+'</div>'+
 '<div class="agent-grid">'+[["Finance Agent","Rapprochement & analyse"],["Education Agent","Scolarité & bulletins"],["Microfinance Agent","Portefeuille & terrain"],["Growth Agent","CRM & acquisition"],["HR Agent","Compétences & équipes"],["Document Agent","Extraction & génération"],["Voice Agent","Appels & rendez-vous"],["Project Agent","Délais & dépendances"]].map((a,i)=>'<article class="agent-card"><div class="agent-icon">✳</div><b>'+a[0]+'</b><small>'+a[1]+'</small><button data-action="ask-agent" data-name="'+a[0]+'">Préparer une analyse</button></article>').join("")+'</div>'+
 panel("Chaîne de contrôle de l’IA",'<div class="value-flow">'+["Contexte autorisé","Sources & données","Proposition IA","Capability Broker","Policy / risque / consentement","Approbation / step-up","Exécution autorisée","Trace & audit"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>')+
 '<p class="notice-box">L’IA ne contourne jamais les permissions, ne valide pas un paiement et ne modifie pas directement le ledger. Toute action à impact suit une politique et une autorisation humaine adaptée.</p>';
}
function documents(){
 return pageHead("DOCUMENT OS","Les documents suivent <em>l’identité de l’organisation.</em>","Modèles versionnés, filigranes, approbations et historique.",button("＋ Créer un modèle","new-document"))+
 '<div class="document-list">'+[["Bulletin scolaire","École Lumière","Version 2.1"],["Contrat de prestation","T.Pay Work","Version 1.4"],["Reçu de paiement","Financial Core","Version 3.0"],["Rapport de microfinance","SFD Solidarité","Version 1.2"]].map(d=>'<article class="document-row"><span class="doc-icon">▧</span><div><b>'+d[0]+'</b><small>'+d[1]+' · '+d[2]+'</small></div>'+badge("Modèle actif","success")+'<button class="link-btn" data-action="preview-document">Aperçu</button></article>').join("")+'</div>'+
 panel("Aperçu du document",'<div class="paper"><div class="paper-brand"><div class="logo-preview">EL</div><div><b>ÉCOLE LUMIÈRE</b><small>Année scolaire 2026–2027</small></div></div><h3>BULLETIN TRIMESTRIEL</h3><div class="watermark">EL</div><p>Élève : Ama Mensah · Classe : 6e A</p>'+table(["Matière","Coefficient","Moyenne"],[["Mathématiques","4","15,5"],["Français","3","14,0"],["Sciences","2","16,0"]])+'<p class="paper-foot">Document fictif · Modèle versionné · Filigrane organisation</p></div>');
}
function workflows(){
 return pageHead("WORKFLOW OS","Les opérations avancent avec <em>des règles visibles.</em>","Tâches, étapes, responsables, SLA, dépendances et décisions.",button("＋ Nouvelle tâche","new-task"))+
 '<div class="metric-grid">'+metric("Tâches ouvertes","32","Tous espaces","▤")+metric("En attente","8","Approbation requise","◷")+metric("SLA respecté","94 %","Indicateur fictif","✓")+metric("Risques détectés","3","À examiner","!")+'</div>'+
 '<div class="kanban">'+[["À faire",state.data.tasks.filter(t=>t.status==="À faire")],["En cours",state.data.tasks.filter(t=>t.status==="En cours")],["À valider",state.data.tasks.filter(t=>t.status==="À valider")]].map(([title,tasks])=>'<div class="kanban-col"><h3>'+title+' <span>'+tasks.length+'</span></h3>'+tasks.map(t=>'<article class="task-card"><b>'+esc(t.title)+'</b><small>'+esc(t.owner)+'</small>'+badge(t.status,t.status==="À valider"?"warning":"info")+'<button class="link-btn" data-action="advance-task" data-name="'+esc(t.title)+'">Faire avancer →</button></article>').join("")+'</div>').join("")+'</div>'+
 panel("Contrôle des workflows",'<div class="check-list">'+["États versionnés","Dépendances et branches conditionnelles","Validation maker/checker","Délégation et autorisations temporelles","SLA et alertes","Audit des transitions"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>');
}
function calendar(){
 return pageHead("TIME OS","Le temps et les ressources, <em>orchestrés.</em>","Calendriers personnels, équipes, projets, ressources et terrain.",button("＋ Réserver une ressource","new-booking"))+
 '<div class="metric-grid">'+metric("Réservations","48","Période démo","▦")+metric("Réunions","12","Cette semaine","◷")+metric("Conflits","2","Arbitrage nécessaire","!")+metric("Ressources","18","Salles & équipements","◇")+'</div>'+
 panel("Calendrier de démonstration",'<div class="calendar-grid">'+["Lundi","Mardi","Mercredi","Jeudi","Vendredi"].map((d,i)=>'<div><b>'+d+'</b><span>'+(i+8)+' nov.</span><article class="'+(i===1?"cal-event":"")+'">'+(i===1?"Comité de direction":i===3?"Réunion pédagogique":"Disponible")+'</article><article class="'+(i===2?"cal-event alt":"")+'">'+(i===2?"Salle A · Réservée":"Créneau ouvert")+'</article></div>').join("")+'</div>')+
 panel("Gouvernance des réservations",'<div class="check-list">'+["Priorité P0 urgence","P1 critique opérationnelle","P2 activité normale","P3 confort","Aucune réservation écrasée silencieusement","Arbitrage humain et historique"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>');
}
function superadmin(){
 return pageHead("SUPER ADMIN","La gouvernance du système, <em>sous contrôle.</em>","Identité, organisations, politiques, autorisations temporelles, audit et continuité.",button("Ouvrir le journal d’audit","audit-log"))+
 '<div class="metric-grid">'+metric("Organisations","24","Périmètres séparés","▦")+metric("Sessions actives","318","Données fictives","♙")+metric("Alertes sécurité","3","À examiner","!")+metric("Services","99,95 %","Disponibilité simulée","✓")+'</div>'+
 '<div class="two-col">'+panel("Gouvernance des accès",'<div class="permission-row"><b>Administrateur plateforme</b>'+badge("Permanent","info")+'</div><div class="permission-row"><b>Gestionnaire École Lumière</b>'+badge("Actif · expire 18:00","success")+'</div><div class="permission-row"><b>Auditeur externe</b>'+badge("En attente","warning")+'</div><div class="permission-row"><b>Accès urgence</b>'+badge("Désactivé","neutral")+'</div><p class="hint">Permissions liées à un acteur, un périmètre, une action, une période, une approbation et un audit.</p>')+panel("Contrôles de plateforme",'<div class="check-list">'+["FIDO2 / WebAuthn et step-up","PAM, JIT / JEA","HSM / KMS et rotation des clés","Isolation tenant et RLS","Journal d’audit append-only","Sauvegardes et restauration","Mode maintenance et reprise","Quorum et récupération d’urgence"].map(x=>'<div>✓ <span>'+x+'</span></div>').join("")+'</div>')+'</div>'+
 panel("Journal d’activité",state.data.events.slice(0,6).map(e=>'<div class="activity-row"><span class="activity-dot"></span><div><b>'+esc(e.title)+'</b><small>'+esc(e.detail)+'</small></div><time>'+esc(e.time)+'</time></div>').join(""));
}
function ecosystem(){
 return pageHead("VERTICALES","Un socle commun, <em>des métiers multiples.</em>","Les verticales spécialisées réutilisent l’identité, la sécurité, les documents et le Financial Core.",'')+
 '<div class="app-grid">'+[["Agriculture","Coopératives, campagnes, intrants, collecte et traçabilité"],["Transport","Flottes, trajets, réservation, livraison et maintenance"],["Santé","Structures, rendez-vous, dossiers et confidentialité"],["Hôtellerie","Réservations, chambres, services et caisse"],["Commerce","Points de vente, stocks, commandes et fidélité"],["Administration","Services publics, dossiers et workflows"]].map((x,i)=>'<article class="app-card"><span class="app-icon">'+["♧","⇄","✚","⌂","◇","▦"][i]+'</span><b>'+x[0]+'</b><small>'+x[1]+'</small>'+badge("Aperçu de domaine","info")+'</article>').join("")+'</div>'+
 panel("Architecture partagée",'<div class="value-flow">'+["Identity & Trust","Organization OS","Domain Services","Event Fabric","Financial Core","AI Core","Partner Gateway"].map((x,i)=>'<div class="flow-step"><span>'+(i+1)+'</span><b>'+x+'</b></div>').join("")+'</div>');
}
function renderModal(){
 let title="Action de démonstration",body="",submit="Enregistrer";
 if(modal==="add-student") {title="Ajouter un élève";body='<label>Nom complet<input name="name" required placeholder="Nom de l’élève"></label><label>Référence<input name="ref" placeholder="ELV-2026-004"></label><label>Classe<select name="class"><option>6e A</option><option>5e B</option><option>Terminale C</option></select></label>';}
 else if(modal==="add-client"){title="Ajouter un client";body='<label>Nom complet<input name="name" required placeholder="Nom du client"></label><label>Référence<input name="ref" placeholder="CLI-0044"></label><label>Agence<select name="agency"><option>Lomé Centre</option><option>Agoè</option><option>Kara</option></select></label>';}
 else if(modal==="new-post"){title="Nouvelle publication";body='<label>Votre message<textarea name="body" required placeholder="Partager une actualité..."></textarea></label>';}
 else if(modal==="create-org"){title="Créer une organisation";body='<label>Nom<input name="name" required placeholder="Nom de l’organisation"></label><label>Secteur<select name="sector"><option>Éducation</option><option>Microfinance</option><option>Entreprise</option><option>Agriculture</option><option>Hôtellerie</option><option>Association</option></select></label><label>Code couleur<input name="color" type="color" value="#0f8f68"></label>';}
 else if(modal==="new-task"){title="Créer une tâche";body='<label>Intitulé<input name="title" required></label><label>Responsable<input name="owner" required></label>';}
 else if(modal==="new-subsidy"){title="Nouvelle demande de School Subsidy";body='<label>Établissement<input name="school" required></label><label>Microfinance garante<input name="guarantor" required></label><label>Budget indicatif XOF<input name="amount" type="number" min="1" required></label><label>Commission négociée (%)<select name="commission"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>';}
 else if(modal==="simulate-payment"){title="Simuler un Payment Intent";body='<label>Motif<input name="reason" required placeholder="Ex. Contribution tontine"></label><label>Montant XOF<input name="amount" type="number" min="1" required></label><label>État<select name="status"><option>En attente</option><option>Simulé</option></select></label>';}
 else if(modal==="create-group"){title="Créer un groupe communautaire";body='<label>Nom du groupe<input name="name" required></label><label>Cycle<select name="cycle"><option>Hebdomadaire</option><option>Mensuel</option><option>Objectif</option></select></label><label>Membres prévus<input name="members" type="number" min="2" value="10"></label>';}
 else if(modal==="add-product"){title="Ajouter un produit";body='<label>Nom<input name="name" required></label><label>Catégorie<input name="category" required></label><label>Prix indicatif XOF<input name="amount" type="number" min="0"></label>';}
 else if(modal==="new-opportunity"){title="Publier une opportunité";body='<label>Intitulé<input name="title" required></label><label>Compétences recherchées<input name="skills" required></label><label>Type<select name="type"><option>Mission</option><option>Emploi</option><option>Stage</option></select></label>';}
 else if(modal==="new-document"){title="Créer un modèle documentaire";body='<label>Nom du modèle<input name="name" required></label><label>Organisation<input name="org" value="'+esc(state.org)+'"></label><label>Version<input name="version" value="1.0"></label>';}
 else if(modal==="new-booking"){title="Réserver une ressource";body='<label>Ressource<input name="resource" required placeholder="Salle A"></label><label>Objet<input name="purpose" required></label><label>Priorité<select name="priority"><option>P2 — Normale</option><option>P1 — Critique</option><option>P3 — Confort</option></select></label><label>Date<input name="date" type="date" required></label>';}
 else if(modal==="investment-scenario"){title="Simulation d’investissement";body='<label>Capital fictif XOF<input name="capital" type="number" min="1" value="500000"></label><label>Scénario<select name="scenario"><option>Central</option><option>Prudent</option><option>Stress</option></select></label><p class="hint">Simulation pédagogique sans rendement garanti ni transaction réelle.</p>';}
 else {title="Analyse IA préparée";body='<p>La demande est préparée en mode démonstration. L’agent propose une analyse, sans exécuter d’action financière ni contacter un tiers.</p><label>Contexte<input name="context" placeholder="Préciser le contexte"></label>';}
 return '<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">T.PAY · DÉMONSTRATION</div><h2>'+title+'</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="demo-form">'+body+'<div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">'+submit+'</button></div></form></section></div>';
}
function renderTour(){
 const steps=[["Identité & organisation","Un même socle d’identité, de contexte et de permissions pour toutes les organisations."],["Opérations métier","School OS, microfinance, tontine et marketplace orchestrent leurs propres règles."],["Financial Core","Un seul ledger canonique, des moteurs séparés et des adaptateurs contractuels."],["AI Core","Les agents analysent et préparent ; les politiques et les humains contrôlent."],["Gouvernance","L’audit, les autorisations temporelles et la sécurité traversent le système."]];
 const s=steps[tourStep]||steps[0];
 return '<div class="tour-backdrop"><section class="tour-card"><span class="eyebrow">VISITE INVESTISSEUR · '+(tourStep+1)+' / '+steps.length+'</span><h2>'+s[0]+'</h2><p>'+s[1]+'</p><div class="tour-progress">'+steps.map((x,i)=>'<i class="'+(i<=tourStep?"done":"")+'"></i>').join("")+'</div><div class="modal-actions"><button class="btn secondary" data-action="tour-close">Quitter</button><button class="btn primary" data-action="tour-next">'+(tourStep===steps.length-1?"Terminer":"Suivant →")+'</button></div></section></div>';
}
function render(){document.getElementById("app").innerHTML=shell();wire();}
function wire(){
 document.querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",()=>{active=el.dataset.nav;search="";render();}));
 document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();if(el.dataset.action==="close-modal"&&e.target!==el)return;act(el.dataset.action,el.dataset);}));
 const input=document.getElementById("global-search");if(input)input.addEventListener("input",e=>{search=e.target.value;filterSearch();});
 const form=document.getElementById("demo-form");if(form)form.addEventListener("submit",submitForm);
 document.querySelectorAll("[data-tab]").forEach(el=>el.addEventListener("click",()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");eventLog("Vue School OS sélectionnée",el.dataset.tab);}));
}
function filterSearch(){
 const q=search.toLowerCase();
 document.querySelectorAll(".app-card,.post,.activity-row,.document-row,.product-card,.task-card,.community").forEach(el=>{el.style.display=!q||el.textContent.toLowerCase().includes(q)?"":"none";});
}
function act(action,data={}){
 if(action==="reset"){if(confirm("Réinitialiser toutes les données de démonstration ?")){localStorage.removeItem(storageKey);state=loadState();active="home";search="";eventLog("Démonstration réinitialisée");render();}return;}
 if(action==="tour"){tourStep=0;render();return;}
 if(action==="tour-next"){if(tourStep>=4){tourStep=-1;active="home";}else tourStep++;render();return;}
 if(action==="tour-close"){tourStep=-1;render();return;}
 if(action==="close-modal"){modal=null;render();return;}
 if(action==="open-school"){active="education";render();return;}
 if(action==="open-mfi"){active="microfinance";render();return;}
 if(action==="open-eco"){active="ecosystem";render();return;}
 if(action==="notifications"){alert("Aucune notification critique. 3 éléments de démonstration.");return;}
 if(action==="help"){alert("Prototype investisseur T.Pay OS. Toutes les données sont fictives.");return;}
 if(action==="audit-log"){alert(state.data.events.map(e=>e.time+" — "+e.title).join("\n"));return;}
 if(action==="preview-document"){alert("Aperçu documentaire simulé : modèle versionné, identité de l’organisation et filigrane.");return;}
 if(action==="like-post"){eventLog("Réaction ajoutée","Interaction sociale simulée");render();return;}
 if(action==="comment-post"){modal="comment-post";render();return;}
 if(action==="client-detail"){alert("Dossier client de démonstration : KYC, historique et autorisations.");return;}
 if(action==="order-product"){eventLog("Commande simulée",data.name||"Produit");alert("Commande de démonstration créée. Aucun paiement n’est exécuté.");render();return;}
 if(action==="advance-task"){const t=state.data.tasks.find(x=>x.title===data.name);if(t){t.status=t.status==="À faire"?"En cours":t.status==="En cours"?"À valider":"Terminé";eventLog("Tâche avancée",t.title+" → "+t.status);persist();render();}return;}
 if(action==="ask-agent"){modal="ask-agent";render();return;}
 modal=action;render();
}
function submitForm(e){
 e.preventDefault();const fd=new FormData(e.currentTarget);const v=Object.fromEntries(fd.entries());
 if(modal==="add-student"){state.data.students.push({name:v.name,ref:v.ref||"ELV-DEMO-"+Date.now(),class:v.class,status:"Inscrit"});eventLog("Élève ajouté",v.name);}
 else if(modal==="add-client"){state.data.clients.push({name:v.name,ref:v.ref||"CLI-DEMO-"+Date.now(),agency:v.agency,status:"KYC à vérifier"});eventLog("Client ajouté",v.name);}
 else if(modal==="new-post"){state.data.posts.unshift({author:"Administrateur démo",body:v.body,time:"À l’instant"});eventLog("Publication créée","Fil social de l’organisation");}
 else if(modal==="create-org"){state.org=v.name;state.context=v.sector;eventLog("Organisation créée",v.name+" · "+v.sector);}
 else if(modal==="new-task"){state.data.tasks.push({title:v.title,owner:v.owner,status:"À faire"});eventLog("Tâche créée",v.title);}
 else if(modal==="new-subsidy"){eventLog("Demande School Subsidy créée",v.school+" · garant "+v.guarantor+" · "+v.amount+" XOF · commission "+v.commission+" %");}
 else if(modal==="simulate-payment"){eventLog("Payment Intent simulé",v.reason+" · "+v.amount+" XOF · "+v.status);}
 else if(modal==="create-group"){eventLog("Groupe de tontine créé",v.name+" · "+v.cycle+" · "+v.members+" membres");}
 else if(modal==="add-product"){eventLog("Produit ajouté au catalogue",v.name+" · "+v.category);}
 else if(modal==="new-opportunity"){eventLog("Opportunité publiée",v.title+" · "+v.skills+" · "+v.type);}
 else if(modal==="new-document"){eventLog("Modèle documentaire créé",v.name+" · v"+v.version);}
 else if(modal==="new-booking"){eventLog("Réservation simulée",v.resource+" · "+v.purpose+" · "+v.priority+" · "+v.date);}
 else if(modal==="investment-scenario"){eventLog("Scénario d’investissement simulé",v.capital+" XOF · "+v.scenario);}
 else if(modal==="comment-post"){eventLog("Commentaire ajouté","Commentaire social simulé");}
 else {eventLog("Analyse préparée",v.context||"Agent IA · aucune exécution");}
 persist();modal=null;render();
}
render();