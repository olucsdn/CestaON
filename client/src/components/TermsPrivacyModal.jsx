import React from 'react';
import { ShieldCheck, X, FileText, Database, Lock, UserCheck, AlertTriangle } from 'lucide-react';

export function TermsPrivacyModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Termos de Uso e Privacidade
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                LGPD (Lei nº 13.709/2018) & Marco Civil da Internet (Lei nº 12.965/2014)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com rolagem suave */}
        <div className="overflow-y-auto py-4 space-y-4 text-xs text-slate-600 dark:text-slate-300 pr-1">
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
            <p className="font-bold text-emerald-900 dark:text-emerald-200 leading-relaxed">
              O CestaON foi construído com o compromisso inegociável de 100% de gratuidade e respeito absoluto à sua privacidade. Seus dados nunca são vendidos ou comercializados.
            </p>
          </div>

          {/* 1. Coleta Mínima */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>1. Coleta Mínima de Dados (Art. 6º, III da LGPD)</span>
            </div>
            <p className="pl-6 leading-relaxed text-slate-500 dark:text-slate-400">
              Solicitamos apenas as informações indispensáveis para o serviço: seu nome ou apelido, e-mail para acesso seguro e pergunta secreta para recuperação de senha de emergência. Não solicitamos CPF, cartão de crédito, dados bancários ou geolocalização.
            </p>
          </div>

          {/* 2. Armazenamento e Modo Subsolo */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <Database className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>2. Armazenamento e Operação Offline (Modo Subsolo)</span>
            </div>
            <p className="pl-6 leading-relaxed text-slate-500 dark:text-slate-400">
              Suas listas e cotações de preços ficam salvas no seu dispositivo (IndexedDB e Service Worker) para permitir uso contínuo mesmo sem sinal de internet no interior de mercados. Quando online, os dados sincronizam com nosso banco de dados em nuvem criptografado.
            </p>
          </div>

          {/* 3. Não Comercialização */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>3. Não Comercialização e Não Compartilhamento</span>
            </div>
            <p className="pl-6 leading-relaxed text-slate-500 dark:text-slate-400">
              Seus hábitos de compra, estabelecimentos frequentados e histórico de preços pertencem a você. O CestaON não comercializa, não aluga e não compartilha seus dados pessoais ou listas com terceiros, parceiros comerciais ou redes de anúncios.
            </p>
          </div>

          {/* 4. Direitos do Titular */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>4. Seus Direitos como Titular (Art. 18 da LGPD)</span>
            </div>
            <ul className="pl-6 list-disc space-y-1 text-slate-500 dark:text-slate-400">
              <li>
                <strong>Portabilidade (Art. 18, V):</strong> Exporte todos os seus dados e histórico de compras a qualquer momento em arquivo JSON estruturado diretamente no seu perfil.
              </li>
              <li>
                <strong>Eliminação Completa (Art. 18, VI):</strong> Exclua permanentemente sua conta, listas, itens e registros a qualquer momento com apenas um clique e confirmação de senha. A exclusão é imediata e irreversível em cascata.
              </li>
            </ul>
          </div>

          {/* 5. Marco Civil da Internet */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <AlertTriangle className="w-4 h-4 text-slate-500 shrink-0" />
              <span>5. Registros de Acesso (Art. 15 do Marco Civil da Internet)</span>
            </div>
            <p className="pl-6 leading-relaxed text-slate-500 dark:text-slate-400">
              Conforme exigência do Art. 15 da Lei nº 12.965/2014, o sistema mantém registros técnicos de conexão (endereço IP, data/hora UTC e rotas acessadas) sob sigilo para auditoria de segurança e prevenção a fraudes. Nenhum conteúdo de suas listas é exposto nestes logs.
            </p>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
          >
            Entendi e Concordo
          </button>
        </div>
      </div>
    </div>
  );
}
