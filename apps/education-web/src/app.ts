import React,{useEffect,useMemo,useRef,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";
import {shouldAnimateUi} from "./motion-policy.js";
const roles=["Administration","Enseignant","Élève","Parent"];
export function SchoolApp({config}:{config:SchoolWebConfig}){
 const client=useMemo(()=>createSchoolWebClient(config),[config]);const [events,setEvents]=useState<SchoolWebEvent[]>([]);const [status,setStatus]=useState(config.demo?"DEMO":"CONNECTING");
 const shellRef=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(config.demo)return;
  const controller=new AbortController();
  consumeSchoolSse(config,e=>setEvents(v=>[e,...v].slice(0,20)),controller.signal).then(()=>setStatus("DISCONNECTED")).catch(()=>{if(!controller.signal.aborted)setStatus("OFFLINE")});
  return()=>controller.abort();
 },[config]);
 useEffect(()=>{
  const shell=shellRef.current;
  if(!shell||typeof window==="undefined"||typeof navigator==="undefined")return;
  const nav=navigator as Navigator & {connection?:{saveData?:boolean};deviceMemory?:number};
  const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false;
  const motionCapability={reducedMotion,saveData:nav.connection?.saveData===true,hardwareConcurrency:navigator.hardwareConcurrency,...(nav.deviceMemory===undefined?{}:{deviceMemory:nav.deviceMemory})};
  if(!shouldAnimateUi(motionCapability))return;
  let disposed=false;
  let revert:undefined|(()=>void);
  void import("gsap").then(({gsap})=>{
   if(disposed||!shell.isConnected)return;
   const targets=shell.querySelectorAll(".school-header,.role-card,.live-panel");
   if(targets.length===0)return;
   const context=gsap.context(()=>{
    gsap.from(targets,{autoAlpha:0,y:10,duration:0.26,stagger:0.05,ease:"power2.out",clearProps:"transform,opacity,visibility"});
   },shell);
   revert=()=>context.revert();
  }).catch(()=>{/* Motion is progressive enhancement; the UI remains usable without it. */});
  return()=>{disposed=true;revert?.()};
 },[]);
 return React.createElement("main",{ref:shellRef,className:"school-shell"},
  React.createElement("header",{className:"school-header"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"T.PAY • SCHOOL OS"),React.createElement("h1",null,"Command Center"),React.createElement("p",null,config.demo?"Mode démonstration — aucune API réelle n'est appelée.":"Pilotage sécurisé de l'organisation scolaire en temps réel.")),React.createElement("span",{className:"status","aria-live":"polite","aria-atomic":"true"},status)),
  React.createElement("section",{className:"role-grid","aria-label":"Espaces de travail"},roles.map(role=>React.createElement("article",{key:role,className:"role-card"},React.createElement("h2",null,role),React.createElement("p",null,"Accès gouverné par les permissions serveur."),React.createElement("button",{type:"button",disabled:config.demo,onClick:()=>client.request("/v1/education/actors/current")},config.demo?"Indisponible en démo":"Ouvrir")))),
  React.createElement("section",{className:"live-panel","aria-labelledby":"live-panel-title"},React.createElement("h2",{id:"live-panel-title"},"Flux opérationnel"),events.length===0?React.createElement("p",null,config.demo?"Démo prête. Connecte un endpoint HTTPS pour activer le temps réel.":"En attente d'événements autorisés…"):events.map(e=>React.createElement("div",{key:e.id,className:"event-row"},React.createElement("strong",null,e.event),React.createElement("span",null,e.id))))
 );
}
