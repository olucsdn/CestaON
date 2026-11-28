import crypto from 'node:crypto';

/**
 * Converte quantidade e unidade para valor na unidade base padronizada (kg, L ou un).
 * @param {number} quantity 
 * @param {string} unit 
 * @returns {{ baseQuantity: number, baseUnit: string }}
 */
export function normalizeUnit(quantity, unit) {
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'gramas') {
    return { baseQuantity: quantity / 1000, baseUnit: 'kg' };
  }
  if (u === 'kg' || u === 'quilos') {
    return { baseQuantity: quantity, baseUnit: 'kg' };
  }
  if (u === 'ml' || u === 'mililitros') {
    return { baseQuantity: quantity / 1000, baseUnit: 'L' };
  }
  if (u === 'l' || u === 'litro' || u === 'litros') {
    return { baseQuantity: quantity, baseUnit: 'L' };
  }
  if (u === 'dz' || u === 'duzia' || u === 'dúzia') {
    return { baseQuantity: quantity * 12, baseUnit: 'un' };
  }
  return { baseQuantity: quantity, baseUnit: u || 'un' };
}

/**
 * Calcula o preço por unidade base em centavos.
 * @param {number} priceCents 
 * @param {number} quantity 
 * @param {string} unit 
 * @returns {{ normalizedPriceCents: number, baseUnit: string }}
 */
export function calculateNormalizedPrice(priceCents, quantity, unit) {
  const safePrice = Number.isFinite(priceCents) && priceCents > 0 ? Math.round(priceCents) : 0;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const { baseQuantity, baseUnit } = normalizeUnit(safeQuantity, unit);
  if (baseQuantity <= 0 || safePrice <= 0) return { normalizedPriceCents: safePrice, baseUnit };
  const normalizedPriceCents = Math.round(safePrice / baseQuantity);
  return { normalizedPriceCents, baseUnit };
}

