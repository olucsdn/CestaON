import React from 'react';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';

/**
 * ErrorBoundary robusto para prevenção de tela escura/em branco (Blank Screen Shield)
 * Captura qualquer exceção não tratada na renderização de componentes React,
 * impedindo o unmount total da árvore da aplicação e exibindo uma interface
 * amigável de recuperação em vez de uma tela vazia.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CestaON ErrorBoundary] Erro capturado na renderização:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  handleResetSession = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('feira_auth_token');
      localStorage.removeItem('feira_user_id');
      localStorage.removeItem('cestaon_pending_join_code');
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none transition-colors">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Ops! Algo deu errado ao carregar a tela
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Aconteceu uma falha temporária na interface. Você pode tentar recarregar ou reiniciar sua sessão com segurança.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Detalhes técnicos:
                </span>
                <p className="text-xs font-mono text-rose-600 dark:text-rose-400 break-words line-clamp-3">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recarregar Aplicativo</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetSession}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Limpar dados de sessão e recomeçar</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
