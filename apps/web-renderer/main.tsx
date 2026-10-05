import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { RendererErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("T.Pay renderer root is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
