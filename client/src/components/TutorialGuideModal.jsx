import React, { useState } from 'react';
import {
  BookOpen,
  ListChecks,
  ShoppingCart,
  Target,
  TrendingDown,
  Calculator,
  History,
  WifiOff,
  Users,
  Download,
  CheckCircle2,
  X,
  ChevronDown,
  Sparkles,
  Lightbulb,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Plus,
  RefreshCw,
  Tag
} from 'lucide-react';

const TUTORIAL_SECTIONS = [
  {
    id: 'intro',
    title: 'Visão Geral',
    badge: 'Comece Aqui',
    icon: Sparkles,
    color: 'text-brand-600 dark:text-brand-400',
    bgColor: 'bg-brand-50 dark:bg-brand-950/60'
  },
  {
    id: 'planning',
    title: '1. Planejar Lista',
    badge: 'Aba Lista',
    icon: ListChecks,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/60'
  },
  {
    id: 'market',
    title: '2. No Supermercado',
    badge: 'Aba Comprar',
    icon: ShoppingCart,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/60'
  },
  {
    id: 'budget',
    title: '3. Gastos e Orçamento',
    badge: 'Aba Gastos',
    icon: Target,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/60'
  },
  {
    id: 'tools',
    title: '4. Inteligência e Ferramentas',
    badge: 'Menu Superior',
    icon: TrendingDown,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/60'
  },
  {
    id: 'offline-family',
    title: '5. Modo Subsolo e Família',
    badge: 'Sem Sinal & Tempo Real',
    icon: WifiOff,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/60'
  },
  {
    id: 'faq',
    title: 'Perguntas Frequentes',
    badge: 'Dúvidas Rápidas',
    icon: Lightbulb,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/60'
  }
];

