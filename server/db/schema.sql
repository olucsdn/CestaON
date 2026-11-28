-- ==============================================================================
-- SCHEMA RELACIONAL SQLITE — FEIRA INTELIGENTE
-- Modo WAL e chaves estrangeiras ativadas por padrão na conexão.
-- Todos os valores monetários armazenados em INTEIROS (centavos) para precisão.
-- ==============================================================================

-- 1. Usuários e Perfis Locais
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    pin_hash TEXT,
    avatar_color TEXT DEFAULT '#10B981',
    recovery_key_hash TEXT,
    security_question TEXT,
    security_answer_hash TEXT,
    token_version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Categorias / Setores do Supermercado e Feira
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER DEFAULT 1
);

-- 3. Estabelecimentos Comerciais
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    address_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Catálogo de Produtos
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    default_unit TEXT DEFAULT 'un',
    is_favorite INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Listas de Compras
CREATE TABLE IF NOT EXISTS shopping_lists (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
    budget_cents INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('active', 'completed', 'archived')) DEFAULT 'active',
    share_code TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- 6. Permissões de Compartilhamento
CREATE TABLE IF NOT EXISTS list_shares (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT CHECK(permission IN ('read', 'write', 'admin')) DEFAULT 'write',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(list_id, user_id)
);

-- 7. Itens da Lista de Compras
CREATE TABLE IF NOT EXISTS list_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    custom_name TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    quantity REAL NOT NULL DEFAULT 1.0,
    unit TEXT NOT NULL DEFAULT 'un',
    estimated_price_cents INTEGER DEFAULT 0,
    actual_price_cents INTEGER DEFAULT 0,
    store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
    is_purchased INTEGER DEFAULT 0,
    purchased_at DATETIME,
    purchased_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    notes TEXT,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Histórico de Feiras Finalizadas
CREATE TABLE IF NOT EXISTS purchase_history (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE RESTRICT,
    store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
    total_spent_cents INTEGER NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    budget_at_time_cents INTEGER DEFAULT 0,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- 9. Histórico de Preços para Análise, Tendências e Comparativos
CREATE TABLE IF NOT EXISTS price_history (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    list_id TEXT REFERENCES shopping_lists(id) ON DELETE SET NULL,
    price_cents INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    normalized_price_per_base_unit_cents INTEGER NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabela de Operações Processadas (Idempotência da Fila Offline - Multi-Tenant)
CREATE TABLE IF NOT EXISTS processed_operations (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT,
  response_status INTEGER NOT NULL,
  response_body TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabela de Códigos de Verificação por E-mail (Cadastro e Recuperação)
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices Estratégicos
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup ON email_verifications(email, purpose);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_purchased ON list_items(list_id, is_purchased);
CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_unique_prod ON list_items(list_id, product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product_store ON price_history(product_id, store_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_purchase_history_completed ON purchase_history(completed_at);
CREATE INDEX IF NOT EXISTS idx_processed_operations_created ON processed_operations(created_at);
