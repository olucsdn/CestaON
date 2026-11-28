import { Router } from 'express';
import { validatePackageCompareInput } from '../middlewares/validators.js';

export function createToolsRouter({ priceRepo }) {
  const router = Router();

  router.post('/compare-packages', (req, res) => {
    const { optionA, optionB } = req.body;
    const validated = validatePackageCompareInput({ optionA, optionB });
    if (validated.error) {
      return res.status(validated.status).json({ error: validated.error });
    }

    const result = priceRepo.comparePackageSizes({
      optionA: validated.optionA,
      optionB: validated.optionB
    });
    res.json(result);
  });

  return router;
}
