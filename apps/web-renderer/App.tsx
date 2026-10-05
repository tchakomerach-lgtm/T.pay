import { useMemo, useState } from "react";
import { useTpayBrowserRuntime } from "./runtime.js";
import { assertRendererRuntime } from "../design/renderer-quality.js";
import { buildTpayCssVariables } from "./adapter.js";
import { tpayTokens } from "../design/tokens.js";
import { assertShellModel, type TPayPrimaryDestination } from "../design/shell.js";
import { assertUniversalObject, type TPayUniversalObject } from "../design/objects.js";
import { assertObjectPresentation } from "../design/object-presentation.js";
import { assertActionPresentation } from "../design/action-presentation.js";
import { assertRealtimePresentation } from "../design/realtime-presentation.js";
import { assertSyncPresentation } from "../design/sync-presentation.js";
import { assertFieldDisplayPolicy } from "../design/field-mode.js";
import type { TPayActionContract } from "../design/actions.js";

const destinations: readonly TPayPrimaryDestination[] = [
  "home","organizations","social","opportunities","community-tontine",
  "wallet","notifications","search","command-center","settings",
];

const demoObject: TPayUniversalObject = {
  objectType: "payment",
  objectId: "demo-payment-001",
  contextId: "personal",
  title: "Paiement école",
  subtitle: "École pilote · frais scolaires",
  status: "pending",
  sensitivity: "internal",
  freshness: "fresh",
  sync: "synced",
  version: 1,
  availableActions: ["view","confirm"],
};

const demoAction: TPayActionContract = {
  actionId: "demo-confirm",
  verb: "confirmer",
  objectType: "payment",
  objectId: demoObject.objectId,
  contextId: demoObject.contextId,
  state: "idle",
  consequential: true,
};

function validateContracts(): void {
  assertShellModel({
    activeContextId: "personal",
    primaryDestination: "home",
    destinations,
    unreadNotifications: 3,
    pendingActions: 1,
    connection: "online",
  });
  assertUniversalObject(demoObject);
  assertObjectPresentation({
    object: demoObject, headingLevel: 1, showStatus: true, showFreshness: true,
    showContext: true, showActivity: true, compact: false, sensitiveFieldsHidden: true,
    redactionReason: "Présentation contrôlée par le renderer",
  });
  assertActionPresentation({
    action: demoAction, label: "Préparer", confirmationRequired: true,
    previewRequired: true, retryable: true, destructive: false,
  });
  assertRealtimePresentation({
    freshness: "fresh", sync: "synced", changedFields: [],
    announcement: "Données à jour", visualDiff: false, screenFlash: false,
  });
  assertSyncPresentation({
    connection: "online", queuedCount: 0, conflictCount: 0,
    action: demoAction, localOutcome: "not-started",
  });
  assertFieldDisplayPolicy({
    mode: "standard", maxListItems: 50, preferTextOverMedia: false,
    animationsEnabled: true, autoRefreshSeconds: 30, allowLargeImages: true,
  });
}

validateContracts();

