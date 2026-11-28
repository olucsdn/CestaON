import { Router } from 'express';
import { getCallerUserId, hasListPermission } from '../middlewares/auth.js';

export function createHistoryRouter({ priceRepo, listRepo }) {
  const router = Router();

  router.get('/', (req, res) => {
    const callerId = getCallerUserId(req);
    const history = priceRepo.getAllPurchaseHistory(callerId);
    res.json(history);
  });

  router.get('/compare/:id', (req, res) => {
    const callerId = getCallerUserId(req);
    const history = priceRepo.getPurchaseHistoryById(req.params.id);
    if (!history) return res.status(404).json({ error: 'Registro de feira não encontrado' });

    if (!hasListPermission(listRepo, history.list_id, callerId, 'read')) {
      return res.status(403).json({ error: 'Acesso não autorizado a esta comparação' });
    }

    const { previousId } = req.query;
    if (previousId) {
      const prevHistory = priceRepo.getPurchaseHistoryById(previousId);
      if (prevHistory && !hasListPermission(listRepo, prevHistory.list_id, callerId, 'read')) {
        return res.status(403).json({ error: 'Acesso não autorizado ao histórico comparado' });
      }
    }

    const comparison = priceRepo.compareShoppingLists(req.params.id, previousId || null);
    if (!comparison) return res.status(404).json({ error: 'Registro de feira não encontrado' });
    res.json(comparison);
  });

  router.get('/trends', (req, res) => {
    const callerId = getCallerUserId(req);
    const productIds = req.query.products ? req.query.products.split(',') : [];
    const trends = priceRepo.getMonthlyPriceTrends(productIds, callerId);
    res.json(trends);
  });

  return router;
}
