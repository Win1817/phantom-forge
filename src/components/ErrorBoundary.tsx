import { Component, type ReactNode } from "react";

interface State { error: Error | null; info: string }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: "" };

  componentDidCatch(error: Error, { componentStack }: { componentStack: string }) {
    this.setState({ error, info: componentStack });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background text-foreground">
        <div className="max-w-2xl w-full rounded-2xl border border-destructive/40 bg-destructive/5 p-8 space-y-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h1 className="font-fantasy text-2xl font-bold text-destructive">Something went wrong</h1>
              <p className="text-sm text-muted-foreground mt-0.5">A runtime error crashed this page.</p>
            </div>
          </div>

          <div className="rounded-lg bg-card border border-border p-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Error</p>
            <p className="font-mono text-sm text-destructive break-all">{error.message}</p>
          </div>

          {info && (
            <details className="rounded-lg bg-secondary/30 border border-border/50 p-4">
              <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none">
                Component stack
              </summary>
              <pre className="mt-3 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {info}
              </pre>
            </details>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Reload page
            </button>
            <button
              onClick={() => { this.setState({ error: null, info: "" }); window.history.back(); }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }
}
