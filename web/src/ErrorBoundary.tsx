import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Affiche l'erreur à l'écran au lieu d'une page blanche (diagnostic sans console). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            color: '#b3261e',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: 16,
            fontFamily: 'monospace',
            fontSize: 13,
            background: '#fff',
          }}
        >
          {'Erreur React :\n' + this.state.error.message + '\n\n' + (this.state.error.stack ?? '')}
        </pre>
      );
    }
    return this.props.children;
  }
}
