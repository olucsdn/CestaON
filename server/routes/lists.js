import { Router } from 'express';
import { joinRateLimiter, creationRateLimiter } from '../middlewares/rateLimiter.js';
import { sanitizeBudget, sanitizeQuantity, sanitizePrice } from '../middlewares/validators.js';
import { getCallerUserId, hasListPermission, isTestEnvironment } from '../middlewares/auth.js';

export function createListsRouter({ listRepo, userRepo, productRepo, priceRepo, categoryRepo, storeRepo, socketManager }) {
  const router = Router();

  router.get('/', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!callerId) {
      return res.status(401).json({ error: 'Acesso restrito: autenticação mandatória via token de sessão válido' });
    }
    const lists = listRepo.getAll(callerId);
    res.json(lists);
  });

  router.post('/', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'local';
    if (!creationRateLimiter.check(ip)) {
      return res.status(429).json({ error: 'Muitas criações de listas. Aguarde 1 minuto.' });
    }

    const { title, store_id, budget_cents } = req.body;
    const callerId = getCallerUserId(req);
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Título da lista é obrigatório' });
    }
    const budgetRes = sanitizeBudget(budget_cents);
    if (budgetRes.error) {
      return res.status(budgetRes.status).json({ error: budgetRes.error });
    }

    // Validação de integridade do estabelecimento se informado
    if (store_id) {
      if (storeRepo && typeof storeRepo.getById === 'function') {
        const store = storeRepo.getById(store_id);
        if (!store) {
          return res.status(400).json({ error: 'Estabelecimento informado não existe' });
        }
      }
    }

    const list = listRepo.create({
      title: title.trim().slice(0, 35),
      owner_id: callerId,
      store_id: store_id || null,
      budget_cents: budgetRes.value
    });

    if (socketManager) {
      socketManager.broadcastToList(list.id, 'LIST_CREATED', list);
    }
    res.status(201).json(list);
  });

  router.post('/join', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'local';
    if (!joinRateLimiter.check(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas de código. Aguarde 1 minuto.' });
    }

    const { share_code, user_id } = req.body;
    // [AUDIT-FIX SEC-02]: Identidade obtida via getCallerUserId (fail-closed contra body spoofing fora de teste)
    const callerId = isTestEnvironment()
      ? (req.headers['x-user-id'] || user_id || getCallerUserId(req))
      : getCallerUserId(req);

    if (!callerId) {
      return res.status(401).json({ error: 'Você precisa estar autenticado para entrar em uma feira' });
    }

    if (!share_code || typeof share_code !== 'string' || !share_code.trim()) {
      return res.status(400).json({ error: 'Código de compartilhamento é obrigatório' });
    }

    const sanitizedCode = share_code.trim().slice(0, 30).replace(/[^a-zA-Z0-9-]/g, '');
    if (!sanitizedCode) {
      return res.status(400).json({ error: 'Código de compartilhamento inválido' });
    }

    const list = listRepo.joinByShareCode(sanitizedCode, callerId);
    if (!list) {
      return res.status(404).json({ error: 'Feira não existente ou indisponível' });
    }

    joinRateLimiter.reset(ip);

    if (socketManager) {
      socketManager.broadcastToList(list.id, 'LIST_SHARE_UPDATED', list);
    }

    res.json(list);
  });

  router.get('/:id', (req, res) => {
    const callerId = getCallerUserId(req);
    const list = listRepo.getById(req.params.id);
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });

    if (!hasListPermission(listRepo, req.params.id, callerId, 'read')) {
      return res.status(403).json({ error: 'Acesso não autorizado a esta feira' });
    }
    res.json(list);
  });

  router.get('/:id/shares', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!hasListPermission(listRepo, req.params.id, callerId, 'read')) {
      return res.status(403).json({ error: 'Acesso não autorizado aos participantes desta feira' });
    }

    const list = listRepo.getById(req.params.id);
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });
    res.json({
      listId: list.id,
      title: list.title,
      share_code: list.share_code,
      owner: {
        id: list.owner_id,
        name: list.owner_name || 'Dono da Lista',
        avatar_color: list.owner_avatar_color || '#10B981'
      },
      shares: list.shares || []
    });
  });

  router.post('/:id/shares', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!callerId || !hasListPermission(listRepo, req.params.id, callerId, 'admin')) {
      return res.status(403).json({ error: 'Apenas o proprietário ou administrador pode compartilhar a feira' });
    }

    const { user_id, permission } = req.body;
    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ error: 'ID do familiar ou usuário é obrigatório' });
    }
    const list = listRepo.getById(req.params.id);
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });

    if (user_id === list.owner_id) {
      return res.status(400).json({ error: 'O proprietário já possui controle total da feira' });
    }

    const targetUser = userRepo.getById(user_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário familiar não encontrado' });
    }

    const allowedPerms = ['read', 'write', 'admin'];
    const safePerm = allowedPerms.includes(permission) ? permission : 'write';

    listRepo.addShare(req.params.id, user_id, safePerm);
    const updated = listRepo.getById(req.params.id);

    if (socketManager) {
      socketManager.broadcastToList(req.params.id, 'LIST_SHARE_UPDATED', updated);
    }

    res.status(201).json(updated);
  });

  router.delete('/:id/shares/:userId', (req, res) => {
    const callerId = getCallerUserId(req);
    const targetUserId = req.params.userId;
    const isSelf = callerId === targetUserId;

    if (!hasListPermission(listRepo, req.params.id, callerId, 'read')) {
      return res.status(403).json({ error: 'Acesso não autorizado a esta feira' });
    }

    const list = listRepo.getById(req.params.id);
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });

    if (targetUserId === list.owner_id) {
      return res.status(400).json({ error: 'Não é possível remover o proprietário da feira' });
    }

    if (!isSelf && !hasListPermission(listRepo, req.params.id, callerId, 'admin')) {
      return res.status(403).json({ error: 'Apenas o proprietário ou administrador pode remover participantes da feira' });
    }

    listRepo.removeShare(req.params.id, targetUserId);
    const updated = listRepo.getById(req.params.id);

    if (socketManager) {
      if (typeof socketManager.evictUserFromList === 'function') {
        socketManager.evictUserFromList(req.params.id, targetUserId);
      }
      socketManager.broadcastToList(req.params.id, 'LIST_SHARE_UPDATED', updated);
    }

    res.json({ success: true, list: updated });
  });

  router.put('/:id', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!hasListPermission(listRepo, req.params.id, callerId, 'write')) {
      return res.status(403).json({ error: 'Permissão insuficiente para alterar esta feira' });
    }

    const existing = listRepo.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lista não encontrada' });
    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Esta feira já foi finalizada e não pode ser alterada.' });
    }

    const { title, store_id, budget_cents } = req.body;
    let safeTitle;
    if (title !== undefined) {
      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'Título da lista não pode ser vazio' });
      }
      safeTitle = String(title).trim().slice(0, 35);
    }

    let safeStoreId;
    if (store_id !== undefined) {
      safeStoreId = (store_id && typeof store_id === 'string' && store_id.trim()) ? store_id.trim() : null;
      if (safeStoreId && storeRepo && typeof storeRepo.getById === 'function') {
        const store = storeRepo.getById(safeStoreId);
        if (!store) {
          return res.status(400).json({ error: 'Estabelecimento informado não existe' });
        }
      }
    }

    let safeBudget;
    if (budget_cents !== undefined) {
      const budgetRes = sanitizeBudget(budget_cents);
      if (budgetRes.error) {
        return res.status(budgetRes.status).json({ error: budgetRes.error });
      }
      safeBudget = budgetRes.value;
    }

    const list = listRepo.update(req.params.id, {
      title: safeTitle,
      store_id: store_id !== undefined ? safeStoreId : undefined,
      budget_cents: safeBudget
    });
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });

    if (socketManager) {
      socketManager.broadcastToList(req.params.id, 'LIST_UPDATED', list);
    }
    res.json(list);
  });

  router.delete('/:id', (req, res) => {
    const listId = req.params.id;
    const existing = listRepo.getById(listId);
    if (!existing) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const callerId = getCallerUserId(req);
    if (!hasListPermission(listRepo, listId, callerId, 'owner')) {
      return res.status(403).json({ error: 'Apenas o proprietário original pode excluir esta feira' });
    }

    try {
      const success = listRepo.deleteList(listId);
      if (socketManager) {
        socketManager.broadcastToList(listId, 'LIST_DELETED', { listId });
      }
      res.status(200).json({ success, listId });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao excluir lista' });
    }
  });

  router.post('/:id/duplicate', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!hasListPermission(listRepo, req.params.id, callerId, 'read')) {
      return res.status(403).json({ error: 'Acesso negado para duplicar esta feira' });
    }

    const { title } = req.body;
    const safeDuplicateTitle = title ? String(title).trim().slice(0, 35) : undefined;
    const newList = listRepo.duplicate(req.params.id, safeDuplicateTitle, callerId);
    if (!newList) return res.status(404).json({ error: 'Lista original não encontrada' });

    res.status(201).json(newList);
  });

  router.post('/:id/finish', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!hasListPermission(listRepo, req.params.id, callerId, 'write')) {
      return res.status(403).json({ error: 'Permissão insuficiente para finalizar esta feira' });
    }

    try {
      const { store_id, notes } = req.body;
      if (store_id) {
        if (storeRepo && typeof storeRepo.getById === 'function') {
          const store = storeRepo.getById(store_id);
          if (!store) {
            return res.status(400).json({ error: 'Estabelecimento informado não existe' });
          }
        }
      }
      const history = priceRepo.finishShoppingList(req.params.id, store_id, notes);
      const fullList = listRepo.getById(req.params.id);

      if (socketManager) {
        socketManager.broadcastToList(req.params.id, 'LIST_COMPLETED', { history, list: fullList });
      }

      res.status(200).json({ ...history, list: fullList });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id/where-to-buy', (req, res) => {
    const callerId = getCallerUserId(req);
    if (!hasListPermission(listRepo, req.params.id, callerId, 'read')) {
      return res.status(403).json({ error: 'Acesso não autorizado a esta feira' });
    }
    const simulation = priceRepo.simulateWhereToBuy(req.params.id, callerId);
    res.json(simulation);
  });

  router.post('/:id/items', (req, res) => {
    const listId = req.params.id;
    const callerId = getCallerUserId(req);

    if (!hasListPermission(listRepo, listId, callerId, 'write')) {
      return res.status(403).json({ error: 'Permissão insuficiente para adicionar itens nesta feira' });
    }

    const currentList = listRepo.getById(listId);
    if (!currentList) return res.status(404).json({ error: 'Lista não encontrada' });
    if (currentList.status === 'completed') {
      return res.status(400).json({ error: 'Não é possível adicionar itens a uma feira já finalizada.' });
    }

    const {
      name,
      product_id,
      category_id,
      quantity,
      unit,
      estimated_price_cents,
      actual_price_cents,
      store_id,
      notes
    } = req.body;

    if (store_id) {
      if (storeRepo && typeof storeRepo.getById === 'function') {
        const store = storeRepo.getById(store_id);
        if (!store) {
          return res.status(400).json({ error: 'Estabelecimento informado não existe' });
        }
      }
    }

    if (category_id) {
      if (categoryRepo && typeof categoryRepo.getById === 'function') {
        const cat = categoryRepo.getById(category_id);
        if (!cat) {
          return res.status(400).json({ error: 'Categoria informada não existe' });
        }
      }
    }

    const finalQuantity = sanitizeQuantity(quantity);
    const finalEstimatedCents = sanitizePrice(estimated_price_cents);
    const finalActualCents = sanitizePrice(actual_price_cents);

    const safeName = name ? String(name).trim().slice(0, 120) : null;
    const safeNotes = notes ? String(notes).trim().slice(0, 300) : null;
    const safeUnit = unit ? String(unit).trim().slice(0, 10) : 'un';

    let finalProductId = product_id;
    let finalCategoryId = category_id;

    if (!finalProductId && safeName) {
      const prod = productRepo.getOrCreate(safeName, category_id, safeUnit);
      finalProductId = prod.id;
      finalCategoryId = prod.category_id;
    }

    if (!finalProductId) {
      return res.status(400).json({ error: 'Produto ou nome é obrigatório' });
    }

    if (!finalCategoryId) {
      const prod = productRepo.getById(finalProductId);
      finalCategoryId = prod ? prod.category_id : 'cat_outros';
    }

    // Validação de duplicidade: proíbe adicionar o mesmo produto na mesma feira
    const duplicate = listRepo.findDuplicateItem(listId, finalProductId, safeName);
    if (duplicate) {
      return res.status(400).json({ error: 'Este produto já foi adicionado a esta feira.' });
    }

    try {
      const item = listRepo.addItem({
        list_id: listId,
        product_id: finalProductId,
        custom_name: safeName,
        category_id: finalCategoryId,
        quantity: finalQuantity,
        unit: safeUnit,
        estimated_price_cents: finalEstimatedCents,
        actual_price_cents: finalActualCents,
        store_id: store_id || null,
        notes: safeNotes
      });

      const fullList = listRepo.getById(listId);

      if (socketManager) {
        socketManager.broadcastToList(listId, 'ITEM_ADDED', { item, stats: fullList.stats });
      }

      res.status(201).json({ item, stats: fullList.stats });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Erro ao adicionar item à feira' });
    }
  });

  return router;
}
