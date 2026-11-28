import { Router } from 'express';
import { sanitizeQuantity, sanitizePrice } from '../middlewares/validators.js';
import { getCallerUserId, hasListPermission } from '../middlewares/auth.js';

export function createItemsRouter({ listRepo, socketManager, categoryRepo, storeRepo }) {
  const router = Router();

  router.put('/:id', async (req, res) => {
    try {
      const item = listRepo.getItemById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Item não encontrado' });

      const callerId = getCallerUserId(req);
      if (!hasListPermission(listRepo, item.list_id, callerId, 'write')) {
        return res.status(403).json({ error: 'Permissão insuficiente para editar este item' });
      }

      const currentList = listRepo.getById(item.list_id);
      if (currentList?.status === 'completed') {
        return res.status(400).json({ error: 'Não é possível editar itens de uma feira já finalizada.' });
      }

      const {
        quantity,
        estimated_price_cents,
        actual_price_cents,
        custom_name,
        notes,
        unit,
        category_id,
        store_id
      } = req.body;

      const updates = {};
      if (quantity !== undefined) {
        updates.quantity = sanitizeQuantity(quantity);
      }
      if (estimated_price_cents !== undefined) {
        updates.estimated_price_cents = sanitizePrice(estimated_price_cents);
      }
      if (actual_price_cents !== undefined) {
        updates.actual_price_cents = sanitizePrice(actual_price_cents);
      }
      if (custom_name !== undefined) {
        const safeCustomName = custom_name ? String(custom_name).trim().slice(0, 120) : null;
        if (safeCustomName) {
          const duplicate = listRepo.findDuplicateItem(item.list_id, null, safeCustomName, item.id);
          if (duplicate) {
            return res.status(400).json({ error: 'Já existe outro produto com este nome nesta feira.' });
          }
        }
        updates.custom_name = safeCustomName;
      }
      if (notes !== undefined) {
        updates.notes = notes ? String(notes).trim().slice(0, 300) : null;
      }
      if (unit !== undefined) {
        updates.unit = String(unit).trim().slice(0, 10) || 'un';
      }
      if (category_id !== undefined) {
        if (!category_id || (categoryRepo && !categoryRepo.getById(category_id))) {
          return res.status(400).json({ error: 'Categoria informada não existe' });
        }
        updates.category_id = category_id;
      }
      if (store_id !== undefined) {
        const safeStoreId = store_id || null;
        if (safeStoreId && (storeRepo && !storeRepo.getById(safeStoreId))) {
          return res.status(400).json({ error: 'Estabelecimento informado não existe' });
        }
        updates.store_id = safeStoreId;
      }

      // Executa mutação via Fila Atômica com Merging Concorrente por Item
      const updatedItem = await listRepo.atomicUpdateItem(req.params.id, updates);
      const fullList = listRepo.getById(item.list_id);

      if (socketManager) {
        socketManager.broadcastToList(item.list_id, 'ITEM_UPDATED', { item: updatedItem, stats: fullList?.stats });
      }

      res.json({ item: updatedItem, stats: fullList?.stats });
    } catch (err) {
      console.error('Erro em PUT /items/:id:', err);
      res.status(500).json({ error: 'Erro interno ao atualizar item' });
    }
  });

  router.put('/:id/toggle', async (req, res) => {
    try {
      const item = listRepo.getItemById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Item não encontrado' });

      const callerId = getCallerUserId(req);
      if (!hasListPermission(listRepo, item.list_id, callerId, 'write')) {
        return res.status(403).json({ error: 'Permissão insuficiente para alterar este item' });
      }

      const currentList = listRepo.getById(item.list_id);
      if (currentList?.status === 'completed') {
        return res.status(400).json({ error: 'Não é possível alterar itens de uma feira já finalizada.' });
      }

      const { is_purchased, actual_price_cents } = req.body;
      const safePrice = actual_price_cents !== undefined
        ? Math.max(0, Math.min(parseInt(actual_price_cents, 10) || 0, 1000000000))
        : undefined;

      // Executa mutação de compra via Fila Atômica com Merging Concorrente por Item
      const toggled = await listRepo.atomicToggleItemPurchased(req.params.id, {
        is_purchased,
        actual_price_cents: safePrice,
        purchased_by_user_id: callerId
      });

      const fullList = listRepo.getById(item.list_id);

      if (socketManager) {
        socketManager.broadcastToList(item.list_id, 'ITEM_TOGGLED', { item: toggled, stats: fullList?.stats });
      }

      res.json({ item: toggled, stats: fullList?.stats });
    } catch (err) {
      console.error('Erro em PUT /items/:id/toggle:', err);
      res.status(500).json({ error: 'Erro interno ao alterar estado de compra do item' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const item = listRepo.getItemById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Item não encontrado' });

      const callerId = getCallerUserId(req);
      if (!hasListPermission(listRepo, item.list_id, callerId, 'write')) {
        return res.status(403).json({ error: 'Permissão insuficiente para remover este item' });
      }

      const currentList = listRepo.getById(item.list_id);
      if (currentList?.status === 'completed') {
        return res.status(400).json({ error: 'Não é possível remover itens de uma feira já finalizada.' });
      }

      const listId = item.list_id;
      listRepo.deleteItem(req.params.id);
      const fullList = listRepo.getById(listId);

      if (socketManager) {
        socketManager.broadcastToList(listId, 'ITEM_DELETED', { itemId: req.params.id, stats: fullList?.stats });
      }

      res.json({ success: true, stats: fullList?.stats });
    } catch (err) {
      console.error('Erro em DELETE /items/:id:', err);
      res.status(500).json({ error: 'Erro interno ao remover item' });
    }
  });

  return router;
}