export class PriceRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Finaliza uma feira, congelando os registros em purchase_history e price_history.
   */
  finishShoppingList(listId, storeId = null, notes = null) {
    const list = this.db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(listId);
    if (!list) throw new Error('Lista não encontrada');
    if (list.status === 'completed') {
      throw new Error('Esta feira já foi finalizada anteriormente.');
    }

    const items = this.db.prepare('SELECT * FROM list_items WHERE list_id = ?').all(listId);
    const purchasedItems = items.filter(i => i.is_purchased);
    const pendingItems = items.filter(i => !i.is_purchased);

    if (purchasedItems.length === 0) {
      throw new Error('Não é possível finalizar uma feira sem nenhum item comprado.');
    }

    if (pendingItems.length > 0) {
      throw new Error('Não é possível finalizar uma feira com itens pendentes.');
    }

    const unpricedItems = purchasedItems.filter(i => !i.actual_price_cents || Number(i.actual_price_cents) <= 0);
    if (unpricedItems.length > 0) {
      throw new Error(`Informe o valor de todos os produtos antes de finalizar a feira (${unpricedItems.length} ${unpricedItems.length === 1 ? 'item sem valor' : 'itens sem valor'}).`);
    }

    const effectiveStoreId = storeId || list.store_id || (purchasedItems.find(i => i.store_id)?.store_id) || 'store_super_dia';
    const totalSpentCents = purchasedItems.reduce((acc, curr) => acc + (curr.actual_price_cents || 0), 0);

    const historyId = 'hist_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const nowIso = new Date().toISOString();

    try {
      this.db.exec('BEGIN IMMEDIATE;');

      // 1. Grava no purchase_history
      this.db.prepare(`
        INSERT INTO purchase_history (
          id, list_id, store_id, total_spent_cents, total_items, budget_at_time_cents, completed_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        listId,
        effectiveStoreId,
        totalSpentCents,
        purchasedItems.length,
        list.budget_cents || 0,
        nowIso,
        notes
      );

      // 2. Grava cada item comprado em price_history
      const insertPrice = this.db.prepare(`
        INSERT INTO price_history (
          id, product_id, store_id, list_id, price_cents, quantity, unit,
          normalized_price_per_base_unit_cents, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of purchasedItems) {
        if (item.actual_price_cents > 0) {
          const { normalizedPriceCents } = calculateNormalizedPrice(item.actual_price_cents, item.quantity, item.unit);
          const priceRecordId = 'prc_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
          const itemStore = item.store_id || effectiveStoreId;
          insertPrice.run(
            priceRecordId,
            item.product_id,
            itemStore,
            listId,
            item.actual_price_cents,
            item.quantity,
            item.unit,
            normalizedPriceCents,
            nowIso
          );
        }
      }

      // 3. Atualiza status da lista
      this.db.prepare(`
        UPDATE shopping_lists
        SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nowIso, nowIso, listId);

      this.db.exec('COMMIT;');
      return this.getPurchaseHistoryById(historyId);
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    }
  }

  getPurchaseHistoryById(id) {
    return this.db.prepare(`
      SELECT ph.*, sl.title as list_title, st.name as store_name
      FROM purchase_history ph
      JOIN shopping_lists sl ON sl.id = ph.list_id
      LEFT JOIN stores st ON st.id = ph.store_id
      WHERE ph.id = ? OR ph.list_id = ?
      ORDER BY ph.completed_at DESC
      LIMIT 1
    `).get(id, id);
  }

  getAllPurchaseHistory(userId = null) {
    if (userId) {
      return this.db.prepare(`
        SELECT ph.*, sl.title as list_title, st.name as store_name
        FROM purchase_history ph
        JOIN shopping_lists sl ON sl.id = ph.list_id
        LEFT JOIN stores st ON st.id = ph.store_id
        WHERE sl.owner_id = ? OR sl.id IN (SELECT list_id FROM list_shares WHERE user_id = ?)
        ORDER BY ph.completed_at DESC
      `).all(userId, userId);
    }
    return this.db.prepare(`
      SELECT ph.*, sl.title as list_title, st.name as store_name
      FROM purchase_history ph
      JOIN shopping_lists sl ON sl.id = ph.list_id
      LEFT JOIN stores st ON st.id = ph.store_id
      ORDER BY ph.completed_at DESC
    `).all();
  }

  /**
   * Compara uma feira finalizada com a anterior (ou outra especificada).
   */
  compareShoppingLists(currentHistoryId, previousHistoryId = null) {
    const current = this.getPurchaseHistoryById(currentHistoryId);
    if (!current) return null;

    let previous = null;
    if (previousHistoryId) {
      previous = this.getPurchaseHistoryById(previousHistoryId);
    } else {
      // Busca a compra anterior restrita ao mesmo proprietário ou mesma lista (isolamento cross-tenant)
      previous = this.db.prepare(`
        SELECT ph.*, sl.title as list_title, st.name as store_name
        FROM purchase_history ph
        JOIN shopping_lists sl ON sl.id = ph.list_id
        LEFT JOIN stores st ON st.id = ph.store_id
        WHERE ph.completed_at < ?
          AND (sl.owner_id = (SELECT owner_id FROM shopping_lists WHERE id = ?) OR ph.list_id = ?)
        ORDER BY ph.completed_at DESC
        LIMIT 1
      `).get(current.completed_at, current.list_id, current.list_id);
    }

    if (!previous) {
      return {
        hasComparison: false,
        message: 'Histórico insuficiente para comparação. Esta é a primeira compra registrada.',
        current
      };
    }

    const deltaCents = current.total_spent_cents - previous.total_spent_cents;
    const previousSpent = previous.total_spent_cents;
    const deltaPercentage = previousSpent > 0 ? ((deltaCents / previousSpent) * 100) : 0;

    // Comparação item a item
    const currentItems = this.db.prepare(`
      SELECT p.id as product_id, p.name, li.actual_price_cents, li.quantity, li.unit
      FROM list_items li
      JOIN products p ON p.id = li.product_id
      WHERE li.list_id = ? AND li.is_purchased = 1
    `).all(current.list_id);

    const previousItems = this.db.prepare(`
      SELECT p.id as product_id, p.name, li.actual_price_cents, li.quantity, li.unit
      FROM list_items li
      JOIN products p ON p.id = li.product_id
      WHERE li.list_id = ? AND li.is_purchased = 1
    `).all(previous.list_id);

    const prevMap = new Map(previousItems.map(i => [i.product_id, i]));
    const itemVariations = [];

    for (const cur of currentItems) {
      const prev = prevMap.get(cur.product_id);
      if (prev && prev.actual_price_cents > 0 && cur.actual_price_cents > 0) {
        // Normaliza para comparar o preço unitário
        const curNorm = calculateNormalizedPrice(cur.actual_price_cents, cur.quantity, cur.unit);
        const prevNorm = calculateNormalizedPrice(prev.actual_price_cents, prev.quantity, prev.unit);

        const unitDiffCents = curNorm.normalizedPriceCents - prevNorm.normalizedPriceCents;
        const percentChange = prevNorm.normalizedPriceCents > 0
          ? ((unitDiffCents / prevNorm.normalizedPriceCents) * 100)
          : 0;

        itemVariations.push({
          productId: cur.product_id,
          name: cur.name,
          baseUnit: curNorm.baseUnit,
          previousUnitCents: prevNorm.normalizedPriceCents,
          currentUnitCents: curNorm.normalizedPriceCents,
          diffCents: unitDiffCents,
          percentChange: Math.round(percentChange * 10) / 10
        });
      }
    }

    itemVariations.sort((a, b) => b.percentChange - a.percentChange);
    const topIncreases = itemVariations.filter(i => i.diffCents > 0).slice(0, 3);
    const topDecreases = itemVariations.filter(i => i.diffCents < 0).reverse().slice(0, 3);

    return {
      hasComparison: true,
      current,
      previous,
      deltaCents,
      deltaPercentage: Math.round(deltaPercentage * 10) / 10,
      humanMessage: deltaCents > 0
        ? `Sua feira ficou R$ ${(deltaCents / 100).toFixed(2).replace('.', ',')} mais cara (+${(deltaPercentage).toFixed(1).replace('.', ',')}%)`
        : deltaCents < 0
        ? `Sua feira ficou R$ ${(Math.abs(deltaCents) / 100).toFixed(2).replace('.', ',')} mais barata (${(deltaPercentage).toFixed(1).replace('.', ',')}%)`
        : 'Sua feira teve exatamente o mesmo valor total da compra anterior.',
      topIncreases,
      topDecreases
    };
  }

  /**
   * Gráfico de evolução mensal para produtos essenciais
   */
  getMonthlyPriceTrends(productIds = [], userId = null) {
    let prods = Array.isArray(productIds)
      ? productIds.map(id => String(id).trim()).filter(id => /^[a-zA-Z0-9_-]{1,64}$/.test(id)).slice(0, 20)
      : [];

    if (prods.length === 0) {
      // Pega os 4 produtos favoritos mais comuns
      const favsQuery = userId
        ? `
          SELECT p.id FROM products p
          JOIN price_history ph ON ph.product_id = p.id
          JOIN shopping_lists sl ON sl.id = ph.list_id
          LEFT JOIN list_shares ls ON ls.list_id = sl.id
          WHERE sl.owner_id = ? OR ls.user_id = ?
          GROUP BY p.id
          ORDER BY count(ph.id) DESC
          LIMIT 4
        `
        : `
          SELECT p.id FROM products p
          JOIN price_history ph ON ph.product_id = p.id
          GROUP BY p.id
          ORDER BY count(ph.id) DESC
          LIMIT 4
        `;
      const favs = userId
        ? this.db.prepare(favsQuery).all(userId, userId)
        : this.db.prepare(favsQuery).all();
      prods = favs.map(f => f.id);
    }

    if (prods.length === 0) return [];

    const placeholders = prods.map(() => '?').join(',');
    const recordsQuery = userId
      ? `
        SELECT p.id as product_id, p.name as product_name, ph.normalized_price_per_base_unit_cents,
               ph.recorded_at, strftime('%Y-%m', ph.recorded_at, '-3 hours') as month_year
        FROM price_history ph
        JOIN products p ON p.id = ph.product_id
        JOIN shopping_lists sl ON sl.id = ph.list_id
        LEFT JOIN list_shares ls ON ls.list_id = sl.id
        WHERE (sl.owner_id = ? OR ls.user_id = ?)
          AND ph.product_id IN (${placeholders})
        ORDER BY ph.recorded_at ASC
      `
      : `
        SELECT p.id as product_id, p.name as product_name, ph.normalized_price_per_base_unit_cents,
               ph.recorded_at, strftime('%Y-%m', ph.recorded_at, '-3 hours') as month_year
        FROM price_history ph
        JOIN products p ON p.id = ph.product_id
        WHERE ph.product_id IN (${placeholders})
        ORDER BY ph.recorded_at ASC
      `;

    const records = userId
      ? this.db.prepare(recordsQuery).all(userId, userId, ...prods)
      : this.db.prepare(recordsQuery).all(...prods);

    return records;
  }

  /**
   * Simulador "Onde Comprar": estima o custo da lista atual em cada estabelecimento.
   */
  simulateWhereToBuy(listId, userId = null) {
    if (userId) {
      const hasAccess = this.db.prepare(`
        SELECT 1 FROM shopping_lists sl
        LEFT JOIN list_shares ls ON ls.list_id = sl.id
        WHERE sl.id = ? AND (sl.owner_id = ? OR ls.user_id = ?)
        LIMIT 1
      `).get(listId, userId, userId);
      if (!hasAccess) {
        return null;
      }
    }

    const listItems = this.db.prepare(`
      SELECT li.product_id, li.quantity, li.unit, p.name as product_name
      FROM list_items li
      JOIN products p ON p.id = li.product_id
      WHERE li.list_id = ?
    `).all(listId);

    if (listItems.length === 0) {
      return { stores: [], message: 'Lista vazia', totalListItems: 0 };
    }

    const stores = this.db.prepare('SELECT * FROM stores ORDER BY name ASC').all();
    const results = [];

    // [AUDIT-FIX #4 & SEC-03]: Eliminação de Queries N+1 e isolamento estrito multitenant por userId.
    // Carrega os preços mais recentes de todos os produtos da lista em lote único O(1) em memória.
    const productIds = Array.from(new Set(listItems.map((i) => i.product_id)));
    const latestPriceMap = new Map();
    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      const tenantFilter = userId
        ? 'AND (sl.owner_id = ? OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.user_id = ?))'
        : '';
      const tenantArgs = userId ? [userId, userId] : [];

      const priceRows = this.db.prepare(`
        SELECT ph.store_id, ph.product_id, ph.normalized_price_per_base_unit_cents, ph.recorded_at
        FROM price_history ph
        INNER JOIN shopping_lists sl ON sl.id = ph.list_id
        WHERE ph.product_id IN (${placeholders})
          ${tenantFilter}
        ORDER BY ph.recorded_at DESC
      `).all(...productIds, ...tenantArgs);

      for (const row of priceRows) {
        const key = `${row.store_id}:${row.product_id}`;
        if (!latestPriceMap.has(key)) {
          latestPriceMap.set(key, row);
        }
      }

      // Complementa com cotações de itens que possuem preço registrado em listas associadas a lojas
      const itemPriceRows = this.db.prepare(`
        SELECT COALESCE(li.store_id, sl.store_id) as store_id, li.product_id, li.actual_price_cents, li.quantity, li.unit, li.updated_at as recorded_at
        FROM list_items li
        JOIN shopping_lists sl ON sl.id = li.list_id
        WHERE li.product_id IN (${placeholders})
          AND li.actual_price_cents > 0
          AND COALESCE(li.store_id, sl.store_id) IS NOT NULL
          ${tenantFilter}
        ORDER BY li.updated_at DESC
      `).all(...productIds, ...tenantArgs);

      for (const row of itemPriceRows) {
        const key = `${row.store_id}:${row.product_id}`;
        if (!latestPriceMap.has(key)) {
          const { normalizedPriceCents } = calculateNormalizedPrice(row.actual_price_cents, row.quantity, row.unit);
          if (normalizedPriceCents > 0) {
            latestPriceMap.set(key, {
              store_id: row.store_id,
              product_id: row.product_id,
              normalized_price_per_base_unit_cents: normalizedPriceCents,
              recorded_at: row.recorded_at
            });
          }
        }
      }
    }

    for (const store of stores) {
      let storeTotalCents = 0;
      let matchedItemsCount = 0;
      const itemBreakdown = [];

      for (const item of listItems) {
        // [AUDIT-FIX #4]: Busca instantânea O(1) no Map sem I/O síncrono repetido no loop
        const latestPrice = latestPriceMap.get(`${store.id}:${item.product_id}`);

        if (latestPrice) {
          const { baseQuantity } = normalizeUnit(item.quantity, item.unit);
          const estimatedItemCost = Math.round(latestPrice.normalized_price_per_base_unit_cents * baseQuantity);
          storeTotalCents += estimatedItemCost;
          matchedItemsCount++;

          itemBreakdown.push({
            productId: item.product_id,
            productName: item.product_name,
            hasPrice: true,
            estimatedItemCostCents: estimatedItemCost,
            recordedAt: latestPrice.recorded_at
          });
        } else {
          itemBreakdown.push({
            productId: item.product_id,
            productName: item.product_name,
            hasPrice: false,
            estimatedItemCostCents: 0,
            recordedAt: null
          });
        }
      }

      const coverageRatio = matchedItemsCount / listItems.length;
      results.push({
        storeId: store.id,
        storeName: store.name,
        totalEstimatedCents: storeTotalCents,
        matchedItemsCount,
        totalItemsCount: listItems.length,
        coveragePercentage: Math.round(coverageRatio * 100),
        isComplete: matchedItemsCount === listItems.length,
        itemBreakdown
      });
    }

    // Ordena do menor total para o maior (somente estabelecimentos com cobertura mínima de 50%)
    // [AUDIT-FIX LOG-05]: Prioriza maior cobertura para não premiar cestas incompletas ilusoriamente baratas
    const validComparisons = results.filter((r) => r.coveragePercentage >= 50);
    validComparisons.sort((a, b) => {
      if (b.coveragePercentage !== a.coveragePercentage) {
        return b.coveragePercentage - a.coveragePercentage;
      }
      return a.totalEstimatedCents - b.totalEstimatedCents;
    });

    const cheapest = validComparisons[0] || null;
    const mostExpensive = validComparisons[validComparisons.length - 1] || null;
    const potentialSavingsCents = (cheapest && mostExpensive) ? (mostExpensive.totalEstimatedCents - cheapest.totalEstimatedCents) : 0;

    return {
      stores: results,
      cheapestStore: cheapest,
      potentialSavingsCents,
      isSufficientData: validComparisons.length > 1,
      totalListItems: listItems.length
    };
  }

  /**
   * Comparador inteligente de unidades equivalentes:
   * Exemplo: Pacote A de 1 kg por R$ 6,50 vs Pacote B de 5 kg por R$ 31,00
   */
  comparePackageSizes({ optionA, optionB }) {
    // option: { priceCents, quantity, unit }
    const normA = calculateNormalizedPrice(optionA.priceCents, optionA.quantity, optionA.unit);
    const normB = calculateNormalizedPrice(optionB.priceCents, optionB.quantity, optionB.unit);

    if (normA.baseUnit !== normB.baseUnit) {
      return {
        canCompare: false,
        message: `Unidades incompatíveis para comparação direta (${normA.baseUnit} vs ${normB.baseUnit}).`
      };
    }

    const diffCents = normA.normalizedPriceCents - normB.normalizedPriceCents;
    const bestOption = diffCents > 0 ? 'B' : diffCents < 0 ? 'A' : 'EQUAL';
    let percentSavings = 0;
    if (bestOption === 'B' && normA.normalizedPriceCents > 0) {
      percentSavings = Math.round(((diffCents / normA.normalizedPriceCents) * 100) * 10) / 10;
    } else if (bestOption === 'A' && normB.normalizedPriceCents > 0) {
      percentSavings = Math.round(((Math.abs(diffCents) / normB.normalizedPriceCents) * 100) * 10) / 10;
    }

    return {
      canCompare: true,
      baseUnit: normA.baseUnit,
      optionA: {
        ...optionA,
        pricePerBaseUnitCents: normA.normalizedPriceCents
      },
      optionB: {
        ...optionB,
        pricePerBaseUnitCents: normB.normalizedPriceCents
      },
      bestOption,
      percentSavings,
      summary: bestOption === 'EQUAL'
        ? 'Ambas as opções possuem exatamente o mesmo preço por unidade base.'
        : `A opção ${bestOption} é ${percentSavings.toFixed(1).replace('.', ',')}% mais econômica por ${normA.baseUnit}.`
    };
  }
}
