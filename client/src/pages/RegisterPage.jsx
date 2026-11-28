import React, { useState } from 'react';
import {
  ShoppingBag,
  UserPlus,
  LogIn,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Sun,
  Moon,
  ArrowRight,
  ArrowLeft,
  Mail,
  Lock,
  User,
  ShieldCheck,
  HelpCircle,
  Copy,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal.jsx';

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

export function RegisterPage({
  currentUser = null,
  theme = 'light',
  onToggleTheme,
  onRegister,
  onLogin,
  onGuestEntry,
  onNavigate
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarColor, setAvatarColor] = useState('#10B981');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // Passo 1: Dados Básicos, Passo 2: Segurança
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Validações e Medidor Visual de Força da Senha
  const hasMinLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const hasGoodLength = password.length >= 10;
  const isMediumPasswordValid = hasMinLength && hasLetter && hasNumber;

  let strengthScore = 0;
  if (password.length > 0) {
    if (hasMinLength) strengthScore += 1;
    if (hasLetter) strengthScore += 1;
    if (hasNumber) strengthScore += 1;
    if (hasSpecial) strengthScore += 1;
    if (hasGoodLength) strengthScore += 1;
  }

  const getStrengthInfo = () => {
    if (password.length === 0) return { label: 'Aguardando senha', color: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-400', width: 'w-0' };
    if (strengthScore <= 2) return { label: 'Fraca', color: 'bg-rose-500', text: 'text-rose-500', width: 'w-1/4' };
    if (strengthScore === 3) return { label: 'Média (Válida)', color: 'bg-amber-500', text: 'text-amber-500', width: 'w-2/4' };
    if (strengthScore === 4) return { label: 'Forte', color: 'bg-emerald-500', text: 'text-emerald-500', width: 'w-3/4' };
    return { label: 'Muito Forte', color: 'bg-teal-500', text: 'text-teal-500', width: 'w-full' };
  };
  const strengthInfo = getStrengthInfo();

  const validateBasics = () => {
    if (!name.trim()) {
      setError('Por favor, informe seu nome ou apelido');
      return false;
    }
    if (!email.trim()) {
      setError('Por favor, informe seu e-mail');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Por favor, insira um endereço de e-mail válido');
      return false;
    }
    if (!isMediumPasswordValid) {
      setError('A senha deve conter no mínimo 6 caracteres, com letras e números');
      return false;
    }
    if (password !== passwordConfirm) {
      setError('As senhas digitadas não coincidem');
      return false;
    }
    return true;
  };

  const handleNextWizard = (e) => {
    e.preventDefault();
    setError('');
    if (validateBasics()) {
      setWizardStep(2);
      handleSendVerificationCode();
    }
  };

  const handleSendVerificationCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Por favor, informe um e-mail válido primeiro');
      return;
    }
    setError('');
    setIsSendingCode(true);
    try {
      const res = await fetch('/api/users/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: 'register' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar código de confirmação');
      }
      setCodeSent(true);
    } catch (err) {
      setError(err.message || 'Erro ao enviar código de verificação');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmitRegister = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError('');

    if (!validateBasics()) return;

    if (!securityAnswer.trim()) {
      setError('Por favor, responda à pergunta de segurança para proteger sua conta');
      return;
    }

    if (!verificationCode.trim() || verificationCode.trim().length !== 6) {
      setError('Por favor, informe o código de 6 dígitos enviado para o seu e-mail');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        avatar_color: avatarColor,
        pin: password.trim(),
        security_question: securityQuestion,
        security_answer: securityAnswer.trim(),
        verification_code: verificationCode.trim() || undefined
      };

      let createdUser = null;
      if (onRegister) {
        createdUser = await onRegister(payload, false);
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        createdUser = await res.json();
        if (!res.ok) {
          throw new Error(createdUser.error || 'Erro ao criar conta');
        }
      }

      if (createdUser) {
        if (createdUser.token) {
          localStorage.setItem('feira_auth_token', createdUser.token);
        }
        if (createdUser.id) {
          localStorage.setItem('feira_user_id', createdUser.id);
        }
        setPendingUser(createdUser);

        if (createdUser.recovery_key) {
          setCreatedKey(createdUser.recovery_key);
        } else {
          if (onLogin) {
            await onLogin(createdUser, createdUser.token);
          }
          if (onNavigate) {
            onNavigate('/');
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Erro ao criar conta');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (!createdKey) return;
    try {
      navigator.clipboard.writeText(createdKey);
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
              className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              Voltar ao App
            </button>
          )}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-amber-400 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
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
          
          {createdKey ? (
            /* TELA DE SUCESSO E ENTREGA DA CHAVE DE EMERGÊNCIA */
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Conta Criada com Sucesso!
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Guarde sua Chave Secreta de Recuperação em um local seguro
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border-2 border-dashed border-brand-500/40 rounded-2xl space-y-2 text-center">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Sua Chave de Emergência (Chave Secreta)
                </span>
                <div className="text-xl sm:text-2xl font-mono font-black text-brand-600 dark:text-brand-400 tracking-widest select-all">
                  {createdKey}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                  Se você esquecer sua senha, usará esta chave para redefini-la. Caso a perca, poderá usar sua Pergunta Secreta.
                </p>
                <button
                  type="button"
                  onClick={handleCopyKey}
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
                      <span>Copiar Chave</span>
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (pendingUser && onLogin) {
                    await onLogin(pendingUser, pendingUser.token);
                  }
                  if (onNavigate) {
                    onNavigate('/');
                  }
                }}
                className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Anotado! Entrar no CestaON</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Header do Card */}
              <div className="text-center mb-5">
                <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-2.5 shadow-inner">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Criar Nova Conta
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Passo {wizardStep} de 2 • {wizardStep === 1 ? 'Dados Básicos' : 'Segurança de Acesso'}
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
                <div className={`flex items-center gap-1.5 text-xs font-bold ${wizardStep === 1 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${wizardStep === 1 ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    1
                  </span>
                  <span>Dados</span>
                </div>
                <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700" />
                <div className={`flex items-center gap-1.5 text-xs font-bold ${wizardStep === 2 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${wizardStep === 2 ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    2
                  </span>
                  <span>Segurança</span>
                </div>
              </div>

              {wizardStep === 1 ? (
                /* PASSO 1: DADOS BÁSICOS */
                <form onSubmit={handleNextWizard} className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nome ou Apelido
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Como deseja ser chamado?"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                        autoFocus
                      />
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      E-mail
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="exemplo@email.com"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Senha de Acesso
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Digite sua senha (mín. 6)"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        placeholder="Confirme sua senha"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>

                    {password.length > 0 && (
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

                  <button
                    type="submit"
                    disabled={!isMediumPasswordValid}
                    className="w-full py-3 px-4 rounded-xl font-black text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    <span>Avançar para Segurança</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* PASSO 2: SEGURANÇA E PERSONALIZAÇÃO */
                <form onSubmit={handleSubmitRegister} className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pergunta de Segurança (Recuperação)
                    </label>
                    <select
                      value={securityQuestion}
                      onChange={(e) => setSecurityQuestion(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition mb-2"
                    >
                      {DEFAULT_SECURITY_QUESTIONS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>

                    <div className="relative">
                      <input
                        type="text"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder="Sua resposta secreta"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                        required
                        autoFocus
                      />
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {/* Confirmação de E-mail (Código de 6 dígitos) */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-brand-500" />
                        <span>Código de Confirmação</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleSendVerificationCode}
                        disabled={isSendingCode}
                        className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSendingCode ? 'animate-spin' : ''}`} />
                        <span>{codeSent ? 'Reenviar código' : 'Enviar ao meu e-mail'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Código de 6 dígitos"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono font-bold tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition text-center"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {codeSent 
                        ? 'Código enviado! Verifique sua caixa de entrada.' 
                        : 'Receba um código no seu e-mail para validar a sua conta.'}
                    </p>
                  </div>

                  <div className="text-center py-0.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                      Cor do Avatar
                    </label>
                    <div className="flex items-center justify-center gap-2 flex-wrap mx-auto">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAvatarColor(c)}
                          className={`w-7 h-7 rounded-xl transition flex items-center justify-center text-white ${
                            avatarColor === c
                              ? 'scale-110 ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900 shadow-sm'
                              : 'opacity-80 hover:opacity-100 hover:scale-105'
                          }`}
                          style={{ backgroundColor: c }}
                        >
                          {avatarColor === c && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1 text-center">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Ao concluir, você concorda com nossos{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-brand-600 dark:text-brand-400 font-bold hover:underline cursor-pointer"
                      >
                        Termos de Privacidade (LGPD)
                      </button>
                      .
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="py-3 px-3.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3 px-4 rounded-xl font-black text-sm bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Finalizando...</span>
                        </>
                      ) : (
                        <>
                          <span>Confirmar Código e Criar Conta</span>
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
                  <span className="text-slate-500 dark:text-slate-400">Já tem cadastro?</span>
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
                  <span className="text-slate-500 dark:text-slate-400">Esqueceu a senha?</span>
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('/recuperar')}
                    className="font-bold text-slate-700 dark:text-slate-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Recuperar Acesso
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Modal de Termos de Uso e Privacidade (LGPD) */}
      <TermsPrivacyModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />

      {/* Rodapé Minimalista */}
      <footer className="max-w-4xl w-full mx-auto text-center py-2 text-xs text-slate-400 dark:text-slate-500">
        <p>CestaON • Segurança, Economia e Custo Zero</p>
      </footer>
    </div>
  );
}
