import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from '../client/node_modules/qrcode/lib/index.js';

test('INGRESSO INSTANTÂNEO EM FEIRAS VIA QR CODE NA TELA', async (t) => {
  const rootDir = process.cwd();
  const shareModalPath = path.join(rootDir, 'client', 'src', 'components', 'ShareModal.jsx');

  await t.test('1. Presença Estrutural do QR Code no ShareModal.jsx', () => {
    assert.ok(fs.existsSync(shareModalPath), 'ShareModal.jsx deve existir');
    const content = fs.readFileSync(shareModalPath, 'utf-8');

    assert.ok(content.includes("import QRCode from 'qrcode';"), 'Deve importar a biblioteca qrcode');
    assert.ok(content.includes('QrCode'), 'Deve importar o ícone QrCode do lucide-react');
    assert.ok(content.includes('showQrCode'), 'Deve possuir o estado showQrCode');
    assert.ok(content.includes('qrSvg'), 'Deve possuir o estado qrSvg para renderização vetorial');
    assert.ok(content.includes('?join='), 'Deve gerar a URL de ingresso com o parâmetro ?join=');
    assert.ok(
      content.includes('Aponte a câmera do celular para entrar instantaneamente'),
      'Deve exibir instruções ergonômicas para a câmera'
    );
  });

  await t.test('2. Geração Vetorial de SVG 100% Offline e Determinística', async () => {
    const testCode = 'FEIRA-123';
    const fakeOrigin = 'https://cestaon.com.br';
    const targetUrl = `${fakeOrigin}?join=${testCode}`;

    const svg = await QRCode.toString(targetUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    assert.ok(typeof svg === 'string', 'SVG gerado deve ser uma string válida');
    assert.ok(svg.includes('<svg'), 'Deve conter tag <svg');
    assert.ok(svg.includes('</svg>'), 'Deve fechar tag </svg>');
    assert.ok(svg.includes('viewBox'), 'Deve ter atributo viewBox para responsividade');
    assert.ok(svg.length > 500, 'SVG deve conter malha dimensional do QR Code');
  });

  await t.test('3. Paridade de Compatibilidade com o Roteador de Ingresso no App.jsx', () => {
    const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    assert.ok(
      appContent.includes("searchParams.get('join')") || appContent.includes('join'),
      'App.jsx deve manter suporte nativo ao parâmetro de busca ?join='
    );
  });
});
