import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  UserPlus,
  LogIn,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sun,
  Moon,
  ArrowRight,
  TrendingDown,
  WifiOff,
  Users,
  Check,
  RefreshCw,
  ShoppingBasket,
  Copy,
  HelpCircle,
  Key,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Mail
} from 'lucide-react';
import { TermsPrivacyModal } from './TermsPrivacyModal.jsx';

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

export function RegisterEntryPage({
  allUsers = [],
  theme = 'light',
  onToggleTheme,
  onRegister,
  onLogin,
  onNavigate
}) {
  const [view, setViewState] = useState('register'); // 'register' | 'login' | 'recover'

  const setView = (newView) => {
    setViewState(newView);
    if (onNavigate) {
      if (newView === 'login') onNavigate('/login');
      else if (newView === 'register') onNavigate('/cadastro');
      else if (newView === 'recover') onNavigate('/recuperar');
    }
  };

  const [regWizardStep, setRegWizardStep] = useState(1); // 1: Dados Básicos, 2: Segurança

  // Estados de Cadastro (Tela Principal)
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regColor, setRegColor] = useState('#10B981');
  const [regPin, setRegPin] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [showRegPin, setShowRegPin] = useState(false);
  const [regQuestion, setRegQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);
  const [regAnswer, setRegAnswer] = useState('');
  const [regVerificationCode, setRegVerificationCode] = useState('');
  const [isSendingRegCode, setIsSendingRegCode] = useState(false);
  const [regCodeSent, setRegCodeSent] = useState(false);
  const [regError, setRegError] = useState('');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [createdRecoveryKey, setCreatedRecoveryKey] = useState(null);
  const [copiedCreatedKey, setCopiedCreatedKey] = useState(false);
  const [pendingCreatedUser, setPendingCreatedUser] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Estados de Login (Apenas E-mail e Senha)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  // Estados de Recuperação (Opção 1 - Código no E-mail, Opção 2 - Chave Secreta, Opção 3 - Pergunta Secreta)
  const [recoverMethod, setRecoverMethod] = useState('code'); // 'code' | 'key' | 'question'
  const [recoverCode, setRecoverCode] = useState('');
  const [isSendingRecoverCode, setIsSendingRecoverCode] = useState(false);
  const [recoverCodeSent, setRecoverCodeSent] = useState(false);
  const [recoverStep, setRecoverStep] = useState(1); // 1: Identificação, 2: Nova Senha
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

  // Validações de Requisitos Médios da Senha na Recuperação
  const recoverHasMinLength = recoverNewPin.length >= 6;
  const recoverHasLetter = /[a-zA-Z]/.test(recoverNewPin);
  const recoverHasNumber = /[0-9]/.test(recoverNewPin);
  const isRecoverPasswordValid = recoverHasMinLength && recoverHasLetter && recoverHasNumber;

  let recoverStrengthScore = 0;
  if (recoverNewPin.length > 0) {
    if (recoverHasMinLength) recoverStrengthScore += 1;
    if (recoverHasLetter) recoverStrengthScore += 1;
    if (recoverHasNumber) recoverStrengthScore += 1;
    if (/[^a-zA-Z0-9]/.test(recoverNewPin)) recoverStrengthScore += 1;
    if (recoverNewPin.length >= 10) recoverStrengthScore += 1;
  }
  const getRecoverStrengthInfo = () => {
    if (recoverNewPin.length === 0) return { label: 'Aguardando', color: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-400', width: 'w-0' };
    if (recoverStrengthScore <= 2) return { label: 'Fraca', color: 'bg-rose-500', text: 'text-rose-500', width: 'w-1/4' };
    if (recoverStrengthScore === 3) return { label: 'Média (Válida)', color: 'bg-amber-500', text: 'text-amber-500', width: 'w-2/4' };
    if (recoverStrengthScore === 4) return { label: 'Forte', color: 'bg-emerald-500', text: 'text-emerald-500', width: 'w-3/4' };
    return { label: 'Muito Forte', color: 'bg-teal-500', text: 'text-teal-500', width: 'w-full' };
  };
  const recoverStrengthInfo = getRecoverStrengthInfo();

  const handleSendRecoverCode = async () => {
    if (!recoverEmail.trim() || !recoverEmail.includes('@')) {
      setRecoverError('Por favor, informe seu e-mail cadastrado primeiro');
      return;
    }
    setRecoverError('');
    setIsSendingRecoverCode(true);
    try {
      const res = await fetch('/api/users/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoverEmail.trim().toLowerCase(), purpose: 'recover' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar código');
      }
      setRecoverCodeSent(true);
    } catch (err) {
      setRecoverError(err.message || 'Erro ao enviar código de verificação');
    } finally {
      setIsSendingRecoverCode(false);
    }
  };

  const handleSendRegCode = async () => {
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setRegError('Por favor, informe um e-mail válido primeiro');
      return;
    }
    setRegError('');
    setIsSendingRegCode(true);
    try {
      const res = await fetch('/api/users/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail.trim().toLowerCase(), purpose: 'register' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar código');
      }
      setRegCodeSent(true);
    } catch (err) {
      setRegError(err.message || 'Erro ao enviar código de confirmação');
    } finally {
      setIsSendingRegCode(false);
    }
  };

  const handleNextRecoverStep = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setRecoverError('');

    if (!recoverEmail.trim()) {
      setRecoverError('Por favor, informe seu e-mail cadastrado');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recoverEmail.trim())) {
      setRecoverError('Por favor, informe um e-mail válido');
      return;
    }

    if (recoverMethod === 'code' && (!recoverCode.trim() || recoverCode.trim().length !== 6)) {
      setRecoverError('Por favor, informe o código de 6 dígitos enviado para o seu e-mail');
      return;
    }

    if (recoverMethod === 'key' && !recoverKey.trim()) {
      setRecoverError('Por favor, informe sua Chave Secreta de Recuperação');
      return;
    }

    if (recoverMethod === 'question' && !recoverAnswer.trim()) {
      setRecoverError('Por favor, informe a resposta da sua pergunta secreta');
      return;
    }

    setRecoverStep(2);
  };

  // Validações de Requisitos Médios da Senha
  const regHasMinLength = regPin.length >= 6;
  const regHasLetter = /[a-zA-Z]/.test(regPin);
  const regHasNumber = /[0-9]/.test(regPin);
  const isRegPasswordValid = regHasMinLength && regHasLetter && regHasNumber;

  let regStrengthScore = 0;
  if (regPin.length > 0) {
    if (regHasMinLength) regStrengthScore += 1;
    if (regHasLetter) regStrengthScore += 1;
    if (regHasNumber) regStrengthScore += 1;
    if (/[^a-zA-Z0-9]/.test(regPin)) regStrengthScore += 1;
    if (regPin.length >= 10) regStrengthScore += 1;
  }
  const getRegStrengthInfo = () => {
    if (regPin.length === 0) return { label: 'Aguardando', text: 'text-slate-400' };
    if (regStrengthScore <= 2) return { label: 'Fraca', text: 'text-rose-500' };
    if (regStrengthScore === 3) return { label: 'Média (Válida)', text: 'text-amber-500' };
    if (regStrengthScore === 4) return { label: 'Forte', text: 'text-emerald-500' };
    return { label: 'Muito Forte', text: 'text-teal-500' };
  };
  const regStrengthInfo = getRegStrengthInfo();

  const validateRegBasics = () => {
    if (!regName.trim()) {
      setRegError('Por favor, informe seu nome ou apelido');
      return false;
    }

    if (!regEmail.trim()) {
      setRegError('Por favor, informe seu e-mail');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      setRegError('Por favor, informe um e-mail válido');
      return false;
    }

    if (!isRegPasswordValid) {
      setRegError('A senha deve conter no mínimo 6 caracteres, com letras e números');
      return false;
    }

    if (regPin.trim() !== regPinConfirm.trim()) {
      setRegError('As senhas digitadas não conferem');
      return false;
    }

    return true;
  };

  const handleNextRegWizard = (e) => {
    e.preventDefault();
    setRegError('');
    if (validateRegBasics()) {
      setRegWizardStep(2);
      handleSendRegCode();
    }
  };

  // Handler de Criação de Conta
  const handleSubmitRegister = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setRegError('');

    if (!validateRegBasics()) return;

    if (!regAnswer.trim()) {
      setRegError('Por favor, responda à pergunta de segurança para proteger sua conta');
      return;
    }

    if (!regVerificationCode.trim() || regVerificationCode.trim().length !== 6) {
      setRegError('Por favor, informe o código de 6 dígitos enviado para o seu e-mail');
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
        security_answer: regAnswer.trim(),
        verification_code: regVerificationCode.trim() || undefined
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
        if (!res.ok) {
          throw new Error(created.error || 'Erro ao criar conta');
        }
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
          if (onNavigate) {
            onNavigate('/');
          }
        }
      }
    } catch (err) {
      setRegError(err.message || 'Erro ao criar conta no CestaON.');
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

  // Handler de Login
  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim()) {
      setLoginError('Por favor, informe seu e-mail cadastrado.');
      return;
    }

    if (!loginPin.trim()) {
      setLoginError('Por favor, informe sua senha.');
      return;
    }

    setIsSubmittingLogin(true);
    try {
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
      if (onNavigate) {
        onNavigate('/');
      }
    } catch (err) {
      setLoginError(err.message || 'Falha ao autenticar.');
    } finally {
      setIsSubmittingLogin(false);
    }
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

  // Handler de Recuperação de Senha (Dual: Opção 2 Principal + Opção 3 Fallback)
  const handleSubmitRecover = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setRecoverError('');
    setRecoverSuccess(false);

    if (recoverStep === 1) {
      handleNextRecoverStep(e);
      return;
    }

    if (!recoverEmail.trim()) {
      setRecoverError('Informe o e-mail cadastrado.');
      return;
    }

    if (recoverMethod === 'code' && (!recoverCode.trim() || recoverCode.trim().length !== 6)) {
      setRecoverError('Por favor, informe o código de 6 dígitos enviado para seu e-mail');
      return;
    }

    if (recoverMethod === 'key' && !recoverKey.trim()) {
      setRecoverError('Por favor, informe sua Chave Secreta de Recuperação');
      return;
    }

    if (recoverMethod === 'question' && !recoverAnswer.trim()) {
      setRecoverError('Por favor, informe a resposta da sua pergunta secreta');
      return;
    }

    if (!recoverNewPin.trim()) {
      setRecoverError('Informe a nova senha.');
      return;
    }

    if (!isRecoverPasswordValid) {
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
        ...(recoverMethod === 'code' ? { verification_code: recoverCode.trim() } : {}),
        ...(recoverMethod === 'key' ? { recovery_key: recoverKey.trim() } : { security_answer: recoverAnswer.trim() })
      };

      const res = await fetch('/api/users/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível redefinir a senha agora.');
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
      setRecoverStep(1);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors duration-200">
      {/* Barra Superior / Header Limpo */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-xl text-slate-900 dark:text-white tracking-tight leading-none">
                Cesta<span className="text-brand-500">On</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-brand-50 dark:bg-brand-950/80 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
                Oficial
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-none mt-1">
              No CestaON, o preço é bom.
            </p>
          </div>
        </div>

        {/* Botão de Tema */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}
      </header>

      {/* Conteúdo Central */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Coluna da Esquerda: Apresentação e Benefícios (Desktop/Tablet) */}
          <div className="hidden lg:block lg:col-span-5 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Bem-vindo à feira inteligente</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Crie sua conta antes de entrar no <span className="text-brand-600 dark:text-brand-400">CestaON</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Economize de verdade no supermercado com organização automática por setores, comparador de embalagens e sincronização familiar.
              </p>
            </div>

            {/* Destaques de Recursos */}
            <div className="space-y-3 text-left pt-2">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-brand-700 dark:text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Controle de Orçamento e Histórico</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Acompanhe o valor da feira em tempo real e compare com compras anteriores.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <WifiOff className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Modo Subsolo 100% Offline</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Calculadora e listas funcionam sem internet dentro de qualquer mercado.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Compartilhamento Familiar</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Divida a lista com quem você mora através de um simples código de acesso.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Card Interativo de Cadastro / Login */}
          <div className="lg:col-span-7">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
              
              {/* Abas Alternadoras Rápidas */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setView('register');
                    setRegError('');
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                    view === 'register'
                      ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Criar Conta</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setLoginError('');
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                    view === 'login'
                      ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Já Tenho Conta</span>
                </button>
              </div>

              {/* ========================================================= */}
              {/* VISÃO: CRIAR CONTA (Foco Principal da Página de Entrada) */}
              {/* ========================================================= */}
              {view === 'register' && (
                createdRecoveryKey ? (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                        <ShieldCheck className="w-8 h-8" />
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                        Conta Criada com Sucesso!
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Guarde sua Chave Secreta de Recuperação em um local seguro
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border-2 border-dashed border-brand-500/40 rounded-2xl space-y-2 text-center">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Sua Chave de Emergência (Opção 2 - Principal)
                      </span>
                      <div className="text-xl sm:text-2xl font-mono font-black text-brand-600 dark:text-brand-400 tracking-widest select-all">
                        {createdRecoveryKey}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                        Se você esquecer sua senha, usará esta chave. Caso a perca, poderá usar a Pergunta Secreta cadastrada.
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyCreatedKey}
                        className="mt-2 py-2 px-4 rounded-xl font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-brand-500 text-slate-800 dark:text-slate-200 shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedCreatedKey ? (
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
                        setCreatedRecoveryKey(null);
                        const userToLogin = pendingCreatedUser;
                        if (userToLogin && onLogin) {
                          await onLogin(userToLogin, userToLogin.token);
                        }
                        if (onNavigate) {
                          onNavigate('/');
                        } else {
                          setView('login');
                        }
                      }}
                      className="w-full bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Anotado! Entrar no CestaON</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                        Crie sua conta no CestaON
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Passo {regWizardStep} de 2 • {regWizardStep === 1 ? 'Dados Básicos' : 'Segurança de Acesso'}
                      </p>
                    </div>

                    {regError && (
                      <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{regError}</span>
                      </div>
                    )}

                    {/* Indicador de Passos */}
                    <div className="flex items-center justify-center gap-2 pb-1">
                      <div className={`flex items-center gap-1.5 text-xs font-bold ${regWizardStep === 1 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${regWizardStep === 1 ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                          1
                        </span>
                        <span>Dados</span>
                      </div>
                      <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700" />
                      <div className={`flex items-center gap-1.5 text-xs font-bold ${regWizardStep === 2 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${regWizardStep === 2 ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                          2
                        </span>
                        <span>Segurança</span>
                      </div>
                    </div>

                    {regWizardStep === 1 ? (
                      <form onSubmit={handleNextRegWizard} className="space-y-3.5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Nome ou Apelido
                          </label>
                          <input
                            type="text"
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            placeholder="Como deseja ser chamado?"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                            required
                            autoFocus
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            E-mail
                          </label>
                          <input
                            type="email"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="exemplo@email.com"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            Senha de Acesso
                          </label>
                          <div className="relative">
                            <input
                              type={showRegPin ? 'text' : 'password'}
                              value={regPin}
                              onChange={(e) => setRegPin(e.target.value)}
                              placeholder="Digite sua senha (mín. 6)"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 pr-11 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowRegPin((prev) => !prev)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                            >
                              {showRegPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          <input
                            type={showRegPin ? 'text' : 'password'}
                            value={regPinConfirm}
                            onChange={(e) => setRegPinConfirm(e.target.value)}
                            placeholder="Confirme sua senha"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                            required
                          />

                          {regPin.length > 0 && (
                            <div className="space-y-1 animate-in fade-in pt-0.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Força da Senha:</span>
                                <span className={`font-bold ${regStrengthInfo.text}`}>{regStrengthInfo.label}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full ${regStrengthInfo.text.replace('text-', 'bg-')} transition-all duration-300 rounded-full`} style={{ width: `${Math.min(100, regStrengthScore * 20)}%` }} />
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={!isRegPasswordValid}
                          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 group cursor-pointer mt-4"
                        >
                          <span>Avançar para Segurança</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleSubmitRegister} className="space-y-4 animate-in fade-in duration-150">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Pergunta de Segurança (Recuperação)
                          </label>
                          <div className="relative mb-2">
                            <button
                              type="button"
                              onClick={() => setShowQuestionPicker((prev) => !prev)}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition flex items-center justify-between text-left cursor-pointer"
                            >
                              <span className="truncate pr-2">{regQuestion}</span>
                              <span className="text-[10px] text-slate-400 shrink-0">▼</span>
                            </button>
                            {showQuestionPicker && (
                              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-1 space-y-0.5">
                                {DEFAULT_SECURITY_QUESTIONS.map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    onClick={() => {
                                      setRegQuestion(q);
                                      setShowQuestionPicker(false);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                                      regQuestion === q
                                        ? 'bg-brand-50 dark:bg-brand-950/70 text-brand-700 dark:text-brand-300 font-bold'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="relative">
                            <input
                              type="text"
                              value={regAnswer}
                              onChange={(e) => setRegAnswer(e.target.value)}
                              placeholder="Sua resposta secreta"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                              required
                              autoFocus
                            />
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          </div>
                        </div>

                        {/* Confirmação de E-mail (Código de 6 dígitos) */}
                        <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-brand-500" />
                              <span>Código de Confirmação</span>
                            </label>
                            <button
                              type="button"
                              onClick={handleSendRegCode}
                              disabled={isSendingRegCode}
                              className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className={`w-3 h-3 ${isSendingRegCode ? 'animate-spin' : ''}`} />
                              <span>{regCodeSent ? 'Reenviar código' : 'Enviar ao meu e-mail'}</span>
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              maxLength={6}
                              value={regVerificationCode}
                              onChange={(e) => setRegVerificationCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="Código de 6 dígitos (enviado ao seu e-mail)"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono font-bold tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition text-center"
                            />
                          </div>
                          <p className="text-[10px] text-slate-400">
                            {regCodeSent 
                              ? 'Código enviado! Verifique sua caixa de entrada.' 
                              : 'Receba um código no seu e-mail para validar a sua conta.'}
                          </p>
                        </div>

                        {/* Avatar Picker */}
                        <div className="text-center py-0.5">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                            Cor do Avatar
                          </label>
                          <div className="flex items-center justify-center gap-2 flex-wrap mx-auto">
                            {AVATAR_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setRegColor(c)}
                                className={`w-7 h-7 rounded-xl transition flex items-center justify-center text-white ${
                                  regColor === c
                                    ? 'scale-110 ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900 shadow-sm'
                                    : 'opacity-80 hover:opacity-100 hover:scale-105'
                                }`}
                                style={{ backgroundColor: c }}
                              >
                                {regColor === c && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="text-center pt-1">
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

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setRegWizardStep(1)}
                            className="py-3 px-3.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Voltar</span>
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingReg}
                            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isSubmittingReg ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Criando conta...</span>
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
                  </div>
                )
              )}

              {/* ========================================================= */}
              {/* VISÃO: LOGIN COM CONTA EXISTENTE (E-MAIL E SENHA)         */}
              {/* ========================================================= */}
              {view === 'login' && (
                <form onSubmit={handleSubmitLogin} className="space-y-5 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      Entrar no CestaON
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Digite seu e-mail cadastrado e senha para carregar suas listas.
                    </p>
                  </div>

                  {loginError && (
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  {/* Campo de E-mail */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
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
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                      required
                    />
                  </div>

                  {/* Senha de Acesso */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Senha de Acesso <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setView('recover');
                          setRecoverStep(1);
                          setRecoverError('');
                        }}
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
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 pr-11 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPin((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                      >
                        {showLoginPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Botão de Entrar */}
                  <button
                    type="submit"
                    disabled={isSubmittingLogin}
                    className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 group cursor-pointer"
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
                      Quer criar um novo perfil?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setView('register');
                          setRegError('');
                        }}
                        className="font-bold text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Cadastre-se aqui
                      </button>
                    </span>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* VISÃO: RECUPERAR SENHA / PIN                              */}
              {/* ========================================================= */}
              {view === 'recover' && (
                <form onSubmit={handleSubmitRecover} className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      Recuperar Acesso
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Passo {recoverStep} de 2 • {recoverStep === 1 ? 'Identificação da Conta' : 'Nova Senha de Acesso'}
                    </p>
                  </div>

                  {recoverSuccess ? (
                    <div className="space-y-4 p-5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex flex-col items-center justify-center text-center text-emerald-800 dark:text-emerald-200">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <h3 className="font-black text-base text-emerald-900 dark:text-emerald-100">
                          Senha Redefinida com Sucesso!
                        </h3>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                          Sua senha foi atualizada. Uma nova Chave de Recuperação foi gerada para você.
                        </p>
                      </div>

                      {newGeneratedKey && (
                        <div className="w-full p-3.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/80 rounded-xl space-y-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                            Nova Chave Secreta de Recuperação
                          </span>
                          <div className="text-lg sm:text-xl font-mono font-black text-brand-600 dark:text-brand-400 tracking-widest select-all">
                            {newGeneratedKey}
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyNewKey}
                            className="mt-1 py-1.5 px-3 rounded-lg font-bold text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 text-slate-800 dark:text-slate-200 shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedNewKey ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600">Copiada!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                                <span>Copiar Nova Chave</span>
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
                          setRecoverStep(1);
                        }}
                        className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-brand-600 hover:bg-brand-700 text-white transition flex items-center justify-center gap-1.5"
                      >
                        <span>Ir para o Login</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {recoverError && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{recoverError}</span>
                        </div>
                      )}

                      {/* Wizard Stepper Compacto de Recuperação */}
                      <div className="flex items-center justify-between pb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                            recoverStep === 1 ? 'bg-brand-600 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {recoverStep > 1 ? <Check className="w-3 h-3" /> : '1'}
                          </span>
                          <span className={`text-xs font-bold ${recoverStep === 1 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                            Identificação
                          </span>
                        </div>
                        <div className="h-0.5 w-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                            recoverStep === 2 ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}>
                            2
                          </span>
                          <span className={`text-xs font-bold ${recoverStep === 2 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                            Nova Senha
                          </span>
                        </div>
                      </div>

                      {/* PASSO 1: IDENTIFICAÇÃO (E-MAIL + CHAVE/PERGUNTA) */}
                      {recoverStep === 1 && (
                        <div className="space-y-3.5 animate-in fade-in duration-150">
                          {/* Alternador de Método de Recuperação */}
                          <div className="flex bg-slate-100 dark:bg-slate-800/70 p-1 rounded-2xl gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setRecoverMethod('code');
                                setRecoverError('');
                              }}
                              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                recoverMethod === 'code'
                                  ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <Mail className="w-3.5 h-3.5" />
                              <span>Código E-mail</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRecoverMethod('key');
                                setRecoverError('');
                              }}
                              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                recoverMethod === 'key'
                                  ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <Key className="w-3.5 h-3.5" />
                              <span>Chave Secreta</span>
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
                              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                recoverMethod === 'question'
                                  ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                              <span>Pergunta Secreta</span>
                            </button>
                          </div>

                          {/* Campo Digitável de E-mail Cadastrado */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
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
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                              required
                              autoFocus
                            />
                          </div>

                          {/* Método 1: Código de 6 dígitos enviado por e-mail */}
                          {recoverMethod === 'code' && (
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                Código de Verificação (6 dígitos) <span className="text-rose-500">*</span>
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  maxLength={6}
                                  value={recoverCode}
                                  onChange={(e) => setRecoverCode(e.target.value.replace(/\D/g, ''))}
                                  placeholder="000000"
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 font-mono font-bold text-sm text-center tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={handleSendRecoverCode}
                                  disabled={isSendingRecoverCode}
                                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-brand-500/20"
                                >
                                  {isSendingRecoverCode ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      <span>Enviando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Mail className="w-3.5 h-3.5" />
                                      <span>{recoverCodeSent ? 'Reenviar' : 'Enviar Código'}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {recoverCodeSent
                                  ? 'Código enviado para sua caixa de entrada!'
                                  : 'Clique em "Enviar Código" para receber o PIN de 6 dígitos no seu Gmail.'}
                              </p>
                            </div>
                          )}

                          {/* Opção 2 (Principal): Chave Secreta de Recuperação */}
                          {recoverMethod === 'key' && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  Chave Secreta de Recuperação <span className="text-rose-500">*</span>
                                </label>
                                <span className="text-[11px] text-slate-400 font-mono">Ex: ABCD-1234</span>
                              </div>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={recoverKey}
                                  onChange={(e) => setRecoverKey(e.target.value.toUpperCase())}
                                  placeholder="Digite sua chave de emergência"
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition tracking-wider"
                                  required
                                />
                                <Key className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                              </div>
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRecoverMethod('question');
                                    if (recoverEmail.trim()) {
                                      handleFetchSecurityQuestion(recoverEmail.trim());
                                    }
                                  }}
                                  className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                >
                                  Perdeu sua chave? Redefinir pela Pergunta Secreta →
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Opção 3 (Fallback): Pergunta Secreta de Segurança */}
                          {recoverMethod === 'question' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  Pergunta de Segurança
                                </label>
                                {recoverEmail.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => handleFetchSecurityQuestion(recoverEmail.trim())}
                                    className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${isLoadingQuestion ? 'animate-spin' : ''}`} />
                                    <span>Buscar pergunta</span>
                                  </button>
                                )}
                              </div>

                              {questionError && (
                                <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-2.5">
                                  {questionError}
                                </div>
                              )}

                              {recoverQuestion ? (
                                <div className="p-2.5 bg-brand-50/70 dark:bg-brand-950/30 border border-brand-200/80 dark:border-brand-800/60 rounded-xl">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400 block mb-0.5">
                                    Sua Pergunta:
                                  </span>
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                    {recoverQuestion}
                                  </p>
                                </div>
                              ) : (
                                <div className="p-2.5 bg-slate-100 dark:bg-slate-800/50 rounded-xl text-xs text-slate-500 dark:text-slate-400 italic">
                                  Informe seu e-mail acima para carregar a pergunta de segurança.
                                </div>
                              )}

                              <div className="relative">
                                <input
                                  type="text"
                                  value={recoverAnswer}
                                  onChange={(e) => setRecoverAnswer(e.target.value)}
                                  placeholder="Digite a resposta da pergunta secreta"
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                                  required
                                />
                                <HelpCircle className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                              </div>

                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => setRecoverMethod('key')}
                                  className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                >
                                  ← Lembra sua chave? Usar Chave Secreta de Recuperação
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Botão Avançar para o Passo 2 */}
                          <button
                            type="button"
                            onClick={handleNextRecoverStep}
                            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs sm:text-sm py-3 px-5 rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 group cursor-pointer"
                          >
                            <span>Avançar para Nova Senha</span>
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                          </button>

                          <div className="text-center pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setView('login');
                                setRecoverError('');
                                setRecoverStep(1);
                              }}
                              className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                            >
                              ← Voltar para a tela de login
                            </button>
                          </div>
                        </div>
                      )}

                      {/* PASSO 2: NOVA SENHA E CONFIRMAÇÃO */}
                      {recoverStep === 2 && (
                        <div className="space-y-3.5 animate-in fade-in duration-150">
                          {/* Card de Identificação Confirmada */}
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                              <div className="truncate">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Conta Verificada</span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">{recoverEmail}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setRecoverStep(1)}
                              className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline shrink-0 ml-2 cursor-pointer"
                            >
                              Alterar
                            </button>
                          </div>

                          {/* Nova Senha */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                              Nova Senha (Mín. 6 caracteres com letras e números) <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type={showRecoverPin ? 'text' : 'password'}
                                value={recoverNewPin}
                                onChange={(e) => setRecoverNewPin(e.target.value)}
                                placeholder="Digite a nova senha"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 pr-11 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                                required
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => setShowRecoverPin((prev) => !prev)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                              >
                                {showRecoverPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>

                            {/* Medidor visual de força */}
                            {recoverNewPin.length > 0 && (
                              <div className="space-y-1 pt-0.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-500 font-medium">Força da Senha:</span>
                                  <span className={`font-bold ${recoverStrengthInfo.text}`}>{recoverStrengthInfo.label}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className={`h-full ${recoverStrengthInfo.color} ${recoverStrengthInfo.width} transition-all duration-300 rounded-full`} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Confirmação do Novo PIN */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                              Confirmar Nova Senha <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type={showRecoverPin ? 'text' : 'password'}
                              value={recoverPinConfirm}
                              onChange={(e) => setRecoverPinConfirm(e.target.value)}
                              placeholder="Repita a nova senha"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                              required
                            />
                          </div>

                          {/* Botões de Ação */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setRecoverStep(1)}
                              className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              <span>Voltar</span>
                            </button>

                            <button
                              type="submit"
                              disabled={isSubmittingRecover}
                              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm py-3 px-5 rounded-2xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 group cursor-pointer"
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
                          </div>

                          <div className="text-center pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setView('login');
                                setRecoverError('');
                                setRecoverStep(1);
                              }}
                              className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                            >
                              ← Voltar para a tela de login
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </form>
              )}

            </div>
          </div>
        </div>
      </main>

      {/* Modal de Termos de Uso e Privacidade (LGPD) */}
      <TermsPrivacyModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />

      {/* Rodapé Sóbrio */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-800 py-4 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
        <p>CestaON • O assistente inteligente de feiras e supermercados • Segurança, Economia e Custo Zero</p>
      </footer>
    </div>
  );
}
