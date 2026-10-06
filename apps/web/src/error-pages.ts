import { escapeHtml } from "./safe-html.js";

export function renderErrorPage(status:404|500, correlationId="local"):string {
  const title=status===404?"Page introuvable":"Une erreur est survenue";
  const message=status===404?"Cette adresse T.Pay n’existe pas ou a été déplacée.":"Le service a rencontré une erreur. Aucune opération financière n’est exécutée depuis cette page.";
  return "<main class=\"error-page\" role=\"main\"><div class=\"error-card\"><div class=\"error-code\">"+status+"</div><p class=\"eyebrow\">T.Pay · sécurité applicative</p><h1>"+title+"</h1><p>"+message+"</p><div class=\"error-actions\"><a class=\"primary\" href=\"#home\">Retour à l’accueil</a><button class=\"secondary\" data-action=\"reload\">Réessayer</button></div><small>Référence : "+escapeHtml(correlationId.slice(0,64))+"</small></div></main>";
}