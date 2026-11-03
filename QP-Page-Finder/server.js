#!/usr/bin/env node
/* QP Page Finder - zero-dependency Node.js fallback server.
 * Use this if you have Node.js but not Python:  node server.js
 * Same behaviour as server.py: localhost only, read-only, no uploads.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const APP_ROOT = __dirname;
const WEB_ROOT = path.join(APP_ROOT, 'web');
const DEFAULT_FOLDER = path.dirname(APP_ROOT);
const MAX_FILES = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf',
  '.wasm': 'application/wasm', '.gz': 'application/gzip', '.ttf': 'font/ttf',
  '.pfb': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

const CSP = "default-src 'self' blob: data:; script-src 'self' 'unsafe-eval' blob:; " +
  "worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; " +
  "style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'self'; " +
  "base-uri 'self'; form-action 'self'";

// Accept both "--port=9000" and "--port 9000" (the Python server accepts both).
function argValue(name, fallback) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && i + 1 < argv.length) return argv[i + 1].replace(/^["']|["']$/g, '');
    if (argv[i].startsWith(name + '=')) return argv[i].slice(name.length + 1).replace(/^["']|["']$/g, '');
  }
  return fallback;
}
const scanFolder = argValue('--folder', null);
const port = parseInt(argValue('--port', '8777'), 10);
const host = argValue('--host', '127.0.0.1');
const noBrowser = process.argv.includes('--no-browser');

function common(res, extra) {
  const headers = Object.assign({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // No COOP / X-Frame-Options / frame-ancestors: the app is embedded in an
    // iframe by local preview proxies. CSP connect-src 'self' blocks all
    // external connections instead.
    'Cache-Control': 'no-store'
  }, extra || {});
  for (const k of Object.keys(headers)) res.setHeader(k, headers[k]);
}

function json(res, obj, status) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  common(res, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.writeHead(status || 200);
  res.end(body);
}

function resolveInside(folder, rel) {
  const root = path.resolve(folder);
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) return null;
  return p;
}

function scan(dir, recursive) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { error: 'Not a folder: ' + root, dir: root, files: [] };
  }
  const out = [];
  function walk(cur, prefix, depth) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (out.length >= MAX_FILES) return;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(cur, entry.name);
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory() && recursive && depth < 12) {
        if (entry.name !== 'node_modules' && entry.name !== '__pycache__') walk(full, rel, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        let size = 0;
        try { size = fs.statSync(full).size; } catch (e) { /* ignore */ }
        out.push({ name: entry.name, rel: rel, size: size });
      }
    }
  }
  walk(root, '', 0);
  out.sort((a, b) => a.rel.toLowerCase().localeCompare(b.rel.toLowerCase()));
  return { dir: root, files: out.slice(0, MAX_FILES), truncated: out.length > MAX_FILES };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const q = u.searchParams;
  let p = u.pathname;

  if (p === '/api/health') return json(res, { ok: true, app: 'QP Page Finder', offline: true });
  if (p === '/api/config') return json(res, {
    appDir: APP_ROOT, parentDir: DEFAULT_FOLDER,
    defaultDir: path.resolve(scanFolder || DEFAULT_FOLDER),
    offline: true, node: process.version,
    note: 'All processing happens in your browser on this machine.'
  });
  if (p === '/api/scan') return json(res, scan(q.get('dir') || (scanFolder || DEFAULT_FOLDER), q.get('recursive') === '1'));
  if (p === '/api/pdf') {
    const dir = q.get('dir') || (scanFolder || DEFAULT_FOLDER);
    const rel = q.get('file');
    if (!rel) return json(res, { error: 'Missing file parameter' }, 400);
    const file = resolveInside(dir, rel);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile() || path.extname(file).toLowerCase() !== '.pdf') {
      return json(res, { error: 'PDF not found or outside the selected folder' }, 404);
    }
    let data;
    try { data = fs.readFileSync(file); } catch (e) { return json(res, { error: 'Cannot read PDF: ' + e.message }, 403); }
    common(res, {
      'Content-Type': 'application/pdf', 'Content-Length': data.length,
      'Content-Disposition': 'inline; filename="' + path.basename(file).replace(/"/g, '') + '"'
    });
    res.writeHead(200);
    return res.end(req.method === 'HEAD' ? undefined : data);
  }

  if (p === '/' || p === '') p = '/index.html';
  const rel = decodeURIComponent(p).replace(/^\/+/, '');
  if (rel.split('/').includes('..')) { res.writeHead(403); return res.end('Forbidden'); }
  const target = resolveInside(WEB_ROOT, rel);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  let data;
  try { data = fs.readFileSync(target); } catch (e) { res.writeHead(404); return res.end('Not found'); }
  const ctype = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  common(res, { 'Content-Type': ctype, 'Content-Length': data.length });
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : data);
});

server.listen(port, host, () => {
  const url = 'http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + port + '/';
  console.log('='.repeat(62));
  console.log('  QP Page Finder - local, offline PDF page finder (Node)');
  console.log('='.repeat(62));
  console.log('  Open this address in your browser:\n    ' + url);
  console.log('  PDF folder: ' + path.resolve(scanFolder || DEFAULT_FOLDER));
  console.log('  Nothing is uploaded. Press Ctrl+C to stop.');
  console.log('='.repeat(62));
  if (!noBrowser) {
    const cmd = process.platform === 'win32' ? 'start "" "' + url + '"'
      : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
    exec(cmd, () => {});
  }
});
