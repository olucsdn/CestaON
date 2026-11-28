import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.jsx';
import { AppSkeleton } from './components/AppSkeleton.jsx';
import { BudgetBanner } from './components/BudgetBanner.jsx';
import { BudgetView } from './components/BudgetView.jsx';
import { NormalModeView } from './components/NormalModeView.jsx';
import { MarketModeView } from './components/MarketModeView.jsx';
import { SavedListsView } from './components/SavedListsView.jsx';
import { HistoryView } from './components/HistoryView.jsx';
import { WhereToBuyModal } from './components/WhereToBuyModal.jsx';
import { PackageCalculatorModal } from './components/PackageCalculatorModal.jsx';
import { FinishListModal } from './components/FinishListModal.jsx';
import { NewListModal } from './components/NewListModal.jsx';
import { UserProfileModal } from './components/UserProfileModal.jsx';
import { ShareModal } from './components/ShareModal.jsx';
import { CartPricePromptModal } from './components/CartPricePromptModal.jsx';
import { InstallPwaPrompt } from './components/InstallPwaPrompt.jsx';
import { TutorialGuideModal } from './components/TutorialGuideModal.jsx';
import { ToastNotification } from './components/ToastNotification.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import { RegisterEntryPage } from './components/RegisterEntryPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { RecoverPage } from './pages/RecoverPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useSubsurfaceSync } from './hooks/useSubsurfaceSync.js';
import { useModalManager } from './hooks/useModalManager.js';
import {
  purgeListOfflineData,
  flushPendingMutations,
  purgeAuthConflicts,
  updatePendingMutationsCredentials
} from './utils/syncManager.js';
import { showToast } from './utils/toast.js';
import { formatMoney } from './utils/formatters.js';
import { ShoppingBag, ShoppingCart, ListChecks, History, TrendingDown, Plus, Target, BookOpen, RefreshCw, KeyRound, CheckCircle2, PieChart, X } from 'lucide-react';

function getLoggedUserIds() {
  const current = typeof localStorage !== 'undefined' ? localStorage.getItem('feira_user_id') : null;
  return current ? [current] : [];
}

function registerLoggedUserId(userId) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    // Cada dispositivo contém no máximo 1 sessão logada (que é a principal)
    localStorage.setItem('feira_logged_user_ids', JSON.stringify([userId]));
  } catch (_) {}
}

function unregisterLoggedUserId(userId) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem('feira_logged_user_ids');
  } catch (_) {}
}

