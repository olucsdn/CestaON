import React, { useState } from 'react';
import { formatMoney } from '../utils/formatters.js';
import { User, Check, Plus, Edit2, Shield, X, Award, ShoppingBag, ShoppingCart, LogOut, Mail, AlertCircle, Eye, EyeOff, Download, Trash2, KeyRound } from 'lucide-react';
import { showToast } from '../utils/toast.js';

const AVATAR_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#EF4444'  // Red
];

export function UserProfileModal({
  currentUser,
  allUsers,
  onUpdateUser,
  onCreateUser,
  onSwitchUser,
  onOpenAuth,
  onLogout,
  onNavigate,
  onClose
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editEmail, setEditEmail] = useState(currentUser?.email || '');
  const [editColor, setEditColor] = useState(currentUser?.avatar_color || '#10B981');

  // Estados de Alteração de Senha
  const [wantChangePassword, setWantChangePassword] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  // Estados e fluxos de Conformidade Legal (LGPD - Arts. 18, V e VI)
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportData = async () => {
    if (!currentUser?.id) return;
    try {
      setIsExporting(true);
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
      const headers = {
        'X-User-Id': currentUser.id
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/users/${currentUser.id}/export`, { headers });
      if (!res.ok) throw new Error('Falha ao exportar dados');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = (currentUser.name || 'usuario').toLowerCase().replace(/\s+/g, '_');
      a.download = `cestaon_dados_${cleanName}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message || 'Erro ao exportar dados', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    setDeleteError('');
    setIsDeleting(true);
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
      const headers = {
        'Content-Type': 'application/json',
        'X-User-Id': currentUser.id
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ pin: deletePin })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao excluir conta');
      }
      showToast('Sua conta e todos os dados associados foram excluídos definitivamente.', 'success');
      if (onLogout) onLogout();
      onClose();
    } catch (err) {
      setDeleteError(err.message || 'Erro ao excluir conta');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRedirectToRecover = () => {
    onClose();
    if (onNavigate) {
      onNavigate('/recuperar');
    } else if (onOpenAuth) {
      onOpenAuth('recover');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setEditError('');

    if (!editName.trim()) {
      setEditError('Por favor, informe seu nome ou apelido');
      return;
    }

    if (!editEmail.trim()) {
      setEditError('Por favor, informe um e-mail válido');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail.trim())) {
      setEditError('O e-mail informado possui formato inválido');
      return;
    }

    const payload = {
      name: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      avatar_color: editColor
    };

    if (wantChangePassword) {
      if (currentUser?.has_pin && !currentPin.trim()) {
        setEditError('Por favor, informe sua senha atual para autorizar a alteração.');
        return;
      }

      if (!newPin.trim()) {
        setEditError('Por favor, informe a nova senha.');
        return;
      }

      const isMinLength = newPin.length >= 6;
      const hasLetter = /[a-zA-Z]/.test(newPin);
      const hasNumber = /[0-9]/.test(newPin);
      const isPinOnly = /^\d{4,8}$/.test(newPin);
      const isValidPassword = (isMinLength && hasLetter && hasNumber) || isPinOnly;

      if (!isValidPassword) {
        setEditError('A nova senha deve ter no mínimo 6 caracteres com letras e números (ou PIN de 4 a 8 dígitos)');
        return;
      }

      if (newPin !== confirmPin) {
        setEditError('A confirmação da nova senha não confere');
        return;
      }

      payload.pin = newPin.trim();
      if (currentUser?.has_pin) {
        payload.current_pin = currentPin.trim();
      }
    }

    setIsSaving(true);
    try {
      await onUpdateUser(currentUser.id, payload);
      setIsEditing(false);
      setWantChangePassword(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('PIN atual incorreto') || msg.includes('Senha/PIN atual')) {
        setEditError('Senha atual incorreta. Caso não lembre da senha, utilize a página de recuperação.');
      } else {
        setEditError(msg || 'Erro ao atualizar dados do perfil');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const stats = currentUser?.stats || {};

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] sm:max-h-[90vh] flex flex-col transition-colors duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-brand-700 dark:text-brand-300 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">Minha Conta</span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Gerenciar Perfil</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 sm:p-5 space-y-4 sm:space-y-6 overflow-y-auto flex-1 overscroll-contain">
          {/* Card do Perfil Atual */}
          {!isEditing ? (
            <div className="bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-800/60 dark:to-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md shrink-0 aspect-square"
                  style={{ backgroundColor: currentUser?.avatar_color || '#10B981' }}
                >
                  {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white leading-tight truncate">
                    {currentUser?.name || 'Meu Usuário'}
                  </h3>
                  {currentUser?.email ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate font-medium">
                      <Mail className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                      <span className="truncate">{currentUser.email}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5 font-semibold">
                      <Check className="w-3 h-3 stroke-[3]" /> Conectado
                    </span>
                  )}
                </div>
              </div>

              {/* Botões de Ação do Perfil: Editar Perfil e Alterar Senha sempre visíveis e alinhados */}
              <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => {
                    setEditName(currentUser?.name || '');
                    setEditEmail(currentUser?.email || '');
                    setEditColor(currentUser?.avatar_color || '#10B981');
                    setWantChangePassword(false);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setEditError('');
                    setIsEditing(true);
                  }}
                  className="w-full py-2 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="Editar Perfil"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Editar Perfil</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditName(currentUser?.name || '');
                    setEditEmail(currentUser?.email || '');
                    setEditColor(currentUser?.avatar_color || '#10B981');
                    setWantChangePassword(true);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setEditError('');
                    setIsEditing(true);
                  }}
                  className="w-full py-2 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="Alterar Senha de Acesso"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Alterar Senha</span>
                </button>
              </div>
            </div>
          ) : (
            /* Formulário de Edição */
            <form onSubmit={handleSaveProfile} className="bg-slate-50 dark:bg-slate-800/60 border border-brand-300 dark:border-brand-500/50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-700 dark:text-brand-400">
                  Editar Dados do Perfil
                </h4>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Nome, E-mail e Cor</span>
              </div>

              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Seu Nome ou Apelido <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  E-mail da Conta <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="text-center py-0.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5 text-center">Escolha sua cor</label>
                <div className="flex items-center justify-center gap-2.5 flex-wrap mx-auto">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-7 h-7 rounded-full transition flex items-center justify-center text-white ${
                        editColor === c ? 'scale-110 ring-2 ring-offset-2 ring-slate-800 dark:ring-white' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {editColor === c && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seção de Alterar Senha */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWantChangePassword((prev) => !prev);
                      setEditError('');
                    }}
                    className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{wantChangePassword ? 'Cancelar alteração de senha' : 'Alterar Senha de Acesso'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRedirectToRecover}
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    Não lembra a senha?
                  </button>
                </div>

                {wantChangePassword && (
                  <div className="space-y-3 bg-white dark:bg-slate-900/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm animate-in fade-in">
                    {currentUser?.has_pin && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                          Senha Atual <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPin ? 'text' : 'password'}
                            value={currentPin}
                            onChange={(e) => setCurrentPin(e.target.value)}
                            placeholder="Digite sua senha atual"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 pr-9 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                            required={wantChangePassword && currentUser?.has_pin}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPin((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                          >
                            {showCurrentPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        Nova Senha <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPin ? 'text' : 'password'}
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value)}
                          placeholder="Mínimo 6 caracteres (letras e números) ou 4-8 dígitos"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 pr-9 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                          required={wantChangePassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPin((prev) => !prev)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                        >
                          {showNewPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        Confirmar Nova Senha <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPin ? 'text' : 'password'}
                          value={confirmPin}
                          onChange={(e) => setConfirmPin(e.target.value)}
                          placeholder="Repita a nova senha"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 pr-9 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
                          required={wantChangePassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPin((prev) => !prev)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                        >
                          {showConfirmPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setWantChangePassword(false);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setEditError('');
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-black bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg transition"
                >
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          )}

          {/* Estatísticas do Usuário */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-2 sm:p-3 text-center min-w-0">
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 mx-auto mb-1" />
              <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block leading-tight">Listas</span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                {stats.totalLists || 0}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-2 sm:p-3 text-center min-w-0">
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
              <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block leading-tight">Itens Comprados</span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                {stats.totalItemsPurchased || 0}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-2 sm:p-3 text-center min-w-0">
              <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 dark:text-amber-400 mx-auto mb-1" />
              <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block leading-tight">Total Investido</span>
              <span className="text-[11px] sm:text-sm font-black text-slate-900 dark:text-slate-100 leading-tight block whitespace-nowrap">
                {formatMoney(stats.totalSpentCents || 0)}
              </span>
            </div>
          </div>

          {/* Sessão Ativa & Ações da Conta */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: currentUser?.avatar_color || '#10B981' }}
                >
                  {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {currentUser?.name || 'Usuário'}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                    {currentUser?.email || 'Sessão ativa'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-[9px] sm:text-[10px] font-extrabold shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Sessão Principal</span>
              </div>
            </div>

            {/* Ações Rápidas de Conta e Sessão */}
            <div className="space-y-2">
              {/* Ações de Dados e Eliminação de Conta */}
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] flex items-center justify-center gap-2 transition border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isExporting ? 'Exportando Dados...' : 'Baixar Meus Dados em JSON'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteError('');
                    setDeletePin('');
                    setShowDeleteModal(true);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 dark:bg-slate-800/30 dark:hover:bg-rose-950/30 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition border border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Minha Conta e Todos os Dados</span>
                </button>
              </div>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition border border-rose-200 dark:border-rose-900 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair da conta atual</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão de Conta (LGPD) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-extrabold text-slate-900 dark:text-white text-center mb-1">
              Excluir Conta Permanentemente?
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-400 text-center mb-4 leading-relaxed">
              Esta ação é definitiva e irreversível. Todas as suas listas de compras, histórico de feiras, participações e cadastro serão <strong>completamente apagados</strong> do sistema.
            </p>

            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              {currentUser?.has_pin && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Digite sua senha atual para confirmar:
                  </label>
                  <input
                    type="password"
                    value={deletePin}
                    onChange={(e) => setDeletePin(e.target.value)}
                    placeholder="Sua senha de acesso"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                    required
                    autoFocus
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition shadow-md shadow-rose-600/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir Tudo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
