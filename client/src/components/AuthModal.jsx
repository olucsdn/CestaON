import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  Sparkles,
  UserPlus,
  LogIn,
  RefreshCw,
  ShoppingBag,
  Mail,
  HelpCircle,
  Key,
  Copy,
  Check
} from 'lucide-react';

const AVATAR_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#EF4444'  // Red
];

const DEFAULT_SECURITY_QUESTIONS = [
  'Qual o nome do seu primeiro animal de estimação?',
  'Em qual cidade você nasceu?',
  'Qual o nome da sua escola primária?',
  'Qual o apelido de infância que sua família te chamava?',
  'Qual a sua comida ou prato favorito?'
];

export function AuthModal({
  isOpen,
  initialView = 'login', // 'login' | 'register' | 'recover'
  currentUser,
  allUsers = [],
  onLogin,
  onRegister,
  onRecoverPassword,
  onClose,
  isMandatory = false
}) {
  const [view, setView] = useState(initialView); // 'login' | 'register' | 'recover'

  // Estados de Login (Apenas E-mail e Senha)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  // Estados de Cadastro
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regColor, setRegColor] = useState('#10B981');
  const [regPin, setRegPin] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [showRegPin, setShowRegPin] = useState(false);
  const [regQuestion, setRegQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [regAnswer, setRegAnswer] = useState('');
  const [regError, setRegError] = useState('');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [createdRecoveryKey, setCreatedRecoveryKey] = useState(null);
  const [copiedCreatedKey, setCopiedCreatedKey] = useState(false);
  const [pendingCreatedUser, setPendingCreatedUser] = useState(null);

  // Estados de Recuperação (Opção 2 - Chave Secreta Principal e Opção 3 - Pergunta Secreta Fallback)
  const [recoverMethod, setRecoverMethod] = useState('key'); // 'key' | 'question'
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverKey, setRecoverKey] = useState('');
  const [recoverQuestion, setRecoverQuestion] = useState('');
  const [recoverAnswer, setRecoverAnswer] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [recoverNewPin, setRecoverNewPin] = useState('');
  const [recoverPinConfirm, setRecoverPinConfirm] = useState('');
  const [showRecoverPin, setShowRecoverPin] = useState(false);
  const [recoverError, setRecoverError] = useState('');
  const [recoverSuccess, setRecoverSuccess] = useState(false);
  const [newGeneratedKey, setNewGeneratedKey] = useState('');
  const [copiedNewKey, setCopiedNewKey] = useState(false);
  const [isSubmittingRecover, setIsSubmittingRecover] = useState(false);

  if (!isOpen && !isMandatory) return null;

  // 1. Submissão de Login
  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim()) {
      setLoginError('Por favor, informe seu e-mail cadastrado');
      return;
    }

    if (!loginPin.trim()) {
      setLoginError('Por favor, informe sua senha de acesso');
      return;
    }

    setIsSubmittingLogin(true);
    try {
      // Integração de autenticação e verificação de senha/PIN via /api/users/login ou /api/users/:id/verify-pin
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPin.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'E-mail ou senha inválidos.');
      }
      if (data.token) {
        localStorage.setItem('feira_auth_token', data.token);
      }
      if (data.user?.id) {
        localStorage.setItem('feira_user_id', data.user.id);
      }
      if (onLogin) {
        await onLogin(data.user, data.token);
      }
      if (onClose) {
        onClose();
      }
    } catch (err) {
      setLoginError(err.message || 'Falha ao autenticar.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  // 2. Submissão de Cadastro
  const handleSubmitRegister = async (e) => {
    e.preventDefault();
    setRegError('');

    if (!regName.trim()) {
      setRegError('Digite seu nome ou apelido');
      return;
    }

    if (!regEmail.trim()) {
      setRegError('Digite seu e-mail');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      setRegError('Por favor, informe um e-mail válido');
      return;
    }

    if (regPin.trim()) {
      const hasMinLength = regPin.trim().length >= 6;
      const hasLetter = /[a-zA-Z]/.test(regPin);
      const hasNumber = /[0-9]/.test(regPin);
      if (!hasMinLength || !hasLetter || !hasNumber) {
        setRegError('A senha deve cumprir as exigências: mínimo de 6 caracteres, contendo letras e números');
        return;
      }
      if (regPin.trim() !== regPinConfirm.trim()) {
        setRegError('A confirmação da senha não coincide');
        return;
      }
    }

    if (!regAnswer.trim()) {
      setRegError('Por favor, responda à pergunta secreta de segurança');
      return;
    }

    setIsSubmittingReg(true);
    try {
      const payload = {
        name: regName.trim(),
        email: regEmail.trim().toLowerCase(),
        avatar_color: regColor,
        pin: regPin.trim() || null,
        security_question: regQuestion,
        security_answer: regAnswer.trim()
      };

      let created = null;
      if (onRegister) {
        created = await onRegister(payload, false);
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        created = await res.json();
        if (!res.ok) throw new Error(created.error || 'Erro ao cadastrar usuário.');
      }

      if (created) {
        if (created.token) {
          localStorage.setItem('feira_auth_token', created.token);
        }
        if (created.id) {
          localStorage.setItem('feira_user_id', created.id);
        }
        setPendingCreatedUser(created);
        if (created.recovery_key) {
          setCreatedRecoveryKey(created.recovery_key);
        } else {
          if (onLogin) {
            await onLogin(created, created.token);
          }
          if (onClose) {
            onClose();
          }
        }
      }
    } catch (err) {
      setRegError(err.message || 'Erro ao cadastrar usuário.');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  const handleCopyCreatedKey = () => {
    if (!createdRecoveryKey) return;
    try {
      navigator.clipboard.writeText(createdRecoveryKey);
      setCopiedCreatedKey(true);
      setTimeout(() => setCopiedCreatedKey(false), 2500);
    } catch (_) {}
  };

  // Busca Pergunta de Segurança para o e-mail informado
  const handleFetchSecurityQuestion = async (targetEmail = recoverEmail) => {
    if (!targetEmail.trim()) {
      setQuestionError('Digite seu e-mail cadastrado primeiro');
      return;
    }
    setQuestionError('');
    setIsLoadingQuestion(true);
    try {
      const res = await fetch('/api/users/security-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim().toLowerCase() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Nenhuma pergunta de segurança encontrada para este e-mail');
      }
      setRecoverQuestion(data.question);
    } catch (err) {
      setQuestionError(err.message || 'Erro ao buscar pergunta de segurança');
      setRecoverQuestion('');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  // 3. Submissão de Recuperação de Senha (Dual: Opção 2 Principal + Opção 3 Fallback)
  const handleSubmitRecover = async (e) => {
    e.preventDefault();
    setRecoverError('');
    setRecoverSuccess(false);

    if (!recoverEmail.trim()) {
      setRecoverError('Informe o e-mail cadastrado');
      return;
    }

    if (recoverMethod === 'key' && !recoverKey.trim()) {
      setRecoverError('Informe sua Chave Secreta de Recuperação');
      return;
    }

    if (recoverMethod === 'question' && !recoverAnswer.trim()) {
      setRecoverError('Informe a resposta da pergunta secreta');
      return;
    }

    if (!recoverNewPin.trim()) {
      setRecoverError('Informe a nova senha');
      return;
    }

    const hasMinLength = recoverNewPin.trim().length >= 6;
    const hasLetter = /[a-zA-Z]/.test(recoverNewPin);
    const hasNumber = /[0-9]/.test(recoverNewPin);
    if (!hasMinLength || !hasLetter || !hasNumber) {
      setRecoverError('A nova senha deve ter no mínimo 6 caracteres, com letras e números');
      return;
    }

    if (recoverNewPin.trim() !== recoverPinConfirm.trim()) {
      setRecoverError('As senhas digitadas não coincidem');
      return;
    }

    setIsSubmittingRecover(true);
    try {
      const payload = {
        email: recoverEmail.trim().toLowerCase(),
        password: recoverNewPin.trim(),
        ...(recoverMethod === 'key' ? { recovery_key: recoverKey.trim() } : { security_answer: recoverAnswer.trim() })
      };

      const res = await fetch('/api/users/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível redefinir no momento.');
      }

      if (data.token) {
        localStorage.setItem('feira_auth_token', data.token);
      }
      if (data.user?.id) {
        localStorage.setItem('feira_user_id', data.user.id);
      }

      setRecoverSuccess(true);
      if (data.new_recovery_key) {
        setNewGeneratedKey(data.new_recovery_key);
      }
      setRecoverNewPin('');
      setRecoverPinConfirm('');
      setRecoverKey('');
      setRecoverAnswer('');
    } catch (err) {
      setRecoverError(err.message || 'Falha ao redefinir a senha.');
    } finally {
      setIsSubmittingRecover(false);
    }
  };

  const handleCopyNewKey = () => {
    if (!newGeneratedKey) return;
    try {
      navigator.clipboard.writeText(newGeneratedKey);
      setCopiedNewKey(true);
      setTimeout(() => setCopiedNewKey(false), 2500);
    } catch (_) {}
  };

  return (
    <div
      className={
        isMandatory
          ? 'min-h-screen w-full bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 select-none transition-colors'
          : 'fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto'
      }
    >
      {isMandatory && (
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/20 mb-3">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Cesta<span className="text-brand-500">On</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            No CestaON, o preço é bom.
          </p>
          <div className="mt-3 px-3.5 py-1 rounded-full bg-brand-50 dark:bg-brand-950/70 border border-brand-200 dark:border-brand-800 text-[11px] font-bold text-brand-700 dark:text-brand-400">
            Acesso Restrito • Identifique-se para continuar
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto transition-all duration-200">
        
        {/* Cabeçalho da Autenticação */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm shrink-0">
              {view === 'login' ? (
                <LogIn className="w-5 h-5" />
              ) : view === 'register' ? (
                <UserPlus className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">
                CestaON Acesso Seguro
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                {view === 'login' && 'Entrar na Conta'}
                {view === 'register' && 'Criar Nova Conta'}
                {view === 'recover' && 'Recuperar Acesso'}
              </h2>
            </div>
          </div>
          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Abas Superiores Rápidas */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/40 p-1 gap-1">
          <button
            onClick={() => {
              setView('login');
              setLoginError('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              view === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Login</span>
          </button>

          <button
            onClick={() => {
              setView('register');
              setRegError('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              view === 'register'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Cadastrar</span>
          </button>

          <button
            onClick={() => {
              setView('recover');
              setRecoverError('');
              setRecoverSuccess(false);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              view === 'recover'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Recuperar</span>
          </button>
        </div>

        {/* Conteúdo do Formulário */}
        <div className="p-5 sm:p-6 space-y-4">
          
          {/* ===================== TELA DE LOGIN ===================== */}
          {view === 'login' && (
            <form onSubmit={handleSubmitLogin} className="space-y-4 animate-in fade-in duration-150">
              {loginError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Campo de E-mail */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  E-mail <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => {
                    setLoginEmail(e.target.value);
                    setLoginError('');
                  }}
                  placeholder="exemplo@email.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                  required
                  autoFocus
                />
              </div>

              {/* Senha de Acesso */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Senha de Acesso <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setView('recover')}
                    className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showLoginPin ? 'text' : 'password'}
                    value={loginPin}
                    onChange={(e) => {
                      setLoginPin(e.target.value);
                      setLoginError('');
                    }}
                    placeholder="Digite sua senha"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPin((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showLoginPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Botão Entrar */}
              <button
                type="submit"
                disabled={isSubmittingLogin}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm py-3 rounded-xl shadow-md shadow-brand-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmittingLogin ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Entrar no CestaON</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Ainda não tem conta?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setView('register');
                      setRegError('');
                    }}
                    className="font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                  >
                    Cadastre-se grátis
                  </button>
                </span>
              </div>
            </form>
          )}

          {/* ===================== TELA DE CADASTRO ===================== */}
          {view === 'register' && (
            createdRecoveryKey ? (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-2.5 shadow-inner">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Conta Criada com Sucesso!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Guarde sua Chave Secreta de Recuperação com segurança
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border-2 border-dashed border-brand-500/40 rounded-2xl space-y-2 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Sua Chave de Emergência (Opção 2 - Principal)
                  </span>
                  <div className="text-xl font-mono font-black text-brand-600 dark:text-brand-400 tracking-widest select-all">
                    {createdRecoveryKey}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                    Use esta chave para redefinir a senha. Se perdê-la, você poderá usar sua Pergunta Secreta.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyCreatedKey}
                    className="mt-1 py-1.5 px-3 rounded-lg font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-brand-500 text-slate-800 dark:text-slate-200 shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedCreatedKey ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Chave Copiada!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copiar Chave</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setCreatedRecoveryKey(null);
                    const userToLogin = pendingCreatedUser;
                    if (userToLogin && onLogin) {
                      await onLogin(userToLogin, userToLogin.token);
                    }
                    if (onClose) onClose();
                    else setView('login');
                  }}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs sm:text-sm py-3 rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Anotado! Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitRegister} className="space-y-3.5 animate-in fade-in duration-150">
                {regError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                {/* Nome do Usuário */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo ou Apelido <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Maria Clara, Lucas, Família Silva"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                    required
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="exemplo@email.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                    required
                  />
                </div>

                {/* Cor do Avatar */}
                <div className="text-center py-0.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 text-center">
                    Cor do Avatar
                  </label>
                  <div className="flex items-center justify-center gap-2 flex-wrap mx-auto">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setRegColor(c)}
                        className={`w-7 h-7 rounded-lg transition-transform ${
                          regColor === c ? 'scale-110 ring-2 ring-offset-2 ring-brand-500' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Senha de Acesso */}
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Senha de Acesso (Mín. 6 caracteres com letras e números) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPin ? 'text' : 'password'}
                        value={regPin}
                        onChange={(e) => setRegPin(e.target.value)}
                        placeholder="Digite sua senha"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 pr-10 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPin((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showRegPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <input
                      type={showRegPin ? 'text' : 'password'}
                      value={regPinConfirm}
                      onChange={(e) => setRegPinConfirm(e.target.value)}
                      placeholder="Confirme sua senha"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                      required
                    />
                  </div>
                </div>

                {/* Pergunta e Resposta Secreta */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Pergunta Secreta de Segurança (Fallback)
                  </label>
                  <select
                    value={regQuestion}
                    onChange={(e) => setRegQuestion(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                  >
                    {DEFAULT_SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={regAnswer}
                    onChange={(e) => setRegAnswer(e.target.value)}
                    placeholder="Sua resposta secreta"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                    required
                  />
                </div>

                {/* Botão Cadastrar */}
                <button
                  type="submit"
                  disabled={isSubmittingReg}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm py-3 rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isSubmittingReg ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Criando conta...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Criar Minha Conta</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Já possui uma conta?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setLoginError('');
                      }}
                      className="font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                    >
                      Faça login
                    </button>
                  </span>
                </div>
              </form>
            )
          )}

          {/* ===================== TELA DE RECUPERAÇÃO ===================== */}
          {view === 'recover' && (
            <form onSubmit={handleSubmitRecover} className="space-y-3.5 animate-in fade-in duration-150">
              {recoverSuccess ? (
                <div className="space-y-3 p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex flex-col items-center justify-center text-center text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-100">
                      Senha redefinida com sucesso!
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                      Uma nova chave de emergência foi gerada para você.
                    </p>
                  </div>

                  {newGeneratedKey && (
                    <div className="w-full p-3 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Nova Chave de Recuperação
                      </span>
                      <div className="text-lg font-mono font-black text-brand-600 dark:text-brand-400 tracking-widest select-all">
                        {newGeneratedKey}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyNewKey}
                        className="py-1 px-2.5 rounded-lg font-bold text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 text-slate-800 dark:text-slate-200 transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedNewKey ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copiada!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span>Copiar Chave</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setRecoverSuccess(false);
                      setNewGeneratedKey('');
                    }}
                    className="w-full py-2 px-3 rounded-xl font-bold text-xs bg-brand-600 hover:bg-brand-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Ir para o Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  {recoverError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{recoverError}</span>
                    </div>
                  )}

                  {/* Alternador de Método */}
                  <div className="flex bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setRecoverMethod('key');
                        setRecoverError('');
                      }}
                      className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
                        recoverMethod === 'key'
                          ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Chave Secreta (Opção 2)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoverMethod('question');
                        setRecoverError('');
                        if (recoverEmail.trim()) {
                          handleFetchSecurityQuestion(recoverEmail.trim());
                        }
                      }}
                      className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
                        recoverMethod === 'question'
                          ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Pergunta (Opção 3)</span>
                    </button>
                  </div>

                  {/* E-mail Cadastrado */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Seu E-mail Cadastrado <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={recoverEmail}
                      onChange={(e) => {
                        setRecoverEmail(e.target.value);
                        setRecoverError('');
                        if (recoverMethod === 'question' && e.target.value.includes('@')) {
                          handleFetchSecurityQuestion(e.target.value);
                        }
                      }}
                      placeholder="Digite seu e-mail cadastrado"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Opção 2: Chave Secreta */}
                  {recoverMethod === 'key' ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Chave Secreta de Recuperação <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">Ex: ABCD-1234</span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={recoverKey}
                          onChange={(e) => setRecoverKey(e.target.value.toUpperCase())}
                          placeholder="Digite sua chave secreta"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition tracking-wider"
                          required
                        />
                        <Key className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRecoverMethod('question');
                          if (recoverEmail.trim()) {
                            handleFetchSecurityQuestion(recoverEmail.trim());
                          }
                        }}
                        className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline mt-1 block"
                      >
                        Perdeu a chave? Use a Pergunta Secreta →
                      </button>
                    </div>
                  ) : (
                    /* Opção 3: Pergunta Secreta */
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Pergunta de Segurança
                        </label>
                        {recoverEmail.trim() && (
                          <button
                            type="button"
                            onClick={() => handleFetchSecurityQuestion(recoverEmail.trim())}
                            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            <RefreshCw className={`w-3 h-3 ${isLoadingQuestion ? 'animate-spin' : ''}`} />
                            <span>Buscar</span>
                          </button>
                        )}
                      </div>

                      {questionError && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-2">
                          {questionError}
                        </div>
                      )}

                      {recoverQuestion ? (
                        <div className="p-2.5 bg-brand-50/70 dark:bg-brand-950/30 border border-brand-200/80 dark:border-brand-800/60 rounded-xl">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {recoverQuestion}
                          </p>
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 italic">
                          Informe seu e-mail acima para carregar a pergunta.
                        </div>
                      )}

                      <input
                        type="text"
                        value={recoverAnswer}
                        onChange={(e) => setRecoverAnswer(e.target.value)}
                        placeholder="Digite sua resposta secreta"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                      />

                      <button
                        type="button"
                        onClick={() => setRecoverMethod('key')}
                        className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline mt-1 block"
                      >
                        ← Usar Chave Secreta de Recuperação
                      </button>
                    </div>
                  )}

                  {/* Nova Senha */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nova Senha (Mín. 6 caracteres com letras e números)
                    </label>
                    <div className="relative">
                      <input
                        type={showRecoverPin ? 'text' : 'password'}
                        value={recoverNewPin}
                        onChange={(e) => setRecoverNewPin(e.target.value)}
                        placeholder="Digite a nova senha"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 pr-10 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRecoverPin((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showRecoverPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirmação da Nova Senha */}
                  <div>
                    <input
                      type={showRecoverPin ? 'text' : 'password'}
                      value={recoverPinConfirm}
                      onChange={(e) => setRecoverPinConfirm(e.target.value)}
                      placeholder="Repita a nova senha para confirmar"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                      required
                    />
                  </div>

                  {/* Botão Redefinir */}
                  <button
                    type="submit"
                    disabled={isSubmittingRecover}
                    className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm py-3 rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    {isSubmittingRecover ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Redefinindo senha...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>Redefinir Senha e Entrar</span>
                      </>
                    )}
                  </button>
                </>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setRecoverError('');
                    setRecoverSuccess(false);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1.5 mx-auto transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar para o Login</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Rodapé Seguro */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span>Criptografia Segura PBKDF2</span>
          </div>
          <span className="font-semibold text-slate-600 dark:text-slate-300">CestaON</span>
        </div>
      </div>
    </div>
  );
}
