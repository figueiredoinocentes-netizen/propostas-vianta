// Netlify Function: proxy de imagens Google Drive para o exportPDF
// Faz o fetch server-side, contornando CORS e auth de browser
const https = require('https');
const http  = require('http');

const ALLOWED_HOSTS = ['drive.google.com', 'lh3.googleusercontent.com', 'googleusercontent.com', 'tuwcllpwvxzmrgrqviqu.supabase.co'];

exports.handler = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) return { statusCode: 400, body: 'Missing url' };

  let host;
  try { host = new URL(url).hostname; } catch { return { statusCode: 400, body: 'Invalid URL' }; }
  if (!ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
    return { statusCode: 403, body: 'Host not allowed' };
  }

  try {
    const buf = await fetchFollow(url);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 502, body: 'Fetch error: ' + e.message };
  }
};

function fetchFollow(url, hops = 6) {
  return new Promise((resolve, reject) => {
    if (hops === 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ViantaPDF/1.0)' }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        return fetchFollow(next, hops - 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}
