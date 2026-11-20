import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {SchoolApp} from "./app.js";
import type {SchoolWebConfig} from "./school-web.js";
import "./style.css";

declare global{interface Window{__TPAY_SCHOOL_CONFIG__?:{apiBaseUrl:string;actorId:string;accessToken:string;expiresAt:string}}}

const STORAGE_KEY="tpay-school-test-config";
const root=document.getElementById("root");if(!root)throw new Error("WEB_ROOT_REQUIRED");

function readConfig():SchoolWebConfig|null{
  const raw=window.__TPAY_SCHOOL_CONFIG__??(()=>{try{const value=sessionStorage.getItem(STORAGE_KEY);return value?JSON.parse(value):undefined}catch{return undefined}})();
  if(raw?.apiBaseUrl&&raw?.actorId&&raw?.accessToken&&raw?.expiresAt)return {apiBaseUrl:raw.apiBaseUrl,actorId:raw.actorId,session:{accessToken:raw.accessToken,expiresAt:raw.expiresAt}};
  return null;
}

function Setup(){const [,refresh]=useState(0);
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const apiBaseUrl=String(form.get("apiBaseUrl")??"").trim().replace(/\/$/,"");const actorId=String(form.get("actorId")??"").trim();const accessToken=String(form.get("accessToken")??"").trim();const expiresAt=String(form.get("expiresAt")??"").trim();if(!apiBaseUrl||!actorId||!accessToken)return;try{const parsed=new URL(apiBaseUrl);if(parsed.protocol!=="https:"||parsed.origin!==apiBaseUrl)throw new Error("HTTPS_REQUIRED");}catch{alert("L'API doit être une URL HTTPS valide, sans chemin.");return;}const expiry=expiresAt?new Date(expiresAt):new Date(Date.now()+86400000);if(!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now()){alert("La date d'expiration doit être valide et dans le futur.");return;}const config={apiBaseUrl,actorId,accessToken,expiresAt:expiry.toISOString()};sessionStorage.setItem(STORAGE_KEY,JSON.stringify(config));refresh(v=>v+1);};
  const config=readConfig();
  if(config)return React.createElement(SchoolApp,{config,onDisconnect:()=>{sessionStorage.removeItem(STORAGE_KEY);sessionStorage.removeItem("tpay-school-last-event-id");refresh(v=>v+1);}});
  return React.createElement("main",{className:"connect-shell"},
    React.createElement("section",{className:"connect-card"},
      React.createElement("div",{className:"brand-lockup"},React.createElement("div",{className:"brand-mark"},"T."),React.createElement("div",null,React.createElement("strong",null,"T.Pay"),React.createElement("small",null,"OPERATING SYSTEM"))),
      React.createElement("p",{className:"eyebrow"},"ESPACE DE TEST UTILISATEUR"),
      React.createElement("h1",null,"Connectez votre espace T.Pay"),
      React.createElement("p",{className:"muted"}, "Cette interface se connecte au serveur HTTPS et à PostgreSQL. Elle n'utilise pas de données fictives. Il vous faut une session de test émise par l'administrateur de l'environnement."),
      React.createElement("form",{onSubmit:submit,className:"connect-form"},
        React.createElement("label",null,"URL de l'API HTTPS",React.createElement("input",{name:"apiBaseUrl",type:"url",placeholder:"https://api.votre-domaine.tld",required:true,autoComplete:"url"})),
        React.createElement("label",null,"Identifiant de l'acteur",React.createElement("input",{name:"actorId",placeholder:"Identifiant fourni avec la session",required:true,autoComplete:"off"})),
        React.createElement("label",null,"Jeton de session",React.createElement("input",{name:"accessToken",type:"password",placeholder:"Jeton sécurisé",required:true,autoComplete:"off"})),
        React.createElement("label",null,"Expiration de la session (facultatif)",React.createElement("input",{name:"expiresAt",placeholder:"ISO 8601, sinon 24 h",autoComplete:"off"})),
        React.createElement("button",{type:"submit",className:"primary-button"},"Se connecter à T.Pay")
      ),
      React.createElement("p",{className:"security-note"},"Le jeton est conservé uniquement dans la session du navigateur. Aucun mot de passe ou secret n'est envoyé à un service tiers.")
    )
  );
}

createRoot(root).render(React.createElement(Setup));
