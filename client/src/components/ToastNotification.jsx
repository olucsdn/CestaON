import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { subscribeToast } from '../utils/toast.js';

/**
 * Componente Global de Notificação Estilizada (Toast)
 * Exibe mensagens estilizadas no topo da tela com alto contraste, animações fluidas,
 * barra de progresso visual de expiração, suporte completo a temas claro/escuro e botão de fechar.
 */
export function ToastNotification() {
  const [activeToast, setActiveToast] = useState(null);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  const dismissToast = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActiveToast(null);
    setProgress(100);
  };

  useEffect(() => {
    const unsubscribe = subscribeToast((toastItem) => {
      // Limpa temporizadores anteriores
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);

      setActiveToast(toastItem);
      setProgress(100);

      const duration = toastItem.duration || 4000;
      const intervalStep = 50;
      const progressDecrement = (intervalStep / duration) * 100;

      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev - progressDecrement;
          return next > 0 ? next : 0;
        });
      }, intervalStep);

      timerRef.current = setTimeout(() => {
        dismissToast();
      }, duration);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!activeToast) return null;

  const isWarning = activeToast.type === 'warning';
  const isError = activeToast.type === 'error';
  const isSuccess = activeToast.type === 'success';

  // Configurações visuais semânticas
  const styleConfig = isWarning
    ? {
        border: 'border-amber-400 dark:border-amber-500/80',
        bg: 'bg-white/95 dark:bg-slate-900/95',
        shadow: 'shadow-amber-500/10 dark:shadow-amber-500/5',
        iconBg: 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400',
        progressBar: 'bg-amber-500 dark:bg-amber-400',
        titleColor: 'text-amber-800 dark:text-amber-300',
        Icon: AlertTriangle
      }
    : isError
    ? {
        border: 'border-rose-400 dark:border-rose-500/80',
        bg: 'bg-white/95 dark:bg-slate-900/95',
        shadow: 'shadow-rose-500/10 dark:shadow-rose-500/5',
        iconBg: 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400',
        progressBar: 'bg-rose-500 dark:bg-rose-400',
        titleColor: 'text-rose-800 dark:text-rose-300',
        Icon: AlertCircle
      }
    : isSuccess
    ? {
        border: 'border-emerald-400 dark:border-emerald-500/80',
        bg: 'bg-white/95 dark:bg-slate-900/95',
        shadow: 'shadow-emerald-500/10 dark:shadow-emerald-500/5',
        iconBg: 'bg-emerald-100 dark:bg-emerald-950/80 text-brand-600 dark:text-brand-400',
        progressBar: 'bg-emerald-500 dark:bg-emerald-400',
        titleColor: 'text-emerald-800 dark:text-emerald-300',
        Icon: CheckCircle2
      }
    : {
        border: 'border-sky-400 dark:border-sky-500/80',
        bg: 'bg-white/95 dark:bg-slate-900/95',
        shadow: 'shadow-sky-500/10 dark:shadow-sky-500/5',
        iconBg: 'bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400',
        progressBar: 'bg-sky-500 dark:bg-sky-400',
        titleColor: 'text-sky-800 dark:text-sky-300',
        Icon: Info
      };

  const { Icon } = styleConfig;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[9999] w-[94%] sm:w-auto sm:min-w-[340px] sm:max-w-md pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-top-4"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border-2 ${styleConfig.border} ${styleConfig.bg} ${styleConfig.shadow} shadow-2xl backdrop-blur-md p-3.5 sm:p-4 transition-colors`}
      >
        <div className="flex items-start gap-3">
          {/* Ícone com badge visual destacado */}
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${styleConfig.iconBg} flex items-center justify-center shrink-0 shadow-sm mt-0.5`}
          >
            <Icon className="w-5 h-5" />
          </div>

          {/* Mensagem e Título */}
          <div className="flex-1 min-w-0 pr-1">
            <h4 className={`text-xs font-black uppercase tracking-wider mb-0.5 ${styleConfig.titleColor}`}>
              {activeToast.title}
            </h4>
            <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug break-words">
              {activeToast.message}
            </p>
          </div>

          {/* Botão de Fechar Rápido */}
          <button
            onClick={dismissToast}
            aria-label="Fechar notificação"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Progresso do Tempo Restante */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
          <div
            className={`h-full ${styleConfig.progressBar} transition-all ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
