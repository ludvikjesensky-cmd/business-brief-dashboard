import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const refreshSeconds = Math.max(5, Number(process.env.REFRESH_SECONDS || 15));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'business-brief-dashboard',
});

function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function authorized(req) {
  const expectedUser = process.env.DASHBOARD_USERNAME;
  const expectedPass = process.env.DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPass) return true;

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const split = decoded.indexOf(':');
  if (split < 0) return false;
  return constantTimeEqual(decoded.slice(0, split), expectedUser)
    && constantTimeEqual(decoded.slice(split + 1), expectedPass);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

async function queryDashboard() {
  const client = await pool.connect();
  try {
    await client.query('begin read only');
    const [kpis, editions, findings, articles, activity] = await Promise.all([
      client.query('select * from brief.dashboard_kpis'),
      client.query(`select * from brief.dashboard_editions
                    order by publication_date desc, publication_code
                    limit 30`),
      client.query(`select * from brief.dashboard_findings
                    order by created_at desc
                    limit 100`),
      client.query(`select * from brief.dashboard_articles
                    order by publication_date desc, created_at desc
                    limit 100`),
      client.query(`select * from brief.dashboard_activity
                    order by event_at desc
                    limit 120`),
    ]);
    await client.query('commit');
    return {
      generatedAt: new Date().toISOString(),
      refreshSeconds,
      kpis: kpis.rows[0] || {},
      editions: editions.rows,
      findings: findings.rows,
      articles: articles.rows,
      activity: activity.rows,
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': pathname === '/index.html' ? 'no-store' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      await pool.query('select 1');
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!authorized(req)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Business Brief Control Room"',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Authentication required');
      return;
    }

    if (req.url?.startsWith('/api/dashboard')) {
      sendJson(res, 200, await queryDashboard());
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      error: 'dashboard_error',
      message: process.env.NODE_ENV === 'production' ? 'Dashboard query failed' : error.message,
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Business Brief dashboard listening on :${port}`);
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
