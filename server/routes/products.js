import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';

export function createProductsRouter({ productRepo, categoryRepo }) {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const products = productRepo.getAll();
    res.json(products);
  });

  router.get('/favorites', requireAuth, (req, res) => {
    const favorites = productRepo.getFavorites();
    res.json(favorites);
  });

  router.get('/search', requireAuth, (req, res) => {
    const { q, limit } = req.query;
    if (!q) return res.json([]);
    const results = productRepo.search(q, limit ? parseInt(limit, 10) : 10);
    res.json(results);
  });

  router.post('/', requireAuth, (req, res) => {
    const { name, category_id, default_unit, is_favorite } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório' });
    }

    const safeName = name.trim().slice(0, 100);
    const safeUnit = default_unit ? String(default_unit).trim().slice(0, 10) : 'un';

    // Validação de integridade referencial de categoria
    if (category_id) {
      if (categoryRepo && typeof categoryRepo.getById === 'function') {
        const cat = categoryRepo.getById(category_id);
        if (!cat) {
          return res.status(400).json({ error: 'Categoria informada não existe' });
        }
      }
    }

    const product = productRepo.create({
      name: safeName,
      category_id: category_id || undefined,
      default_unit: safeUnit,
      is_favorite: Boolean(is_favorite)
    });
    res.status(201).json(product);
  });

  router.post('/:id/toggle-favorite', requireAuth, (req, res) => {
    const product = productRepo.toggleFavorite(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  });

  return router;
}
