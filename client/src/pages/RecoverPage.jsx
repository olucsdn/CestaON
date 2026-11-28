import React, { useState } from 'react';
import {
  ShoppingBag,
  KeyRound,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sun,
  Moon,
  ArrowRight,
  ArrowLeft,
  Mail,
  Lock,
  Check,
  ShieldCheck,
  HelpCircle,
  Key,
  Copy,
  RefreshCw
} from 'lucide-react';

export function RecoverPage({
  allUsers = [],
  currentUser = null,
  theme = 'light',
  onToggleTheme,
  onLogin,
  onNavigate
}) {
  const [step, setStep] = useState(1); // Passo 1: Identificação, Passo 2: Nova Senha
  const [method, setMethod] = useState('code'); // 'code' (Opção 1 - E-mail) | 'key' (Opção 2 - Chave) | 'question' (Opção 3 - Pergunta)
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [newGeneratedKey, setNewGeneratedKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Validações de Requisitos Médios da Senha
  const hasMinLength = newPassword.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^a-zA-Z0-9]/.test(newPassword);
  const hasGoodLength = newPassword.length >= 10;
  const isMediumPasswordValid = hasMinLength && hasLetter && hasNumber;

  let strengthScore = 0;
  if (newPassword.length > 0) {
    if (hasMinLength) strengthScore += 1;
    if (hasLetter) strengthScore += 1;
    if (hasNumber) strengthScore += 1;
    if (hasSpecial) strengthScore += 1;
    if (hasGoodLength) strengthScore += 1;
  }

  const getStrengthInfo = () => {
    if (newPassword.length === 0) return { label: 'Aguardando', color: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-400', width: 'w-0' };
    if (strengthScore <= 2) return { label: 'Fraca', color: 'bg-rose-500', text: 'text-rose-500', width: 'w-1/4' };
    if (strengthScore === 3) return { label: 'Média (Válida)', color: 'bg-amber-500', text: 'text-amber-500', width: 'w-2/4' };
    if (strengthScore === 4) return { label: 'Forte', color: 'bg-emerald-500', text: 'text-emerald-500', width: 'w-3/4' };
    return { label: 'Muito Forte', color: 'bg-teal-500', text: 'text-teal-500', width: 'w-full' };
  };
  const strengthInfo = getStrengthInfo();

  // Busca a pergunta secreta quando o usuário digita o e-mail ou alterna para o modo pergunta
  const handleFetchSecurityQuestion = async (targetEmail = email) => {
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
      setSecurityQuestion(data.question);
    } catch (err) {
      setQuestionError(err.message || 'Erro ao buscar pergunta de segurança');
      setSecurityQuestion('');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Por favor, digite seu e-mail cadastrado primeiro');
      return;
    }
    setError('');
    setIsSendingCode(true);
    try {
      const res = await fetch('/api/users/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: 'recover' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar código de verificação');
      }
      setCodeSent(true);
    } catch (err) {
      setError(err.message || 'Erro ao enviar código de verificação');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Validação do Passo 1 e avanço para o Passo 2
  const handleNextStep = (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Por favor, informe seu e-mail cadastrado');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Por favor, informe um e-mail válido');
      return;
    }

    if (method === 'code' && (!verificationCode.trim() || verificationCode.trim().length !== 6)) {
      setError('Por favor, informe o código de 6 dígitos enviado para o seu e-mail');
      return;
    }

    if (method === 'key' && !recoveryKey.trim()) {
      setError('Por favor, informe sua Chave Secreta de Recuperação');
      return;
    }

    if (method === 'question' && !securityAnswer.trim()) {
      setError('Por favor, informe a resposta da sua pergunta secreta');
      return;
    }

    setStep(2);
  };

  // Submissão final no Passo 2
  const handleSubmitRecover = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!isMediumPasswordValid) {
      setError('A nova senha deve ter no mínimo 6 caracteres, contendo letras e números');
      return;
    }

    if (newPassword !== passwordConfirm) {
      setError('As senhas digitadas não conferem');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        password: newPassword.trim(),
        ...(method === 'code' ? { verification_code: verificationCode.trim() } : {}),
        ...(method === 'key' ? { recovery_key: recoveryKey.trim() } : {}),
        ...(method === 'question' ? { security_answer: securityAnswer.trim() } : {})
      };

      const res = await fetch('/api/users/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha');
      }

      if (data.token) {
        localStorage.setItem('feira_auth_token', data.token);
      }
      if (data.user?.id) {
        localStorage.setItem('feira_user_id', data.user.id);
      }
      setPendingUser(data.user || null);

      setSuccess(true);
      if (data.new_recovery_key) {
        setNewGeneratedKey(data.new_recovery_key);
      }
      setNewPassword('');
      setPasswordConfirm('');
      setRecoveryKey('');
      setSecurityAnswer('');
    } catch (err) {
      setError(err.message || 'Falha ao redefinir senha');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyNewKey = () => {
    if (!newGeneratedKey) return;
    try {
      navigator.clipboard.writeText(newGeneratedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 text-slate-800 dark:text-slate-100 flex flex-col justify-between p-3 sm:p-6 transition-colors duration-200">
      {/* Barra Superior */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-2">
        <div
          onClick={() => onNavigate && onNavigate('/')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/20 group-hover:scale-105 transition">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight flex items-center gap-1 leading-none">
              Cesta<span className="text-brand-500">On</span>
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
              No CestaON, o preço é bom.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser && (
            <button
              onClick={() => onNavigate && onNavigate('/')}
              className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer"
            >
              Voltar ao App
            </button>
          )}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-amber-400 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
              title="Alternar tema claro/escuro"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="max-w-md w-full mx-auto my-auto py-4 sm:py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
          
          {/* TELA DE SUCESSO: SENHA REDEFINIDA */}
          {success ? (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Senha Redefinida com Sucesso!
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sua conta foi redefinida com segurança
                </p>
              </div>

              {newGeneratedKey && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border-2 border-dashed border-brand-500/40 rounded-2xl space-y-2 text-center">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Sua Nova Chave de Emergência (Guarde!)
                  </span>
                  <div className="text-xl sm:text-2xl font-mono font-black text-brand-600 dark:text-brand-400 tracking-widest select-all">
                    {newGeneratedKey}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                    Uma nova chave de emergência foi gerada automaticamente para substituir a anterior.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyNewKey}
                    className="mt-2 py-2 px-4 rounded-xl font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-brand-500 text-slate-800 dark:text-slate-200 shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-600">Chave Copiada!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-500" />
                        <span>Copiar Nova Chave</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  if (pendingUser && onLogin) {
                    await onLogin(pendingUser, pendingUser.token);
                    if (onNavigate) onNavigate('/');
                  } else if (onNavigate) {
                    onNavigate('/login');
                  }
                }}
                className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Entrar no CestaON</span>
              </button>
            </div>
          ) : (
            <>
              {/* Header do Card */}
              <div className="text-center mb-5">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-2.5 shadow-inner">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Recuperar Acesso
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Passo {step} de 2 • {step === 1 ? 'Identificação da Conta' : 'Nova Senha de Acesso'}
                </p>
              </div>

              {/* Mensagem de Erro */}
              {error && (
                <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="font-medium leading-relaxed">{error}</div>
                </div>
              )}

              {/* Indicador de Passos */}
              <div className="flex items-center justify-center gap-2 pb-2 mb-3">
                <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 1 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${step === 1 ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    1
                  </span>
                  <span>Identidade</span>
                </div>
                <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700" />
                <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 2 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${step === 2 ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    2
                  </span>
                  <span>Nova Senha</span>
                </div>
              </div>

              {step === 1 ? (
                /* PASSO 1: IDENTIFICAÇÃO E AUTENTICAÇÃO */
                <form onSubmit={handleNextStep} className="space-y-3.5 animate-in fade-in duration-150">
                  {/* Campo de E-mail */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Seu E-mail Cadastrado
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (method === 'question' && securityQuestion) {
                            setSecurityQuestion('');
                          }
                        }}
                        onBlur={() => {
                          if (method === 'question' && email.trim()) {
                            handleFetchSecurityQuestion(email);
                          }
                        }}
                        placeholder="seu@email.com"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                        autoFocus
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {/* Alternador de Método de Recuperação */}
                  <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMethod('code');
                        setError('');
                      }}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                        method === 'code'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Código E-mail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMethod('key');
                        setError('');
                      }}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                        method === 'key'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Chave</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMethod('question');
                        setError('');
                        if (email.trim() && !securityQuestion) {
                          handleFetchSecurityQuestion(email);
                        }
                      }}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                        method === 'question'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Pergunta</span>
                    </button>
                  </div>

                  {/* Método: Código por E-mail */}
                  {method === 'code' && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="Código de 6 dígitos"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition text-center"
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSendCode}
                          disabled={isSendingCode}
                          className="px-3.5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                        >
                          {isSendingCode ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Enviando...</span>
                            </>
                          ) : (
                            <>
                              <Mail className="w-3.5 h-3.5" />
                              <span>{codeSent ? 'Reenviar' : 'Enviar Código'}</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {codeSent 
                          ? 'Código enviado! Verifique sua caixa de entrada e spam.'
                          : 'Clique em "Enviar Código" para receber o PIN de 6 dígitos no seu e-mail.'}
                      </p>
                    </div>
                  )}

                  {/* Método: Chave Secreta */}
                  {method === 'key' && (
                    <div className="space-y-1">
                      <div className="relative">
                        <input
                          type="text"
                          value={recoveryKey}
                          onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                          placeholder="Ex: XXXX-XXXX"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition tracking-wider"
                          required
                        />
                        <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                        A chave fornecida no momento da criação da sua conta.
                      </p>
                    </div>
                  )}

                  {/* Método: Pergunta Secreta */}
                  {method === 'question' && (
                    <div className="space-y-2">
                      {securityQuestion ? (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-start gap-2">
                          <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                          <span>{securityQuestion}</span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex items-center justify-between">
                          <span className="truncate pr-2">{questionError || 'Informe o e-mail para carregar'}</span>
                          <button
                            type="button"
                            onClick={() => handleFetchSecurityQuestion(email)}
                            className="px-2 py-1 bg-white dark:bg-slate-700 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-slate-600 hover:border-brand-500 shrink-0 cursor-pointer"
                          >
                            {isLoadingQuestion ? 'Buscando...' : 'Buscar'}
                          </button>
                        </div>
                      )}

                      <div className="relative">
                        <input
                          type="text"
                          value={securityAnswer}
                          onChange={(e) => setSecurityAnswer(e.target.value)}
                          placeholder="Sua resposta secreta"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                          required
                        />
                        <HelpCircle className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl font-black text-sm bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    <span>Avançar para Nova Senha</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* PASSO 2: NOVA SENHA */
                <form onSubmit={handleSubmitRecover} className="space-y-3.5 animate-in fade-in duration-150">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Nova Senha de Acesso
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Digite a nova senha (mín. 6)"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                        required
                        autoFocus
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        placeholder="Confirme a nova senha"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                        required
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>

                    {newPassword.length > 0 && (
                      <div className="space-y-1 animate-in fade-in pt-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Força da Senha:</span>
                          <span className={`font-bold ${strengthInfo.text}`}>{strengthInfo.label}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${strengthInfo.color} ${strengthInfo.width} transition-all duration-300 rounded-full`} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="py-3 px-3.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !isMediumPasswordValid}
                      className="flex-1 py-3 px-4 rounded-xl font-black text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Redefinindo...</span>
                        </>
                      ) : (
                        <>
                          <span>Redefinir Senha</span>
                          <Check className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Links e Alternativas */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Lembrou sua senha?</span>
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('/login')}
                    className="font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Fazer Login
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Deseja um novo perfil?</span>
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('/cadastro')}
                    className="font-bold text-slate-700 dark:text-slate-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Criar Nova Conta
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Rodapé Minimalista */}
      <footer className="max-w-4xl w-full mx-auto text-center py-2 text-xs text-slate-400 dark:text-slate-500">
        <p>CestaON • Segurança, Economia e Custo Zero</p>
      </footer>
    </div>
  );
}
