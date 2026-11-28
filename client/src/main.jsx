import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { showToast } from './utils/toast.js';
import './index.css';

// Interceptação global de alertas nativos — substituição completa por Toasts estilizados
if (typeof window !== 'undefined') {
  window.alert = (msg) => {
    showToast(String(msg), 'warning');
  };
}

// [AUDIT-FIX #11]: Solicitação de Armazenamento Persistente contra a Purga de 7 dias do iOS/Safari (WebKit ITP)
if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
  navigator.storage.persist().then((isPersisted) => {
    if (isPersisted) {
      console.log('[PWA Storage] Armazenamento persistente concedido pelo navegador.');
    }
  }).catch(() => {});
}

// Registro do Service Worker PWA Offline-First
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // [AUDIT-FIX #10]: Atualização automática quando um novo Service Worker assume o controle (evita Stale Cache)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado com sucesso no escopo:', reg.scope);
          // Força verificação periódica de nova versão do sw.js
          if (typeof reg.update === 'function') {
            reg.update().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn('[PWA] Falha ao registrar Service Worker:', err);
        });
    });
  } else {
    // Em modo dev (Vite), remove Service Workers legados para evitar conflitos com HMR
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