export function App() {
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [activeList, setActiveList] = useState(null);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [mode, setMode] = useState('normal'); // 'normal' (criação da lista) | 'budget' (controle orçamentário) | 'market' | 'saved'
  const [finishedSummary, setFinishedSummary] = useState(null);

  // Perfis de Usuário e Autenticação Mandatória
  const [allUsers, setAllUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isColdStarting, setIsColdStarting] = useState(false);
  const [baseDataError, setBaseDataError] = useState(null);

  // Gerenciamento Modular de Modais (Custom Hook)
  const {
    modals,
    shareTargetList,
    setShareTargetList,
    shareInitialTab,
    cartPromptItem,
    authInitialView,
    openModal,
    closeModal,
    setCartPromptItem
  } = useModalManager();

  // Roteamento Nativo SPA para Páginas Distintas (/login, /cadastro, /recuperar)
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname.toLowerCase();
    }
    return '/';
  });

  const navigate = useCallback((toPath) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', toPath);
      setCurrentPath(toPath.toLowerCase());
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.alert = (msg) => {
        showToast(String(msg), 'warning');
      };
    }
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        setCurrentPath(window.location.pathname.toLowerCase());
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Helper de requisições autenticadas para isolamento multi-inquilino e escalabilidade em nuvem
  const authFetch = useCallback((url, options = {}) => {
    const userId = currentUser?.id || (typeof window !== 'undefined' ? localStorage.getItem('feira_user_id') : null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
    const headers = {
      ...(options.headers || {})
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (userId) {
      headers['X-User-Id'] = userId;
    }
    return fetch(url, { ...options, headers });
  }, [currentUser]);

  // 1. Carrega dados fundamentais iniciais
  const refreshLists = useCallback(async (selectId = null) => {
    try {
      const res = await authFetch('/api/lists');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        console.warn('Resposta não-array ou erro de /api/lists:', data);
        setLists([]);
        setActiveListId(null);
        setActiveList(null);
        return;
      }
      setLists(data);

      const activeLists = data.filter((l) => l.status === 'active');

      if (data.length > 0) {
        let nextId = selectId;
        if (!nextId) {
          const currentIsActive = activeLists.some((l) => l.id === activeListId);
          nextId = currentIsActive ? activeListId : (activeLists[0]?.id || null);
        }
        setActiveListId(nextId);
        if (nextId) {
          loadListDetails(nextId);
        } else {
          setActiveList(null);
        }
      } else {
        setActiveListId(null);
        setActiveList(null);
      }
    } catch (err) {
      console.error('Erro ao buscar listas:', err);
      setLists((prev) => (Array.isArray(prev) ? prev : []));
    }
  }, [activeListId, authFetch, currentUser]);

  const loadListDetails = async (id) => {
    try {
      const res = await authFetch(`/api/lists/${id}`);
      if (!res.ok) {
        console.warn(`Erro ao carregar detalhes da lista ${id}: status ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data && typeof data === 'object' && !data.error && Array.isArray(data.items)) {
        setActiveList(data);
      }
    } catch (err) {
      console.error('Erro ao carregar lista:', err);
    }
  };

  // Modo Subsolo, Cache Preditivo e Background Sync (Custom Hook)
  const handleSyncCompleted = useCallback(() => {
    if (activeListId) loadListDetails(activeListId);
    refreshLists();
  }, [activeListId, refreshLists]);

  const {
    isSubsurfaceMode,
    pendingSyncCount,
    conflictNotification,
    clearConflictNotification
  } = useSubsurfaceSync({
    activeListId,
    activeListItemsCount: activeList?.items?.length,
    onSyncCompleted: handleSyncCompleted
  });

  // Tema Claro / Escuro (Teoria das Cores)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('feira_theme');
    if (saved) return saved;
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('feira_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const loadBaseData = async () => {
    setIsAuthLoading(true);
    setBaseDataError(null);
    const coldStartTimer = setTimeout(() => {
      setIsColdStarting(true);
    }, 3000);

    try {
      const savedUserId = localStorage.getItem('feira_user_id');
      const savedToken = localStorage.getItem('feira_auth_token');

      const [catsRes, storesRes, favsRes] = await Promise.all([
        fetch('/api/categories').then((r) => { if (!r.ok) throw new Error('API indisponível'); return r.json(); }),
        savedToken
          ? authFetch('/api/stores').then((r) => (r.ok ? r.json() : [])).catch(() => [])
          : Promise.resolve([]),
        savedToken
          ? authFetch('/api/products/favorites').then((r) => (r.ok ? r.json() : [])).catch(() => [])
          : Promise.resolve([])
      ]);
      setCategories(catsRes);
      setStores(Array.isArray(storesRes) ? storesRes : []);
      setFavorites(Array.isArray(favsRes) ? favsRes : []);

      if (savedUserId && savedToken) {
        try {
          const userRes = await authFetch(`/api/users/${savedUserId}`);
          if (userRes.ok) {
            const userData = await userRes.json();
            const active = userData;
            if (!active || !active.email || !active.email.trim()) {
              unregisterLoggedUserId(savedUserId);
              localStorage.removeItem('feira_user_id');
              localStorage.removeItem('feira_auth_token');
              setCurrentUser(null);
            } else {
              registerLoggedUserId(active.id);
              setCurrentUser(active);
              const activeToken = localStorage.getItem('feira_auth_token');
              if (activeToken) {
                updatePendingMutationsCredentials(activeToken, active.id).catch(() => {});
                purgeAuthConflicts().catch(() => {});
              }
              // Dispara envio imediato de mutações locais salvas no IndexedDB para o servidor e DB
              flushPendingMutations().then(() => {
                refreshLists();
              }).catch(() => {});
              try {
                const usersListRes = await authFetch('/api/users');
                if (usersListRes.ok) {
                  const usersData = await usersListRes.json();
                  setAllUsers(usersData);
                } else {
                  setAllUsers([active]);
                }
              } catch (_) {
                setAllUsers([active]);
              }
            }
          } else {
            handleLogout();
          }
        } catch (_) {
          handleLogout();
        }
      } else {
        setCurrentUser(null);
        setAllUsers([]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados mestres:', err);
      setBaseDataError('Não foi possível conectar ao servidor. O serviço em nuvem pode estar acordando.');
    } finally {
      clearTimeout(coldStartTimer);
      setIsColdStarting(false);
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    const savedUserId = localStorage.getItem('feira_user_id');
    unregisterLoggedUserId(savedUserId);
    localStorage.removeItem('feira_user_id');
    localStorage.removeItem('feira_auth_token');
    // Limpeza rigorosa de cache e dados locais de sessão no logout
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('feira_subsurface_') || key.startsWith('cestaon_pending_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    // [AUDIT-FIX SEC-08]: Limpeza de dados de API em Cache Storage no logout
    if (typeof caches !== 'undefined') {
      try {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            caches.open(key).then((cache) => {
              cache.keys().then((requests) => {
                requests.forEach((req) => {
                  if (req.url && req.url.includes('/api/')) {
                    cache.delete(req);
                  }
                });
              });
            });
          });
        }).catch(() => {});
      } catch (_) {}
    }
    purgeAuthConflicts().catch(() => {});
    setCurrentUser(null);
    setActiveListId(null);
    setActiveList(null);
    setLists([]);
    closeModal('profile');
    closeModal('auth');
    closeModal('newList');
    closeModal('finish');
    closeModal('whereToBuy');
    closeModal('calculator');
    closeModal('history');
    closeModal('share');
    closeModal('tutorial');
    navigate('/login');
  };

  const handleUpdateUser = async (userId, payload) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
      const headers = {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error || 'Erro ao atualizar dados do perfil');
      }
      setCurrentUser(updated);
      try {
        const refreshedUsers = await authFetch('/api/users').then((r) => r.json());
        setAllUsers(refreshedUsers);
      } catch (_) {}
      return updated;
    } catch (err) {
      console.error('Erro ao atualizar usuário:', err);
      throw err;
    }
  };

  const handleCreateUser = async (payload, autoLogin = true) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const created = await res.json();
      if (!res.ok) {
        throw new Error(created.error || 'Erro ao criar perfil');
      }
      localStorage.setItem('feira_user_id', created.id);
      if (created.token) {
        localStorage.setItem('feira_auth_token', created.token);
      }
      registerLoggedUserId(created.id);
      if (autoLogin) {
        if (created.token) {
          updatePendingMutationsCredentials(created.token, created.id).catch(() => {});
          purgeAuthConflicts().catch(() => {});
        }
        setCurrentUser(created);
        flushPendingMutations().catch(() => {});
        try {
          const refreshedUsers = await authFetch('/api/users').then((r) => r.json());
          setAllUsers(Array.isArray(refreshedUsers) ? refreshedUsers : [created]);
        } catch (_) {
          setAllUsers([created]);
        }
        refreshLists();
      }
      return created;
    } catch (err) {
      console.error('Erro ao criar perfil:', err);
      throw err;
    }
  };

  const handleSwitchUser = async (user, token = null) => {
    if (!user) return;
    if (!user.email || !user.email.trim()) {
      handleLogout();
      return;
    }
    const authToken = token || user.token;
    if (authToken) {
      localStorage.setItem('feira_auth_token', authToken);
    }
    localStorage.setItem('feira_user_id', user.id);
    registerLoggedUserId(user.id);
    if (authToken) {
      updatePendingMutationsCredentials(authToken, user.id).catch(() => {});
      purgeAuthConflicts().catch(() => {});
    }
    try {
      const userRes = await authFetch(`/api/users/${user.id}`);
      if (userRes.ok) {
        const fullUser = await userRes.json();
        if (fullUser && fullUser.email && fullUser.email.trim()) {
          registerLoggedUserId(fullUser.id);
          setCurrentUser(fullUser);
        } else {
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(user);
      }
    } catch {
      setCurrentUser(user);
    }
    flushPendingMutations().catch(() => {});
    refreshLists();
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (currentUser) {
      if (!currentUser.email || !currentUser.email.trim()) {
        handleLogout();
        return;
      }
      refreshLists();
      Promise.all([
        authFetch('/api/stores').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        authFetch('/api/products/favorites').then((r) => (r.ok ? r.json() : [])).catch(() => [])
      ]).then(([sRes, fRes]) => {
        if (Array.isArray(sRes)) setStores(sRes);
        if (Array.isArray(fRes)) setFavorites(fRes);
      });
    }
  }, [currentUser]);

  // 2. Conexão WebSocket em Tempo Real
  const handleWsEvent = useCallback((event) => {
    if (!event || !event.type) return;

    // Fusão atômica em tempo real na interface para atualizações recebidas via WebSocket
    if (event.type === 'ITEM_UPDATED' || event.type === 'ITEM_TOGGLED') {
      const payloadItem = event.payload?.item;
      const payloadStats = event.payload?.stats;
      if (payloadItem) {
        setActiveList((prev) => {
          if (!prev || !prev.items) return prev;
          return {
            ...prev,
            items: prev.items.map((i) => (i.id === payloadItem.id ? { ...i, ...payloadItem } : i)),
            stats: payloadStats || prev.stats
          };
        });
      }
    }

    if (
      event.type === 'ITEM_ADDED' ||
      event.type === 'ITEM_UPDATED' ||
      event.type === 'ITEM_TOGGLED' ||
      event.type === 'ITEM_DELETED' ||
      event.type === 'LIST_UPDATED' ||
      event.type === 'LIST_SHARE_UPDATED'
    ) {
      if (activeListId) {
        loadListDetails(activeListId);
      }
    }

    if (event.type === 'LIST_COMPLETED' || event.type === 'LIST_CREATED' || event.type === 'LIST_SHARE_UPDATED') {
      refreshLists();
    }

    if (event.type === 'LIST_DELETED') {
      const deletedId = event.payload?.listId;
      setLists((prev) => (Array.isArray(prev) ? prev.filter((l) => l.id !== deletedId) : []));
      if (activeListId === deletedId) {
        refreshLists();
      }
    }

    // [AUDIT-FIX #8]: Tratamento de revogação de acesso com purga imediata do IndexedDB e desvinculação da UI
    if (event.type === 'ACCESS_REVOKED') {
      const revokedId = event.listId;
      if (revokedId) {
        purgeListOfflineData(revokedId).catch(() => {});
        setLists((prev) => (Array.isArray(prev) ? prev.filter((l) => l.id !== revokedId) : []));
        if (activeListId === revokedId) {
          setActiveList(null);
          setActiveListId(null);
          refreshLists();
        }
      }
    }
  }, [activeListId, refreshLists]);

  const { isConnected } = useWebSocket(activeListId, handleWsEvent, currentUser?.id);

  // 3. Handlers de Ações
  const handleSelectList = (id) => {
    setActiveListId(id);
    loadListDetails(id);
  };

  const handleCreateList = async (payload) => {
    const res = await authFetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        owner_id: currentUser?.id || 'usr_default'
      })
    });
    const newList = await res.json();
    await refreshLists(newList.id);
  };

  const handleOpenShareModal = (targetList = null, initialTab = 'share') => {
    const listToShare = targetList || (initialTab === 'join' ? null : activeList);
    openModal('share', { list: listToShare, initialTab: initialTab || (listToShare ? 'share' : 'join') });
  };

  const handleAddShare = async (listId, userId, permission = 'write') => {
    try {
      const res = await authFetch(`/api/lists/${listId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, permission })
      });
      const updated = await res.json();
      if (activeListId === listId) {
        setActiveList(updated);
      }
      setShareTargetList(updated);
      refreshLists();
    } catch (err) {
      console.error('Erro ao adicionar familiar:', err);
    }
  };

  const handleRemoveShare = async (listId, userId) => {
    try {
      const res = await authFetch(`/api/lists/${listId}/shares/${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao remover participante');
      }

      const isSelf = userId === currentUser?.id;
      if (isSelf) {
        // Se o próprio participante saiu da feira compartilhada
        if (activeListId === listId) {
          setActiveListId(null);
          setActiveList(null);
        }
        setShareTargetList(null);
        closeModal('share');
        purgeListOfflineData(listId).catch(() => {});
        showToast('Você saiu da feira compartilhada.', 'success');
      } else {
        if (data.list) {
          if (activeListId === listId) {
            setActiveList(data.list);
          }
          setShareTargetList(data.list);
        }
        showToast('Participante removido com sucesso.', 'success');
      }
      await refreshLists();
    } catch (err) {
      console.error('Erro ao remover familiar/sair da feira:', err);
      showToast(err.message || 'Erro ao processar ação de participante', 'warning');
      throw err;
    }
  };

  const handleLeaveList = async (listId) => {
    if (!currentUser?.id) return;
    await handleRemoveShare(listId, currentUser.id);
  };

  const handleJoinList = async (shareCode) => {
    const res = await authFetch('/api/lists/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_code: shareCode,
        user_id: currentUser?.id || 'usr_default'
      })
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Feira não existente ou indisponível');
    }
    const joinedList = await res.json();
    await refreshLists(joinedList.id);
    setActiveListId(joinedList.id);
    setActiveList(joinedList);
    setShareTargetList(joinedList);
    setMode('normal');
    return joinedList;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCodeFromUrl = params.get('join');
    if (joinCodeFromUrl) {
      try {
        localStorage.setItem('cestaon_pending_join_code', joinCodeFromUrl);
      } catch (_) {}
    }

    const pendingCode = joinCodeFromUrl || (typeof localStorage !== 'undefined' ? localStorage.getItem('cestaon_pending_join_code') : null);

    if (pendingCode && currentUser) {
      handleJoinList(pendingCode)
        .then(() => {
          try {
            localStorage.removeItem('cestaon_pending_join_code');
          } catch (_) {}
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        })
        .catch((err) => {
          console.warn('Falha no join da URL:', err);
          try {
            localStorage.removeItem('cestaon_pending_join_code');
          } catch (_) {}
        });
    }
  }, [currentUser]);

  const handleDeleteList = async (idToDelete) => {
    // 1. Atualização otimista imediata do estado local
    setLists((prev) => (Array.isArray(prev) ? prev.filter((l) => l.id !== idToDelete) : []));
    if (activeListId === idToDelete) {
      const remaining = (Array.isArray(lists) ? lists : []).filter((l) => l.id !== idToDelete);
      if (remaining.length > 0) {
        setActiveListId(remaining[0].id);
        loadListDetails(remaining[0].id);
      } else {
        setActiveListId(null);
        setActiveList(null);
      }
    }

    // 2. Chamada DELETE /api/lists/:id no backend com autorização
    try {
      const res = await authFetch(`/api/lists/${idToDelete}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Falha ao excluir lista');
      }
      await refreshLists();
    } catch (err) {
      console.error('Erro ao excluir lista:', err);
      await refreshLists();
    }
  };

  const handleDuplicateList = async (sourceId) => {
    try {
      const sourceList = (Array.isArray(lists) ? lists : []).find((l) => l.id === sourceId) || activeList;
      const res = await authFetch(`/api/lists/${sourceId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${sourceList?.title || 'Feira'} (Nova Compra)` })
      });
      const duplicated = await res.json();
      await refreshLists(duplicated.id);
      setMode('normal');
      return duplicated;
    } catch (err) {
      console.error('Erro ao duplicar lista:', err);
    }
  };

  const handleUpdateBudget = async (newBudgetCents) => {
    if (!activeListId) return;
    try {
      const res = await authFetch(`/api/lists/${activeListId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_cents: newBudgetCents })
      });
      const updated = await res.json();
      setActiveList(updated);
    } catch (err) {
      console.error('Erro ao atualizar orçamento:', err);
    }
  };

  const handleRenameList = async (listId, newTitle) => {
    const res = await authFetch(`/api/lists/${listId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível atualizar o nome da feira');
    }
    setActiveList((prev) => (prev && prev.id === listId ? { ...prev, ...data } : prev));
    await refreshLists();
    showToast('Nome da feira atualizado.', 'success');
    return data;
  };

  const handleAddItem = async (itemPayload) => {
    if (!activeListId) return;
    try {
      const res = await authFetch(`/api/lists/${activeListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemPayload)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.error || 'Não foi possível adicionar o produto.', 'warning');
        return;
      }
      loadListDetails(activeListId);
    } catch (err) {
      console.error('Erro ao adicionar item:', err);
    }
  };

  const handleQuickAddFavorite = (favProduct) => {
    const isAlreadyInList = activeList?.items?.some(
      (item) =>
        item.product_id === favProduct.id ||
        (item.product_name && item.product_name.toLowerCase() === favProduct.name.toLowerCase()) ||
        (item.custom_name && item.custom_name.toLowerCase() === favProduct.name.toLowerCase())
    );
    if (isAlreadyInList) {
      showToast(`O produto "${favProduct.name}" já está na lista desta feira.`, 'warning');
      return;
    }

    handleAddItem({
      name: favProduct.name,
      product_id: favProduct.id,
      category_id: favProduct.category_id,
      unit: favProduct.default_unit || 'un',
      quantity: 1
    });
  };

  const handleToggleItem = async (itemId, isPurchased, actualPriceCents) => {
    // Atualização otimista com mesclagem atômica imediata na UI
    setActiveList((prev) => {
      if (!prev || !prev.items) return prev;
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                is_purchased: isPurchased ? 1 : 0,
                ...(actualPriceCents !== undefined ? { actual_price_cents: actualPriceCents } : {})
              }
            : i
        )
      };
    });

    try {
      const res = await authFetch(`/api/items/${itemId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_purchased: isPurchased,
          actual_price_cents: actualPriceCents !== undefined ? actualPriceCents : undefined,
          user_id: currentUser?.id || 'usr_default'
        })
      });
      const data = await res.json();
      if (data?.item) {
        setActiveList((prev) => {
          if (!prev || !prev.items) return prev;
          return {
            ...prev,
            items: prev.items.map((i) => (i.id === data.item.id ? { ...i, ...data.item } : i)),
            stats: data.stats || prev.stats
          };
        });
      }
    } catch (err) {
      console.error('Erro ao alterar status de compra:', err);
      loadListDetails(activeListId);
    }
  };

  const handleRequestToggle = (itemId, isPurchased) => {
    if (!isPurchased) {
      // Retirando do carrinho: desmarca direto e zera preço pago
      handleToggleItem(itemId, false, 0);
      return;
    }

    // Colocando no carrinho: exige informar o preço ou marcar que não sabe no momento
    const item = activeList?.items?.find((i) => i.id === itemId);
    if (item) {
      openModal('cartPrompt', item);
    } else {
      handleToggleItem(itemId, true);
    }
  };

  const handleCancelCartPrompt = (itemId) => {
    if (cartPromptItem?.is_purchased) {
      handleToggleItem(itemId, false, 0);
    }
    closeModal('cartPrompt');
  };

  const handleConfirmCartPrice = (itemId, priceCents) => {
    if (cartPromptItem?.is_purchased) {
      handleUpdateItemPrice(itemId, priceCents);
    } else {
      handleToggleItem(itemId, true, priceCents);
    }
    closeModal('cartPrompt');
  };

  const handleUnknownCartPrice = (itemId) => {
    if (cartPromptItem?.is_purchased) {
      handleUpdateItemPrice(itemId, 0);
    } else {
      handleToggleItem(itemId, true, 0);
    }
    closeModal('cartPrompt');
  };

  const handleUpdateItemPrice = async (itemId, priceCents) => {
    try {
      await authFetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_price_cents: priceCents })
      });
      loadListDetails(activeListId);
    } catch (err) {
      console.error('Erro ao atualizar preço:', err);
    }
  };

  const handleUpdateItem = async (itemId, updates) => {
    // Atualização otimista com mesclagem atômica imediata na UI
    setActiveList((prev) => {
      if (!prev || !prev.items) return prev;
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
      };
    });

    try {
      const res = await authFetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data?.item) {
        setActiveList((prev) => {
          if (!prev || !prev.items) return prev;
          return {
            ...prev,
            items: prev.items.map((i) => (i.id === data.item.id ? { ...i, ...data.item } : i)),
            stats: data.stats || prev.stats
          };
        });
      }
    } catch (err) {
      console.error('Erro ao atualizar item:', err);
      loadListDetails(activeListId);
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await authFetch(`/api/items/${itemId}`, { method: 'DELETE' });
      loadListDetails(activeListId);
    } catch (err) {
      console.error('Erro ao excluir item:', err);
    }
  };

  const handleToggleFavoriteProduct = async (productId) => {
    try {
      await authFetch(`/api/products/${productId}/toggle-favorite`, { method: 'POST' });
      const favsRes = await authFetch('/api/products/favorites').then((r) => (r.ok ? r.json() : []));
      if (Array.isArray(favsRes)) setFavorites(favsRes);
    } catch (err) {
      console.error('Erro ao favoritar:', err);
    }
  };

  const handleFinishList = async ({ store_id, notes }) => {
    if (!activeListId) return;
    const finishedId = activeListId;
    const snapshotList = activeList;
    const res = await authFetch(`/api/lists/${finishedId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id, notes })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao finalizar feira');
    }

    // Monta o resumo da distribuição por categoria para a sobreposição pós-finalização
    if (snapshotList) {
      const purchasedItems = (snapshotList.items || []).filter((i) => i.is_purchased);
      const sectorMap = {};
      let totalSpentCents = 0;

      for (const item of purchasedItems) {
        const catName = item.category_name || 'Outros';
        const catColor = item.category_color || '#10B981';
        const cost = Number(item.actual_price_cents) || 0;
        totalSpentCents += cost;
        if (!sectorMap[catName]) {
          sectorMap[catName] = { name: catName, color: catColor, totalCents: 0, itemCount: 0 };
        }
        sectorMap[catName].totalCents += cost;
        sectorMap[catName].itemCount += 1;
      }

      const sectors = Object.values(sectorMap)
        .sort((a, b) => b.totalCents - a.totalCents)
        .map((s) => ({
          ...s,
          percent: totalSpentCents > 0 ? Math.round((s.totalCents / totalSpentCents) * 100) : 0
        }));

      const storeName = stores.find((s) => s.id === store_id)?.name || snapshotList.store_name || null;

      setFinishedSummary({
        title: snapshotList.title || 'Feira Finalizada',
        storeName,
        totalSpentCents,
        totalItems: purchasedItems.length,
        sectors
      });
    }

    closeModal('finish');
    setMode('saved');
    setActiveListId(null);
    setActiveList(null);
    await refreshLists();
  };

  if (baseDataError && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 text-center animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">
            Iniciando Servidor Gratuito
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
            Hospedagens 100% gratuitas (como o Render) colocam o servidor para hibernar após inatividade. O primeiro acesso pode levar de 30 a 50 segundos para acordar.
          </p>
          <button
            type="button"
            onClick={() => loadBaseData()}
            className="w-full py-3 px-4 rounded-xl font-black text-xs bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tentar Conectar Novamente</span>
          </button>
        </div>
      </div>
    );
  }

  if (isAuthLoading) {
    return <AppSkeleton isColdStarting={isColdStarting} />;
  }

  // Normalização de rota para evitar falhas com barras finais (trailing slash)
  const normalizedPath = (currentPath || '/').replace(/\/+$/, '') || '/';

  // ROTA DEDICADA 1: Página de Login Distinta
  if (normalizedPath === '/login') {
    return (
      <>
        <ToastNotification />
        <LoginPage
          allUsers={allUsers}
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogin={handleSwitchUser}
          onNavigate={navigate}
        />
      </>
    );
  }

  // ROTA DEDICADA 2: Página de Cadastro Distinta
  if (normalizedPath === '/cadastro' || normalizedPath === '/register') {
    return (
      <>
        <ToastNotification />
        <RegisterPage
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRegister={handleCreateUser}
          onLogin={handleSwitchUser}
          onNavigate={navigate}
        />
      </>
    );
  }

  // ROTA DEDICADA 3: Página de Recuperação Distinta
  if (normalizedPath === '/recuperar' || normalizedPath === '/recover') {
    return (
      <>
        <ToastNotification />
        <RecoverPage
          allUsers={allUsers}
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogin={handleSwitchUser}
          onNavigate={navigate}
        />
      </>
    );
  }

  // ROTA DEDICADA 4: Landing Page (/landing)
  if (normalizedPath === '/landing') {
    return (
      <>
        <ToastNotification />
        <LandingPage
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={navigate}
        />
      </>
    );
  }

  // ROTA DEDICADA 5: Acesso Rápido / Wizard (/entrar)
  if (normalizedPath === '/entrar') {
    return (
      <>
        <ToastNotification />
        <RegisterEntryPage
          isMandatory={true}
          allUsers={allUsers}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRegister={handleCreateUser}
          onLogin={handleSwitchUser}
          onNavigate={navigate}
        />
      </>
    );
  }

  // ROTA DEDICADA 6: Página 404 (Corredor Inexistente / CestaON Triste)
  const isHomeRoute = normalizedPath === '/' || normalizedPath === '/index.html';
  if (!isHomeRoute) {
    return (
      <>
        <ToastNotification />
        <NotFoundPage
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={navigate}
          currentPath={currentPath}
        />
      </>
    );
  }

  // PORTÃO DE ENTRADA:
  // Se não estiver logado, direciona o usuário para a Landing Page do CestaON
  if (!currentUser) {
    return (
      <>
        <ToastNotification />
        <LandingPage
          currentUser={null}
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={navigate}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-200 w-full max-w-full overflow-x-hidden">
      {/* Notificações Estilizadas Globais */}
      <ToastNotification />

      {/* Cabeçalho */}
      <Header
        lists={lists}
        activeList={activeList}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelectList={handleSelectList}
        onOpenNewListModal={() => openModal('newList')}
        onOpenHistory={() => openModal('history')}
        onOpenWhereToBuy={() => openModal('whereToBuy')}
        onOpenCalculator={() => openModal('calculator')}
        onOpenProfile={() => openModal('profile')}
        onOpenShareModal={(tab) => handleOpenShareModal(tab === 'join' ? null : activeList, tab || (activeList ? 'share' : 'join'))}
        onDuplicateList={handleDuplicateList}
        onOpenInstallPwa={() => openModal('installPrompt')}
        onOpenTutorial={() => openModal('tutorial')}
        onOpenAuth={(initialView) => {
          if (initialView === 'register') navigate('/cadastro');
          else if (initialView === 'recover') navigate('/recuperar');
          else navigate('/login');
        }}
        onLogout={handleLogout}
        onNavigate={navigate}
        isConnected={isConnected}
        isSubsurface={isSubsurfaceMode}
        pendingSyncCount={pendingSyncCount}
        conflictNotification={conflictNotification}
        onDismissConflict={clearConflictNotification}
      />

      {/* Navegação Principal Limpa e Intuitiva */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 sm:px-3 py-2 sm:py-2.5 transition-colors w-full overflow-x-hidden">
        <div className="max-w-2xl mx-auto flex items-center justify-between sm:justify-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setMode('normal')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition select-none min-h-[40px] sm:min-h-[40px] ${
              mode === 'normal'
                ? 'bg-slate-900 dark:bg-slate-800 text-white dark:text-white dark:border dark:border-slate-700 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ListChecks className="w-4 h-4 shrink-0" />
            <span>Lista</span>
          </button>

          <button
            onClick={() => setMode('market')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition select-none min-h-[40px] sm:min-h-[40px] ${
              mode === 'market'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span>Comprar</span>
          </button>

          <button
            onClick={() => setMode('budget')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition select-none min-h-[40px] sm:min-h-[40px] ${
              mode === 'budget'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Target className="w-4 h-4 shrink-0" />
            <span>Gastos</span>
          </button>

          <button
            onClick={() => setMode('saved')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition select-none min-h-[40px] sm:min-h-[40px] ${
              mode === 'saved'
                ? 'bg-slate-900 dark:bg-slate-800 text-white dark:text-white dark:border dark:border-slate-700 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>Feiras</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-4xl lg:max-w-5xl w-full mx-auto p-3.5 sm:p-6 overflow-x-hidden">
        {/* Se não houver feira ativa selecionada para as abas de trabalho */}
        {mode !== 'saved' && (!activeList || activeList.status === 'completed') ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 md:p-10 lg:p-12 max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto text-center shadow-sm my-4 sm:my-8 md:my-10 transition">
            {/* Top Badge & Ícone */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200/60 dark:border-brand-800/40 flex items-center justify-center mx-auto mb-4 md:mb-5 text-brand-600 dark:text-brand-400">
              <ShoppingBag className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>

            <div className="hidden md:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50/80 dark:bg-brand-950/40 border border-brand-200/50 dark:border-brand-800/40 text-brand-700 dark:text-brand-300 text-xs font-bold mb-4">
              <span>🛒</span>
              <span>"No CestaON, o preço é bom."</span>
            </div>

            <h3 className="font-extrabold text-lg sm:text-xl md:text-2xl lg:text-3xl text-slate-900 dark:text-white mb-2.5 md:mb-3.5 tracking-tight">
              Nenhuma feira ativa selecionada
            </h3>
            <p className="text-xs sm:text-sm md:text-[15px] text-slate-500 dark:text-slate-400 leading-relaxed mb-7 md:mb-9 max-w-xl mx-auto">
              Feiras finalizadas ficam arquivadas na aba <strong className="text-slate-700 dark:text-slate-200">Feiras</strong> para consulta. Para planejar ou comprar, entre com o código de uma feira compartilhada ou crie uma nova feira ativa com controle de orçamento.
            </p>

            {/* Ações Rápidas com Espaçamento Equilibrado e Quebra Suave */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-2.5 sm:gap-3 md:gap-3.5 w-full max-w-3xl mx-auto">
              <button
                onClick={() => handleOpenShareModal(null, 'join')}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl shadow-sm hover:shadow-md transition flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4" />
                <span>Entrar com Código</span>
              </button>
              <button
                onClick={() => openModal('newList')}
                className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl shadow-sm hover:shadow-md transition flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Nova Feira</span>
              </button>
              <button
                onClick={() => setMode('saved')}
                className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl transition flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
              >
                <ShoppingBag className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Ver Feiras</span>
              </button>
              <button
                onClick={() => openModal('tutorial')}
                className="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl transition flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>Como usar o app</span>
              </button>
            </div>

            {/* Grid Informativo de 3 Etapas (SOMENTE COMPUTADOR / DESKTOP) */}
            <div className="hidden md:block mt-10 md:mt-12 pt-8 md:pt-9 border-t border-slate-100 dark:border-slate-800/80 text-left">
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  O ciclo inteligente de compras em 3 etapas:
                </span>
                <button
                  onClick={() => openModal('tutorial')}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                >
                  <span>Abrir guia completo</span>
                  <span>→</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4 md:gap-5">
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-5 md:p-6 transition hover:border-slate-300 dark:hover:border-slate-700">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Planeje em Casa
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Monte sua lista por setor com auto-categorização inteligente e defina um orçamento máximo.
                  </p>
                </div>

                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-5 md:p-6 transition hover:border-slate-300 dark:hover:border-slate-700">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="w-6 h-6 rounded-lg bg-brand-100 dark:bg-brand-950/80 text-brand-600 dark:text-brand-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Compre com 1 Mão
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Na aba Comprar, marque itens no carrinho em segundos e confira o total em tempo real no corredor.
                  </p>
                </div>

                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-5 md:p-6 transition hover:border-slate-300 dark:hover:border-slate-700">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Economize Sempre
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Finalize a feira para congelar os preços no histórico, comparar mercados e descobrir onde comprar mais barato.
                  </p>
                </div>
              </div>
            </div>

            {/* Atalho para Feiras Existentes (se houver) no Desktop */}
            {(Array.isArray(lists) ? lists : []).length > 0 && (
              <div className="hidden md:flex items-center justify-between mt-7 pt-6 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                <span className="text-slate-400 dark:text-slate-500">
                  Você já possui <strong className="text-slate-700 dark:text-slate-300 font-bold">{(Array.isArray(lists) ? lists : []).length} feira(s)</strong> cadastradas no histórico.
                </span>
                <button
                  onClick={() => setMode('saved')}
                  className="font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition flex items-center gap-1"
                >
                  <span>Acessar feiras salvas</span>
                  <span>→</span>
                </button>
              </div>
            )}
          </div>
        ) : mode === 'normal' ? (
          <NormalModeView
            list={activeList}
            categories={categories}
            favorites={favorites}
            onAddItem={handleAddItem}
            onQuickAddFavorite={handleQuickAddFavorite}
            onToggleItem={handleRequestToggle}
            onRequestPricePrompt={(item) => openModal('cartPrompt', item)}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
            onToggleFavoriteProduct={handleToggleFavoriteProduct}
            onSwitchToMarketMode={() => setMode('market')}
            onSwitchToBudgetMode={() => setMode('budget')}
            onOpenShareModal={(tab) => handleOpenShareModal(activeList, tab || 'share')}
          />
        ) : mode === 'budget' ? (
          <BudgetView
            list={activeList}
            categories={categories}
            onUpdateBudget={handleUpdateBudget}
            onSwitchToPlanning={() => setMode('normal')}
            onSwitchToMarket={() => setMode('market')}
            onOpenNewList={() => openModal('newList')}
            onOpenShareModal={(tab) => handleOpenShareModal(activeList, tab || 'share')}
          />
        ) : mode === 'market' ? (
          <MarketModeView
            list={activeList}
            onToggleItem={handleRequestToggle}
            onRequestPricePrompt={(item) => openModal('cartPrompt', item)}
            onUpdateItemPrice={handleUpdateItemPrice}
            onUpdateBudget={handleUpdateBudget}
            onOpenFinishModal={() => openModal('finish')}
            onOpenShareModal={(tab) => handleOpenShareModal(activeList, tab || 'share')}
          />
        ) : (
          <SavedListsView
            lists={lists}
            currentUser={currentUser}
            activeListId={activeListId}
            onSelectList={handleSelectList}
            onDeleteList={handleDeleteList}
            onLeaveList={handleLeaveList}
            onDuplicateList={handleDuplicateList}
            onRenameList={handleRenameList}
            onOpenNewListModal={() => openModal('newList')}
            onOpenShareModal={(list, tab) => handleOpenShareModal(list, tab)}
            onSwitchToPlanning={() => setMode('normal')}
          />
        )}
      </main>

      {/* Modais Globais */}
      {modals.newList && (
        <NewListModal
          stores={stores}
          onCreate={handleCreateList}
          onClose={() => closeModal('newList')}
          onOpenJoinModal={() => handleOpenShareModal(null, 'join')}
        />
      )}

      {modals.share && (
        <ShareModal
          list={shareTargetList || (shareInitialTab === 'join' ? null : activeList)}
          initialTab={shareInitialTab || (activeList ? 'share' : 'join')}
          currentUser={currentUser}
          allUsers={allUsers}
          onAddShare={handleAddShare}
          onRemoveShare={handleRemoveShare}
          onJoinList={handleJoinList}
          onOpenProfile={() => openModal('profile')}
          onClose={() => closeModal('share')}
        />
      )}

      {modals.finish && (
        <FinishListModal
          list={activeList}
          stores={stores}
          onFinish={handleFinishList}
          onUpdateItemPrice={handleUpdateItemPrice}
          onClose={() => closeModal('finish')}
        />
      )}

      {modals.history && (
        <HistoryView onClose={() => closeModal('history')} />
      )}

      {modals.whereToBuy && activeList && (
        <WhereToBuyModal
          listId={activeList.id}
          onClose={() => closeModal('whereToBuy')}
        />
      )}

      {modals.calculator && (
        <PackageCalculatorModal onClose={() => closeModal('calculator')} />
      )}

      {modals.profile && (
        <UserProfileModal
          currentUser={currentUser}
          allUsers={allUsers}
          onUpdateUser={handleUpdateUser}
          onCreateUser={handleCreateUser}
          onSwitchUser={handleSwitchUser}
          onOpenAuth={(initialView) => {
            if (initialView === 'register') navigate('/cadastro');
            else if (initialView === 'recover') navigate('/recuperar');
            else navigate('/login');
          }}
          onLogout={handleLogout}
          onNavigate={navigate}
          onClose={() => closeModal('profile')}
        />
      )}

      {/* Página / Modal de Autenticação (Login, Cadastrar e Recuperar) */}
      {modals.auth && (
        <AuthModal
          isOpen={modals.auth}
          initialView={authInitialView}
          currentUser={currentUser}
          allUsers={allUsers}
          onLogin={handleSwitchUser}
          onRegister={handleCreateUser}
          onClose={() => closeModal('auth')}
        />
      )}

      {cartPromptItem && (
        <CartPricePromptModal
          item={cartPromptItem}
          onConfirmPrice={handleConfirmCartPrice}
          onUnknownPrice={handleUnknownCartPrice}
          onCancelPending={handleCancelCartPrompt}
          onClose={() => closeModal('cartPrompt')}
        />
      )}

      {/* Guia e Tutorial Oficial "Como Usar o App" */}
      {modals.tutorial && (
        <TutorialGuideModal
          onClose={() => closeModal('tutorial')}
          onOpenNewList={() => openModal('newList')}
          onOpenCalculator={() => openModal('calculator')}
        />
      )}

      {/* Sobreposição Pós-Finalização: Distribuição por Categoria + Ações Rápidas */}
      {finishedSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 dark:bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/30 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">
                    Feira Finalizada!
                  </h2>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                    {finishedSummary.title}{finishedSummary.storeName ? ` • ${finishedSummary.storeName}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFinishedSummary(null)}
                className="w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition shrink-0"
                title="Fechar resumo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 text-center">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                  Total Gasto na Feira
                </span>
                <span className="text-2xl font-black text-emerald-950 dark:text-emerald-100 block mt-1">
                  {formatMoney(finishedSummary.totalSpentCents)}
                </span>
                <span className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 block font-medium">
                  {finishedSummary.totalItems} {finishedSummary.totalItems === 1 ? 'produto comprado' : 'produtos comprados'}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <PieChart className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <span>Distribuição por Categoria</span>
                </div>

                {finishedSummary.sectors.length > 0 ? (
                  <div className="space-y-2.5">
                    {finishedSummary.sectors.map((sector) => (
                      <div
                        key={sector.name}
                        className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: sector.color }}
                            />
                            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {sector.name}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                              ({sector.itemCount})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              {formatMoney(sector.totalCents)}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-9 text-right">
                              {sector.percent}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(sector.percent, 2)}%`,
                              backgroundColor: sector.color
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-3">
                    Nenhum item categorizado nesta feira.
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 grid grid-cols-2 gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setFinishedSummary(null);
                  setMode('saved');
                }}
                className="w-full py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-1.5"
              >
                <ListChecks className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <span>Ver Feiras</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinishedSummary(null);
                  openModal('newList');
                }}
                className="w-full py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black text-white bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-600/20 transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Nova Feira</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gatilho Ergonômico de Instalação PWA */}
      <InstallPwaPrompt
        externalOpenTrigger={modals.installPrompt}
        onExternalOpenHandled={() => closeModal('installPrompt')}
      />
    </div>
  );
}
