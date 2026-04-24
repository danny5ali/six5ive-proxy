const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
  'Access-Control-Max-Age': '86400'
};

function proxyRequest(targetUrl, options, body, res) {
  const url = new URL(targetUrl);

  const reqOptions = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: options.method || 'POST',
    headers: options.headers || {}
  };

  const proxyReq = https.request(reqOptions, proxyRes => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      ...CORS_HEADERS
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

const server = http.createServer((req, res) => {

  // preflight — CORS headers must be in writeHead, not setHeader
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {

    // health check
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ status: 'ok', service: 'six5ive-proxy' }));
      return;
    }

    // POST /anthropic
    if (req.url === '/anthropic' && req.method === 'POST') {
      const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
      if (!ANTHROPIC_KEY) {
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ error: 'ANTHROPIC_KEY not set' }));
        return;
      }
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

    // /beehiiv/*
    if (req.url.startsWith('/beehiiv/')) {
      const BEEHIIV_KEY = process.env.BEEHIIV_KEY;
      if (!BEEHIIV_KEY) {
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ error: 'BEEHIIV_KEY not set' }));
        return;
      }
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

    res.writeHead(404, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

server.listen(PORT, () => {
  console.log(`six5ive proxy running on port ${PORT}`);
});
