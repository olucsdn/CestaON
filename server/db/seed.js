import crypto from 'node:crypto';

export const DEFAULT_CATEGORIES = [
  { id: 'cat_hortifruti', name: 'Hortifrúti', icon: 'Apple', color: '#10B981', display_order: 1 },
  { id: 'cat_acougue', name: 'Açougue & Peixaria', icon: 'Beef', color: '#EF4444', display_order: 2 },
  { id: 'cat_laticinios', name: 'Laticínios & Frios', icon: 'Milk', color: '#0284C7', display_order: 3 },
  { id: 'cat_graos', name: 'Grãos, Massas & Mercearia', icon: 'Wheat', color: '#EAB308', display_order: 4 },
  { id: 'cat_padaria', name: 'Padaria & Sobremesas', icon: 'Croissant', color: '#EA580C', display_order: 5 },
  { id: 'cat_bebidas', name: 'Bebidas', icon: 'Wine', color: '#8B5CF6', display_order: 6 },
  { id: 'cat_limpeza', name: 'Limpeza & Lavanderia', icon: 'Sparkles', color: '#0D9488', display_order: 7 },
  { id: 'cat_higiene', name: 'Higiene & Cuidados', icon: 'HeartHandshake', color: '#EC4899', display_order: 8 },
  { id: 'cat_outros', name: 'Outros', icon: 'Package', color: '#64748B', display_order: 9 }
];

export const INITIAL_PRODUCTS = [
  // Grãos e Mercearia
  { name: 'Arroz', category_id: 'cat_graos', default_unit: 'kg', is_favorite: 1 },
  { name: 'Feijão', category_id: 'cat_graos', default_unit: 'kg', is_favorite: 1 },
  { name: 'Macarrão', category_id: 'cat_graos', default_unit: 'pct', is_favorite: 0 },
  { name: 'Óleo', category_id: 'cat_graos', default_unit: 'un', is_favorite: 1 },
  { name: 'Azeite', category_id: 'cat_graos', default_unit: 'un', is_favorite: 0 },
  { name: 'Açúcar', category_id: 'cat_graos', default_unit: 'kg', is_favorite: 1 },
  { name: 'Sal', category_id: 'cat_graos', default_unit: 'kg', is_favorite: 0 },
  { name: 'Café', category_id: 'cat_graos', default_unit: 'pct', is_favorite: 1 },
  { name: 'Farinha de Trigo', category_id: 'cat_graos', default_unit: 'kg', is_favorite: 0 },
  { name: 'Molho de Tomate', category_id: 'cat_graos', default_unit: 'un', is_favorite: 0 },

  // Hortifrúti
  { name: 'Tomate', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 1 },
  { name: 'Cebola', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 1 },
  { name: 'Alho', category_id: 'cat_hortifruti', default_unit: 'un', is_favorite: 1 },
  { name: 'Batata', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 1 },
  { name: 'Cenoura', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 0 },
  { name: 'Banana', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 1 },
  { name: 'Maçã', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 0 },
  { name: 'Alface', category_id: 'cat_hortifruti', default_unit: 'un', is_favorite: 0 },
  { name: 'Limão', category_id: 'cat_hortifruti', default_unit: 'kg', is_favorite: 0 },

  // Laticínios e Frios
  { name: 'Leite', category_id: 'cat_laticinios', default_unit: 'L', is_favorite: 1 },
  { name: 'Manteiga', category_id: 'cat_laticinios', default_unit: 'un', is_favorite: 1 },
  { name: 'Queijo', category_id: 'cat_laticinios', default_unit: 'g', is_favorite: 1 },
  { name: 'Presunto', category_id: 'cat_laticinios', default_unit: 'g', is_favorite: 0 },
  { name: 'Ovos', category_id: 'cat_laticinios', default_unit: 'dz', is_favorite: 1 },
  { name: 'Iogurte', category_id: 'cat_laticinios', default_unit: 'un', is_favorite: 0 },

  // Açougue
  { name: 'Peito de Frango', category_id: 'cat_acougue', default_unit: 'kg', is_favorite: 1 },
  { name: 'Carne Moída', category_id: 'cat_acougue', default_unit: 'kg', is_favorite: 1 },
  { name: 'Alcatra', category_id: 'cat_acougue', default_unit: 'kg', is_favorite: 0 },

  // Limpeza
  { name: 'Detergente', category_id: 'cat_limpeza', default_unit: 'un', is_favorite: 1 },
  { name: 'Sabão em Pó', category_id: 'cat_limpeza', default_unit: 'kg', is_favorite: 1 },
  { name: 'Amaciante', category_id: 'cat_limpeza', default_unit: 'L', is_favorite: 0 },
  { name: 'Água Sanitária', category_id: 'cat_limpeza', default_unit: 'L', is_favorite: 1 },
  { name: 'Desinfetante', category_id: 'cat_limpeza', default_unit: 'L', is_favorite: 0 },
  { name: 'Esponja', category_id: 'cat_limpeza', default_unit: 'pct', is_favorite: 0 },

  // Higiene
  { name: 'Sabonete', category_id: 'cat_higiene', default_unit: 'un', is_favorite: 1 },
  { name: 'Creme Dental', category_id: 'cat_higiene', default_unit: 'un', is_favorite: 1 },
  { name: 'Papel Higiênico', category_id: 'cat_higiene', default_unit: 'pct', is_favorite: 1 },
  { name: 'Shampoo', category_id: 'cat_higiene', default_unit: 'un', is_favorite: 0 }
];

