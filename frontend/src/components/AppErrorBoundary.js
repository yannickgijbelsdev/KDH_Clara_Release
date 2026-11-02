import { Component } from 'react';

const isChunkError = (error) => /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed/i.test(
  `${error?.name || ''} ${error?.message || ''}`,
);

// Catches render crashes so the app never stays a blank white page.
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Clara crashed:', error, info?.componentStack);
    // After a new release old JS chunks disappear: reload once to get the new build.
    if (isChunkError(error) && !sessionStorage.getItem('clara_chunk_reload')) {
      sessionStorage.setItem('clara_chunk_reload', '1');
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F0F2] px-6" data-testid="app-error-screen">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-sm border border-zinc-200 text-center">
          <img src="/clara-chevron.png" alt="Clara" className="mx-auto h-10 w-10 mb-4" />
          <h1 className="text-lg font-semibold text-zinc-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-600">This page hit an unexpected error. Reloading usually fixes it.</p>
          <p className="mt-3 text-[11px] font-mono text-zinc-400 break-words" data-testid="app-error-message">{String(this.state.error?.message || this.state.error).slice(0, 200)}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={() => window.location.reload()} className="rounded-full bg-[#7380b6] px-5 py-2 text-sm font-medium text-white hover:bg-[#5f6ba3]" data-testid="app-error-reload-btn">Reload</button>
            <button onClick={() => { window.location.href = '/'; }} className="rounded-full border border-zinc-300 px-5 py-2 text-sm text-zinc-700 hover:bg-zinc-50" data-testid="app-error-home-btn">Go to start</button>
          </div>
        </div>
      </div>
    );
  }
}
