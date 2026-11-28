import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';

export function createStoresRouter({ storeRepo }) {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const stores = storeRepo.getAll();
    res.json(stores);
  });

  router.post('/', requireAuth, (req, res) => {
    const { name, address_notes } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome do estabelecimento é obrigatório' });
    }
    const safeName = String(name).trim().slice(0, 100);
    const safeNotes = address_notes ? String(address_notes).trim().slice(0, 300) : '';
    const store = storeRepo.getOrCreateByName(safeName, safeNotes);
    res.status(201).json(store);
  });

  return router;
}
