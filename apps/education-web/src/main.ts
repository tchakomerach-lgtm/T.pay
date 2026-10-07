import React from "react";
import {createRoot} from "react-dom/client";
import {SchoolApp} from "./app.js";
import "./style.css";
const root=document.getElementById("root");if(!root)throw new Error("WEB_ROOT_REQUIRED");
const apiBaseUrl=document.documentElement.dataset.apiBaseUrl;const accessToken=document.documentElement.dataset.accessToken;const expiresAt=document.documentElement.dataset.sessionExpiresAt;
if(!apiBaseUrl||!accessToken||!expiresAt)throw new Error("WEB_BOOTSTRAP_SESSION_REQUIRED");
createRoot(root).render(React.createElement(SchoolApp,{config:{apiBaseUrl,session:{accessToken,expiresAt}}}));
