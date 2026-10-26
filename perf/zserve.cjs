// Static server with brotli/gzip and no caching, like a CDN or host would compress.
// usage: node zserve.cjs <port> <name=dir> [<name=dir> ...]   ->   http://127.0.0.1:<port>/<name>/...
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const [port, ...pairs] = process.argv.slice(2);
const roots = Object.fromEntries(pairs.map(p => p.split('=')));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.bin': 'application/octet-stream' };
const cache = new Map();
http.createServer((req, res) => {
  const [, name, ...rest] = decodeURIComponent(req.url.split('?')[0]).split('/');
  if (!roots[name]) { res.writeHead(404); return res.end(); }
  const p = path.join(roots[name], rest.join('/') || 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    const ext = path.extname(p), ae = req.headers['accept-encoding'] || '', text = /html|javascript|json|css|svg|octet/.test(types[ext] || '');
    const head = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    const enc = text && /br/.test(ae) ? 'br' : text && /gzip/.test(ae) ? 'gzip' : '';
    if (enc) {
      // compress once per file version, as a host would serve precompressed files
      const k = `${p}:${enc}:${data.length}:${data[0]}:${data[data.length - 1]}`;
      if (!cache.has(k)) cache.set(k, enc === 'br' ? zlib.brotliCompressSync(data) : zlib.gzipSync(data));
      data = cache.get(k); head['Content-Encoding'] = enc;
    }
    res.writeHead(200, head); res.end(data);
  });
}).listen(+port, '127.0.0.1');
