import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {SchoolApp} from "./app.js";
import {GlobalPortal} from "./os-portal.js";
import type {SchoolWebConfig} from "./school-web.js";
import "./style.css";

declare global{interface Window{__TPAY_SCHOOL_CONFIG__?:{apiBaseUrl:string;accessToken:string;expiresAt:string}}}
const STORAGE_KEY="tpay-school-test-config";
const root=document.getElementById("root");if(!root)throw new Error("WEB_ROOT_REQUIRED");
function readConfig():SchoolWebConfig|null{
 const raw=window.__TPAY_SCHOOL_CONFIG__??(()=>{try{const value=sessionStorage.getItem(STORAGE_KEY);return value?JSON.parse(value):undefined}catch{return undefined}})();
 if(raw?.apiBaseUrl&&raw?.accessToken&&raw?.expiresAt)return {apiBaseUrl:raw.apiBaseUrl,session:{accessToken:raw.accessToken,expiresAt:raw.expiresAt},demo:raw.demo===true};
 return null;
}
function Setup(){
 const [revision,setRevision]=useState(0);const [openSchool,setOpenSchool]=useState(false);
 const config=readConfig();
 const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const apiBaseUrl=String(form.get("apiBaseUrl")??"").trim();const accessToken=String(form.get("accessToken")??"").trim();if(!apiBaseUrl||!accessToken)return;try{const url=new URL(apiBaseUrl);if(url.protocol!=="https:")throw new Error("HTTPS_REQUIRED");sessionStorage.setItem(STORAGE_KEY,JSON.stringify({apiBaseUrl:url.toString().replace(/\/$/,""),accessToken,expiresAt:new Date(Date.now()+86400000).toISOString(),demo:false}));setRevision(v=>v+1);}catch{window.alert("Une URL API HTTPS valide est obligatoire.");}};
 const demo=()=>{sessionStorage.setItem(STORAGE_KEY,JSON.stringify({apiBaseUrl:"https://demo.invalid",accessToken:"demo-session",expiresAt:new Date(Date.now()+86400000).toISOString(),demo:true}));setRevision(v=>v+1);};
 const exit=()=>{sessionStorage.removeItem(STORAGE_KEY);setOpenSchool(false);setRevision(v=>v+1);};
 void revision;
 if(config&&openSchool)return React.createElement(SchoolApp,{config:{...config,demo:config.demo===true}});
 if(config)return React.createElement(GlobalPortal,{onOpenSchool:()=>setOpenSchool(true),onExit:exit});
 return React.createElement("main",{className:"school-shell"},React.createElement("section",{className:"setup-panel"},React.createElement("p",{className:"eyebrow"},"T.PAY OS • ACCÈS DE TEST"),React.createElement("h1",null,"Lancer T.Pay OS"),React.createElement("p",null,"Configure un endpoint HTTPS et un jeton de test pour accéder au portail. Les valeurs restent dans cette session du navigateur."),React.createElement("form",{onSubmit:submit,className:"setup-form"},React.createElement("label",null,"API HTTPS",React.createElement("input",{name:"apiBaseUrl",placeholder:"https://api.example.tg",required:true,type:"url"})),React.createElement("label",null,"Jeton de test",React.createElement("input",{name:"accessToken",type:"password",autoComplete:"off",required:true})),React.createElement("button",{type:"submit"},"Se connecter")),React.createElement("button",{type:"button",onClick:demo,className:"secondary"},"Ouvrir le portail en démonstration"),React.createElement("p",{className:"notice"},"La démonstration utilise des données fictives. Elle ne crée aucune opération financière et ne représente pas une connexion à une API réelle.")));
}
createRoot(root).render(React.createElement(Setup));
