import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  KeyRound,
  Eye,
  AlertTriangle,
  CheckCircle2,
  X,
  ShoppingCart,
  Share2,
  LogOut,
  Pencil
} from 'lucide-react';
import { formatMoney, formatDate } from '../utils/formatters.js';

export function SavedListsView({
  lists = [],
  activeListId,
  currentUser,
  onSelectList,
  onDeleteList,
  onLeaveList,
  onDuplicateList,
  onRenameList,
  onOpenNewListModal,
  onOpenShareModal,
  onSwitchToPlanning
}) {
  const [listToDelete, setListToDelete] = useState(null);
  const [listToOpen, setListToOpen] = useState(null);
  const [listToRename, setListToRename] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [viewingFinishedList, setViewingFinishedList] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const safeLists = Array.isArray(lists) ? lists : [];

  const handleConfirmDelete = async () => {
    if (!listToDelete) return;
    try {
      setIsDeleting(true);
      const isOwner = !listToDelete.owner_id || listToDelete.owner_id === currentUser?.id;
      if (isOwner) {
        await onDeleteList(listToDelete.id);
      } else if (onLeaveList) {
        await onLeaveList(listToDelete.id);
      }
      setListToDelete(null);
      if (viewingFinishedList?.id === listToDelete.id) {
        setViewingFinishedList(null);
      }
    } catch (err) {
      console.error('Erro ao excluir ou sair da lista:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmRename = async (e) => {
    e.preventDefault();
    if (!listToRename || !onRenameList || isRenaming) return;
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setRenameError('Informe um nome válido para a feira.');
      return;
    }
    try {
      setIsRenaming(true);
      setRenameError('');
      await onRenameList(listToRename.id, trimmed);
      setListToRename(null);
    } catch (err) {
      setRenameError(err?.message || 'Não foi possível renomear a feira.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleConfirmOpen = async () => {
    if (!listToOpen) return;
    if (listToOpen.status === 'completed') {
      try {
        setIsLoadingDetails(true);
        const userId = typeof window !== 'undefined' ? localStorage.getItem('feira_user_id') : null;
        const token = typeof window !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
        const headers = {};
        if (userId) headers['X-User-Id'] = userId;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`/api/lists/${listToOpen.id}`, { headers });
        const data = await res.json();
        setViewingFinishedList(data);
        setListToOpen(null);
      } catch (err) {
        console.error('Erro ao carregar detalhes da feira:', err);
      } finally {
        setIsLoadingDetails(false);
      }
    } else {
      onSelectList(listToOpen.id);
      if (onSwitchToPlanning) onSwitchToPlanning();
      setListToOpen(null);
    }
  };

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      {/* Cabeçalho da Seção */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          Feiras
        </h2>

        {safeLists.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenShareModal && onOpenShareModal(null, 'join')}
              className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl transition"
            >
              <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>Código</span>
            </button>
            <button
              onClick={onOpenNewListModal}
              className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Lista</span>
            </button>
          </div>
        )}
      </div>

      {/* Lista de Feiras */}
      {safeLists.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 sm:p-12 md:p-14 max-w-2xl mx-auto my-2 sm:my-6 text-center transition-colors">
          <p className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-200">
            Nenhuma feira cadastrada
          </p>
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1.5 mb-6 max-w-md mx-auto leading-relaxed">
            Entre com um código compartilhado ou crie uma nova lista para começar.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => onOpenShareModal && onOpenShareModal(null, 'join')}
              className="inline-flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 font-bold text-xs sm:text-sm px-4 sm:px-5 py-2.5 rounded-xl transition"
            >
              <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Entrar com Código</span>
            </button>
            <button
              onClick={onOpenNewListModal}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs sm:text-sm px-4 sm:px-5 py-2.5 rounded-xl shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Lista</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {safeLists.map((list) => {
            const isActive = list.id === activeListId;
            const isCompleted = list.status === 'completed';
            const totalItems = list.total_items || 0;
            const purchasedItems = list.purchased_items || 0;
            const totalSpentCents = list.total_spent_cents || 0;
            const budgetCents = list.budget_cents || 0;

            return (
              <div
                key={list.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 shadow-sm transition ${
                  isActive
                    ? 'border-brand-500/80 ring-1 ring-brand-500/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 truncate">
                    {list.title}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isCompleted ? 'Concluída' : 'Ativa'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 text-xs text-slate-600 dark:text-slate-400 border-t border-b border-slate-100 dark:border-slate-800 my-2">
                  <div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Itens</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {purchasedItems}/{totalItems}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Total Gasto</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {formatMoney(totalSpentCents)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Teto</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {budgetCents > 0 ? formatMoney(budgetCents) : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  <span className="text-[11px] text-slate-400">
                    {formatDate(list.completed_at || list.updated_at || list.created_at)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Botão Editar Nome (somente dono enquanto a feira estiver aberta) */}
                    {!isCompleted && (!list.owner_id || list.owner_id === currentUser?.id) && onRenameList && (
                      <button
                        type="button"
                        onClick={() => {
                          setListToRename(list);
                          setRenameInput(list.title || '');
                          setRenameError('');
                        }}
                        className="p-1.5 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 rounded-lg transition"
                        title="Editar nome da feira"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Botão Compartilhar: sempre acessível enquanto a feira estiver aberta */}
                    {!isCompleted && (
                      <button
                        onClick={() => onOpenShareModal && onOpenShareModal(list, 'share')}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition"
                        title="Compartilhar feira aberta"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Botão Copiar */}
                    <button
                      onClick={() => onDuplicateList(list.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
                      title="Copiar feira (criar nova a partir desta)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Botão Excluir (Dono) ou Sair da Feira (Convidado) */}
                    {(!list.owner_id || list.owner_id === currentUser?.id) ? (
                      <button
                        onClick={() => setListToDelete(list)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition"
                        title="Excluir feira permanentemente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setListToDelete(list)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                        title="Sair desta feira compartilhada"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Botão Abrir / Ver (aciona card chamativo) */}
                    <button
                      onClick={() => setListToOpen(list)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                        isCompleted
                          ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                          : isActive
                          ? 'bg-slate-900 dark:bg-slate-800 text-white dark:text-white dark:border dark:border-slate-700'
                          : 'bg-brand-600 hover:bg-brand-700 text-white'
                      }`}
                    >
                      {isCompleted ? 'Ver' : isActive ? 'Aberta' : 'Abrir'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Card Chamativo de Confirmação de Abertura */}
      {listToOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div
            className={`bg-white dark:bg-slate-900 border-2 ${
              listToOpen.status === 'completed'
                ? 'border-brand-500/90 shadow-brand-500/20'
                : 'border-blue-500/90 shadow-blue-500/20'
            } rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 my-auto`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  listToOpen.status === 'completed'
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                }`}
              >
                {listToOpen.status === 'completed' ? (
                  <Eye className="w-6 h-6" />
                ) : (
                  <ShoppingCart className="w-6 h-6" />
                )}
              </div>
              <div>
                <span
                  className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full inline-block mb-1 ${
                    listToOpen.status === 'completed'
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200'
                      : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200'
                  }`}
                >
                  {listToOpen.status === 'completed'
                    ? 'Feira Concluída • Somente Leitura'
                    : 'Feira Ativa em Andamento'}
                </span>
                <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">
                  {listToOpen.status === 'completed'
                    ? 'Visualizar feira concluída?'
                    : 'Abrir feira para edição?'}
                </h3>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3.5 border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
              <p>
                Feira: <strong>"{listToOpen.title}"</strong>
              </p>
              {listToOpen.status === 'completed' ? (
                <p className="text-slate-500 dark:text-slate-400">
                  Esta feira já foi concluída e está arquivada. Ao abrir, você poderá{' '}
                  <strong>visualizar os itens, quantidades e preços pagos em modo somente leitura</strong>, sem alteração dos dados originais.
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">
                  Esta feira está ativa. Ao abrir, você será direcionado para o modo de planejamento e compras.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => setListToOpen(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition whitespace-nowrap"
              >
                Cancelar
              </button>
              {listToOpen.status !== 'completed' && onOpenShareModal && (
                <button
                  type="button"
                  onClick={() => {
                    const target = listToOpen;
                    setListToOpen(null);
                    onOpenShareModal(target, 'share');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
                  title="Compartilhar esta feira aberta"
                >
                  <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Compartilhar</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmOpen}
                disabled={isLoadingDetails}
                className={`flex-1 px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm text-white shadow-lg transition whitespace-nowrap ${
                  listToOpen.status === 'completed'
                    ? 'bg-brand-600 hover:bg-brand-700 shadow-brand-600/30'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
                }`}
              >
                {isLoadingDetails
                  ? 'Carregando...'
                  : listToOpen.status === 'completed'
                  ? 'Visualizar Feira'
                  : 'Abrir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Chamativo de Confirmação de Exclusão ou Saída da Feira */}
      {listToDelete && (() => {
        const isDeletingOwner = !listToDelete.owner_id || listToDelete.owner_id === currentUser?.id;
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border-2 border-red-500/90 rounded-3xl max-w-md w-full p-6 shadow-2xl shadow-red-500/25 space-y-4 my-auto">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/80 border border-red-200 dark:border-red-900 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-wider uppercase bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 px-2.5 py-0.5 rounded-full inline-block mb-1">
                    {isDeletingOwner ? 'Ação Definitiva e Irreversível' : 'Desvincular Participação'}
                  </span>
                  <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">
                    {isDeletingOwner ? 'Excluir esta feira?' : 'Sair desta feira compartilhada?'}
                  </h3>
                </div>
              </div>

              <div className="bg-red-50/70 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-2xl p-3.5 text-xs text-red-900 dark:text-red-200 leading-relaxed">
                {isDeletingOwner ? (
                  <>
                    Você está prestes a apagar permanentemente <strong>"{listToDelete.title}"</strong>. Todos os itens cadastrados, preços pagos e registros associados serão removidos.
                  </>
                ) : (
                  <>
                    Você está prestes a sair da feira <strong>"{listToDelete.title}"</strong> compartilhada com você. Você não terá mais acesso a esta lista a menos que insira o código novamente.
                  </>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isDeletingOwner
                  ? 'Essa ação não poderá ser desfeita após a confirmação.'
                  : 'A feira continuará existindo para o proprietário e outros participantes.'}
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setListToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 transition disabled:opacity-50"
                >
                  {isDeleting
                    ? (isDeletingOwner ? 'Excluindo...' : 'Saindo...')
                    : (isDeletingOwner ? 'Sim, Excluir Feira' : 'Sim, Sair da Feira')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Visualizador de Feira Concluída (100% Somente Leitura) */}
      {viewingFinishedList && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in zoom-in-95">
            {/* Cabeçalho do Visualizador */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900 dark:text-white truncate">
                      {viewingFinishedList.title}
                    </h2>
                    <span className="text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                      Somente Leitura
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{formatDate(viewingFinishedList.completed_at || viewingFinishedList.updated_at)}</span>
                    {viewingFinishedList.store_name && (
                      <>
                        <span>•</span>
                        <span>{viewingFinishedList.store_name}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingFinishedList(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
                title="Fechar visualização"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo de Indicadores da Feira Concluída */}
            <div className="grid grid-cols-3 gap-2 p-4 bg-slate-100/50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-center shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Gasto</span>
                <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                  {formatMoney(viewingFinishedList.stats?.totalSpentCents || 0)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Teto Orçado</span>
                <span className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  {viewingFinishedList.budget_cents > 0 ? formatMoney(viewingFinishedList.budget_cents) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Itens Comprados</span>
                <span className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  {viewingFinishedList.stats?.purchasedCount || 0} / {viewingFinishedList.items?.length || 0}
                </span>
              </div>
            </div>

            {/* Lista de Itens (100% Somente Leitura) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {!viewingFinishedList.items || viewingFinishedList.items.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">
                  Nenhum item registrado nesta feira.
                </p>
              ) : (
                viewingFinishedList.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          item.is_purchased ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {item.custom_name || item.product_name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {item.quantity} {item.unit || 'un'}
                          {item.category_name ? ` • ${item.category_name}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {item.is_purchased ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                          {item.actual_price_cents > 0
                            ? formatMoney(item.actual_price_cents)
                            : 'Sem valor'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Não comprado</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé com Ações Permitidas: Copiar, Excluir, Fechar */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={() => {
                  const target = viewingFinishedList;
                  setViewingFinishedList(null);
                  setListToDelete(target);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Feira</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const targetId = viewingFinishedList.id;
                    setViewingFinishedList(null);
                    await onDuplicateList(targetId);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Feira</span>
                </button>
                <button
                  onClick={() => setViewingFinishedList(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição do Nome da Feira (Apenas Dono, Feira Aberta) */}
      {listToRename && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleConfirmRename}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800/80 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">
                    Editar Feira
                  </span>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-tight">
                    Alterar nome da feira
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setListToRename(null)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                Nome da feira
              </label>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => {
                  setRenameInput(e.target.value);
                  if (renameError) setRenameError('');
                }}
                maxLength={35}
                placeholder="Ex: Feira do Mês"
                autoFocus
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500 transition"
              />
              {renameError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1.5">
                  {renameError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setListToRename(null)}
                disabled={isRenaming}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isRenaming || !renameInput.trim()}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white shadow-lg shadow-brand-600/25 transition"
              >
                {isRenaming ? 'Salvando...' : 'Salvar Nome'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
