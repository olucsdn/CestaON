import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('GOVERNANÇA ARQUITETURAL & INTEGRIDADE DO MAPA (MAP-FIRST)', async (t) => {
  const rootDir = process.cwd();
  const mapPath = path.join(rootDir, 'MAPA_DO_PROJETO.md');

  await t.test('1. Existência e Estrutura Básica do MAPA_DO_PROJETO.md', () => {
    assert.ok(fs.existsSync(mapPath), 'MAPA_DO_PROJETO.md deve existir na raiz do projeto');
    const content = fs.readFileSync(mapPath, 'utf-8');
    assert.match(content, /^# MAPA DO PROJETO/m, 'Cabeçalho do mapa deve estar presente');
    assert.match(content, /## Índice de Arquivos/m, 'Tabela de índice de arquivos deve estar presente');
  });

  await t.test('2. Todos os Arquivos Mapeados Devem Existir Fisicamente no Disco', () => {
    const content = fs.readFileSync(mapPath, 'utf-8');
    const tableRegex = /\|\s*`([^`]+)`\s*\|\s*([^|]+)\s*\|/g;
    let match;
    const mappedFiles = [];

    while ((match = tableRegex.exec(content)) !== null) {
      const filePath = match[1].trim();
      if (filePath !== 'Arquivo') {
        mappedFiles.push(filePath);
      }
    }

    assert.ok(mappedFiles.length >= 70, `Deve conter ao menos 70 arquivos mapeados (encontrados: ${mappedFiles.length})`);

    const missingFiles = [];
    for (const relPath of mappedFiles) {
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push(relPath);
      }
    }

    assert.equal(
      missingFiles.length,
      0,
      `Arquivos listados no MAPA_DO_PROJETO.md que não existem no disco: ${missingFiles.join(', ')}`
    );
  });

  await t.test('3. Rastreabilidade de Fontes Críticos no Mapa', () => {
    const content = fs.readFileSync(mapPath, 'utf-8');
    const criticalFiles = [
      'server/index.js',
      'server/routes/api.js',
      'server/middlewares/rateLimiter.js',
      'server/middlewares/validators.js',
      'server/middlewares/auth.js',
      'server/routes/users.js',
      'server/routes/lists.js',
      'client/src/App.jsx',
      'client/src/hooks/useSubsurfaceSync.js',
      'client/src/hooks/useModalManager.js',
      'client/src/utils/syncManager.js',
      'client/src/utils/subsurfaceCache.js',
      'tests/math_normalization_parity.test.js'
    ];

    for (const file of criticalFiles) {
      assert.ok(
        content.includes(`\`${file}\``),
        `Arquivo crítico ${file} deve estar catalogado no MAPA_DO_PROJETO.md`
      );
    }
  });
});
