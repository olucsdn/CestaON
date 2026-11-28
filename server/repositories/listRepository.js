import crypto from 'node:crypto';

/**
 * Fila Atômica por Item com Merging Inteligente de Campos
 * Serializa mutações concorrentes para o mesmo item e funde payloads acumulados
 * na fila para evitar sobrescrita concorrente ("Lost Update").
 */
export class ItemMutationQueue {
  constructor(listRepo) {
    this.listRepo = listRepo;
    // Map<string, { isRunning: boolean, pendingUpdates: object | null, callbacks: Array<{ resolve: Function, reject: Function }> }>
    this.queues = new Map();
  }

  _sanitizeFields(fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
    const safe = Object.create(null);
    const ALLOWED = [
      'quantity', 'estimated_price_cents', 'actual_price_cents',
      'custom_name', 'notes', 'unit', 'category_id', 'store_id',
      'is_purchased', 'purchased_by_user_id'
    ];
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined) {
        safe[key] = fields[key];
      }
    }
    return safe;
  }

  /**
   * Enfileira uma mutação para um item específico.
   * Se já houver uma mutação em andamento para este itemId, funde os campos no lote pendente.
   * @param {string} itemId
   * @param {object} fields
   * @returns {Promise<object>}
   */
  async enqueue(itemId, fields) {
    if (!itemId) throw new Error('itemId é obrigatório para mutação atômica');

    const safeFields = this._sanitizeFields(fields);
    let state = this.queues.get(itemId);
    if (!state) {
      state = {
        isRunning: false,
        pendingUpdates: null,
        callbacks: []
      };
      this.queues.set(itemId, state);
    }

    return new Promise((resolve, reject) => {
      if (state.isRunning) {
        // Fusão atômica de campos pendentes: novas chaves mesclam com as já acumuladas de forma segura
        if (!state.pendingUpdates) {
          state.pendingUpdates = { ...safeFields };
        } else {
          Object.assign(state.pendingUpdates, safeFields);
        }
        state.callbacks.push({ resolve, reject });
      } else {
        state.isRunning = true;
        this._run(itemId, safeFields, [{ resolve, reject }]);
      }
    });
  }

  async _run(itemId, fields, currentCallbacks) {
    try {
      // Executa transação atômica no banco de dados SQLite
      const updated = this.listRepo.atomicMergeItemDirect(itemId, fields);
      for (const cb of currentCallbacks) {
        cb.resolve(updated);
      }
    } catch (err) {
      for (const cb of currentCallbacks) {
        cb.reject(err);
      }
    } finally {
      const state = this.queues.get(itemId);
      if (state) {
        if (state.pendingUpdates && state.callbacks.length > 0) {
          const nextFields = state.pendingUpdates;
          const nextCallbacks = state.callbacks;
          state.pendingUpdates = null;
          state.callbacks = [];
          // Continua processando o lote fundido na fila no próximo ciclo
          queueMicrotask(() => this._run(itemId, nextFields, nextCallbacks));
        } else {
          // Esvazia e remove do Map para garantir zero vazamento de memória
          this.queues.delete(itemId);
        }
      }
    }
  }

  /**
   * Retorna a quantidade de filas ativas no momento (para auditoria e testes)
   */
  getActiveQueuesCount() {
    return this.queues.size;
  }
}