// Nomes legados redundantes substituídos pelos nomes simplificados acima.
// Usados no boot para desmarcar duplicatas de favoritos em bancos já existentes (Turso/SQLite) sem quebrar histórico.
export const LEGACY_SEEDED_PRODUCT_NAMES = [
  'Feijão Carioca',
  'Macarrão Espaguete',
  'Óleo de Soja',
  'Azeite de Oliva',
  'Açúcar Refinado',
  'Sal Refinado',
  'Café em Pó',
  'Batata Inglesa',
  'Banana Prata',
  'Maçã Fuji',
  'Alface Crespa',
  'Limão Taiti',
  'Leite Integral',
  'Queijo Mussarela',
  'Presunto Fatiado',
  'Ovos Brancos',
  'Iogurte Natural',
  'Carne Moída (Patinho)',
  'Alcatra Bovina',
  'Detergente Líquido',
  'Amaciante de Roupas',
  'Esponja de Aço / Pia',
  'Sabonete em Barra',
  'Papel Higiênico (12 rolos)'
];

export const INITIAL_STORES = [
  { id: 'store_atacadao', name: 'Atacadão', address_notes: 'Loja Regional' },
  { id: 'store_super_dia', name: 'Supermercado', address_notes: 'Bairro' },
  { id: 'store_hortifruti_local', name: 'Feira Livre / Sacolão', address_notes: 'Centro' }
];

