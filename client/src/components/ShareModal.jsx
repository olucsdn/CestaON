import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { triggerHaptic } from '../utils/haptics.js';
import {
  Users,
  Share2,
  Copy,
  Check,
  Shield,
  Trash2,
  UserPlus,
  ArrowRight,
  Wifi,
  X,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  MessageCircle,
  AlertCircle,
  QrCode,
  LogOut
} from 'lucide-react';

export function ShareModal({
  list,
  currentUser,
  allUsers = [],
  onAddShare,
  onRemoveShare,
  onJoinList,
  onOpenProfile,
  onClose,
  initialTab = 'share'
}) {
  const [activeTab, setActiveTab] = useState(list ? initialTab : 'join');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [isRemoving, setIsRemoving] = useState(null);
  const [isAdding, setIsAdding] = useState(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrSvg, setQrSvg] = useState('');

  const shareCode = list?.share_code || '---';
  const isOwner = list ? (!list.owner_id || list.owner_id === currentUser?.id) : false;
  const currentShares = list?.shares || [];

  const joinUrl = list?.share_code
    ? `${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}?join=${shareCode}`
    : '';

  useEffect(() => {
    if (joinUrl && list?.share_code) {
      QRCode.toString(joinUrl, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
        .then((svg) => setQrSvg(svg))
        .catch((err) => console.error('[ShareModal] Erro ao gerar QR Code:', err));
    }
  }, [joinUrl, list?.share_code]);

  // IDs dos participantes da lista
  const sharedUserIds = new Set(list ? [list.owner_id, ...currentShares.map((s) => s.user_id)] : []);

  const copyToClipboard = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (_) {
      return false;
    }
  };

  const handleCopyCode = async () => {
    if (!list?.share_code) return;
    await copyToClipboard(shareCode);
    triggerHaptic(12);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!list?.share_code) return;
    const url = `${window.location.origin}${window.location.pathname}?join=${shareCode}`;
    await copyToClipboard(url);
    triggerHaptic(10);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!list?.share_code) return;
    triggerHaptic(10);
    const url = `${window.location.origin}${window.location.pathname}?join=${shareCode}`;
    const text = `🛒 Olá! Vamos fazer a feira juntos no CestaON?\n\nFeira: *${list.title}*\nCódigo de acesso: *${shareCode}*\n\nClique no link para entrar direto:\n${url}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (!list?.share_code) return;
    const url = `${window.location.origin}${window.location.pathname}?join=${shareCode}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        triggerHaptic(10);
        await navigator.share({
          title: `CestaON — ${list.title}`,
          text: `Entre na feira "${list.title}" no CestaON usando o código: ${shareCode}\n`,
          url
        });
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleShareWhatsApp();
        }
      }
    } else {
      handleShareWhatsApp();
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = joinCodeInput.trim().replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanCode || isJoining) return;
    setJoinError(null);
    setIsJoining(true);
    try {
      await onJoinList(cleanCode);
      setJoinSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('[ShareModal] Erro ao entrar na feira:', err);
      const rawMsg = err?.message || '';
      // Oculta qualquer erro técnico interno (ex: setShareTargetList, undefined, ReferenceError)
      const isInternalTechnical =
        rawMsg.includes('setShareTarget') ||
        rawMsg.includes('is not defined') ||
        rawMsg.includes('ReferenceError') ||
        rawMsg.includes('TypeError') ||
        rawMsg.includes('undefined') ||
        rawMsg.includes('null');

      let userMsg = 'Feira não existente ou indisponível';
      if (rawMsg && !isInternalTechnical) {
        if (rawMsg.includes('conexão') || rawMsg.includes('offline') || rawMsg.includes('Failed to fetch')) {
          userMsg = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        } else {
          userMsg = 'Feira não existente ou indisponível';
        }
      }
      setJoinError(userMsg);
    } finally {
      setIsJoining(false);
    }
  };

  const handleAddFamiliar = async (userId) => {
    if (isAdding) return;
    setIsAdding(userId);
    try {
      await onAddShare(list.id, userId, 'write');
    } catch (err) {
      console.error('Erro ao adicionar familiar:', err);
    } finally {
      setIsAdding(null);
    }
  };

  const handleRemoveFamiliar = async (userId) => {
    if (isRemoving) return;
    setIsRemoving(userId);
    try {
      await onRemoveShare(list.id, userId);
      if (userId === currentUser?.id) {
        onClose();
      }
    } catch (err) {
      console.error('Erro ao remover familiar:', err);
    } finally {
      setIsRemoving(null);
    }
  };

  if (activeTab === 'share' && !list) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto transition-colors duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 text-white flex items-center justify-center shadow-md shadow-brand-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">
                Família & Tempo Real
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight truncate max-w-[260px] sm:max-w-xs">
                {list ? 'Compartilhar Feira' : 'Entrar em Feira'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas Superiores Segmentadas */}
        <div className="px-5 pt-4 pb-1">
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('share')}
              disabled={!list}
              className={`py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'share'
                  ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{list ? 'Esta Feira' : 'Compartilhar'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('join')}
              className={`py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'join'
                  ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Entrar com Código</span>
            </button>
          </div>
        </div>

        {/* Conteúdo da Aba 1: Compartilhar a Feira Atual */}
        {activeTab === 'share' ? (
          <div className="p-5 space-y-5">
            {/* Bloco 1: Card de Código */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 text-center space-y-3">
              <div>
                {list?.status !== 'completed' && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] font-bold mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Feira Aberta • Sincronização em tempo real</span>
                  </div>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Código de acesso da feira <strong>{list?.title || 'Selecionada'}</strong>:
                </p>
                <div className="inline-flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 sm:px-6 py-2.5 shadow-sm max-w-full">
                  <span className="font-mono text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-widest select-all break-all">
                    {shareCode}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-1.5">
                  Compartilhe este código para sincronizar os itens da feira em tempo real.
                </span>
              </div>

              {/* Botões de Cópia e Compartilhamento */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className={`btn-tactile flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl transition-all duration-200 active:scale-95 shadow-sm ${
                    copiedCode
                      ? 'bg-emerald-500 text-white scale-[1.03] shadow-emerald-500/20'
                      : 'bg-brand-600 hover:bg-brand-700 text-white'
                  }`}
                >
                  {copiedCode ? <Check className="w-4 h-4 animate-in zoom-in duration-150" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? '✓ Copiado!' : 'Copiar Código'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`btn-tactile flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 active:scale-95 ${
                    copiedLink
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in duration-150" /> : <ExternalLink className="w-4 h-4 text-slate-400" />}
                  <span>{copiedLink ? '✓ Link Copiado!' : 'Copiar Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="btn-tactile flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 transition-all duration-200 active:scale-95 shadow-sm"
                  title="Compartilhar pelo WhatsApp"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setShowQrCode((prev) => !prev);
                  }}
                  className={`btn-tactile flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 active:scale-95 shadow-sm ${
                    showQrCode
                      ? 'bg-brand-600 text-white border-brand-600 shadow-brand-500/20'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                  title="Exibir QR Code para ingresso rápido"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{showQrCode ? 'Ocultar QR' : 'QR Code'}</span>
                </button>
              </div>

              {showQrCode && (
                <div className="pt-3 pb-1 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-white p-3.5 rounded-2xl border-2 border-brand-500 shadow-xl shadow-brand-500/10 inline-block">
                    {qrSvg ? (
                      <div
                        className="w-44 h-44 sm:w-48 sm:h-48 [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
                        Gerando QR Code...
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-2.5 text-center">
                    Aponte a câmera do celular para entrar instantaneamente
                  </p>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Sem digitar códigos • Sincronização em tempo real
                  </span>
                </div>
              )}
            </div>

            {/* Bloco 2: Membros com Acesso */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Membros ({1 + currentShares.length})
              </span>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {/* Dono / Criador */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-sm shrink-0"
                      style={{ backgroundColor: list?.owner_avatar_color || '#10B981' }}
                    >
                      {list?.owner_name?.charAt(0)?.toUpperCase() || 'D'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                          {list?.owner_name || 'Dono da Lista'}
                        </h4>
                        {list?.owner_id === currentUser?.id && (
                          <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded font-bold">
                            Você
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Dono da Feira
                      </span>
                    </div>
                  </div>
                </div>

                {/* Familiares compartilhados */}
                {currentShares.map((share) => (
                  <div
                    key={share.id || share.user_id}
                    className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-sm shrink-0"
                        style={{ backgroundColor: share.avatar_color || '#3B82F6' }}
                      >
                        {share.user_name?.charAt(0)?.toUpperCase() || 'F'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                            {share.user_name || 'Familiar'}
                          </h4>
                          {share.user_id === currentUser?.id && (
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded font-bold">
                              Você
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                          Pode editar e comprar
                        </span>
                      </div>
                    </div>

                    {share.user_id === currentUser?.id ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveFamiliar(share.user_id)}
                        disabled={isRemoving === share.user_id}
                        title="Sair desta feira compartilhada"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200/80 dark:border-rose-900/60 transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sair da feira</span>
                      </button>
                    ) : isOwner ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveFamiliar(share.user_id)}
                        disabled={isRemoving === share.user_id}
                        title="Remover acesso deste familiar"
                        className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Conteúdo da Aba 2: Entrar em Outra Feira com Código */
          <form onSubmit={handleJoinSubmit} className="p-5 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Entrar em uma feira familiar
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Digite o código de acesso compartilhado com você para visualizar, adicionar e marcar produtos no carrinho em tempo real.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                Código da Feira
              </label>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                placeholder="Ex: F51DE6"
                maxLength={20}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl px-4 py-3 font-mono text-center text-lg sm:text-xl font-black tracking-widest outline-none focus:ring-2 focus:ring-brand-500 transition uppercase"
                required
                autoFocus
              />
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block text-center">
                Aceita códigos curtos e códigos prévios de qualquer tamanho.
              </span>
            </div>

            {joinError && (
              <div
                aria-label="Aviso ao Entrar na Feira"
                className="bg-rose-50/90 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 rounded-xl p-3 flex items-center justify-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300 shadow-sm animate-in fade-in text-center"
              >
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {joinSuccess && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Feira sincronizada com sucesso! Abrindo...</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isJoining || !joinCodeInput.trim() || joinSuccess}
              className="w-full min-h-[48px] bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl transition shadow-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <span>{isJoining ? 'Localizando feira...' : 'Entrar na Feira'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Rodapé Informativo */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: currentUser?.avatar_color || '#10B981' }}
            />
            <span>
              Conectado como: <strong>{currentUser?.name || 'Meu Usuário'}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenProfile) onOpenProfile();
            }}
            className="font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Gerenciar Perfis</span>
          </button>
        </div>
      </div>
    </div>
  );
}
