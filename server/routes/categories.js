import { Router } from 'express';

export function createCategoriesRouter({ categoryRepo }) {
  const router = Router();

  router.get('/', (req, res) => {
    const categories = categoryRepo.getAll();
    res.json(categories);
  });

  return router;
}
