import React, { useState } from 'react';
import {
  ShoppingBag,
  LogIn,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus,
  AlertCircle,
  Sun,
  Moon,
  ArrowRight,
  Mail,
  Lock,
  RefreshCw
} from 'lucide-react';

export function LoginPage({
  allUsers = [],
  currentUser = null,
  theme = 'light',
  onToggleTheme,
  onLogin,
  onGuestEntry,
  onNavigate
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Por favor, informe seu e-mail cadastrado');
      return;
    }

    if (!password.trim()) {
      setError('Por favor, informe sua senha de acesso');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim()
        })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error && data.error.includes('sem e-mail')) {
          throw new Error('Esta conta foi cadastrada sem e-mail e foi deslogada por segurança. Sem e-mail cadastrado (Deslogada).');
        }
        throw new Error(data.error || 'E-mail ou senha incorretos.');
      }

      if (!data.user?.email || !data.user.email.trim()) {
        throw new Error('Esta conta foi cadastrada sem e-mail e foi deslogada por segurança. Sem e-mail cadastrado (Deslogada).');
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
      setError(err.message || 'Falha ao autenticar.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 text-slate-800 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6 transition-colors duration-200">
      {/* Barra Superior */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-2">
        <div
          onClick={() => onNavigate && onNavigate('/')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/20 group-hover:scale-105 transition">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tight flex items-center gap-1 leading-none">
              Cesta<span className="text-brand-500">On</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
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
              Voltar para o App
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
      <main className="max-w-md w-full mx-auto my-auto py-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <LogIn className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Entrar na Conta
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Acesse suas listas de feira digitando seu e-mail e senha
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="font-medium leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmitLogin} className="space-y-4">
            {/* Campo de E-mail */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                E-mail <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="exemplo@email.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 pl-10 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition"
                  required
                  autoFocus
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Campo de Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Senha <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('/recuperar')}
                  className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Digite sua senha"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 pl-10 pr-11 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition font-medium"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl font-black text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white shadow-md shadow-brand-600/30 transition flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Acessando...</span>
                </>
              ) : (
                <>
                  <span>Entrar na Conta</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Links e Ações Alternativas */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Ainda não tem conta?</span>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('/cadastro')}
                className="font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Criar Nova Conta
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Problemas para entrar?</span>
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
        </div>
      </main>

      {/* Rodapé */}
      <footer className="max-w-4xl w-full mx-auto text-center py-3 text-xs text-slate-400 dark:text-slate-500">
        <p>CestaON • O assistente inteligente de feiras e supermercados • 100% Privado & Local</p>
      </footer>
    </div>
  );
}
