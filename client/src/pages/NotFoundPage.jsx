import React, { useState } from 'react';
import {
  ShoppingBag,
  Home,
  ArrowLeft,
  Heart,
  Sparkles,
  HelpCircle,
  LogIn,
  UserPlus
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics.js';

export function NotFoundPage({
  currentUser = null,
  theme = 'light',
  onToggleTheme,
  onNavigate,
  currentPath = ''
}) {
  const [comforted, setComforted] = useState(false);
  const [heartsCount, setHeartsCount] = useState(0);

  const handleComfort = () => {
    triggerHaptic([15, 35, 20]);
    setComforted(true);
    setHeartsCount((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6 transition-colors duration-200">
      {/* Conteúdo Principal — O Carrinho / Cestinha Triste */}
      <main className="max-w-xl sm:max-w-5xl w-full mx-auto flex flex-col items-center text-center my-auto py-8">
        {/* Ilustração SVG Interativa da Cestinha Triste */}
        <div className="relative mb-6 select-none">
          {/* Brilhos / Corações Flutuantes ao ser consolado */}
          {comforted && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-rose-500 animate-bounce">
              <Heart className="w-5 h-5 fill-rose-500 drop-shadow" />
              <Sparkles className="w-4 h-4 text-amber-400" />
              <Heart className="w-4 h-4 fill-rose-400" />
            </div>
          )}

          <div
            onClick={handleComfort}
            title={comforted ? 'O CestaON está feliz pelo seu carinho!' : 'Clique para dar um carinho no CestaON'}
            className="w-48 h-48 sm:w-56 sm:h-56 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 flex flex-col items-center justify-center p-4 relative group cursor-pointer transition-transform duration-300 hover:scale-[1.02]"
          >
            {/* SVG Exclusivo: CestaON Carrinho/Cestinha com Expressão Emotiva */}
            <svg viewBox="0 0 160 140" className="w-36 h-36 sm:w-44 sm:h-44 transition-all duration-300">
              <defs>
                {/* Gradiente da Cesta */}
                <linearGradient id="basketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                {/* Sombra suave no chão */}
                <ellipse id="groundShadow" cx="80" cy="132" rx="55" ry="6" fill="rgba(100, 116, 139, 0.18)" />
              </defs>

              {/* Sombra no piso do supermercado */}
              <use href="#groundShadow" />

              {/* Rodinhas do carrinho/cesta no chão */}
              <circle cx="50" cy="122" r="7" className="fill-slate-700 dark:fill-slate-400" />
              <circle cx="50" cy="122" r="3" className="fill-slate-300 dark:fill-slate-900" />
              <circle cx="110" cy="122" r="7" className="fill-slate-700 dark:fill-slate-400" />
              <circle cx="110" cy="122" r="3" className="fill-slate-300 dark:fill-slate-900" />

              {/* Haste de suporte das rodinhas */}
              <path d="M 50 115 L 55 102 M 110 115 L 105 102" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />

              {/* Alça caída/inclinada da cestinha (demonstra desânimo) */}
              <path
                d={comforted ? "M 38 65 C 38 32, 122 32, 122 65" : "M 34 72 C 34 38, 116 46, 120 75"}
                fill="none"
                stroke="#059669"
                strokeWidth="5"
                strokeLinecap="round"
                className="transition-all duration-500"
              />

              {/* Corpo da Cesta */}
              <path
                d="M 32 68 L 128 68 L 118 102 L 42 102 Z"
                fill="url(#basketGrad)"
                stroke="#047857"
                strokeWidth="3"
                strokeLinejoin="round"
                className="drop-shadow-sm"
              />

              {/* Grades decorativas da cesta */}
              <line x1="50" y1="68" x2="55" y2="102" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <line x1="80" y1="68" x2="80" y2="102" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <line x1="110" y1="68" x2="105" y2="102" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <line x1="36" y1="84" x2="124" y2="84" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />

              {/* Expressão Facial do CestaON: Triste vs Consolado */}
              {comforted ? (
                /* Rosto Feliz / Consolado */
                <g className="transition-all duration-300">
                  {/* Bochechinhas coradas */}
                  <circle cx="58" cy="88" r="4.5" fill="#f43f5e" opacity="0.4" />
                  <circle cx="102" cy="88" r="4.5" fill="#f43f5e" opacity="0.4" />
                  {/* Olhos fechadinhos de felicidade (^ ^) */}
                  <path d="M 60 83 Q 66 77 72 83" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M 88 83 Q 94 77 100 83" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
                  {/* Boquinha sorrindo com língua fofa */}
                  <path d="M 74 88 Q 80 94 86 88" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
                </g>
              ) : (
                /* Rosto Triste / Solitário */
                <g className="transition-all duration-300">
                  {/* Olhinhos caídos com olhar marejado */}
                  <ellipse cx="64" cy="82" rx="4" ry="5" fill="#ffffff" />
                  <ellipse cx="96" cy="82" rx="4" ry="5" fill="#ffffff" />
                  <circle cx="65" cy="83" r="2.2" fill="#0f172a" />
                  <circle cx="95" cy="83" r="2.2" fill="#0f172a" />
                  {/* Brilho de lágrima nos olhos */}
                  <circle cx="63" cy="81" r="1.1" fill="#ffffff" />
                  <circle cx="94" cy="81" r="1.1" fill="#ffffff" />

                  {/* Sobrancelhas caídas de tristeza */}
                  <path d="M 58 75 Q 64 78 70 76" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                  <path d="M 90 76 Q 96 78 102 75" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />

                  {/* Boquinha para baixo (biquinho triste) */}
                  <path d="M 74 92 Q 80 87 86 92" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Lagriminha escorrendo */}
                  <path
                    d="M 60 88 C 58 92, 59 96, 61 97 C 63 97, 64 94, 61 91 Z"
                    fill="#38bdf8"
                    className="animate-pulse"
                  />
                </g>
              )}

              {/* Folhinha murcha solitária saindo da cesta quando triste */}
              {!comforted ? (
                <path
                  d="M 112 68 Q 124 64 126 73 Q 120 74 116 71"
                  fill="#86efac"
                  stroke="#16a34a"
                  strokeWidth="1.2"
                  className="animate-pulse"
                />
              ) : (
                /* Maçãzinha alegre dentro da cesta quando feliz */
                <g>
                  <circle cx="114" cy="64" r="6" fill="#ef4444" />
                  <path d="M 114 58 Q 116 55 118 56" fill="none" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              )}
            </svg>

            {/* Dica interativa na borda */}
            <span className="absolute bottom-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wide">
              {comforted ? '💚 CestaON reconfortado!' : 'Toque nele para dar um carinho'}
            </span>
          </div>
        </div>

        {/* Badge de Status */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 text-xs font-bold mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
          Erro 404 • Corredor Vazio & Solitário
        </div>

        {/* Título com sentimento */}
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
          {comforted
            ? 'Snif... obrigado pelo carinho! 🥹'
            : 'Poxa... parece que este corredor não existe mais.'}
        </h1>

        {/* Descrição Imersiva e Emotiva */}
        <div className="max-w-md sm:max-w-none text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2 mb-6">
          {comforted ? (
            <p className="bg-emerald-50 dark:bg-emerald-950/40 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-medium">
              O CestaON enxugou a lágrima, ajeitou a alça da cestinha e deu um sorrisinho tímido! Agora só falta você voltar para a feira para enchermos o carrinho juntos.
            </p>
          ) : (
            <>
              <p>
                O CestaON procurou em cada prateleira, olhou embaixo das gôndolas e até perguntou no caixa... mas não encontrou nada neste endereço.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                "Fiquei aqui sozinho empurrando rodinhas no vazio, esperando você me chamar para montar a lista..."
              </p>
            </>
          )}
        </div>

        {/* Botão de Consolo se ainda triste */}
        {!comforted && (
          <button
            type="button"
            onClick={handleComfort}
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/50 transition cursor-pointer btn-tactile"
          >
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span>Fazer um carinho na cestinha (consolar)</span>
          </button>
        )}

        {/* Ações de Retorno e Navegação Segura */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm sm:max-w-none">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/')}
            className="w-full sm:w-auto py-3.5 px-5 rounded-2xl font-black text-sm bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/25 transition flex items-center justify-center gap-2 btn-tactile cursor-pointer sm:whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{currentUser ? 'Voltar para Minhas Feiras' : 'Voltar para o Início'}</span>
          </button>

          {!currentUser ? (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('/login')}
              className="w-full sm:w-auto py-3.5 px-4 rounded-2xl font-bold text-sm bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition flex items-center justify-center gap-2 btn-tactile cursor-pointer sm:whitespace-nowrap"
            >
              <LogIn className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>Entrar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('/')}
              className="w-full sm:w-auto py-3.5 px-4 rounded-2xl font-bold text-sm bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition flex items-center justify-center gap-2 btn-tactile cursor-pointer sm:whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>Ir às Compras</span>
            </button>
          )}
        </div>
      </main>

      {/* Rodapé Poético e Gentil */}
      <footer className="max-w-4xl lg:max-w-6xl w-full mx-auto text-center py-3 text-xs text-slate-400 dark:text-slate-500">
        <p>CestaON • Nenhum carrinho foi esquecido de verdade • No CestaON, o preço é bom e o coração é grande.</p>
      </footer>
    </div>
  );
}