export class ListRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
    this.mutationQueue = new ItemMutationQueue(this);
  }

  // ==========================================
  // GESTÃO DE LISTAS (SHOPPING_LISTS)
  // ==========================================

  getAll(userId = null) {
    if (userId) {
      return this.db.prepare(`
        SELECT l.*, s.name as store_name, u.name as owner_name, u.avatar_color as owner_avatar_color,
               (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) as total_items,
               (SELECT COUNT(*) FROM list_items WHERE list_id = l.id AND is_purchased = 1) as purchased_items,
               (SELECT COALESCE(SUM(actual_price_cents), 0) FROM list_items WHERE list_id = l.id AND is_purchased = 1) as total_spent_cents
        FROM shopping_lists l
        LEFT JOIN stores s ON s.id = l.store_id
        LEFT JOIN users u ON u.id = l.owner_id
        WHERE l.owner_id = ? OR l.id IN (SELECT list_id FROM list_shares WHERE user_id = ?)
        ORDER BY l.status ASC, l.updated_at DESC
      `).all(userId, userId);
    }
    return this.db.prepare(`
      SELECT l.*, s.name as store_name, u.name as owner_name, u.avatar_color as owner_avatar_color,
             (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) as total_items,
             (SELECT COUNT(*) FROM list_items WHERE list_id = l.id AND is_purchased = 1) as purchased_items,
             (SELECT COALESCE(SUM(actual_price_cents), 0) FROM list_items WHERE list_id = l.id AND is_purchased = 1) as total_spent_cents
      FROM shopping_lists l
      LEFT JOIN stores s ON s.id = l.store_id
      LEFT JOIN users u ON u.id = l.owner_id
      ORDER BY l.status ASC, l.updated_at DESC
    `).all();
  }

  generateShareCode() {
    // Tenta gerar código ergonômico único de 6 caracteres (hexadecimal maiúsculo)
    for (let i = 0; i < 20; i++) {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const existing = this.db.prepare("SELECT id FROM shopping_lists WHERE UPPER(REPLACE(share_code, '-', '')) = ?").get(code);
      if (!existing) return code;
    }
    // Fallback garantido contra saturação: gera código de 8 caracteres sempre validado contra duplicatas no banco
    while (true) {
      const fallbackCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const existing = this.db.prepare("SELECT id FROM shopping_lists WHERE UPPER(REPLACE(share_code, '-', '')) = ?").get(fallbackCode);
      if (!existing) return fallbackCode;
    }
  }

  getById(id) {
    const list = this.db.prepare(`
      SELECT l.*, s.name as store_name, u.name as owner_name, u.avatar_color as owner_avatar_color
      FROM shopping_lists l
      LEFT JOIN stores s ON s.id = l.store_id
      LEFT JOIN users u ON u.id = l.owner_id
      WHERE l.id = ?
    `).get(id);

    if (!list) return null;

    // Garante que a lista possui um share_code único e curto (6 caracteres)
    if (!list.share_code) {
      const generatedCode = this.generateShareCode();
      this.db.prepare('UPDATE shopping_lists SET share_code = ? WHERE id = ?').run(generatedCode, id);
      list.share_code = generatedCode;
    }

    const items = this.getItems(id);
    const shares = this.getShares(id);

    // Cálculos de resumo financeiro
    let totalSpentCents = 0;
    let totalEstimatedCents = 0;
    let purchasedCount = 0;
    let itemsWithEstimateCount = 0;

    for (const item of items) {
      if (item.is_purchased) {
        totalSpentCents += (item.actual_price_cents || 0);
        purchasedCount++;
      }
      if (item.estimated_price_cents > 0) {
        totalEstimatedCents += Math.round(item.estimated_price_cents * (item.quantity || 1));
        itemsWithEstimateCount++;
      }
    }

    const budgetCents = list.budget_cents || 0;
    const remainingBudgetCents = budgetCents > 0 ? (budgetCents - totalSpentCents) : null;
    const budgetUsedPercentage = budgetCents > 0 ? Math.round((totalSpentCents / budgetCents) * 100) : 0;

    return {
      ...list,
      items,
      shares,
      stats: {
        totalItems: items.length,
        purchasedCount,
        remainingCount: items.length - purchasedCount,
        totalSpentCents,
        totalEstimatedCents,
        itemsWithEstimateCount,
        budgetCents,
        remainingBudgetCents,
        budgetUsedPercentage,
        isOverBudget: budgetCents > 0 && totalSpentCents > budgetCents
      }
    };
  }

  checkPermission(listId, userId) {
    if (!listId || !userId) return { allowed: false, permission: null, isOwner: false };
    const list = this.db.prepare('SELECT owner_id FROM shopping_lists WHERE id = ?').get(listId);
    if (!list) return { allowed: false, permission: null, isOwner: false };
    if (list.owner_id === userId) {
      return { allowed: true, permission: 'admin', isOwner: true };
    }
    const share = this.db.prepare('SELECT permission FROM list_shares WHERE list_id = ? AND user_id = ?').get(listId, userId);
    if (share) {
      return { allowed: true, permission: share.permission, isOwner: false };
    }
    return { allowed: false, permission: null, isOwner: false };
  }

  create({ title, owner_id = 'usr_default', store_id = null, budget_cents = 0 }) {
    const safeBudget = Math.max(0, Math.min(Math.round(Number(budget_cents)) || 0, 1000000000));

    // Retry loop para garantir unicidade absoluta mesmo sob concorrência extrema
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = 'list_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      const shareCode = this.generateShareCode();

      try {
        this.db.prepare(`
          INSERT INTO shopping_lists (id, title, owner_id, store_id, budget_cents, status, share_code)
          VALUES (?, ?, ?, ?, ?, 'active', ?)
        `).run(id, title.trim(), owner_id, store_id, safeBudget, shareCode);

        return this.getById(id);
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed: shopping_lists.share_code') && attempt < 4) {
          continue;
        }
        throw err;
      }
    }
  }

  update(id, { title, store_id, budget_cents, status }) {
    const existing = this.getById(id);
    if (!existing) return null;

    const finalTitle = title !== undefined ? title.trim() : existing.title;
    const finalStoreId = store_id !== undefined ? store_id : existing.store_id;
    const finalBudget = budget_cents !== undefined ? Math.max(0, Math.min(Math.round(Number(budget_cents)) || 0, 1000000000)) : existing.budget_cents;
    const finalStatus = status !== undefined ? status : existing.status;

    this.db.prepare(`
      UPDATE shopping_lists
      SET title = ?, store_id = ?, budget_cents = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalTitle, finalStoreId, finalBudget, finalStatus, id);

    return this.getById(id);
  }

  deleteList(id) {
    try {
      this.db.exec('BEGIN IMMEDIATE;');

      // 1. Limpa registros em purchase_history se a lista tiver sido finalizada (evita violação de RESTRICT)
      this.db.prepare('DELETE FROM purchase_history WHERE list_id = ?').run(id);

      // 2. Remove registros em price_history associados a esta lista para não deixar preços órfãos
      this.db.prepare('DELETE FROM price_history WHERE list_id = ?').run(id);

      // 3. Remove itens da lista
      this.db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);

      // 4. Remove compartilhamentos
      this.db.prepare('DELETE FROM list_shares WHERE list_id = ?').run(id);

      // 5. Exclui a lista de compras
      const result = this.db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(id);

      this.db.exec('COMMIT;');
      return result.changes > 0;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    }
  }

  delete(id) {
    return this.deleteList(id);
  }

  duplicate(sourceListId, newTitle, owner_id = 'usr_default') {
    const source = this.getById(sourceListId);
    if (!source) return null;

    const title = newTitle || `${source.title} (Cópia)`;
    const newList = this.create({
      title,
      owner_id,
      store_id: source.store_id,
      budget_cents: source.budget_cents
    });

    // Clona os itens zerando o status de comprado e utilizando o preço real anterior como preço estimado
    const insertItem = this.db.prepare(`
      INSERT INTO list_items (
        id, list_id, product_id, custom_name, category_id,
        quantity, unit, estimated_price_cents, actual_price_cents,
        store_id, is_purchased, sort_order, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)
    `);

    const seenProductIds = new Set();
    for (const item of source.items) {
      if (seenProductIds.has(item.product_id)) continue;
      seenProductIds.add(item.product_id);
      const newItemId = 'item_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      const estimatedPrice = item.actual_price_cents > 0 ? item.actual_price_cents : item.estimated_price_cents;
      insertItem.run(
        newItemId,
        newList.id,
        item.product_id,
        item.custom_name,
        item.category_id,
        item.quantity,
        item.unit,
        estimatedPrice,
        item.store_id,
        item.sort_order,
        item.notes
      );
    }

    return this.getById(newList.id);
  }

  // ==========================================
  // GESTÃO DE ITENS (LIST_ITEMS)
  // ==========================================

  getItems(listId) {
    return this.db.prepare(`
      SELECT li.*, p.name as product_name, p.is_favorite as is_favorite, c.name as category_name, c.color as category_color,
             c.icon as category_icon, c.display_order as category_order, s.name as store_name
      FROM list_items li
      JOIN products p ON p.id = li.product_id
      JOIN categories c ON c.id = li.category_id
      LEFT JOIN stores s ON s.id = li.store_id
      WHERE li.list_id = ?
      ORDER BY c.display_order ASC, li.sort_order ASC, p.name ASC
    `).all(listId);
  }

  getItemById(itemId) {
    return this.db.prepare(`
      SELECT li.*, p.name as product_name, p.is_favorite as is_favorite, c.name as category_name, c.color as category_color,
              c.icon as category_icon, c.display_order as category_order, s.name as store_name
      FROM list_items li
      JOIN products p ON p.id = li.product_id
      JOIN categories c ON c.id = li.category_id
      LEFT JOIN stores s ON s.id = li.store_id
      WHERE li.id = ?
    `).get(itemId);
  }

  /**
   * Verifica se já existe um item com o mesmo produto ou nome na feira.
   * @param {string} listId
   * @param {string|null} productId
   * @param {string|null} name
   * @param {string|null} excludeItemId
   * @returns {object|null}
   */
  findDuplicateItem(listId, productId = null, name = null, excludeItemId = null) {
    const safeName = name ? String(name).trim() : null;
    return this.db.prepare(`
      SELECT li.*, p.name as product_name
      FROM list_items li
      JOIN products p ON p.id = li.product_id
      WHERE li.list_id = ?
        AND (? IS NULL OR li.id != ?)
        AND (
          (? IS NOT NULL AND li.product_id = ?)
          OR (? IS NOT NULL AND (
            LOWER(p.name) = LOWER(?)
            OR LOWER(COALESCE(li.custom_name, '')) = LOWER(?)
          ))
        )
      LIMIT 1
    `).get(
      listId,
      excludeItemId,
      excludeItemId,
      productId,
      productId,
      safeName,
      safeName,
      safeName
    );
  }

  addItem({
    list_id,
    product_id,
    custom_name = null,
    category_id,
    quantity = 1,
    unit = 'un',
    estimated_price_cents = 0,
    actual_price_cents = 0,
    store_id = null,
    notes = null
  }) {
    const safeCustomName = custom_name ? String(custom_name).trim().slice(0, 150) : null;

    // Impede adicionar o mesmo produto na mesma feira
    const duplicate = this.findDuplicateItem(list_id, product_id, safeCustomName);
    if (duplicate) {
      throw new Error('Este produto já foi adicionado a esta feira.');
    }

    const id = 'item_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const safeQty = Math.max(0.001, Math.min(Number(quantity) || 1, 100000));
    const safeEst = Math.max(0, Math.min(Math.round(Number(estimated_price_cents)) || 0, 1000000000));
    const safeAct = Math.max(0, Math.min(Math.round(Number(actual_price_cents)) || 0, 1000000000));
    const safeNotes = notes ? String(notes).trim().slice(0, 500) : null;

    this.db.prepare(`
      INSERT INTO list_items (
        id, list_id, product_id, custom_name, category_id,
        quantity, unit, estimated_price_cents, actual_price_cents,
        store_id, is_purchased, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      list_id,
      product_id,
      safeCustomName,
      category_id,
      safeQty,
      unit,
      safeEst,
      safeAct,
      store_id,
      safeNotes
    );

    this.touchList(list_id);
    return this.getItemById(id);
  }

  /**
   * Executa a mutação atômica diretamente no SQLite com mesclagem cirúrgica de campos e controle de versão.
   * @param {string} itemId
   * @param {object} fields
   * @returns {object|null}
   */
  atomicMergeItemDirect(itemId, fields) {
    try {
      this.db.exec('BEGIN IMMEDIATE;');

      const current = this.db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
      if (!current) {
        this.db.exec('ROLLBACK;');
        return null;
      }

      // Merging inteligente campo a campo: preserva valores existentes se não informados
      const quantity = fields.quantity !== undefined
        ? ((!Number.isFinite(Number(fields.quantity)) || Number(fields.quantity) === 0)
            ? 1
            : Math.max(0.001, Math.min(100000, Math.abs(Number(fields.quantity)))))
        : current.quantity;

      const unit = fields.unit !== undefined
        ? (String(fields.unit).trim().slice(0, 10) || 'un')
        : current.unit;

      const category_id = fields.category_id !== undefined
        ? fields.category_id
        : current.category_id;

      const custom_name = fields.custom_name !== undefined
        ? (fields.custom_name ? String(fields.custom_name).trim().slice(0, 120) : null)
        : current.custom_name;

      const estimated_price_cents = fields.estimated_price_cents !== undefined
        ? Math.max(0, Math.min(1000000000, Math.round(Number(fields.estimated_price_cents)) || 0))
        : current.estimated_price_cents;

      const actual_price_cents = fields.actual_price_cents !== undefined
        ? Math.max(0, Math.min(1000000000, Math.round(Number(fields.actual_price_cents)) || 0))
        : current.actual_price_cents;

      const store_id = fields.store_id !== undefined
        ? fields.store_id
        : current.store_id;

      const notes = fields.notes !== undefined
        ? (fields.notes ? String(fields.notes).trim().slice(0, 300) : null)
        : current.notes;

      // Fusão e consistência de status de compra
      let is_purchased = current.is_purchased;
      let purchased_at = current.purchased_at;
      let purchased_by_user_id = current.purchased_by_user_id;

      if (fields.is_purchased !== undefined) {
        is_purchased = fields.is_purchased ? 1 : 0;
        purchased_at = is_purchased ? (current.purchased_at || new Date().toISOString()) : null;
        purchased_by_user_id = is_purchased
          ? (fields.purchased_by_user_id || current.purchased_by_user_id || 'usr_default')
          : null;
      }

      const newVersion = (current.version || 0) + 1;

      this.db.prepare(`
        UPDATE list_items
        SET quantity = ?, unit = ?, category_id = ?, custom_name = ?,
            estimated_price_cents = ?, actual_price_cents = ?, store_id = ?, notes = ?,
            is_purchased = ?, purchased_at = ?, purchased_by_user_id = ?,
            version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        quantity, unit, category_id, custom_name,
        estimated_price_cents, actual_price_cents, store_id, notes,
        is_purchased, purchased_at, purchased_by_user_id,
        newVersion, itemId
      );

      this.touchList(current.list_id);
      this.db.exec('COMMIT;');
      return this.getItemById(itemId);
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    }
  }

  updateItem(itemId, fields) {
    return this.atomicMergeItemDirect(itemId, fields);
  }

  toggleItemPurchased(itemId, options = {}) {
    let fields = {};
    if (typeof options === 'boolean') {
      fields = { is_purchased: options ? 1 : 0 };
    } else if (options && typeof options === 'object') {
      fields = { ...options };
      if (options.is_purchased !== undefined) {
        fields.is_purchased = options.is_purchased ? 1 : 0;
      }
    } else {
      const current = this.getItemById(itemId);
      if (current) {
        fields = { is_purchased: current.is_purchased ? 0 : 1 };
      }
    }
    return this.atomicMergeItemDirect(itemId, fields);
  }

  atomicUpdateItem(itemId, fields) {
    return this.mutationQueue.enqueue(itemId, fields);
  }

  atomicToggleItemPurchased(itemId, options = {}) {
    let fields = {};
    if (typeof options === 'boolean') {
      fields = { is_purchased: options ? 1 : 0 };
    } else if (options && typeof options === 'object') {
      fields = { ...options };
      if (options.is_purchased !== undefined) {
        fields.is_purchased = options.is_purchased ? 1 : 0;
      }
    }
    return this.mutationQueue.enqueue(itemId, fields);
  }

  deleteItem(itemId) {
    const item = this.getItemById(itemId);
    if (!item) return false;
    this.db.prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
    this.touchList(item.list_id);
    return true;
  }

  touchList(listId) {
    this.db.prepare('UPDATE shopping_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(listId);
  }

  // ==========================================
  // COMPARTILHAMENTO E PERMISSÕES
  // ==========================================

  getShares(listId) {
    return this.db.prepare(`
      SELECT ls.*, u.name as user_name, u.avatar_color
      FROM list_shares ls
      JOIN users u ON u.id = ls.user_id
      WHERE ls.list_id = ?
    `).all(listId);
  }

  addShare(listId, userId, permission = 'write') {
    const id = 'share_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    this.db.prepare(`
      INSERT OR REPLACE INTO list_shares (id, list_id, user_id, permission)
      VALUES (?, ?, ?, ?)
    `).run(id, listId, userId, permission);
    return this.getShares(listId);
  }

  removeShare(listId, userId) {
    this.db.prepare('DELETE FROM list_shares WHERE list_id = ? AND user_id = ?').run(listId, userId);
    return true;
  }

  getByShareCode(code) {
    if (!code) return null;
    const clean = code.trim().replace(/-/g, '').replace(/\s+/g, '').toUpperCase();
    const row = this.db.prepare("SELECT id FROM shopping_lists WHERE UPPER(REPLACE(share_code, '-', '')) = ?").get(clean);
    if (!row) return null;
    return this.getById(row.id);
  }

  joinByShareCode(code, userId, permission = 'write') {
    const list = this.getByShareCode(code);
    if (!list) return null;
    if (list.owner_id !== userId) {
      this.addShare(list.id, userId, permission);
    }
    return this.getById(list.id);
  }
}
