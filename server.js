const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = ['*'];

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function proxyRequest(targetUrl, options, body, res) {
  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const reqOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: options.method || 'GET',
    headers: options.headers || {}
  };

  const proxyReq = lib.request(reqOptions, proxyRes => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {

    // POST /anthropic — proxies to Anthropic API
    if (req.url === '/anthropic' && req.method === 'POST') {
      const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
      proxyRequest(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          }
        },
        body,
        res
      );
      return;
    }

    // /beehiiv/* — proxies to beehiiv API
    if (req.url.startsWith('/beehiiv/')) {
      const BEEHIIV_KEY = process.env.BEEHIIV_KEY;
      const bhPath = req.url.replace('/beehiiv', '');
      proxyRequest(
        `https://api.beehiiv.com/v2${bhPath}`,
        {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BEEHIIV_KEY}`
          }
        },
        body,
        res
      );
      return;
    }

    // health check
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', service: 'six5ive-proxy' }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

server.listen(PORT, () => {
  console.log(`six5ive proxy running on port ${PORT}`);
});
