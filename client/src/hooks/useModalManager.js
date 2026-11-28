import { useState, useCallback } from 'react';

/**
 * Gerenciador dedicado para estados de modais e diálogos
 * Desacopla o componente raiz de re-renderizações e proliferação de booleans.
 */
export function useModalManager() {
  const [modals, setModals] = useState({
    newList: false,
    history: false,
    whereToBuy: false,
    calculator: false,
    finish: false,
    profile: false,
    share: false,
    installPrompt: false,
    tutorial: false,
    auth: false
  });

  const [shareTargetList, setShareTargetList] = useState(null);
  const [shareInitialTab, setShareInitialTab] = useState('share');
  const [cartPromptItem, setCartPromptItem] = useState(null);
  const [authInitialView, setAuthInitialView] = useState('login');

  const openModal = useCallback((modalName, data = null) => {
    if (modalName === 'share') {
      if (data && typeof data === 'object' && ('initialTab' in data || 'list' in data)) {
        setShareTargetList(data.list || null);
        setShareInitialTab(data.initialTab || (data.list ? 'share' : 'join'));
      } else {
        setShareTargetList(data || null);
        setShareInitialTab(data ? 'share' : 'join');
      }
    }
    if (modalName === 'cartPrompt') {
      setCartPromptItem(data);
      return;
    }
    if (modalName === 'auth') {
      setAuthInitialView(data?.view || 'login');
    }
    setModals((prev) => ({ ...prev, [modalName]: true }));
  }, []);

  const closeModal = useCallback((modalName) => {
    if (modalName === 'share') {
      setShareTargetList(null);
      setShareInitialTab('share');
    }
    if (modalName === 'cartPrompt') {
      setCartPromptItem(null);
      return;
    }
    setModals((prev) => ({ ...prev, [modalName]: false }));
  }, []);

  const closeAll = useCallback(() => {
    setModals({
      newList: false,
      history: false,
      whereToBuy: false,
      calculator: false,
      finish: false,
      profile: false,
      share: false,
      installPrompt: false,
      tutorial: false,
      auth: false
    });
    setShareTargetList(null);
    setShareInitialTab('share');
    setCartPromptItem(null);
  }, []);

  return {
    modals,
    shareTargetList,
    shareInitialTab,
    cartPromptItem,
    authInitialView,
    openModal,
    closeModal,
    closeAll,
    setShareTargetList,
    setShareInitialTab,
    setCartPromptItem
  };
}
