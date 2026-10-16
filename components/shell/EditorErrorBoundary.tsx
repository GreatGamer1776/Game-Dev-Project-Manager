import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  fileName: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Contains a crashing editor to its pane so the rest of the workspace keeps working. */
class EditorErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Editor for "${this.props.fileName}" crashed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-bg p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-warning" />
          <h2 className="text-base font-semibold text-content">"{this.props.fileName}" couldn't be displayed</h2>
          <p className="mt-1 text-[0.8125rem] text-muted">The editor hit an unexpected error. Your saved content is unchanged.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 text-[0.8125rem] text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default EditorErrorBoundary;
