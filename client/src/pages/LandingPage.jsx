import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  ArrowRight,
  Check,
  Sun,
  Moon,
  Users,
  WifiOff,
  Scale,
  TrendingDown,
  ShieldCheck,
  LogIn,
  UserPlus,
  ShoppingCart
} from 'lucide-react';
import { formatMoney } from '../utils/formatters.js';
import { triggerHaptic } from '../utils/haptics.js';

const DEMO_BUDGET_CENTS = 12000;

const DEMO_ITEMS = [
  { id: 'arroz', name: 'Arroz Tipo 1 (5kg)', sector: 'Mercearia', priceCents: 2890, defaultChecked: true },
  { id: 'cafe', name: 'Café Torrado (500g)', sector: 'Matinais', priceCents: 1940, defaultChecked: true },
  { id: 'azeite', name: 'Azeite Extra Virgem (500ml)', sector: 'Mercearia', priceCents: 3690, defaultChecked: false },
  { id: 'leite', name: 'Leite Integral (6x1L)', sector: 'Laticínios', priceCents: 2940, defaultChecked: false },
  { id: 'frango', name: 'Filé de Peito (1kg)', sector: 'Açougue', priceCents: 2190, defaultChecked: false }
];

export function LandingPage({
  currentUser = null,
  theme = 'light',
  onToggleTheme,
  onNavigate
}) {
  const [checkedIds, setCheckedIds] = useState(() =>
    DEMO_ITEMS.filter((item) => item.defaultChecked).map((item) => item.id)
  );

  const toggleDemoItem = (id) => {
    triggerHaptic(12);
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const { totalCents, pct, barColorClass, isOverBudget } = useMemo(() => {
    const sum = DEMO_ITEMS.reduce(
      (acc, item) => (checkedIds.includes(item.id) ? acc + item.priceCents : acc),
      0
    );
    const ratio = Math.round((sum / DEMO_BUDGET_CENTS) * 100);
    const over = sum > DEMO_BUDGET_CENTS;
    let color = 'bg-brand-500';
    if (over || ratio >= 100) color = 'bg-rose-500';
    else if (ratio >= 75) color = 'bg-orange-500';
    else if (ratio >= 50) color = 'bg-amber-400';

    return {
      totalCents: sum,
      pct: Math.min(ratio, 100),
      barColorClass: color,
      isOverBudget: over
    };
  }, [checkedIds]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 selection:bg-brand-500/20">
      {/* Barra Superior Editorial */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate(currentUser ? '/' : '/landing')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm shadow-brand-600/25 group-hover:scale-105 transition-transform duration-150">
              <ShoppingBag className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white block leading-none">
                CestaON
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5">
                No CestaON, o preço é bom.
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Alternar tema"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.97] transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {currentUser ? (
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('/cadastro')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/25 active:scale-[0.98] transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Criar Conta</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('/login')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  <span>Entrar</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('/cadastro')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/25 active:scale-[0.98] transition cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Criar Conta</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Assimétrico 60/40 com Simulador Interativo ao Vivo */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-14 sm:pt-16 sm:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Coluna Editorial (7/12) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                Feira colaborativa • Em tempo real
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.08]">
                Faça a feira sabendo o total antes de chegar no caixa.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Monte a lista com sua família em tempo real, acompanhe o teto de gastos no corredor do supermercado e compare preços por quilo ou litro — mesmo no subsolo sem sinal.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate(currentUser ? '/' : '/cadastro')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-black bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/25 active:scale-[0.98] transition cursor-pointer"
                >
                  <span>Começar Agora</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {!currentUser && (
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('/login')}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 active:scale-[0.98] transition cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span>Já tenho conta</span>
                  </button>
                )}
              </div>

              {/* Métricas Reais de Produto */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-3 gap-4 max-w-lg">
                <div>
                  <div className="font-mono text-lg sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
                    Zero susto
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Total antes do caixa
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
                    100%
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Offline no subsolo
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg sm:text-xl font-black tabular-nums text-brand-600 dark:text-brand-400">
                    Tempo real
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Lista compartilhada
                  </div>
                </div>
              </div>
            </div>

            {/* Âncora Interativa (5/12): Simulador Ao Vivo do Modo No Mercado */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_32px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_1px_1px_rgba(0,0,0,0.5),0_16px_36px_-12px_rgba(0,0,0,0.75)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400">
                      <ShoppingCart className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-none">
                        Simulação: Modo No Mercado
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Toque nos itens para testar a barra
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    Ao vivo
                  </span>
                </div>

                {/* Barra de Orçamento Reativa */}
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 p-3.5 mb-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        No carrinho
                      </span>
                      <span
                        className={`font-mono text-2xl font-black tabular-nums ${
                          isOverBudget
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatMoney(totalCents)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Teto da feira
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(DEMO_BUDGET_CENTS)}
                      </span>
                    </div>
                  </div>

                  <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ease-out ${barColorClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px] font-medium">
                    <span className={isOverBudget ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}>
                      {isOverBudget
                        ? `Passou ${formatMoney(totalCents - DEMO_BUDGET_CENTS)} do teto`
                        : `Restam ${formatMoney(DEMO_BUDGET_CENTS - totalCents)}`}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {checkedIds.length}/{DEMO_ITEMS.length} itens
                    </span>
                  </div>
                </div>

                {/* Lista Interativa */}
                <div className="space-y-2">
                  {DEMO_ITEMS.map((item) => {
                    const checked = checkedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleDemoItem(item.id)}
                        className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                          checked
                            ? 'bg-brand-50/70 dark:bg-brand-950/30 border-brand-200 dark:border-brand-800/80'
                            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                              checked
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                            }`}
                          >
                            {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </span>
                          <div className="min-w-0">
                            <div
                              className={`text-xs font-bold truncate ${
                                checked
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {item.name}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {item.sector}
                            </div>
                          </div>
                        </div>

                        <span className="font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                          {formatMoney(item.priceCents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Grid Assimétrico de Capacidades */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="mb-8">
            <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-brand-600 dark:text-brand-400 font-bold">
              Feito para o corredor do mercado
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
              Menos susto no caixa, mais controle na palma da mão.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card Largo 1: Colaboração Familiar */}
            <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 mb-2">
                    <Users className="w-4 h-4" />
                    <span>Sincronização em Família</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    Divida a feira com quem vai ao mercado com você
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 max-w-xl leading-relaxed">
                    Enquanto alguém pega o hortifrúti e outra pessoa vai ao açougue, o carrinho e o total atualizam na hora para todo mundo.
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Todos veem o mesmo carrinho</span>
                <span>•</span>
                <span>Atualização instantânea</span>
                <span>•</span>
                <span>Ideal para casal e família</span>
              </div>
            </div>

            {/* Card Compacto 2: Comparador de Embalagens */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 mb-2">
                  <Scale className="w-4 h-4" />
                  <span>Calculadora de Embalagens</span>
                </div>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Qual compensa mais?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Compare 500ml com 1L ou 400g com 1kg na hora e descubra qual embalagem realmente compensa no preço.
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200/80 dark:border-brand-800/60 p-3 text-xs font-mono">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>500ml • R$ 8,90</span>
                  <span>R$ 17,80/L</span>
                </div>
                <div className="flex justify-between text-brand-700 dark:text-brand-300 font-bold mt-1">
                  <span>1L • R$ 15,80</span>
                  <span>-11% mais barato</span>
                </div>
              </div>
            </div>

            {/* Card Compacto 3: Modo Subsolo */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 mb-2">
                  <WifiOff className="w-4 h-4" />
                  <span>Modo Subsolo Offline</span>
                </div>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Sem 4G no mercado? Continua normal.
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Suas marcações ficam salvas no aparelho e sincronizam automaticamente quando o sinal voltar.
                </p>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
                Salvo no seu celular • Sincroniza quando o sinal volta
              </div>
            </div>

            {/* Card Largo 4: Histórico & Onde Comprar */}
            <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 mb-2">
                  <TrendingDown className="w-4 h-4" />
                  <span>Histórico & Onde Comprar</span>
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Descubra onde sua lista sai mais barata
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 max-w-xl leading-relaxed">
                  Cada feira finalizada alimenta seu histórico de preços, mostra variações entre compras e simula o melhor supermercado para a sua próxima lista.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <span>Seus dados sob seu controle • Exporte ou exclua quando quiser</span>
                </div>
                {!currentUser && (
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('/cadastro')}
                    className="inline-flex items-center gap-1.5 text-xs font-black text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                  >
                    <span>Criar minha conta</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Rodapé */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>CestaON • No CestaON, o preço é bom.</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('/login')}
              className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('/cadastro')}
              className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              Criar conta
            </button>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('/recuperar')}
              className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              Recuperar acesso
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
