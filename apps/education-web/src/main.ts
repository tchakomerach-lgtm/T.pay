import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {SchoolApp} from "./app.js";
import type {SchoolWebConfig} from "./school-web.js";
import "./style.css";

declare global{interface Window{__TPAY_SCHOOL_CONFIG__?:{apiBaseUrl:string;accessToken:string;expiresAt:string}}}
const root=document.getElementById("root");
if(!root)throw new Error("WEB_ROOT_REQUIRED");

function readConfig():SchoolWebConfig|null{
  const raw=window.__TPAY_SCHOOL_CONFIG__;
  if(raw?.apiBaseUrl&&raw?.accessToken&&raw?.expiresAt&&Date.parse(raw.expiresAt)>Date.now()){
    return {apiBaseUrl:raw.apiBaseUrl,session:{accessToken:raw.accessToken,expiresAt:raw.expiresAt}};
  }
  return null;
}

function BrandMark(){return React.createElement("div",{className:"brand-mark","aria-hidden":true},
  React.createElement("span",{className:"brand-mark-core"},"T."));}

function AuthScreen(){
  const [showPassword,setShowPassword]=useState(false);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(busy)return;
    setBusy(true);
    setNotice("Le service d’authentification serveur n’est pas encore raccordé à cet écran. Aucun identifiant n’a été transmis ni enregistré.");
    window.setTimeout(()=>setBusy(false),450);
  };
  return React.createElement("main",{className:"auth-page"},
    React.createElement("div",{className:"auth-ambient ambient-one"}),
    React.createElement("div",{className:"auth-ambient ambient-two"}),
    React.createElement("section",{className:"auth-layout"},
      React.createElement("aside",{className:"brand-panel"},
        React.createElement("div",{className:"brand-top"},React.createElement(BrandMark),React.createElement("span",null,"T.PAY")),
        React.createElement("div",{className:"brand-copy"},
          React.createElement("span",{className:"brand-kicker"},"L’ÉCOSYSTÈME QUI VOUS CONNECTE"),
          React.createElement("h1",null,"L’éducation mérite une expérience plus simple."),
          React.createElement("p",null,"Un espace de travail sécurisé pour les établissements, les équipes pédagogiques, les élèves et les familles."),
          React.createElement("div",{className:"brand-feature"},
            React.createElement("span",{className:"feature-icon"},"✦"),
            React.createElement("div",null,React.createElement("strong",null,"Tout votre établissement, au même endroit"),React.createElement("small",null,"Gestion · Pédagogie · Communication")))),
        React.createElement("div",{className:"brand-footer"},
          React.createElement("span",{className:"secure-dot"}),
          React.createElement("span",null,"Un espace pensé pour la confiance"),
          React.createElement("span",{className:"brand-version"},"SCHOOL OS"))),
      React.createElement("section",{className:"auth-main"},
        React.createElement("div",{className:"mobile-brand"},React.createElement(BrandMark),React.createElement("span",null,"T.PAY")),
        React.createElement("div",{className:"auth-content"},
          React.createElement("div",{className:"auth-heading"},
            React.createElement("span",{className:"auth-eyebrow"},"VOTRE ESPACE T.PAY"),
            React.createElement("h2",null,"Ravi de vous revoir."),
            React.createElement("p",null,"Connectez-vous pour accéder à votre espace.")),
          React.createElement("form",{className:"auth-form",onSubmit:submit},
            React.createElement("label",{htmlFor:"identity"},"Adresse e-mail ou identifiant"),
            React.createElement("div",{className:"field-wrap"},
              React.createElement("span",{className:"field-icon","aria-hidden":true},"✉"),
              React.createElement("input",{id:"identity",name:"identity",type:"text",autoComplete:"username",placeholder:"ex. nom@etablissement.tg",required:true})),
            React.createElement("div",{className:"password-label"},
              React.createElement("label",{htmlFor:"password"},"Mot de passe"),
              React.createElement("span",{className:"password-hint"},"Accès personnel")),
            React.createElement("div",{className:"field-wrap"},
              React.createElement("span",{className:"field-icon","aria-hidden":true},"⌑"),
              React.createElement("input",{id:"password",name:"password",type:showPassword?"text":"password",autoComplete:"current-password",placeholder:"Votre mot de passe",required:true}),
              React.createElement("button",{type:"button",className:"reveal-button",onClick:()=>setShowPassword(v=>!v),"aria-label":showPassword?"Masquer le mot de passe":"Afficher le mot de passe"},showPassword?"Masquer":"Afficher")),
            React.createElement("div",{className:"auth-options"},
              React.createElement("label",{className:"remember-option"},React.createElement("input",{type:"checkbox",name:"remember"}),React.createElement("span",null,"Se souvenir de moi")),
              React.createElement("span",{className:"recovery-note"},"Besoin d’aide ? Contactez votre administrateur")),
            React.createElement("button",{type:"submit",className:"login-button",disabled:busy},busy?"Vérification…": "Se connecter",React.createElement("span",{ "aria-hidden":true },"→")),
            notice?React.createElement("p",{className:"auth-notice","role":"status"},notice):null),
          React.createElement("div",{className:"auth-security"},
            React.createElement("span",{className:"security-icon"},"◇"),
            React.createElement("p",null,React.createElement("strong",null,"Connexion protégée")," — vos accès doivent être vérifiés par les services sécurisés de T.Pay."))),
        React.createElement("footer",{className:"auth-bottom"},
          React.createElement("span",null,"© 2026 T.Pay · School OS"),
          React.createElement("span",null,"Confidentialité · Sécurité")))));
}

const config=readConfig();
createRoot(root).render(config?React.createElement(SchoolApp,{config}):React.createElement(AuthScreen));
