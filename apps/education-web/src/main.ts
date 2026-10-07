import React from "react";
import {createRoot} from "react-dom/client";
import {SchoolApp} from "./app.js";
import "./style.css";
declare global{interface Window{__TPAY_SCHOOL_CONFIG__?:{apiBaseUrl:string;accessToken:string;expiresAt:string}}}
const root=document.getElementById("root");if(!root)throw new Error("WEB_ROOT_REQUIRED");
const config=window.__TPAY_SCHOOL_CONFIG__;if(!config)throw new Error("WEB_BOOTSTRAP_CONFIG_REQUIRED");
createRoot(root).render(React.createElement(SchoolApp,{config:{apiBaseUrl:config.apiBaseUrl,session:{accessToken:config.accessToken,expiresAt:config.expiresAt}}}));
