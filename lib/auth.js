const crypto = require('crypto');

const COOKIE_NAME = 'dfc_session';
const SESSION_DAYS = 90;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

async function createSession(client, author) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await client`INSERT INTO sessions (token, author, expires_at) VALUES (${token}, ${author || null}, ${expires})`;
  return { token, expires };
}

async function getSession(client, req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const rows = await client`SELECT token, author, expires_at FROM sessions WHERE token = ${token} AND expires_at > now()`;
  return rows[0] || null;
}

async function destroySession(client, req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) await client`DELETE FROM sessions WHERE token = ${token}`;
}

function sessionCookie(token, expires) {
  const secure = process.env.NODE_ENV !== 'development' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; Expires=${expires.toUTCString()}; HttpOnly; SameSite=Lax${secure}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`;
}

function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { parseCookies, createSession, getSession, destroySession, sessionCookie, clearCookie, checkPassword, COOKIE_NAME };
