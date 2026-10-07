import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {SchoolApp} from "./app.js";
import type {SchoolWebConfig} from "./school-web.js";
import "./style.css";

declare global{interface Window{__TPAY_SCHOOL_CONFIG__?:{apiBaseUrl:string;accessToken:string;expiresAt:string}}}

const STORAGE_KEY="tpay-school-test-config";
const root=document.getElementById("root");if(!root)throw new Error("WEB_ROOT_REQUIRED");

function readConfig():SchoolWebConfig|null{
  const raw=window.__TPAY_SCHOOL_CONFIG__??(()=>{try{const value=sessionStorage.getItem(STORAGE_KEY);return value?JSON.parse(value):undefined}catch{return undefined}})();
  if(raw?.apiBaseUrl&&raw?.accessToken&&raw?.expiresAt)return {apiBaseUrl:raw.apiBaseUrl,session:{accessToken:raw.accessToken,expiresAt:raw.expiresAt}};
  return null;
}

function Setup(){const [,refresh]=useState(0);
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const apiBaseUrl=String(form.get("apiBaseUrl")??"").trim();const accessToken=String(form.get("accessToken")??"").trim();if(!apiBaseUrl||!accessToken)return;sessionStorage.setItem(STORAGE_KEY,JSON.stringify({apiBaseUrl,accessToken,expiresAt:new Date(Date.now()+86400000).toISOString()}));refresh(v=>v+1);};
  const demo=()=>{sessionStorage.setItem(STORAGE_KEY,JSON.stringify({apiBaseUrl:"https://demo.invalid",accessToken:"demo-session",expiresAt:new Date(Date.now()+86400000).toISOString(),demo:true}));refresh(v=>v+1);};
  const config=readConfig();
  if(config)return React.createElement(SchoolApp,{config:{...config,demo:config.apiBaseUrl==="https://demo.invalid"}});
  return React.createElement("main",{className:"school-shell"},
    React.createElement("section",{className:"setup-panel"},React.createElement("p",{className:"eyebrow"},"T.PAY • TEST BOOTSTRAP"),React.createElement("h1",null,"Connexion de test"),React.createElement("p",null,"La version précédente plantait lorsque la configuration de session n'était pas injectée. Configure ici un endpoint HTTPS et un jeton de test. Les valeurs sont conservées uniquement dans sessionStorage."),
      React.createElement("form",{onSubmit:submit,className:"setup-form"},
        React.createElement("label",null,"API HTTPS",React.createElement("input",{name:"apiBaseUrl",placeholder:"https://127.0.0.1:8443",required:true})),
        React.createElement("label",null,"Jeton de test",React.createElement("input",{name:"accessToken",type:"password",autoComplete:"off",required:true})),
        React.createElement("button",{type:"submit"},"Lancer T.Pay")
      ),
      React.createElement("button",{type:"button",onClick:demo,className:"secondary"},"Ouvrir en mode démonstration"),
      React.createElement("p",{className:"notice"},"Le mode démonstration vérifie le lancement du frontend sans prétendre fournir une API financière réelle.")
    )
  );
}

createRoot(root).render(React.createElement(Setup));
