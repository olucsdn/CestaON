/**
 * Repositório de Categorias / Setores da Feira
 */
export class CategoryRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  getAll() {
    return this.db.prepare('SELECT * FROM categories ORDER BY display_order ASC, name ASC').all();
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  create({ id, name, icon, color, display_order, is_default = 0 }) {
    const finalId = id || 'cat_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    this.db.prepare(`
      INSERT INTO categories (id, name, icon, color, display_order, is_default)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(finalId, name, icon, color, display_order || 99, is_default ? 1 : 0);
    return this.getById(finalId);
  }
}
