// 로컬 개발용: 정적 파일 + /api (D1 대신 메모리 SQLite). 사용: node test/dev-server.mjs [포트]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { onRequest } from '../functions/api/[[route]].js';
const env = { DB: createRequire(import.meta.url)('./d1shim.js')() };
const root = path.resolve(import.meta.dirname, '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const body = req.method === 'POST' ? await new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); }) : undefined;
    const r = await onRequest({ request: new Request(url, { method: req.method, body }), env, params: { route: url.pathname.slice(5).split('/') } });
    res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(await r.text());
  }
  const f = path.join(root, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(Number(process.argv[2]) || 8788, () => console.log('http://localhost:' + (process.argv[2] || 8788)));
