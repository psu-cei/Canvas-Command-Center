/**
 * Canvas Command Center — local read-only proxy
 * File: proxy/server.js
 *
 * WHY THIS EXISTS
 *   GitHub Pages can only serve static files. A Canvas Access Token must never
 *   be placed in browser-side JavaScript, so the browser talks to THIS small
 *   server on your own computer, and this server adds the token when it calls
 *   Canvas. The token never leaves your machine except in requests to Canvas.
 *
 * SAFETY MODEL (v1)
 *   - READ ONLY: only HTTP GET is forwarded, and only to an allowlist of
 *     Canvas API paths (see ALLOWED_PATHS). Nothing here MODIFIES CANVAS.
 *   - Binds to 127.0.0.1 only, so other computers on your network can't reach it.
 *   - CORS is limited to the origins you list in ALLOWED_ORIGINS.
 *
 * REQUIREMENTS
 *   Node.js 18+ (uses the built-in fetch). No npm packages needed.
 *
 * RUN
 *   node proxy/server.js          (from the repository root)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Configuration — loaded from proxy/.env (git-ignored) or real env vars.
// ---------------------------------------------------------------------------
loadDotEnv(path.join(__dirname, '.env'));

const CANVAS_BASE_URL = (process.env.CANVAS_BASE_URL || '').replace(/\/+$/, '');
const CANVAS_TOKEN = process.env.CANVAS_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);
const HOST = '127.0.0.1';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const MAX_PAGES = Number(process.env.MAX_PAGES || 20); // pagination safety cap

// The static dashboard lives one folder up (the repository root).
const SITE_ROOT = path.resolve(__dirname, '..');

// Allowlisted READ ONLY Canvas endpoints. Anything else is rejected with 403.
// Each regex is matched against the path AFTER /api/v1.
const ALLOWED_PATHS = [
  /^\/users\/self$/,                                   // GET /api/v1/users/self
  /^\/courses$/,                                       // GET /api/v1/courses
  /^\/courses\/\d+$/,                                  // GET /api/v1/courses/:id
  /^\/courses\/\d+\/modules$/,                         // GET .../modules
  /^\/courses\/\d+\/modules\/\d+\/items$/,             // GET .../modules/:id/items
  /^\/courses\/\d+\/pages$/,                           // GET .../pages
  /^\/courses\/\d+\/pages\/[A-Za-z0-9_\-%.]+$/,        // GET .../pages/:url_or_id
  /^\/courses\/\d+\/assignments$/,                     // GET .../assignments
  /^\/courses\/\d+\/discussion_topics$/,               // GET .../discussion_topics
  /^\/courses\/\d+\/quizzes$/,                         // GET .../quizzes (Classic Quizzes)
  /^\/courses\/\d+\/files$/,                           // GET .../files
];

// ---------------------------------------------------------------------------
// 2. Startup checks — fail loudly instead of guessing.
// ---------------------------------------------------------------------------
if (!CANVAS_BASE_URL || CANVAS_BASE_URL.includes('PLACEHOLDER')) {
  console.error('✖ CANVAS_BASE_URL is not set. Copy proxy/.env.example to proxy/.env and fill it in.');
  process.exit(1);
}
if (!CANVAS_TOKEN || CANVAS_TOKEN.includes('PLACEHOLDER')) {
  console.error('✖ CANVAS_TOKEN is not set. Put your token in proxy/.env (never in the website code).');
  process.exit(1);
}
if (typeof fetch !== 'function') {
  console.error('✖ This proxy needs Node.js 18 or newer (built-in fetch). Run: node --version');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const origin = req.headers.origin;

  // CORS: only echo back origins you've explicitly allowed.
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Chrome's Private/Local Network Access checks: a public HTTPS page
    // (GitHub Pages) calling 127.0.0.1 must be explicitly permitted.
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(origin && isAllowedOrigin(origin) ? 204 : 403);
    return res.end();
  }

  // Health check used by the dashboard's "Test connection" button.
  if (url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, mode: 'read-only', canvas: CANVAS_BASE_URL });
  }

  if (url.pathname.startsWith('/api/v1/')) {
    if (origin && !isAllowedOrigin(origin)) {
      return sendJson(res, 403, { error: `Origin ${origin} is not in ALLOWED_ORIGINS.` });
    }
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'This proxy is READ ONLY. Only GET is allowed.' });
    }
    return proxyCanvas(url, res);
  }

  // Anything else: serve the static dashboard (so http://127.0.0.1:8787 works
  // without GitHub Pages at all — the simplest, most reliable option).
  return serveStatic(url.pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Canvas Command Center proxy  (READ ONLY)');
  console.log(`  Dashboard : http://${HOST}:${PORT}/`);
  console.log(`  Canvas    : ${CANVAS_BASE_URL}`);
  console.log(`  Origins   : ${ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(', ') : '(same-origin only)'}`);
  console.log('  Stop with Ctrl+C');
  console.log('');
});

// ---------------------------------------------------------------------------
// 4. Canvas proxying with pagination
// ---------------------------------------------------------------------------
async function proxyCanvas(url, res) {
  const apiPath = url.pathname.slice('/api/v1'.length);
  if (!ALLOWED_PATHS.some((re) => re.test(apiPath))) {
    return sendJson(res, 403, { error: `Endpoint not allowlisted: /api/v1${apiPath}` });
  }

  // ?all=1 tells the proxy to follow Canvas pagination (Link: rel="next").
  const followPages = url.searchParams.get('all') === '1';
  url.searchParams.delete('all');

  let next = `${CANVAS_BASE_URL}/api/v1${apiPath}${url.search}`;
  const collected = [];
  let pages = 0;

  try {
    while (next) {
      pages += 1;
      const upstream = await fetch(next, {
        headers: {
          Authorization: `Bearer ${CANVAS_TOKEN}`, // token added HERE, server-side only
          Accept: 'application/json',
        },
      });

      const text = await upstream.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

      if (!upstream.ok) {
        // Pass Canvas's error through, with a hint for the common cases.
        return sendJson(res, upstream.status, {
          error: 'Canvas returned an error',
          status: upstream.status,
          hint: hintFor(upstream.status),
          canvas: body,
        });
      }

      if (!followPages || !Array.isArray(body)) {
        return sendJson(res, 200, body);
      }

      collected.push(...body);
      next = parseNextLink(upstream.headers.get('link'));
      if (pages >= MAX_PAGES) {
        console.warn(`⚠ Stopped after ${MAX_PAGES} pages for ${apiPath}. Raise MAX_PAGES if needed.`);
        break;
      }
    }
    return sendJson(res, 200, collected);
  } catch (err) {
    return sendJson(res, 502, { error: 'Could not reach Canvas', detail: String(err.message || err) });
  }
}

// Canvas pagination: Link: <https://...&page=2>; rel="next", <...>; rel="last"
function parseNextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) {
      // Only follow links that stay on your Canvas host.
      return m[1].startsWith(CANVAS_BASE_URL) ? m[1] : null;
    }
  }
  return null;
}

function hintFor(status) {
  if (status === 401) return 'Token missing, expired, or revoked. Request a new token and update proxy/.env.';
  if (status === 403) return 'Your Canvas role may lack permission for this endpoint, or Canvas rate-limited you ("Rate Limit Exceeded") — check the message below.';
  if (status === 404) return 'Not found — check the course/page ID, or the feature may be disabled in this course.';
  if (status === 429) return 'Rate limited — wait a moment and retry.';
  return undefined;
}

// ---------------------------------------------------------------------------
// 5. Helpers
// ---------------------------------------------------------------------------
function isAllowedOrigin(origin) {
  const o = origin.replace(/\/+$/, '');
  return o === `http://${HOST}:${PORT}` || o === `http://localhost:${PORT}` || ALLOWED_ORIGINS.includes(o);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

function serveStatic(pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    // A malformed escape such as "/%E0%A4" would otherwise throw and crash the proxy.
    res.writeHead(400); return res.end('Bad request');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(SITE_ROOT, '.' + rel);
  // Block path traversal, never serve the proxy folder (it holds .env), and
  // refuse any dot-file or dot-folder anywhere in the path (.git/, .env, .github/).
  const hasDotSegment = path.relative(SITE_ROOT, file).split(path.sep).some((seg) => seg.startsWith('.'));
  if (!file.startsWith(SITE_ROOT + path.sep) || file.startsWith(__dirname) || hasDotSegment) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// Minimal .env reader (KEY=value per line, # comments). Real env vars win.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
