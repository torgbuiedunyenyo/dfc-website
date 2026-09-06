const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { execFileSync } = require('node:child_process');

// A disposable PostgreSQL cluster and HTTP adapter for the real Vercel handler.
// Never loads .env.local or connects to the production database.
async function startLocalSite() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dfc-integration-'));
  const data = path.join(directory, 'pg');
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' });
  let started = false;
  let server;
  let sql;
  let gate = null;
  async function close() {
    if (gate) gate.release();
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (sql) await sql.end({ timeout: 5 });
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(directory, { recursive: true, force: true });
  }
  try {
    run('initdb', ['-D', data, '-U', 'dfc_test', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(data, 'server.key'), '-out', path.join(data, 'server.crt'), '-days', '1', '-subj', '/CN=localhost']);
    fs.chmodSync(path.join(data, 'server.key'), 0o600);
    run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory} -c ssl=on`, '-w', 'start']);
    started = true;
    process.env.POSTGRES_URL = `postgres://dfc_test@127.0.0.1:${port}/postgres`;
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_PASSWORD = 'local-integration-only';
    sql = await require('../../lib/db').db();
    const handler = require('../../api');
    const publicRoot = path.resolve('public');
    const types = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf' };
    server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const pathname = decodeURIComponent(url.pathname);
        const file = path.resolve(publicRoot, '.' + (pathname === '/admin/' || pathname === '/admin' ? '/admin/index.html' : pathname));
        if (file.startsWith(publicRoot + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
          return res.end(fs.readFileSync(file));
        }
        req.query = Object.fromEntries(url.searchParams);
        if (pathname.startsWith('/api/')) req.query.__path = pathname.slice(5);
        else if (pathname === '/' || pathname === '/index.html') req.query.__path = 'page/Dfc';
        else if (pathname.startsWith('/projects/')) req.query.__path = 'page' + pathname;
        else if (pathname.endsWith('.html')) req.query.__path = 'page' + pathname;
        else req.query.__path = 'legacy' + pathname;
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        if (chunks.length) req.body = JSON.parse(Buffer.concat(chunks).toString());
        res.status = code => { res.statusCode = code; return res; };
        res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        res.send = value => res.end(value);
        res.redirect = (code, location) => { res.statusCode = code; res.setHeader('Location', location); res.end(); };
        if (gate && ['POST', 'PUT'].includes(req.method) && !pathname.includes('/auth/')) {
          const waiting = gate;
          gate = null;
          waiting.arrived();
          await waiting.promise;
        }
        await handler(req, res);
      } catch (error) {
        res.statusCode = 500;
        res.end(error.message);
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
      sql, close, url: `http://127.0.0.1:${server.address().port}`,
      pauseNextWrite() {
        let release, arrived;
        const promise = new Promise(resolve => { release = resolve; });
        const pending = new Promise(resolve => { arrived = resolve; });
        gate = { promise, release, arrived };
        return { pending, release };
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { startLocalSite };
