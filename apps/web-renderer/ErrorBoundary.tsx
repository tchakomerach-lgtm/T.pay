import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = Readonly<{ children: ReactNode }>;
type State = Readonly<{ failed: boolean; message: string }>;

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      failed: true,
      message: error instanceof Error ? error.message : "Erreur d'affichage inattendue",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately no sensitive payload logging. Production telemetry is injected later.
    void error;
    void info;
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" style={{ minHeight:"100vh", display:"grid", placeItems:"center", padding:24, fontFamily:"system-ui" }}>
        <section style={{ maxWidth:520 }}>
          <strong>T.Pay n’a pas pu afficher cette surface.</strong>
          <p>Vos données ne sont pas supprimées. Réessayez ou revenez à l’accueil.</p>
          <details>
            <summary>Détails techniques</summary>
            <pre style={{ whiteSpace:"pre-wrap" }}>{this.state.message}</pre>
          </details>
        </section>
      </main>
    );
  }
}