/**
 * Popula o banco com sementes iniciais se estiver vazio.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function seedDatabase(db) {
  // 1. Categorias
  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, icon, color, display_order, is_default)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET color = excluded.color, icon = excluded.icon, name = excluded.name
  `);
  for (const cat of DEFAULT_CATEGORIES) {
    insertCat.run(cat.id, cat.name, cat.icon, cat.color, cat.display_order);
  }

  // 2. Usuário Local Padrão
  const checkUser = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (checkUser.count === 0) {
    db.prepare(`
      INSERT INTO users (id, name, avatar_color, email)
      VALUES (?, ?, ?, ?)
    `).run('usr_default', 'Meu Usuário', '#10B981', 'visitante@cestaon.app');
  }

  // 3. Estabelecimentos
  const insertStore = db.prepare(`
    INSERT INTO stores (id, name, address_notes)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, address_notes = excluded.address_notes
  `);
  for (const store of INITIAL_STORES) {
    insertStore.run(store.id, store.name, store.address_notes);
  }

  // 4. Catálogo Inicial de Produtos
  const insertProd = db.prepare(`
    INSERT OR IGNORE INTO products (id, name, category_id, default_unit, is_favorite)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const prod of INITIAL_PRODUCTS) {
    const id = 'prod_' + crypto.createHash('md5').update(prod.name.toLowerCase()).digest('hex').substring(0, 10);
    insertProd.run(id, prod.name, prod.category_id, prod.default_unit, prod.is_favorite);
  }

  // 5. Limpeza segura de nomes legados redundantes (evita duplicatas nos favoritos sem afetar histórico/listas)
  const unfavLegacy = db.prepare('UPDATE products SET is_favorite = 0 WHERE id = ?');
  const deleteUnusedLegacy = db.prepare(`
    DELETE FROM products
    WHERE id = ?
      AND id NOT IN (SELECT product_id FROM list_items WHERE product_id IS NOT NULL)
      AND id NOT IN (SELECT product_id FROM price_history WHERE product_id IS NOT NULL)
  `);
  for (const legacyName of LEGACY_SEEDED_PRODUCT_NAMES) {
    const legacyId = 'prod_' + crypto.createHash('md5').update(legacyName.toLowerCase()).digest('hex').substring(0, 10);
    unfavLegacy.run(legacyId);
    deleteUnusedLegacy.run(legacyId);
  }
}

/**
 * Popula o banco Turso LibSQL com as sementes essenciais de produção.
 * @param {import('@libsql/client').Client} client
 */
export async function seedLibsqlDatabase(client) {
  // 1. Categorias
  const catStatements = DEFAULT_CATEGORIES.map((cat) => ({
    sql: `INSERT INTO categories (id, name, icon, color, display_order, is_default)
          VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET color = excluded.color, icon = excluded.icon, name = excluded.name`,
    args: [cat.id, cat.name, cat.icon, cat.color, cat.display_order]
  }));
  await client.batch(catStatements, 'write');

  // 2. Usuário Inicial Padrão
  const checkUser = await client.execute('SELECT COUNT(*) as count FROM users');
  const count = Number(checkUser.rows[0]?.count || 0);
  if (count === 0) {
    await client.execute({
      sql: 'INSERT INTO users (id, name, avatar_color, email) VALUES (?, ?, ?, ?)',
      args: ['usr_default', 'Meu Usuário', '#10B981', 'visitante@cestaon.app']
    });
  }

  // 3. Estabelecimentos
  const storeStatements = INITIAL_STORES.map((store) => ({
    sql: `INSERT INTO stores (id, name, address_notes)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, address_notes = excluded.address_notes`,
    args: [store.id, store.name, store.address_notes]
  }));
  await client.batch(storeStatements, 'write');

  // 4. Catálogo Inicial de Produtos
  const prodStatements = INITIAL_PRODUCTS.map((prod) => {
    const id = 'prod_' + crypto.createHash('md5').update(prod.name.toLowerCase()).digest('hex').substring(0, 10);
    return {
      sql: 'INSERT OR IGNORE INTO products (id, name, category_id, default_unit, is_favorite) VALUES (?, ?, ?, ?, ?)',
      args: [id, prod.name, prod.category_id, prod.default_unit, prod.is_favorite]
    };
  });
  await client.batch(prodStatements, 'write');

  // 5. Limpeza segura de nomes legados redundantes no Turso LibSQL (sem quebrar chaves estrangeiras)
  const legacyStatements = LEGACY_SEEDED_PRODUCT_NAMES.flatMap((legacyName) => {
    const legacyId = 'prod_' + crypto.createHash('md5').update(legacyName.toLowerCase()).digest('hex').substring(0, 10);
    return [
      { sql: 'UPDATE products SET is_favorite = 0 WHERE id = ?', args: [legacyId] },
      {
        sql: `DELETE FROM products
              WHERE id = ?
                AND id NOT IN (SELECT product_id FROM list_items WHERE product_id IS NOT NULL)
                AND id NOT IN (SELECT product_id FROM price_history WHERE product_id IS NOT NULL)`,
        args: [legacyId]
      }
    ];
  });
  await client.batch(legacyStatements, 'write');
}
