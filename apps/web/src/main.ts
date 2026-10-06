export type Screen = "home" | "organizations" | "social" | "opportunities" | "tontine";

export interface NavItem { id: Screen; label: string; icon: string; }

export const navigation: readonly NavItem[] = [
  { id: "home", label: "Accueil", icon: "⌂" },
  { id: "organizations", label: "Organisations", icon: "▦" },
  { id: "social", label: "Réseau social", icon: "◎" },
  { id: "opportunities", label: "Opportunités", icon: "↗" },
  { id: "tontine", label: "Tontine communautaire", icon: "◌" }
];

const content: Record<Screen, {eyebrow:string; title:string; description:string}> = {
  home: { eyebrow: "T.Pay OS", title: "Votre espace central", description: "Un point d’entrée unique pour les activités, organisations, opportunités et services T.Pay." },
  organizations: { eyebrow: "Gestion des organisations", title: "Pilotez vos organisations", description: "Préparez les espaces École, Micro-finance, Entreprise, Coopérative, Ferme et autres verticales." },
  social: { eyebrow: "Réseau social", title: "Votre réseau T.Pay", description: "Publications, communautés et communications, avec des contrôles de sécurité intégrés." },
  opportunities: { eyebrow: "Opportunités", title: "Travail, projets et recrutement", description: "Un espace orienté compétences, recrutement, missions et développement professionnel." },
  tontine: { eyebrow: "Tontine communautaire", title: "Épargner ensemble", description: "Module communautaire indépendant de la tontine journalière des microfinances." }
};

const demoOrganizations = [
  ["École", "Gestion scolaire", "À configurer"],
  ["Micro-finance", "Épargne & crédit", "Sandbox"],
  ["Entreprise", "ERP & CRM", "À configurer"]
] as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c] ?? c);
}

export function renderScreen(screen: Screen, signedIn: boolean): string {
  const current = content[screen];
  const orgCards = demoOrganizations.map(([type, desc, status]) =>
    `<article class="card"><div class="card-icon">▦</div><div><h3>${type}</h3><p>${desc}</p><span class="badge">${status}</span></div></article>`
  ).join("");
  return `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#home" aria-label="T.Pay accueil"><span class="brand-mark">↑</span><span>T<span>.pay</span></span></a>
        <div class="environment"><span></span> Web Alpha · données de test</div>
        <nav aria-label="Navigation principale">
          ${navigation.map(item => `<a class="nav-item ${item.id === screen ? "active" : ""}" href="#${item.id}"><b>${item.icon}</b><span>${item.label}</span></a>`).join("")}
        </nav>
        <div class="sidebar-bottom">
          <button class="ghost-button" data-action="simulate">⚙ Simuler une session</button>
          <small>Aucune opération financière réelle dans cette Alpha.</small>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="mobile-brand"><span class="brand-mark">↑</span>T<span>.pay</span></div>
          <div class="top-actions"><span class="status-dot">● Sandbox</span><button class="avatar" title="Profil">TA</button></div>
        </header>
        <section class="hero">
          <div>
            <p class="eyebrow">${escapeHtml(current.eyebrow)}</p>
            <h1>${escapeHtml(current.title)}</h1>
            <p class="lead">${escapeHtml(current.description)}</p>
          </div>
          <div class="hero-actions">
            ${screen === "organizations" ? '<button class="primary" data-action="create-org">+ Créer une organisation</button>' : '<button class="secondary" data-action="notify">Tester une notification</button>'}
          </div>
        </section>
        ${screen === "home" ? `
          <section class="metrics">
            <article><span>Activités</span><strong>12</strong><small>dans le flux de test</small></article>
            <article><span>Organisations</span><strong>3</strong><small>espaces de démonstration</small></article>
            <article><span>Opportunités</span><strong>5</strong><small>à découvrir</small></article>
            <article><span>Tontine</span><strong>1</strong><small>communauté de test</small></article>
          </section>
          <section class="section-grid">
            <article class="panel"><div class="panel-head"><div><p class="eyebrow">Première vérification</p><h2>Parcours utilisateur</h2></div><span class="success">Prêt à tester</span></div>
              <ol class="steps"><li><b>1</b><span>Ouvrir T.Pay Web Alpha</span><em>✓</em></li><li><b>2</b><span>Naviguer entre les modules</span><em>✓</em></li><li><b>3</b><span>Créer une organisation de démonstration</span><em>Test</em></li><li><b>4</b><span>Brancher l’API et l’identité réelles</span><em>Prochaine couche</em></li></ol>
            </article>
            <article class="panel feed"><div class="panel-head"><div><p class="eyebrow">Flux</p><h2>Activité récente</h2></div></div>
              <div class="feed-item"><span class="feed-icon">↗</span><div><b>Web Alpha initialisée</b><p>Interface navigateur disponible avec navigation T.Pay.</p></div><time>maintenant</time></div>
              <div class="feed-item"><span class="feed-icon">▦</span><div><b>Architecture conservée</b><p>La finance réelle reste séparée du mode démonstration.</p></div><time>maintenant</time></div>
            </article>
          </section>` :
          screen === "organizations" ? `<section class="cards-grid">${orgCards}</section><section class="panel callout"><div><p class="eyebrow">Architecture</p><h2>Chaque organisation aura son propre espace</h2><p>Rôles, permissions, ERP, CRM, documents, wallet, assistant IA, recrutement, marketplace et communication seront branchés progressivement sur les contrats serveur existants.</p></div></section>` :
          `<section class="panel empty"><div class="empty-icon">◎</div><h2>${escapeHtml(current.title)}</h2><p>La coque Web est opérationnelle. Cette verticale sera reliée à ses services métier réels sans contourner les permissions, le ledger ou les contrôles de risque.</p><button class="secondary" data-action="notify">Créer un événement de test</button></section>`}
      </main>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </div>`;
}

export function startApp(root: HTMLElement): void {
  const getScreen = (): Screen => {
    const value = location.hash.slice(1) as Screen;
    return navigation.some((n) => n.id === value) ? value : "home";
  };
  const render = () => {
    const signedIn = localStorage.getItem("tpay.demo.session") === "active";
    root.innerHTML = renderScreen(getScreen(), signedIn);
    root.querySelectorAll<HTMLElement>("[data-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "simulate") {
        localStorage.setItem("tpay.demo.session", "active");
        showToast(root, "Session de démonstration activée.");
      } else if (action === "create-org") {
        const name = window.prompt("Nom de l’organisation de test", "T.Pay Démo");
        if (name?.trim()) {
          localStorage.setItem("tpay.demo.organization", name.trim());
          showToast(root, `Organisation « ${name.trim()} » enregistrée localement.`);
        }
      } else {
        showToast(root, "Événement de démonstration enregistré localement.");
      }
    }));
  };
  const showToastOnLoad = () => {
    if (location.hash === "") history.replaceState(null, "", "#home");
    render();
  };
  window.addEventListener("hashchange", render);
  showToastOnLoad();
}

function showToast(root: HTMLElement, message: string): void {
  const toast = root.querySelector<HTMLElement>("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

const root = document.getElementById("app");
if (root) startApp(root);
