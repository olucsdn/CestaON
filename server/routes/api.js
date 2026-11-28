/**
 * Roteador Central da API REST (Agregador Modular)
 * 
 * Orquestra e desacopla os domínios da aplicação através de submódulos dedicados:
 * - /users       -> createUsersRouter
 * - /categories  -> createCategoriesRouter
 * - /stores      -> createStoresRouter
 * - /products    -> createProductsRouter
 * - /lists       -> createListsRouter
 * - /items       -> createItemsRouter
 * - /history     -> createHistoryRouter
 * - /tools       -> createToolsRouter
 */

import { Router } from 'express';
import { createIdempotencyMiddleware } from '../middlewares/idempotency.js';
import { createTokenAuthenticator, requireAuth } from '../middlewares/auth.js';
import { UserRepository } from '../repositories/userRepository.js';
import { CategoryRepository } from '../repositories/categoryRepository.js';
import { StoreRepository } from '../repositories/storeRepository.js';
import { ProductRepository } from '../repositories/productRepository.js';
import { ListRepository } from '../repositories/listRepository.js';
import { PriceRepository } from '../repositories/priceRepository.js';

import { createUsersRouter } from './users.js';
import { createCategoriesRouter } from './categories.js';
import { createStoresRouter } from './stores.js';
import { createProductsRouter } from './products.js';
import { createListsRouter } from './lists.js';
import { createItemsRouter } from './items.js';
import { createHistoryRouter } from './history.js';
import { createToolsRouter } from './tools.js';

export function createApiRouter(db, socketManager) {
  const router = Router();

  const userRepo = new UserRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const storeRepo = new StoreRepository(db);
  const productRepo = new ProductRepository(db);
  const listRepo = new ListRepository(db);
  const priceRepo = new PriceRepository(db);

  // [AUDIT-FIX SEC-04]: Prevenção de cache defensiva em todos os endpoints REST dinâmicos da API
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Middleware de Autenticação Global: extrai e valida tokens Bearer e token_version no banco (popula req.user)
  router.use(createTokenAuthenticator(db));

  // [AUDIT-FIX #1, #4 & SEC-03]: Middleware de Idempotência e Durabilidade Atômica para API e Fila Offline (SyncManager)
  // Montado APÓS authenticateToken para que req.user esteja disponível no isolamento de replay multi-tenant
  router.use(createIdempotencyMiddleware(db));

  router.use('/users', createUsersRouter({ userRepo }));
  router.use('/categories', createCategoriesRouter({ categoryRepo }));
  router.use('/stores', createStoresRouter({ storeRepo }));
  router.use('/products', createProductsRouter({ productRepo, categoryRepo }));
  router.use('/lists', requireAuth, createListsRouter({ listRepo, userRepo, productRepo, priceRepo, categoryRepo, storeRepo, socketManager }));
  router.use('/items', requireAuth, createItemsRouter({ listRepo, socketManager, categoryRepo, storeRepo }));
  router.use('/history', requireAuth, createHistoryRouter({ priceRepo, listRepo }));
  router.use('/tools', createToolsRouter({ priceRepo }));

  // Middleware centralizado de tratamento de erros da API:
  // Garante contenção de vazamento de informações e finalização determinística de requisições
  router.use((err, req, res, next) => {
    if (!res.headersSent && !res.writableEnded) {
      const isCorsError = err.message?.includes('CORS');
      const statusCode = err.status || (isCorsError ? 403 : 500);
      return res.status(statusCode).json({
        error: isCorsError ? 'Acesso bloqueado por política de segurança de origem (CORS)' : 'Erro interno seguro do servidor'
      });
    }
    next(err);
  });

  return router;
}
