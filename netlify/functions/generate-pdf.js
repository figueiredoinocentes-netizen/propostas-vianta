// Netlify Function: gera PDF com Chromium headless (qualidade nativa, download direto)
const path = require('path');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// O @sparticuz/chromium usa __dirname para encontrar o binário.
// Com NFT bundling no Netlify, a estrutura pode ser diferente —
// passamos o caminho explícito para evitar o erro "bin does not exist".
const CHROMIUM_BIN = path.join(
  __dirname, '..', '..', 'node_modules', '@sparticuz', 'chromium', 'bin', 'chromium.br'
);

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let html, filename;
  try {
    const body = JSON.parse(event.body);
    html = body.html;
    filename = body.filename || 'proposta-vianta.pdf';
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  if (!html) return { statusCode: 400, body: 'Missing html' };

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(CHROMIUM_BIN),
      headless: true,
    });

    const page = await browser.newPage();

    // Aguardar fontes e imagens (base64 já embutidas, só fontes externas)
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });

    // Pequena pausa para garantir render de fontes
    await new Promise(r => setTimeout(r, 300));

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });

    await browser.close();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: Buffer.from(pdf).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error('generate-pdf error:', e);
    return { statusCode: 500, body: 'Erro ao gerar PDF: ' + e.message };
  }
};
