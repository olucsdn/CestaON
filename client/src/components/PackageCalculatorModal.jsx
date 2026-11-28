import React, { useState } from 'react';
import { formatMoney, maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';
import { Calculator, Check, ArrowRight, X, WifiOff, Scale } from 'lucide-react';
import { comparePackageSizesOffline, isSubsurface } from '../utils/subsurfaceCache.js';
import { triggerHaptic } from '../utils/haptics.js';

export function PackageCalculatorModal({ onClose }) {
  const [optAPrice, setOptAPrice] = useState('6,50');
  const [optAQty, setOptAQty] = useState('1');
  const [optAUnit, setOptAUnit] = useState('kg');

  const [optBPrice, setOptBPrice] = useState('31,00');
  const [optBQty, setOptBQty] = useState('5');
  const [optBUnit, setOptBUnit] = useState('kg');

  const [result, setResult] = useState(null);

  const handleCompare = async (e) => {
    e.preventDefault();
    const pA = parseBankCurrencyToCents(optAPrice);
    const qA = parseFloat(optAQty.replace(',', '.')) || 1;
    const pB = parseBankCurrencyToCents(optBPrice);
    const qB = parseFloat(optBQty.replace(',', '.')) || 1;

    const payload = {
      optionA: { priceCents: pA, quantity: qA, unit: optAUnit },
      optionB: { priceCents: pB, quantity: qB, unit: optBUnit }
    };

    // 1. Se estiver no subsolo (sem rede), calcula localmente com 0ms de latência
    if (isSubsurface()) {
      const localResult = comparePackageSizesOffline(payload);
      setResult(localResult);
      return;
    }

    // 2. Se online, tenta a API com fallback resiliente instantâneo
    try {
      const res = await fetch('/api/tools/compare-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Falha no cálculo remoto');
      const data = await res.json();
      triggerHaptic(15);
      setResult(data);
    } catch (_) {
      // Fallback local caso caia o sinal
      const fallbackResult = comparePackageSizesOffline(payload);
      triggerHaptic(15);
      setResult(fallbackResult);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto transition-colors duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-brand-700 dark:text-brand-300 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">Calculadora Rápida</span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Qual embalagem compensa mais?</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulário de Comparação */}
        <form onSubmit={handleCompare} className="p-5 space-y-4">
          {/* Opção A */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 block">Embalagem A (Ex: Menor)</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Preço (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={optAPrice}
                  onChange={(e) => setOptAPrice(maskBankCurrencyInput(e.target.value))}
                  placeholder="0,00"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-sm font-bold outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Quantidade</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={optAQty}
                  onChange={(e) => setOptAQty(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-sm font-bold outline-none text-center"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Unidade</label>
                <select
                  value={optAUnit}
                  onChange={(e) => setOptAUnit(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-sm font-bold outline-none"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="ml">ml</option>
                  <option value="un">un</option>
                </select>
              </div>
            </div>
          </div>

          {/* Opção B */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 block">Embalagem B (Ex: Tamanho Família)</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Preço (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={optBPrice}
                  onChange={(e) => setOptBPrice(maskBankCurrencyInput(e.target.value))}
                  placeholder="0,00"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-sm font-bold outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Quantidade</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={optBQty}
                  onChange={(e) => setOptBQty(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-sm font-bold outline-none text-center"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Unidade</label>
                <select
                  value={optBUnit}
                  onChange={(e) => setOptBUnit(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-sm font-bold outline-none"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="ml">ml</option>
                  <option value="un">un</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-extrabold text-sm py-3 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
          >
            <span>Calcular Opção Mais Vantajosa</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Resultado Comparativo */}
          {result && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              {result.isOfflineCalc && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                  <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Cálculo instantâneo processado no dispositivo (Modo Subsolo ativo).</span>
                </div>
              )}
              {result.canCompare ? (() => {
                const isEqual = result.bestOption === 'EQUAL';
                return (
                  <div
                    className={`p-4 rounded-2xl border transition-all duration-300 animate-in fade-in zoom-in-95 duration-200 ${
                      isEqual
                        ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/80 text-emerald-950 dark:text-emerald-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full text-white flex items-center justify-center font-black text-xs shrink-0 ${
                            isEqual ? 'bg-slate-600 dark:bg-slate-600' : 'bg-emerald-600'
                          }`}
                        >
                          {isEqual ? <Scale className="w-3.5 h-3.5" /> : result.bestOption}
                        </div>
                        <h4 className="font-extrabold text-sm">
                          {isEqual ? 'Preços Equivalentes (Empate)' : `Opção Recomendada: Embalagem ${result.bestOption}`}
                        </h4>
                      </div>
                      {isEqual ? (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs shrink-0 flex items-center gap-1 animate-in zoom-in-95 duration-200">
                          <span>⚖️</span>
                          <span>Tanto Faz</span>
                        </span>
                      ) : (
                        (result.percentSavings > 0 || result.savingsPercent > 0) && (
                          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-600 text-white shadow-sm shrink-0 flex items-center gap-1 animate-in zoom-in-95 duration-200">
                            <span>🏆</span>
                            <span>-{(result.percentSavings || result.savingsPercent).toFixed(1).replace('.', ',')}% mais barato</span>
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">{result.summary}</p>
                    <div
                      className={`grid grid-cols-2 gap-2 mt-3 pt-3 border-t text-xs ${
                        isEqual
                          ? 'border-slate-200 dark:border-slate-700'
                          : 'border-emerald-200/60 dark:border-emerald-800/60'
                      }`}
                    >
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Opção A:</span>
                        <strong className="text-slate-900 dark:text-white font-extrabold">
                          {formatMoney(result.optionA.pricePerBaseUnitCents)} / {result.baseUnit}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Opção B:</span>
                        <strong className="text-slate-900 dark:text-white font-extrabold">
                          {formatMoney(result.optionB.pricePerBaseUnitCents)} / {result.baseUnit}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl text-xs">
                  {result.message}
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
