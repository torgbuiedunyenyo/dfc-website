const crypto = require('crypto');
const cheerio = require('cheerio');
const { db, recordVersion } = require('../lib/db');
const auth = require('../lib/auth');
const { PAGES, renderPage, renderProject, buildProjectBody, notFoundHtml } = require('../lib/render');
const { venueHeader, clearedColumn, futureToColumn, CLEARED_FUTURE } = require('../lib/move');

const PAGE_CACHE = 'public, max-age=0, s-maxage=10, stale-while-revalidate=300';
const NO_CACHE = 'private, no-store';
const MEDIA_CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function getSegments(req) {
  let p = req.query.__path;
  if (Array.isArray(p)) p = p.join('/');
  if (!p) {
    try { p = new URL(req.url, 'http://x').pathname.replace(/^\/api\/?/, ''); } catch (e) { p = ''; }
  }
  return p ? String(p).split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } }) : [];
}

module.exports = async function handler(req, res) {
  const segs = getSegments(req);
  try {
    const client = await db();
    return await route(client, req, res, segs);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};

async function route(client, req, res, segs) {
  const [head, ...rest] = segs;

  if (head === 'page') return handlePage(client, req, res, rest);
  if (head === 'legacy') return handleLegacy(client, req, res, rest);
  if (head === 'auth') return handleAuth(client, req, res, rest);
  if (head === 'events') return handleEvents(client, req, res, rest);
  if (head === 'media') return handleMedia(client, req, res, rest);

  // Everything below requires a session
  const session = await auth.getSession(client, req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  const author = session.author || 'unknown';

  if (head === 'content') return handleContent(client, req, res, rest, author);
  if (head === 'projects') return handleProjects(client, req, res, rest, author);
  if (head === 'versions') return handleVersions(client, req, res, rest, author);

  return res.status(404).json({ error: 'Not found' });
}

async function handleLegacy(client, req, res, rest) {
  const sourcePath = `/${rest.join('/')}`.replace(/\/$/, '') || '/';
  const pageMap = {
    '/about': 'About',
    '/about-5': 'Current',
    '/about-1-2': 'Current',
    '/hereafter': 'Future',
    '/past': 'Past',
    '/contact': 'Visit',
    '/how-to-support': 'Donate',
  };
  let html = null;
  if (pageMap[sourcePath]) {
    html = await renderPage(client, pageMap[sourcePath]);
  } else {
    const rows = await client`SELECT slug FROM projects WHERE source_path = ${sourcePath}`;
    if (rows[0]) html = await renderProject(client, rows[0].slug);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', html == null ? NO_CACHE : PAGE_CACHE);
  return html == null ? res.status(404).send(notFoundHtml()) : res.status(200).send(html);
}

/* ---------- pages ---------- */

async function handlePage(client, req, res, rest) {
  const editWanted = req.query.cmsedit === '1';
  let editMode = false;
  if (editWanted) {
    const session = await auth.getSession(client, req);
    if (!session) {
      res.setHeader('Cache-Control', NO_CACHE);
      return res.redirect(302, '/admin/');
    }
    editMode = true;
  }

  let html = null;
  if (rest[0] === 'projects' && rest[1]) {
    html = await renderProject(client, decodeURIComponent(rest[1]).replace(/\.html$/, ''), { editMode });
  } else if (rest[0]) {
    const name = decodeURIComponent(rest[0]).replace(/\.html$/, '');
    if (PAGES[name]) html = await renderPage(client, name, { editMode });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', editMode ? NO_CACHE : PAGE_CACHE);
  if (html == null) {
    res.setHeader('Cache-Control', NO_CACHE);
    return res.status(404).send(notFoundHtml());
  }
  return res.status(200).send(html);
}

/* ---------- auth ---------- */

async function handleAuth(client, req, res, rest) {
  const action = rest[0];
  if (action === 'login' && req.method === 'POST') {
    const { password, name } = req.body || {};
    if (!auth.checkPassword(password)) {
      await new Promise((r) => setTimeout(r, 600));
      return res.status(401).json({ error: 'Wrong password' });
    }
    const { token, expires } = await auth.createSession(client, String(name || '').slice(0, 80) || 'unnamed');
    res.setHeader('Set-Cookie', auth.sessionCookie(token, expires));
    return res.json({ ok: true });
  }
  if (action === 'logout' && req.method === 'POST') {
    await auth.destroySession(client, req);
    res.setHeader('Set-Cookie', auth.clearCookie());
    return res.json({ ok: true });
  }
  if (action === 'me') {
    const session = await auth.getSession(client, req);
    res.setHeader('Cache-Control', NO_CACHE);
    return res.json({ authed: !!session, author: session ? session.author : null });
  }
  return res.status(404).json({ error: 'Not found' });
}

/* ---------- content regions ---------- */

async function handleContent(client, req, res, rest, author) {
  if (req.method === 'GET') {
    const rows = await client`SELECT key, kind, value, updated_at FROM content ORDER BY key`;
    return res.json({ content: rows });
  }
  if (rest[0] === 'bulk' && req.method === 'POST') {
    const changes = (req.body && req.body.changes) || [];
    if (!Array.isArray(changes) || !changes.length) return res.status(400).json({ error: 'No changes' });
    for (const ch of changes) {
      if (!ch.key || typeof ch.value !== 'string') continue;
      const kind = ch.kind === 'image' ? 'image' : 'html';
      await client`
        INSERT INTO content (key, kind, value, updated_at) VALUES (${ch.key}, ${kind}, ${ch.value}, now())
        ON CONFLICT (key) DO UPDATE SET kind = ${kind}, value = ${ch.value}, updated_at = now()`;
      await recordVersion(client, 'content', ch.key, 'update', { key: ch.key, kind, value: ch.value }, author);
    }
    return res.json({ ok: true, saved: changes.length });
  }

  // Move the Future Projects section into a Current Exhibitions column:
  // images + copy land under the column's venue header, and the Future
  // section is cleared. Both keys are version-recorded before and after.
  if (rest[0] === 'move-future' && req.method === 'POST') {
    const col = req.body && Number(req.body.column) === 2 ? 2 : 1;
    const targetKey = `current.column-${col}`;
    const futRows = await client`SELECT value FROM content WHERE key = 'future.source-content'`;
    if (!futRows.length) return res.status(404).json({ error: 'Future content not found' });
    const curRows = await client`SELECT value FROM content WHERE key = ${targetKey}`;
    const oldColumn = curRows.length ? curRows[0].value : '';
    const venue = venueHeader(oldColumn) || (col === 2 ? 'THE ANNEX' : 'DREAM FARM COMMONS');
    const newColumn = futureToColumn(futRows[0].value, venue);

    if (curRows.length) {
      await recordVersion(client, 'content', targetKey, 'update', { key: targetKey, kind: 'html', value: oldColumn }, author);
    }
    await client`
      INSERT INTO content (key, kind, value, updated_at) VALUES (${targetKey}, 'html', ${newColumn}, now())
      ON CONFLICT (key) DO UPDATE SET kind = 'html', value = ${newColumn}, updated_at = now()`;
    await recordVersion(client, 'content', targetKey, 'update', { key: targetKey, kind: 'html', value: newColumn }, author);

    await recordVersion(client, 'content', 'future.source-content', 'update', { key: 'future.source-content', kind: 'html', value: futRows[0].value }, author);
    await client`
      UPDATE content SET value = ${CLEARED_FUTURE}, updated_at = now() WHERE key = 'future.source-content'`;
    await recordVersion(client, 'content', 'future.source-content', 'update', { key: 'future.source-content', kind: 'html', value: CLEARED_FUTURE }, author);
    return res.json({ ok: true });
  }
  return res.status(404).json({ error: 'Not found' });
}

/* ---------- projects ---------- */

function slugify(title) {
  return String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
}

function projectSnapshot(p) {
  return {
    slug: p.slug, title: p.title, status: p.status, layout: p.layout,
    thumbnail: p.thumbnail, body_html: p.body_html, sort_order: p.sort_order,
    category: p.category, source_path: p.source_path,
    source_url: p.source_url, source_hash: p.source_hash,
  };
}

async function handleProjects(client, req, res, rest, author) {
  if (!rest.length) {
    if (req.method === 'GET') {
      const rows = await client`
        SELECT slug, title, status, layout, thumbnail, sort_order, category,
               source_path, source_url, source_hash,
               (length(trim(body_html)) > 0) AS has_body, updated_at
        FROM projects ORDER BY sort_order ASC, id ASC`;
      return res.json({ projects: rows });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
      const title = String(b.title).trim();
      let slug = b.slug ? slugify(b.slug) : slugify(title);
      const existing = await client`SELECT slug FROM projects WHERE slug = ${slug}`;
      if (existing.length) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
      const layout = b.layout === 'single' ? 'single' : 'detail';
      const status = ['past', 'archive', 'draft'].includes(b.status) ? b.status : 'past';
      const paragraphs = String(b.description || '')
        .split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
        .map((s) => escapeHtml(s).replace(/\n/g, '<br>'));
      const body_html = buildProjectBody({
        title, meta: escapeHtml(b.meta || ''), paragraphs,
        links: Array.isArray(b.links) ? b.links : [],
        images: Array.isArray(b.images) ? b.images : [],
        layout,
      });
      const thumbnail = b.thumbnail || (Array.isArray(b.images) && b.images[0] && b.images[0].src) || null;
      const [{ min }] = await client`SELECT COALESCE(MIN(sort_order), 1) AS min FROM projects`;
      const [row] = await client`
        INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order)
        VALUES (${slug}, ${title}, ${status}, ${layout}, ${thumbnail}, ${body_html}, ${min - 1})
        RETURNING *`;
      await recordVersion(client, 'project', slug, 'create', projectSnapshot(row), author);
      return res.json({ ok: true, project: row });
    }
  }

  // Move a Current Exhibitions column to Past: copy its images + text into a
  // new past project (two-column layout), then clear the column down to its
  // venue header. Both steps are version-recorded so they can be undone.
  if (rest[0] === 'from-current' && req.method === 'POST') {
    const col = req.body && Number(req.body.column) === 2 ? 2 : 1;
    const key = `current.column-${col}`;
    const contentRows = await client`SELECT value FROM content WHERE key = ${key}`;
    if (!contentRows.length) return res.status(404).json({ error: 'Column content not found' });

    const $ = cheerio.load(`<div id="col">${contentRows[0].value}</div>`);
    const images = $('#col img').toArray()
      .map((el) => ({ src: $(el).attr('src') || '', alt: $(el).attr('alt') || '' }))
      .filter((im) => im.src);

    let title = String((req.body && req.body.title) || '').trim();
    if (!title) {
      const h3s = $('#col h3');
      if (h3s.length) {
        const firstLine = (h3s.last().html() || '').split(/<br\s*\/?>/i)[0];
        title = cheerio.load(`<div>${firstLine}</div>`)('div').text().replace(/\s+/g, ' ').trim();
      }
      title = title || 'Current exhibition';
    }

    $('#col img').remove();
    const copyHtml = ($('#col').html() || '').trim();
    const galleryHtml = images
      .map((im) => `      <img src="${escapeHtml(im.src)}" alt="${escapeHtml(im.alt)}">`)
      .join('\n');
    const body_html = `<div class="project-detail">
    <section class="project-gallery" aria-label="${escapeHtml(title)} exhibition images">
${galleryHtml}
    </section>
    <article class="project-copy">
${copyHtml}
    </article>
  </div>`;

    let slug = slugify(title);
    const taken = await client`SELECT slug FROM projects WHERE slug = ${slug}`;
    if (taken.length) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    const [{ min }] = await client`SELECT COALESCE(MIN(sort_order), 1) AS min FROM projects`;
    const [row] = await client`
      INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order)
      VALUES (${slug}, ${title}, 'past', 'detail', ${images[0] ? images[0].src : null}, ${body_html}, ${min - 1})
      RETURNING *`;
    await recordVersion(client, 'project', slug, 'create', projectSnapshot(row), author);

    // Snapshot the column as it was (restorable), then clear it.
    await recordVersion(client, 'content', key, 'update', { key, kind: 'html', value: contentRows[0].value }, author);
    const cleared = clearedColumn(contentRows[0].value);
    await client`
      UPDATE content SET value = ${cleared}, updated_at = now() WHERE key = ${key}`;
    await recordVersion(client, 'content', key, 'update', { key, kind: 'html', value: cleared }, author);
    return res.json({ ok: true, project: row });
  }

  if (rest[0] === 'reorder' && req.method === 'POST') {
    const slugs = (req.body && req.body.slugs) || [];
    if (!Array.isArray(slugs) || !slugs.length) return res.status(400).json({ error: 'No slugs' });
    for (let i = 0; i < slugs.length; i++) {
      await client`UPDATE projects SET sort_order = ${i}, updated_at = now() WHERE slug = ${slugs[i]}`;
    }
    await recordVersion(client, 'projects-order', 'order', 'update', { slugs }, author);
    return res.json({ ok: true });
  }

  const slug = decodeURIComponent(rest[0] || '');
  if (!slug) return res.status(404).json({ error: 'Not found' });
  const rows = await client`SELECT * FROM projects WHERE slug = ${slug}`;
  const project = rows[0];

  if (req.method === 'GET') {
    if (!project) return res.status(404).json({ error: 'Not found' });
    return res.json({ project });
  }
  if (req.method === 'PUT') {
    if (!project) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const title = b.title !== undefined ? String(b.title).trim() : project.title;
    const status = b.status !== undefined && ['past', 'archive', 'draft'].includes(b.status) ? b.status : project.status;
    const layout = b.layout !== undefined && ['detail', 'single'].includes(b.layout) ? b.layout : project.layout;
    const thumbnail = b.thumbnail !== undefined ? (b.thumbnail || null) : project.thumbnail;
    const body_html = b.body_html !== undefined ? String(b.body_html) : project.body_html;
    const category = b.category !== undefined ? (b.category || null) : project.category;
    const [row] = await client`
      UPDATE projects SET title = ${title}, status = ${status}, layout = ${layout},
        thumbnail = ${thumbnail}, body_html = ${body_html}, category = ${category}, updated_at = now()
      WHERE slug = ${slug} RETURNING *`;
    await recordVersion(client, 'project', slug, 'update', projectSnapshot(row), author);
    return res.json({ ok: true, project: row });
  }
  if (req.method === 'DELETE') {
    if (!project) return res.status(404).json({ error: 'Not found' });
    await client`DELETE FROM projects WHERE slug = ${slug}`;
    await recordVersion(client, 'project', slug, 'delete', projectSnapshot(project), author);
    return res.json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

/* ---------- events ---------- */

function eventSnapshot(e) {
  return {
    id: e.id, title: e.title,
    start_date: e.start_date, end_date: e.end_date,
    link: e.link, published: e.published,
  };
}

async function handleEvents(client, req, res, rest, authorFromCaller) {
  if (req.method === 'GET' && !rest.length) {
    const session = await auth.getSession(client, req);
    const rows = await client`
      SELECT id, title, to_char(start_date, 'YYYY-MM-DD') AS start_date,
             to_char(end_date, 'YYYY-MM-DD') AS end_date, link, published
      FROM events WHERE published = true OR ${!!session}
      ORDER BY start_date DESC, id DESC`;
    res.setHeader('Cache-Control', NO_CACHE);
    return res.json({ events: rows });
  }

  const session = await auth.getSession(client, req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  const author = session.author || 'unknown';

  if (req.method === 'POST' && !rest.length) {
    const b = req.body || {};
    if (!b.title || !b.start_date) return res.status(400).json({ error: 'Title and start date are required' });
    const [row] = await client`
      INSERT INTO events (title, start_date, end_date, link, published)
      VALUES (${b.title}, ${b.start_date}, ${b.end_date || null}, ${b.link || null}, ${b.published !== false})
      RETURNING id, title, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date, link, published`;
    await recordVersion(client, 'event', row.id, 'create', eventSnapshot(row), author);
    return res.json({ ok: true, event: row });
  }

  const id = parseInt(rest[0], 10);
  if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found' });
  const rows = await client`
    SELECT id, title, to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date, 'YYYY-MM-DD') AS end_date, link, published
    FROM events WHERE id = ${id}`;
  const event = rows[0];
  if (!event) return res.status(404).json({ error: 'Not found' });

  if (req.method === 'PUT') {
    const b = req.body || {};
    const [row] = await client`
      UPDATE events SET
        title = ${b.title !== undefined ? b.title : event.title},
        start_date = ${b.start_date !== undefined ? b.start_date : event.start_date},
        end_date = ${b.end_date !== undefined ? (b.end_date || null) : event.end_date},
        link = ${b.link !== undefined ? (b.link || null) : event.link},
        published = ${b.published !== undefined ? !!b.published : event.published},
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date, link, published`;
    await recordVersion(client, 'event', id, 'update', eventSnapshot(row), author);
    return res.json({ ok: true, event: row });
  }
  if (req.method === 'DELETE') {
    await client`DELETE FROM events WHERE id = ${id}`;
    await recordVersion(client, 'event', id, 'delete', eventSnapshot(event), author);
    return res.json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

/* ---------- media ---------- */

async function handleMedia(client, req, res, rest) {
  if (req.method === 'GET' && rest[0]) {
    const id = decodeURIComponent(rest[0]);
    const rows = await client`SELECT mime, data FROM media WHERE id = ${id}`;
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Cache-Control', MEDIA_CACHE);
    return res.status(200).send(Buffer.from(rows[0].data));
  }

  const session = await auth.getSession(client, req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  if (req.method === 'GET') {
    const rows = await client`SELECT id, filename, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 200`;
    return res.json({ media: rows });
  }
  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.data_b64 || !b.mime) return res.status(400).json({ error: 'data_b64 and mime are required' });
    const data = Buffer.from(b.data_b64, 'base64');
    if (!data.length) return res.status(400).json({ error: 'Empty file' });
    if (data.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'File too large (max 4MB)' });
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' })[b.mime];
    if (!ext) return res.status(400).json({ error: 'Unsupported image type' });
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    await client`
      INSERT INTO media (id, filename, mime, size, data)
      VALUES (${id}, ${String(b.filename || '').slice(0, 200) || null}, ${b.mime}, ${data.length}, ${data})`;
    return res.json({ ok: true, id, url: `/api/media/${id}` });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

/* ---------- versions (history / undo) ---------- */

async function handleVersions(client, req, res, rest, author) {
  if (req.method === 'GET' && !rest.length) {
    const type = req.query.type || null;
    const key = req.query.key || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const rows = await client`
      SELECT id, entity_type, entity_key, action, snapshot, author, created_at
      FROM versions
      WHERE (${type}::text IS NULL OR entity_type = ${type})
        AND (${key}::text IS NULL OR entity_key = ${key})
      ORDER BY id DESC LIMIT ${limit}`;
    return res.json({ versions: rows });
  }

  if (rest[1] === 'restore' && req.method === 'POST') {
    const id = parseInt(rest[0], 10);
    const rows = await client`SELECT * FROM versions WHERE id = ${id}`;
    const v = rows[0];
    if (!v) return res.status(404).json({ error: 'Version not found' });
    const s = v.snapshot;

    if (v.entity_type === 'content') {
      await client`
        INSERT INTO content (key, kind, value, updated_at) VALUES (${s.key}, ${s.kind || 'html'}, ${s.value}, now())
        ON CONFLICT (key) DO UPDATE SET kind = ${s.kind || 'html'}, value = ${s.value}, updated_at = now()`;
    } else if (v.entity_type === 'project') {
      await client`
        INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order,
                              category, source_path, source_url, source_hash)
        VALUES (${s.slug}, ${s.title}, ${s.status}, ${s.layout}, ${s.thumbnail}, ${s.body_html}, ${s.sort_order},
                ${s.category || null}, ${s.source_path || null}, ${s.source_url || null}, ${s.source_hash || null})
        ON CONFLICT (slug) DO UPDATE SET title = ${s.title}, status = ${s.status}, layout = ${s.layout},
          thumbnail = ${s.thumbnail}, body_html = ${s.body_html}, sort_order = ${s.sort_order},
          category = ${s.category || null}, source_path = ${s.source_path || null}, source_url = ${s.source_url || null},
          source_hash = ${s.source_hash || null}, updated_at = now()`;
    } else if (v.entity_type === 'event') {
      await client`
        INSERT INTO events (id, title, start_date, end_date, link, published)
        VALUES (${s.id}, ${s.title}, ${s.start_date}, ${s.end_date}, ${s.link}, ${s.published})
        ON CONFLICT (id) DO UPDATE SET title = ${s.title}, start_date = ${s.start_date},
          end_date = ${s.end_date}, link = ${s.link}, published = ${s.published}, updated_at = now()`;
      await client`SELECT setval('events_id_seq', GREATEST((SELECT MAX(id) FROM events), 1))`;
    } else if (v.entity_type === 'projects-order') {
      const slugs = s.slugs || [];
      for (let i = 0; i < slugs.length; i++) {
        await client`UPDATE projects SET sort_order = ${i} WHERE slug = ${slugs[i]}`;
      }
    } else {
      return res.status(400).json({ error: `Cannot restore entity type ${v.entity_type}` });
    }

    await recordVersion(client, v.entity_type, v.entity_key, 'restore', s, author);
    return res.json({ ok: true });
  }
  return res.status(404).json({ error: 'Not found' });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