export function App() {
  const [active, setActive] = useState<TPayPrimaryDestination>("home");
  const [fieldMode, setFieldMode] = useState<"standard" | "low-bandwidth" | "offline">("standard");
  const [notice, setNotice] = useState("T.Pay Design Runtime actif");
  const runtime = useTpayBrowserRuntime(fieldMode);

  assertRendererRuntime({
    connection: runtime.connection,
    load: "ready",
    density: runtime.density,
    viewport: runtime.viewport,
    reducedMotion: runtime.reducedMotion,
    queuedActions: 0,
    conflicts: 0,
  });

  const destinationLabel = useMemo(() => ({
    home: "Accueil", organizations: "Organisations", social: "Réseau social",
    opportunities: "Opportunités", "community-tontine": "Tontine communautaire",
    wallet: "Wallet", notifications: "Notifications", search: "Recherche",
    "command-center": "Command Center", settings: "Paramètres",
  } satisfies Record<TPayPrimaryDestination,string>)[active], [active]);

  const runAction = () => {
    setNotice("Action préparée avec prévisualisation et confirmation requises.");
  };

  return (
    <div className={fieldMode === "offline" ? "tpay app offline" : "tpay app"}>
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand"><span className="brand-mark">↗</span><span>T.Pay</span></div>
        <div className="context">Personnel <span>●</span></div>
        <nav>
          {destinations.map((item) => (
            <button
              key={item}
              className={active === item ? "nav-item active" : "nav-item"}
              aria-current={active === item ? "page" : undefined}
              onClick={() => setActive(item)}
            >
              <span aria-hidden="true">•</span>{labelFor(item)}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">T.PAY EXPERIENCE OS</div>
            <h1>{destinationLabel}</h1>
          </div>
          <div className="top-actions">
            <button className="mode" onClick={() => setFieldMode(fieldMode === "standard" ? "low-bandwidth" : fieldMode === "low-bandwidth" ? "offline" : "standard")}>
              Mode : {fieldMode}
            </button>
            <span className={"live " + runtime.connection} aria-live="polite">{connectionLabel(runtime.connection)}</span>
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="badge">DB-075 · React Renderer</span>
            <h2>Un seul Design System, plusieurs surfaces.</h2>
            <p>Le renderer consomme les contrats DB-073/074 : tokens, contexte, objets, actions, temps réel, synchronisation et mode terrain.</p>
          </div>
          <div className="hero-metric"><strong>2026.10</strong><span>Design Registry</span></div>
        </section>

        <section className="grid">
          <article className="card object-card">
            <div className="card-head"><span>Objet universel</span><span className="status">● {demoObject.status}</span></div>
            <h3>{demoObject.title}</h3>
            <p>{demoObject.subtitle}</p>
            <div className="meta"><span>Type · {demoObject.objectType}</span><span>v{demoObject.version}</span><span>À jour</span></div>
            <div className="actions">
              <button className="primary" onClick={runAction}>Préparer l'action</button>
              <button className="secondary" onClick={() => setNotice("Objet ouvert dans son contexte.")}>Ouvrir</button>
            </div>
          </article>

          <article className="card">
            <div className="card-head"><span>Temps réel</span><span className="status">● stable</span></div>
            <div className="pulse"><span className="pulse-dot" /> Données fraîches</div>
            <p className="muted">Les changements sont signalés localement. Aucun clignotement de l'écran entier.</p>
            <div className="diff"><span>Solde</span><strong>+25 000 FCFA</strong><small>Mis à jour</small></div>
          </article>

          <article className="card">
            <div className="card-head"><span>Action gouvernée</span><span className="lock">◈</span></div>
            <h3>Confirmer le paiement</h3>
            <p>Prévisualisation → confirmation → exécution → résultat → récupération.</p>
            <button className="secondary full" onClick={runAction}>Voir la prévisualisation</button>
          </article>

          <article className="card">
            <div className="card-head"><span>Mode terrain</span><span className="status">{runtime.viewport} · {runtime.density}</span></div>
            <div className="field-row"><span>Connexion</span><strong>{connectionLabel(runtime.connection)}</strong></div>
            <div className="field-row"><span>Média lourd</span><strong>{fieldMode === "low-bandwidth" || fieldMode === "offline" ? "Réduit" : "Autorisé"}</strong></div>
            <div className="field-row"><span>Animation</span><strong>{runtime.reducedMotion || fieldMode === "offline" ? "Réduite" : "Adaptative"}</strong></div>
          </article>
        </section>

        <div className="toast" role="status" aria-live="polite">{notice}</div>
      </main>
    </div>
  );
}

function labelFor(item: TPayPrimaryDestination): string {
  return ({
    home: "Accueil", organizations: "Organisations", social: "Réseau social",
    opportunities: "Opportunités", "community-tontine": "Tontine",
    wallet: "Wallet", notifications: "Notifications", search: "Recherche",
    "command-center": "Command Center", settings: "Paramètres",
  } satisfies Record<TPayPrimaryDestination,string>)[item];
}
