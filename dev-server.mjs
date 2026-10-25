import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function withVercelHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(urlPath, res) {
  const pathname = new URL(urlPath, 'http://localhost').pathname;
  const decoded = decodeURIComponent(pathname);
  let filePath = path.normalize(path.join(root, decoded));
  if (!filePath.startsWith(root) || filePath.includes(`${path.sep}node_modules`)) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  try {
    if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    if (decoded === '/admin') {
      filePath = path.join(root, 'admin.html');
    } else if (decoded === '/chatbot') {
      filePath = path.join(root, 'chatbot.html');
    } else {
      filePath = path.join(root, 'index.html');
    }
  }

  try {
    const content = await readFile(filePath);
    res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;

    if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
      const { default: handler } = await import('./api/admin.js');
      req.body = await readBody(req).catch(() => ({}));
      return handler(req, withVercelHelpers(res));
    }

    if (pathname === '/api/chatbot') {
      const { default: handler } = await import('./api/chatbot.js');
      req.body = await readBody(req).catch(() => ({}));
      return handler(req, withVercelHelpers(res));
    }

    if (pathname === '/api/submit' || pathname === '/api/captcha') {
      const route = pathname.replace('/api/', '');
      const { default: handler } = await import(`./api/${route}.js`);
      req.body = await readBody(req).catch(() => ({}));
      return handler(req, withVercelHelpers(res));
    }

    if (pathname === '/admin' || pathname === '/chatbot') {
      return serveStatic(pathname, res);
    }

    return serveStatic(req.url, res);
  })
  .listen(port, () => console.log(`Preview running on http://localhost:${port}`));
