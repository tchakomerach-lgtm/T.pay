import React,{useEffect,useMemo,useState} from "react";
import {createSchoolWebClient,consumeSchoolSse,type SchoolWebConfig,type SchoolWebEvent} from "./school-web.js";
const roles=["Administration","Enseignant","Élève","Parent"];
export function SchoolApp({config}:{config:SchoolWebConfig}){
 const client=useMemo(()=>createSchoolWebClient(config),[config]);const [events,setEvents]=useState<SchoolWebEvent[]>([]);const [status,setStatus]=useState("CONNECTING");
 useEffect(()=>{const controller=new AbortController();consumeSchoolSse(config,e=>setEvents(v=>[e,...v].slice(0,20)),controller.signal).then(()=>setStatus("DISCONNECTED")).catch(()=>setStatus("OFFLINE"));return()=>controller.abort();},[config]);
 return React.createElement("main",{className:"school-shell"},
  React.createElement("header",{className:"school-header"},React.createElement("div",null,React.createElement("p",{className:"eyebrow"},"T.PAY • SCHOOL OS"),React.createElement("h1",null,"Command Center"),React.createElement("p",null,"Pilotage sécurisé de l'organisation scolaire en temps réel.")),React.createElement("span",{className:"status"},status)),
  React.createElement("section",{className:"role-grid"},roles.map(role=>React.createElement("article",{key:role,className:"role-card"},React.createElement("h2",null,role),React.createElement("p",null,"Accès gouverné par les permissions serveur."),React.createElement("button",{type:"button",onClick:()=>client.request("/v1/education/actors/current")},"Ouvrir")))),
  React.createElement("section",{className:"live-panel"},React.createElement("h2",null,"Flux opérationnel"),events.length===0?React.createElement("p",null,"En attente d'événements autorisés…"):events.map(e=>React.createElement("div",{key:e.id,className:"event-row"},React.createElement("strong",null,e.event),React.createElement("span",null,e.id))))
 );
}
