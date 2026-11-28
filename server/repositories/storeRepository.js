/**
 * Repositório de Estabelecimentos Comerciais
 */
export class StoreRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  getAll() {
    return this.db.prepare('SELECT * FROM stores ORDER BY name ASC').all();
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  }

  create({ id, name, address_notes = '' }) {
    const finalId = id || 'store_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const safeName = String(name || '').trim().slice(0, 100);
    const safeNotes = String(address_notes || '').trim().slice(0, 300);
    this.db.prepare(`
      INSERT INTO stores (id, name, address_notes)
      VALUES (?, ?, ?)
    `).run(finalId, safeName, safeNotes);
    return this.getById(finalId);
  }

  getOrCreateByName(name, address_notes = '') {
    const trimmed = String(name || '').trim().slice(0, 100);
    const existing = this.db.prepare('SELECT * FROM stores WHERE LOWER(name) = LOWER(?)').get(trimmed);
    if (existing) return existing;
    return this.create({ name: trimmed, address_notes });
  }
}
