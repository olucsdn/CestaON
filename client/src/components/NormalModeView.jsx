import React, { useState } from 'react';
import { formatMoney, formatQuantity, formatCentsToBankInput, maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';
import { triggerHaptic } from '../utils/haptics.js';
import { showToast } from '../utils/toast.js';
import { RemoveFromCartConfirmCard } from './RemoveFromCartConfirmCard.jsx';
import {
  Plus,
  Star,
  Trash2,
  Edit2,
  CheckCircle,
  Circle,
  Scale,
  Users,
  Share2
} from 'lucide-react';

export function NormalModeView({
  list,
  categories,
  favorites,
  onAddItem,
  onQuickAddFavorite,
  onToggleItem,
  onRequestPricePrompt,
  onDeleteItem,
  onUpdateItem,
  onToggleFavoriteProduct,
  onOpenShareModal
}) {
  const [quickItemName, setQuickItemName] = useState('');
  const [quickQty, setQuickQty] = useState('1');
  const [quickUnit, setQuickUnit] = useState('un');
  const [editingItem, setEditingItem] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [itemPendingRemoval, setItemPendingRemoval] = useState(null);

  if (!list) return null;

  // Agrupa itens por categoria
  const groupedByCategory = categories.map((cat) => {
    const items = (list.items || []).filter((i) => i.category_id === cat.id);
    return {
      ...cat,
      items
    };
  }).filter((cat) => cat.items.length > 0);

  const displayedCategories = categoryFilter === 'all'
    ? groupedByCategory
    : groupedByCategory.filter((cat) => cat.id === categoryFilter);

  const handleQuickAdd = (e) => {
    e.preventDefault();
    const trimmed = quickItemName.trim();
    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    const alreadyExists = (list.items || []).some(
      (item) =>
        (item.product_name && item.product_name.toLowerCase() === lower) ||
        (item.custom_name && item.custom_name.toLowerCase() === lower)
    );

    if (alreadyExists) {
      showToast(`O produto "${trimmed}" já está na lista desta feira.`, 'warning');
      return;
    }

    onAddItem({
      name: trimmed,
      quantity: parseFloat(quickQty.replace(',', '.')) || 1,
      unit: quickUnit
    });

    setQuickItemName('');
    setQuickQty('1');
    setQuickUnit('un');
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingItem) return;

    const newName = (editingItem.custom_name || '').trim();
    if (newName) {
      const lower = newName.toLowerCase();
      const duplicate = (list.items || []).some(
        (i) =>
          i.id !== editingItem.id &&
          ((i.product_name && i.product_name.toLowerCase() === lower) ||
           (i.custom_name && i.custom_name.toLowerCase() === lower))
      );
      if (duplicate) {
        showToast(`Já existe outro item chamado "${newName}" nesta feira.`, 'warning');
        return;
      }
    }

    onUpdateItem(editingItem.id, {
      custom_name: editingItem.custom_name,
      quantity: parseFloat(editingItem.quantity) || 1,
      unit: editingItem.unit,
      category_id: editingItem.category_id,
      notes: editingItem.notes,
      actual_price_cents: parseBankCurrencyToCents(editingItem.actual_price_input),
      estimated_price_cents: Math.round(parseFloat(editingItem.estimated_price_input || 0) * 100)
    });

    setEditingItem(null);
  };

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      {/* Formulário de Adição Rápida e Limpo */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-4 shadow-sm transition-colors">
        <form onSubmit={handleQuickAdd} className="flex flex-col sm:flex-row gap-2.5 sm:gap-2">
          <input
            type="text"
            value={quickItemName}
            onChange={(e) => setQuickItemName(e.target.value)}
            placeholder="Adicionar produto (ex: Tomate, Leite)..."
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500 transition"
          />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <input
              type="number"
              step="any"
              min="0.1"
              value={quickQty}
              onChange={(e) => setQuickQty(e.target.value)}
              className="w-16 sm:w-20 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-100 text-center outline-none focus:ring-2 focus:ring-brand-500 transition"
            />
            <select
              value={quickUnit}
              onChange={(e) => setQuickUnit(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand-500 transition [&>option]:bg-white dark:[&>option]:bg-slate-800"
            >
              <option value="un">un</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="L">L</option>
              <option value="ml">ml</option>
              <option value="pct">pct</option>
              <option value="cx">cx</option>
              <option value="dz">dz</option>
            </select>
            <button
              type="submit"
              className="flex-1 sm:flex-initial bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center gap-1 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </div>
        </form>

        {/* Chips de Favoritos Rápidos */}
        {favorites.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-2.5 pb-1 mt-2.5 border-t border-slate-100 dark:border-slate-800/80">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 shrink-0 mr-1">
              Favoritos:
            </span>
            {favorites.map((fav) => {
              const isAdded = (list.items || []).some(
                (item) =>
                  item.product_id === fav.id ||
                  (item.product_name && item.product_name.toLowerCase() === fav.name.toLowerCase()) ||
                  (item.custom_name && item.custom_name.toLowerCase() === fav.name.toLowerCase())
              );
              return (
                <button
                  key={fav.id}
                  type="button"
                  onClick={() => {
                    if (!isAdded) {
                      triggerHaptic(10);
                      onQuickAddFavorite(fav);
                    }
                  }}
                  disabled={isAdded}
                  title={isAdded ? 'Produto já adicionado a esta feira' : `Adicionar ${fav.name}`}
                  className={`btn-tactile shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 ${
                    isAdded
                      ? 'bg-brand-50/80 dark:bg-slate-800 text-brand-700 dark:text-emerald-400 border border-brand-200/50 dark:border-emerald-800/60 cursor-not-allowed opacity-85'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400'
                  }`}
                >
                  {isAdded ? `✓ ${fav.name}` : `+ ${fav.name}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de Filtro Rápido por Setor */}
      {groupedByCategory.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              categoryFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white dark:border dark:border-slate-700 shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span>Todos</span>
            <span className="text-[10px] opacity-75">
              ({list.items?.length || 0})
            </span>
          </button>

          {groupedByCategory.map((cat) => {
            const isSelected = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(isSelected ? 'all' : cat.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                  isSelected
                    ? 'border-transparent text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: cat.color || '#64748B' }
                    : {}
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: isSelected ? '#ffffff' : (cat.color || '#64748B') }}
                />
                <span>{cat.name}</span>
                <span className={`text-[10px] ${isSelected ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'}`}>
                  ({cat.items.length})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Listagem Setorizada de Produtos */}
      <div className="space-y-3">
        {groupedByCategory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center transition-colors">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Sua lista está vazia
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Adicione itens no campo acima para começar sua feira.
            </p>
          </div>
        ) : displayedCategories.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center transition-colors">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Nenhum item encontrado neste setor
            </p>
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className="mt-2 text-xs font-bold text-brand-600 hover:underline"
            >
              Exibir todos os setores
            </button>
          </div>
        ) : (
          displayedCategories.map((category) => (
            <div
              key={category.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors"
              style={{ borderLeftWidth: '4px', borderLeftColor: category.color || '#64748B' }}
            >
              {/* Header da Categoria com Cor de Destaque */}
              <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: category.color || '#64748B' }}
                  />
                  <span
                    className="font-black text-xs uppercase tracking-wider"
                    style={{ color: category.color || '#64748B' }}
                  >
                    {category.name}
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {category.items.length} {category.items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              {/* Itens da Categoria */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {category.items.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 sm:px-4 flex items-center justify-between gap-3 transition-colors ${
                      item.is_purchased
                        ? 'bg-slate-50/50 dark:bg-slate-800/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Botão de Checkbox */}
                    <button
                      onClick={() => {
                        if (item.is_purchased) {
                          setItemPendingRemoval(item);
                        } else {
                          onToggleItem(item.id, true);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-brand-600 transition shrink-0"
                    >
                      {item.is_purchased ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>

                    {/* Nome & Quantidade */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold text-sm ${
                            item.is_purchased
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {item.custom_name || item.product_name}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {formatQuantity(item.quantity, item.unit)}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Preço */}
                    <div className="text-right shrink-0">
                      {item.is_purchased && (!item.actual_price_cents || item.actual_price_cents === 0) ? (
                        <button
                          type="button"
                          onClick={() => onRequestPricePrompt && onRequestPricePrompt(item)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 transition"
                          title="Aguardando pesagem ou preço no caixa. Clique para informar valor."
                        >
                          <Scale className="w-3 h-3" />
                          <span>Pesar / caixa</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          {item.actual_price_cents > 0
                            ? formatMoney(item.actual_price_cents)
                            : item.estimated_price_cents > 0
                            ? `~${formatMoney(item.estimated_price_cents)}`
                            : '—'}
                        </span>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() =>
                          setEditingItem({
                            ...item,
                            actual_price_input: formatCentsToBankInput(item.actual_price_cents),
                            estimated_price_input: item.estimated_price_cents > 0 ? (item.estimated_price_cents / 100).toString() : ''
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
                        title="Editar item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onToggleFavoriteProduct(item.product_id)}
                        className={`p-1.5 rounded-lg transition ${
                          item.is_favorite
                            ? 'text-amber-500'
                            : 'text-slate-400 hover:text-amber-500'
                        }`}
                        title="Favoritar produto"
                      >
                        <Star className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition"
                        title="Excluir item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Edição Simplificado */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Editar Produto
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={editingItem.custom_name || editingItem.product_name}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, custom_name: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editingItem.quantity}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, quantity: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Unidade
                  </label>
                  <select
                    value={editingItem.unit}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, unit: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="un">un</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="pct">pct</option>
                    <option value="cx">cx</option>
                    <option value="dz">dz</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Categoria / Setor
                </label>
                <select
                  value={editingItem.category_id || 'cat_outros'}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, category_id: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500 [&>option]:bg-white dark:[&>option]:bg-slate-850"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Preço Pago (R$)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={editingItem.actual_price_input}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, actual_price_input: maskBankCurrencyInput(e.target.value) })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Observações
                </label>
                <input
                  type="text"
                  placeholder="Ex: maduro, marca específica..."
                  value={editingItem.notes || ''}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, notes: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RemoveFromCartConfirmCard
        item={itemPendingRemoval}
        onKeep={() => setItemPendingRemoval(null)}
        onConfirmRemove={(target) => {
          onToggleItem(target.id, false);
          setItemPendingRemoval(null);
        }}
      />
    </div>
  );
}
