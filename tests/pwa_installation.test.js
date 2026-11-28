import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('GATILHO ERGONÔMICO DE INSTALAÇÃO PWA & MANIFESTO WEB', async (t) => {
  const rootDir = process.cwd();

  await t.test('1. Validação de Metadados e Meta Tags no HTML Principal', () => {
    const indexPath = path.join(rootDir, 'client', 'index.html');
    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');
    const html = fs.readFileSync(indexPath, 'utf-8');

    assert.match(html, /<link\s+rel=["']manifest["']\s+href=["']\/manifest\.webmanifest["']/i, 'Deve referenciar manifest.webmanifest');
    assert.match(html, /<meta\s+name=["']theme-color["']\s+content=["']#10b981["']/i, 'Theme color verde esmeralda deve estar configurada');
    assert.match(html, /<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']/i, 'Meta tag para iOS standalone deve estar presente');
    assert.match(html, /<link\s+rel=["']apple-touch-icon["']/i, 'apple-touch-icon deve estar configurado para iOS');
  });

  await t.test('2. Validação Estrutural do Manifesto PWA (W3C Web App Manifest)', () => {
    const manifestPath = path.join(rootDir, 'client', 'public', 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest deve existir');
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    assert.equal(manifest.display, 'standalone', 'PWA deve abrir em modo tela cheia standalone');
    assert.equal(manifest.start_url, '/', 'start_url deve ser a raiz');
    assert.equal(manifest.theme_color, '#10b981', 'theme_color deve bater com a identidade visual');
    assert.ok(manifest.icons?.length >= 2, 'Deve fornecer ao menos os ícones 192x192 e 512x512');

    const icon192 = manifest.icons.find((i) => i.sizes === '192x192');
    const icon512 = manifest.icons.find((i) => i.sizes === '512x512');
    assert.ok(icon192, 'Ícone 192x192 deve existir no manifesto');
    assert.ok(icon512, 'Ícone 512x512 deve existir no manifesto');
  });

  await t.test('3. Validação dos Assets de Ícones PWA para Mobile', () => {
    const icon192Path = path.join(rootDir, 'client', 'public', 'icons', 'icon-192.svg');
    const icon512Path = path.join(rootDir, 'client', 'public', 'icons', 'icon-512.svg');

    assert.ok(fs.existsSync(icon192Path), 'icon-192.svg deve existir em public/icons/');
    assert.ok(fs.existsSync(icon512Path), 'icon-512.svg deve existir em public/icons/');

    const svgContent = fs.readFileSync(icon192Path, 'utf-8');
    assert.match(svgContent, /<svg/i, 'icon-192 deve ser um SVG válido');
  });

  await t.test('4. Validação da Existência e Sintaxe do Componente InstallPwaPrompt', () => {
    const compPath = path.join(rootDir, 'client', 'src', 'components', 'InstallPwaPrompt.jsx');
    assert.ok(fs.existsSync(compPath), 'InstallPwaPrompt.jsx deve existir');
    const code = fs.readFileSync(compPath, 'utf-8');

    // Valida ganchos essenciais de ergonomia
    assert.match(code, /beforeinstallprompt/i, 'Deve capturar evento beforeinstallprompt nativo');
    assert.match(code, /display-mode:\s*standalone/i, 'Deve checar se já está em modo standalone');
    assert.match(code, /pwa_prompt_dismissed_until/i, 'Deve respeitar dispensa temporária do usuário');
    assert.match(code, /appinstalled/i, 'Deve escutar evento appinstalled');
    assert.match(code, /iphone|ipad|ipod/i, 'Deve fornecer suporte ergonômico guiado para iOS Safari');
  });

  await t.test('5. Remoção Dinâmica da Opção de Baixar/Instalar Quando Já Instalado', () => {
    const headerPath = path.join(rootDir, 'client', 'src', 'components', 'Header.jsx');
    assert.ok(fs.existsSync(headerPath), 'Header.jsx deve existir');
    const headerCode = fs.readFileSync(headerPath, 'utf-8');

    // Valida que o Header oculta o botão de download/instalação quando o app já estiver instalado
    assert.match(headerCode, /!isAppInstalled/i, 'Header deve renderizar botão condicionado a !isAppInstalled');
    assert.match(headerCode, /display-mode:\s*standalone/i, 'Header deve checar se está rodando em display-mode standalone');
    assert.match(headerCode, /appinstalled/i, 'Header deve escutar evento appinstalled para ocultar botão');

    const promptPath = path.join(rootDir, 'client', 'src', 'components', 'InstallPwaPrompt.jsx');
    const promptCode = fs.readFileSync(promptPath, 'utf-8');
    assert.match(promptCode, /localStorage\.setItem\(['"]pwa_installed['"]/i, 'InstallPwaPrompt deve persistir flag pwa_installed');
    assert.match(promptCode, /cestaon:pwa-installed/i, 'Deve disparar evento de sincronização pwa-installed');
  });
});
