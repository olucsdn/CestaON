import crypto from 'node:crypto';

// Heurísticas de categorização automática baseadas em palavras-chave (100% local e custo zero)
const KEYWORD_CATEGORY_MAP = [
  {
    categoryId: 'cat_acougue',
    keywords: [
      // Bovinos
      'carne', 'carne moida', 'picanha', 'alcatra', 'contrafile', 'contra file', 'file mignon',
      'maminha', 'fraldinha', 'patinho', 'coxao', 'coxao mole', 'coxao duro', 'acem', 'musculo',
      'lagarto', 'cupim', 'costela', 'bife', 'bife ancho', 'chorizo', 'churrasco', 'figado',
      'rabada', 'mocoto', 'paleta', 'ossobuco', 'carne seca', 'charque', 'jaba', 'carne de sol',
      // Aves
      'frango', 'peito de frango', 'file de frango', 'coxa', 'sobrecoxa', 'asa de frango',
      'drumet', 'sassami', 'coracao de frango', 'moela', 'chester',
      // Suínos & Embutidos de açougue
      'porco', 'suino', 'pernil', 'lombo', 'bisteca', 'costelinha', 'panceta', 'toucinho',
      'bacon', 'linguica', 'calabresa', 'toscana', 'paio', 'salsicha', 'hamburguer', 'nuggets',
      'empanado', 'almondega', 'kibe',
      // Peixes & Frutos do Mar
      'peixe', 'file de peixe', 'tilapia', 'salmao', 'bacalhau', 'merluza', 'pescada', 'cacao',
      'pintado', 'tambaqui', 'truta', 'robalo', 'camarao', 'lula', 'polvo', 'marisco', 'mexilhao'
    ]
  },
  {
    categoryId: 'cat_laticinios',
    keywords: [
      // Leites & Derivados
      'leite', 'leite integral', 'leite desnatado', 'leite semidesnatado', 'leite em po',
      'leite fermentado', 'yakult', 'bebida lactea', 'iogurte', 'iogurte natural', 'iogurte grego',
      'iogurte de', 'coalhada', 'kefir', 'manteiga', 'margarina', 'nata', 'chantilly',
      'creme de leite', 'leite condensado',
      // Queijos
      'queijo', 'mussarela', 'mucarela', 'queijo prato', 'queijo minas', 'queijo coalho',
      'queijo branco', 'queijo ralado', 'parmesao', 'provolone', 'gorgonzola', 'cheddar',
      'brie', 'camembert', 'gouda', 'ricota', 'cottage', 'cream cheese', 'requeijao',
      'catupiry', 'polenguinho',
      // Frios & Ovos
      'presunto', 'apresuntado', 'mortadela', 'salame', 'peito de peru', 'blanquet',
      'lombo canadense', 'pate', 'ovo', 'ovos'
    ]
  },
  {
    categoryId: 'cat_hortifruti',
    keywords: [
      // Legumes & Verduras
      'tomate', 'tomate cereja', 'cebola', 'cebola roxa', 'alho', 'batata', 'batata doce',
      'batata baroa', 'mandioquinha', 'mandioca', 'aipim', 'macaxeira', 'inhame', 'cenoura',
      'beterraba', 'chuchu', 'abobora', 'abobrinha', 'berinjela', 'jilo', 'quiabo', 'vagem',
      'pepino', 'pimentao', 'pimenta', 'milho verde', 'brocolis', 'couve', 'couve flor',
      'repolho', 'alface', 'rucula', 'agriao', 'espinafre', 'acelga', 'escarola', 'chicoria',
      'alho poro', 'salsao', 'aipo', 'rabanete', 'nabo', 'gengibre', 'cogumelo', 'champignon',
      'shimeji', 'shiitake', 'hortela', 'salsinha', 'salsa', 'cebolinha', 'coentro',
      'manjericao', 'alecrim', 'cheiro verde',
      // Frutas
      'banana', 'maca', 'pera', 'uva', 'laranja', 'tangerina', 'mexerica', 'pokan', 'limao',
      'abacaxi', 'manga', 'mamao', 'melancia', 'melao', 'abacate', 'morango', 'kiwi', 'ameixa',
      'pessego', 'nectarina', 'caqui', 'goiaba', 'maracuja', 'coco', 'coco verde', 'acerola',
      'caju', 'jabuticaba', 'pitaya', 'framboesa', 'mirtilo', 'amora', 'cereja', 'figo', 'roma',
      'jaca', 'graviola', 'carambola', 'lichia'
    ]
  },
  {
    categoryId: 'cat_graos',
    keywords: [
      // Grãos & Farinhas
      'arroz', 'feijao', 'lentilha', 'grao de bico', 'ervilha', 'soja', 'milho', 'pipoca',
      'canjica', 'quinoa', 'chia', 'linhaca', 'aveia', 'granola', 'cereal', 'sucrilhos',
      'farinha', 'farinha de trigo', 'farinha de mandioca', 'farinha de rosca', 'farinha de milho',
      'fuba', 'polvilho', 'amido de milho', 'maizena', 'tapioca', 'cuscuz', 'farofa', 'fermento',
      // Massas & Molhos
      'macarrao', 'espaguete', 'penne', 'parafuso', 'miojo', 'lamen', 'lasanha', 'nhoque',
      'massa de pastel', 'massa de pizza', 'molho', 'molho de tomate', 'extrato de tomate',
      'extrato', 'passata', 'ketchup', 'catchup', 'mostarda', 'maionese', 'shoyu',
      'molho ingles', 'barbecue', 'vinagre', 'azeite', 'oleo', 'oleo de soja', 'oleo de coco',
      'oleo de girassol', 'oleo de canola', 'oleo de milho', 'banha',
      // Mercearia, Temperos & Enlatados
      'acucar', 'adocante', 'sal', 'sal grosso', 'cafe', 'cafe soluvel', 'capsula de cafe',
      'achocolatado', 'toddy', 'nescau', 'chocolate em po', 'cacau', 'mel', 'geleia',
      'pasta de amendoim', 'amendoim', 'castanha', 'nozes', 'uva passa', 'azeitona', 'palmito',
      'atum', 'sardinha', 'tempero', 'caldo', 'sazon', 'oregano', 'pimenta do reino', 'cominho',
      'paprica', 'curcuma', 'acafrao', 'canela', 'cravo', 'louro', 'biscoito', 'bolacha',
      'wafer', 'rosquinha', 'salgadinho', 'batata palha', 'barra de cereal', 'gelatina',
      'mistura para bolo'
    ]
  },
  {
    categoryId: 'cat_padaria',
    keywords: [
      'pao', 'pao frances', 'pao de forma', 'pao integral', 'pao de queijo', 'pao de alho',
      'pao de hamburguer', 'pao de hot dog', 'bisnaguinha', 'baguete', 'ciabatta', 'brioche',
      'croissant', 'torrada', 'bolo', 'bolo de', 'torta', 'torta de', 'rocambole', 'sonho',
      'pudim', 'mousse', 'brigadeiro', 'beijinho', 'brownie', 'cookie', 'panetone', 'chocotone',
      'doce', 'doce de leite', 'goiabada', 'pacoca', 'chocolate', 'bombom', 'sorvete', 'picole',
      'acai', 'coxinha', 'empada', 'esfiha', 'pastel'
    ]
  },
  {
    categoryId: 'cat_bebidas',
    keywords: [
      'agua', 'agua mineral', 'agua com gas', 'agua de coco', 'agua tonica', 'refrigerante',
      'coca', 'guarana', 'fanta', 'sprite', 'pepsi', 'suco', 'suco de', 'nectar', 'refresco',
      'tang', 'cha', 'cha de', 'cha gelado', 'mate', 'chimarrao', 'energetico', 'red bull',
      'monster', 'isotonico', 'gatorade', 'cerveja', 'chopp', 'vinho', 'espumante', 'champagne',
      'vodka', 'gin', 'whisky', 'uisque', 'rum', 'cachaca', 'tequila', 'licor'
    ]
  },
  {
    categoryId: 'cat_limpeza',
    keywords: [
      'detergente', 'sabao', 'sabao em po', 'sabao liquido', 'sabao em barra', 'lava roupas',
      'amaciante', 'agua sanitaria', 'cloro', 'alvejante', 'vanish', 'tira manchas',
      'desinfetante', 'multiuso', 'veja', 'desengordurante', 'limpa vidros', 'limpa aluminio',
      'limpa forno', 'limpa piso', 'lustra moveis', 'cera', 'alcool', 'alcool 70', 'alcool em gel',
      'esponja', 'bombril', 'palha de aco', 'pano de chao', 'pano de prato', 'flanela',
      'vassoura', 'rodo', 'pa de lixo', 'balde', 'mop', 'saco de lixo', 'luva de limpeza',
      'prendedor', 'inseticida', 'naftalina', 'odorizador', 'aromatizador', 'bom ar',
      'pedra sanitaria', 'papel toalha', 'guardanapo', 'papel aluminio', 'filme pvc',
      'plastico filme', 'papel manteiga'
    ]
  },
  {
    categoryId: 'cat_higiene',
    keywords: [
      'sabonete', 'sabonete liquido', 'shampoo', 'xampu', 'condicionador', 'mascara capilar',
      'creme de pentear', 'gel de cabelo', 'creme dental', 'pasta de dente', 'escova de dente',
      'escova', 'fio dental', 'enxaguante bucal', 'listerine', 'papel higienico',
      'lenco umedecido', 'lenco de papel', 'desodorante', 'antitranspirante', 'perfume',
      'colonia', 'hidratante', 'creme corporal', 'protetor solar', 'bloqueador solar',
      'repelente', 'absorvente', 'protetor diario', 'fralda', 'algodao', 'cotonete',
      'haste flexivel', 'lamina', 'prestobarba', 'aparelho de barbear', 'espuma de barbear',
      'pos barba', 'pinca', 'esmalte', 'acetona', 'removedor de esmalte', 'curativo',
      'band aid', 'gaze', 'esparadrapo'
    ]
  }
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pré-compila regras com fronteira de palavra e ordena por tamanho (maior frase vence colisões)
const COMPILED_CATEGORY_RULES = KEYWORD_CATEGORY_MAP.flatMap((rule) =>
  rule.keywords.map((kw) => {
    const normKw = normalizeText(kw);
    return {
      categoryId: rule.categoryId,
      length: normKw.length,
      regex: new RegExp(`(?:^|[^a-z0-9])${escapeRegex(normKw)}(?:s)?(?:$|[^a-z0-9])`)
    };
  })
).sort((a, b) => b.length - a.length);

export class ProductRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  getAll() {
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ORDER BY p.name ASC
    `).all();
  }

  getFavorites() {
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.is_favorite = 1
      ORDER BY p.name ASC
    `).all();
  }

  getById(id) {
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `).get(id);
  }

  findByName(name) {
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE LOWER(p.name) = LOWER(?)
    `).get(name.trim());
  }

  search(query, limit = 10) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    // Escapa caracteres curinga do SQLite (_, %) com barra invertida para prevenir DoS / Full Scan
    const escaped = String(query || '').trim().toLowerCase().replace(/([%_\\])/g, '\\$1');
    const term = `%${escaped}%`;
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE LOWER(p.name) LIKE ? ESCAPE '\\'
      ORDER BY p.is_favorite DESC, p.name ASC
      LIMIT ?
    `).all(term, safeLimit);
  }

  /**
   * Inferência automática de categoria baseada no nome do produto.
   * Usa prefixos semânticos compostos + casamento por fronteira de palavra com prioridade
   * para expressões mais específicas (ex: "Água Sanitária Ypê" -> Limpeza, "Molho de Tomate" -> Mercearia).
   * @param {string} name 
   * @returns {string} ID da categoria mais provável
   */
  inferCategory(name) {
    const normalized = normalizeText(name);
    if (!normalized) return 'cat_outros';

    // Prefixos compostos evitam que o sabor/ingrediente vença o tipo principal do produto
    if (normalized.startsWith('suco de ') || normalized.startsWith('cha de ') || normalized.startsWith('refrigerante de ')) {
      return 'cat_bebidas';
    }
    if (normalized.startsWith('bolo de ') || normalized.startsWith('torta de ') || normalized.startsWith('pao de ') || normalized.startsWith('sorvete de ')) {
      return 'cat_padaria';
    }
    if (normalized.startsWith('molho de ') || normalized.startsWith('extrato de ') || normalized.startsWith('oleo de ') || normalized.startsWith('farinha de ') || normalized.startsWith('geleia de ')) {
      return 'cat_graos';
    }
    if (normalized.startsWith('iogurte de ') || normalized.startsWith('queijo de ')) {
      return 'cat_laticinios';
    }
    if (normalized.startsWith('saco de ')) {
      return 'cat_limpeza';
    }

    for (const rule of COMPILED_CATEGORY_RULES) {
      if (rule.regex.test(normalized)) {
        return rule.categoryId;
      }
    }
    return 'cat_outros';
  }

  create({ name, category_id, default_unit = 'un', is_favorite = 0 }) {
    const trimmed = name.trim();
    const finalCategory = category_id || this.inferCategory(trimmed);
    const id = 'prod_' + crypto.createHash('md5').update(trimmed.toLowerCase()).digest('hex').substring(0, 10);

    this.db.prepare(`
      INSERT INTO products (id, name, category_id, default_unit, is_favorite, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category_id = excluded.category_id,
        default_unit = excluded.default_unit,
        is_favorite = excluded.is_favorite,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, trimmed, finalCategory, default_unit, is_favorite ? 1 : 0);

    return this.getById(id);
  }

  toggleFavorite(id) {
    const product = this.getById(id);
    if (!product) return null;
    const newStatus = product.is_favorite ? 0 : 1;
    this.db.prepare('UPDATE products SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, id);
    return this.getById(id);
  }

  getOrCreate(name, category_id, default_unit = 'un') {
    const existing = this.findByName(name);
    if (existing) {
      if (category_id && category_id !== existing.category_id) {
        this.db.prepare('UPDATE products SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(category_id, existing.id);
        return this.getById(existing.id);
      }
      return existing;
    }
    return this.create({ name, category_id, default_unit });
  }
}