export function TutorialGuideModal({ onClose, onOpenNewList, onOpenCalculator }) {
  const [activeTab, setActiveTab] = useState('intro');
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] transition-colors duration-200">
        {/* Cabeçalho do Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">
                Guia Oficial CestaON
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                Como usar o CestaON e economizar
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition shrink-0"
            title="Fechar guia"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas de Navegação Horizontal */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {TUTORIAL_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeTab === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 dark:bg-slate-800 text-white dark:text-white dark:border dark:border-slate-700 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? '' : section.color}`} />
                <span>{section.title}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
          {/* Seção 0: Visão Geral */}
          {activeTab === 'intro' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-brand-700 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-emerald-400/30">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-xl">🛒</span>
                  <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                    "No CestaON, o preço é bom."
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-emerald-50/90 leading-relaxed font-medium">
                  O CestaON é seu assistente inteligente completo de feira e supermercado. Ele foi projetado para acabar com o papelzinho de compras, impedir estouros de orçamento, calcular a embalagem mais barata e funcionar mesmo sem sinal de internet no subsolo do mercado.
                </p>
              </div>

              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                O Ciclo Perfeito de Compras em 3 Etapas:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs mb-2.5">
                      1
                    </div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                      Planeje em Casa
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Monte sua lista por setor com auto-categorização inteligente e defina um orçamento máximo.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs mb-2.5">
                      2
                    </div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                      Compre com 1 Mão
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Na aba Comprar, marque itens no carrinho em segundos e confira o total em tempo real no corredor.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs mb-2.5">
                      3
                    </div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                      Economize Sempre
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Finalize a feira para congelar os preços no histórico, comparar mercados e descobrir onde comprar mais barato.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-blue-900 dark:text-blue-200">
                <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5">Dica de Produtividade:</span>
                  Navegue pelas abas acima para aprender cada detalhe de como planejar, comprar, controlar seus gastos e usar as ferramentas de inteligência!
                </div>
              </div>

              {onOpenNewList && (
                <div className="pt-3 flex justify-center">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenNewList();
                    }}
                    className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-2xl shadow-sm hover:shadow-md transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Minha Primeira Lista</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Seção 1: Planejar Lista */}
          {activeTab === 'planning' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <ListChecks className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Aba "Lista": Onde o planejamento acontece
                </h3>
              </div>

              <div className="space-y-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wide block mb-1">
                    Passo 1: Criando uma Lista
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                    Clique em <strong>+ Nova Lista</strong> no topo da tela. Você pode dar um nome à feira (ex: <em>Feira da Semana</em>), definir um supermercado pretendido e estipular um <strong>Teto de Orçamento</strong> em reais.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wide block mb-1">
                    Passo 2: Adição Rápida com Auto-Categorização
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                    Digite o nome do produto no campo de adição (ex: <em>"Tomate"</em> ou <em>"Detergente"</em>). O CestaON identifica automaticamente o setor correto (Hortifrúti, Limpeza, Açougue, etc.), organizando sua lista por corredores sem esforço.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Você pode alterar a quantidade, unidade (kg, L, un, dz, g, ml) e até definir uma estimativa de preço para planejar seu gasto antes de sair de casa.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wide block mb-1">
                    Passo 3: Chips de Favoritos
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Os itens que você mais compra frequentemente aparecem como botões rápidos logo abaixo da barra de adição. Um clique no chip e o produto entra na sua lista imediatamente!
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wide block mb-1">
                    Passo 4: Filtros por Setor
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Use os badges coloridos no topo da lista para visualizar apenas os produtos de um setor específico (ex: apenas <em>Laticínios</em> ou apenas <em>Açougue</em>).
                  </p>
                </div>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Dica de Ouro:</strong> Com a lista pronta, clique na aba <strong>Comprar</strong> para ativar o modo de supermercado otimizado para celulares!
                </div>
              </div>
            </div>
          )}

          {/* Seção 2: No Supermercado */}
          {activeTab === 'market' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Aba "Comprar": O Modo No Mercado (Uso com 1 Mão)
                </h3>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                O <strong>Modo No Mercado</strong> foi desenvolvido para ser usado segurando o carrinho com uma mão e o celular com a outra, sem menus confusos ou botões pequenos.
              </p>

              <div className="space-y-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>1 Toque para Comprar</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Toque no círculo de seleção do produto. O aplicativo abre um modal rápido para você digitar o preço real pago (se quiser) ou marcar como <em>"A definir / no caixa"</em> para produtos que você só vai pesar na balança ou registrar no caixa.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Filtro Corredor por Corredor</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Selecione o filtro do setor onde você está (ex: <em>Hortifrúti</em>). O CestaON mostra apenas os itens daquele corredor. Quando terminar, mude para o próximo setor sem precisar ficar subindo e descendo uma lista enorme.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
                    <Target className="w-3.5 h-3.5" />
                    <span>Total do Carrinho em Tempo Real</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    A barra inferior exibe a soma acumulada de tudo o que você já colocou no carrinho e quantos itens ainda faltam. Você nunca mais terá surpresas ruins ao passar as compras no caixa!
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Finalização Reativa da Feira</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Quando todos os itens forem comprados, o botão verde <strong>Finalizar</strong> acende automaticamente na barra inferior do modo No Mercado. Ao finalizar, os preços vão para seu banco de inteligência e a lista é arquivada.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Seção 3: Gastos e Orçamento */}
          {activeTab === 'budget' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Target className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Aba "Gastos": Controle Financeiro sem Planilhas
                </h3>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Evite compras por impulso e saiba exatamente quanto pode gastar antes de entrar no supermercado.
              </p>

              <div className="space-y-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <h5 className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
                    Barra de Progresso Inteligente
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    A barra visual mostra três métricas essenciais:
                  </p>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc list-inside mt-1.5 space-y-1">
                    <li><strong>Total Registrado:</strong> Soma dos itens já marcados no carrinho.</li>
                    <li><strong>Saldo Restante:</strong> Quanto ainda sobra da sua meta de gastos.</li>
                    <li><strong>Teto Definido:</strong> O limite máximo que você determinou para esta feira.</li>
                  </ul>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <h5 className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
                    Ajuste Rápido de Teto
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Quer aumentar o orçamento durante as compras? Use os botões rápidos de <strong>+R$ 50</strong> ou <strong>+R$ 100</strong> na aba Gastos com um simples toque, sem precisar refazer a lista.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <h5 className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
                    Distribuição por Setor
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    O CestaON calcula a porcentagem e o valor em reais gasto em cada setor (ex: 40% em Açougue, 25% em Hortifrúti). Assim você descobre facilmente onde o seu dinheiro está indo.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Seção 4: Inteligência e Ferramentas */}
          {activeTab === 'tools' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Ferramentas Inteligentes (Acessíveis pelo Menu Superior ⋮)
                </h3>
              </div>

              <div className="space-y-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-sky-600 dark:text-sky-400 uppercase tracking-wide mb-1">
                    <Calculator className="w-4 h-4" />
                    <span>Calculadora de Embalagens (Qual compensa mais?)</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                    Nunca mais caia na pegadinha das embalagens econômicas que custam mais caro! Informe o peso/volume e o preço de duas opções (ex: Sabão de 900g por R$ 8,90 vs Sabão de 2,4kg por R$ 24,90).
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    O CestaON normaliza automaticamente para R$/kg ou R$/L e calcula a porcentagem exata de economia. Funciona 100% offline no Modo Subsolo!
                  </p>
                  {onOpenCalculator && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenCalculator();
                      }}
                      className="mt-2 text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                    >
                      <span>Abrir Calculadora Agora</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
                    <TrendingDown className="w-4 h-4" />
                    <span>Simulador "Onde Comprar"</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Com base no histórico dos seus preços registrados nas compras anteriores, o simulador cruza sua lista inteira contra os supermercados cadastrados e indica em qual estabelecimento sua feira ficaria mais barata, indicando a economia estimada em reais.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
                    <History className="w-4 h-4" />
                    <span>Histórico de Preços e Comparador Delta</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Compare uma feira contra a anterior para saber: <em>"Minha feira ficou R$ 35 mais cara (+8,2%)"</em> e descubra imediatamente os maiores vilões do aumento de preço e os produtos que caíram.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1">
                    <Download className="w-4 h-4" />
                    <span>Instalação no Celular</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Abra o menu no canto superior e toque em <strong>Instalar no Celular</strong>. O CestaON funcionará como um aplicativo nativo no seu Android ou iPhone, abrindo em tela cheia com ícone na sua tela inicial!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Seção 5: Modo Subsolo e Família */}
          {activeTab === 'offline-family' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <WifiOff className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Modo Subsolo & Sincronização Familiar
                </h3>
              </div>

              <div className="space-y-3">
                <div className="border border-purple-200 dark:border-purple-800/60 rounded-2xl p-3.5 bg-purple-50/50 dark:bg-purple-950/30">
                  <div className="flex items-center gap-2 font-bold text-xs text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-1">
                    <WifiOff className="w-4 h-4" />
                    <span>Modo Subsolo (100% Offline)</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                    Às vezes você perde acesso a internet ao fazer alguma compra? No CestaON isso não é problema!
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    O aplicativo ativa automaticamente o <strong>Modo Subsolo</strong>. Cada produto marcado e editado fica salvo no seu aparelho. Um indicador discreto mostra quantas operações estão salvas no celular.
                  </p>
                </div>

                <div className="border border-sky-200 dark:border-sky-800/60 rounded-2xl p-3.5 bg-sky-50/50 dark:bg-sky-950/30">
                  <div className="flex items-center gap-2 font-bold text-xs text-sky-700 dark:text-sky-300 uppercase tracking-wide mb-1">
                    <RefreshCw className="w-4 h-4" />
                    <span>Reconexão com Internet</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Quando você sair do mercado ou recuperar a conexão com a internet, as alterações serão enviadas automaticamente em segundo plano, sem que você precise fazer nada ou atualizar a página.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-bold text-xs text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-1">
                    <Users className="w-4 h-4" />
                    <span>Compras em Família em Tempo Real</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                    Quer dividir o mercado com outra pessoa para terminar as compras na metade do tempo?
                  </p>
                  <ol className="text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside space-y-1">
                    <li>Abra o menu no topo e clique em <strong>Compartilhar lista</strong>.</li>
                    <li>Envie o código de acesso (ex: 12 caracteres) para seu familiar.</li>
                    <li>No celular dele, ele clica em <em>Entrar</em> e digita o código (sem precisar criar nenhuma feira antes!).</li>
                  </ol>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Pronto! Cada um pode ir para um corredor diferente. Conforme os produtos forem colocados no carrinho, a tela do outro sincroniza instantaneamente!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Seção 6: FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Perguntas Frequentes & Respostas Diretas
                </h3>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    q: 'Preciso de internet para usar o app no mercado?',
                    a: 'Não! O CestaON foi construído com arquitetura Offline-First (Modo Subsolo). Todas as suas marcações, produtos e contas continuam funcionando sem internet. Ao recuperar conexão, tudo sincroniza automaticamente.'
                  },
                  {
                    q: 'Como colocar produtos pesados que não têm preço antes da balança?',
                    a: 'Ao tocar no produto para colocar no carrinho, você pode clicar em "Preço a definir / no caixa". O item vai para o carrinho com um marcador especial e você pode informar o valor exato quando pesar ou no caixa.'
                  },
                  {
                    q: 'O que acontece quando eu clico em "Finalizar"?',
                    a: 'A feira atual é encerrada e protegida contra alterações acidentais. Seus preços são salvos no histórico inteligente e você pode consultá-la a qualquer momento na aba Feiras ou duplicá-la para a próxima semana.'
                  },
                  {
                    q: 'Como começar uma compra nova aproveitando a feira anterior?',
                    a: 'Na aba Feiras (ou no menu ⋮ > Duplicar feira), você clica em Duplicar. Uma nova lista ativa é criada instantaneamente com os mesmos produtos, permitindo que você apenas ajuste o que precisa comprar de novo.'
                  },
                  {
                    q: 'Como proteger minha feira compartilhada?',
                    a: 'No ícone do seu avatar no topo direito, você pode definir um PIN numérico seguro de 4 a 8 dígitos para proteger suas feiras contra acessos indevidos na mesma máquina.'
                  }
                ].map((faq, index) => {
                  const isOpen = openFaqIndex === index;
                  return (
                    <div
                      key={index}
                      className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/40 transition"
                    >
                      <button
                        onClick={() => toggleFaq(index)}
                        className="w-full px-4 py-3 text-left font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between gap-3"
                      >
                        <span>{faq.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                            isOpen ? 'rotate-180 text-brand-600 dark:text-brand-400' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 leading-relaxed">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span className="hidden sm:inline">Privado e Seguro</span>
          </div>

          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl transition shadow-sm"
          >
            Entendi, vamos às compras!
          </button>
        </div>
      </div>
    </div>
  );
}
