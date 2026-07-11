const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const TEMPLATE_DIR = path.join(process.cwd(), 'templates');
const templateCache = {};

// Pages served from templates. Key = URL name (e.g. /About.html)
const PAGES = {
  Dfc: 'Dfc.html',
  About: 'About.html',
  Current: 'Current.html',
  Future: 'Future.html',
  Past: 'Past.html',
  Visit: 'Visit.html',
  Donate: 'Donate.html',
};

const PLACEHOLDER_THUMB = '/Images/PPHoldingImage.jpg';

function loadTemplate(file) {
  if (!templateCache[file]) {
    templateCache[file] = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
  }
  return templateCache[file];
}

async function fetchContentMap(client) {
  const rows = await client`SELECT key, kind, value FROM content`;
  const map = {};
  for (const r of rows) map[r.key] = r;
  return map;
}

function applyContent($, contentMap) {
  $('[data-cms]').each((_, el) => {
    const $el = $(el);
    const key = $el.attr('data-cms');
    const row = contentMap[key];
    if (!row) return;
    if ($el.attr('data-cms-type') === 'image') {
      $el.attr('src', row.value);
    } else {
      $el.html(row.value);
    }
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build the Past Projects grid: rows of 3 cells inside tables, matching the
// original hand-built markup so existing CSS applies untouched.
function pastGridHtml(projects) {
  const cells = projects.map((p) => {
    const thumb = p.thumbnail || PLACEHOLDER_THUMB;
    const hasPage = (p.body_html || '').trim().length > 0;
    const title = escapeHtml(p.title);
    const label = hasPage
      ? `<a href="/projects/${encodeURIComponent(p.slug)}.html">${title}</a>`
      : title;
    return `<td width="33%"><img src="${escapeHtml(thumb)}" alt="${title}" width="100%"><h5>${label}</h5></td>`;
  });
  let html = '';
  for (let i = 0; i < cells.length; i += 3) {
    const row = cells.slice(i, i + 3);
    while (row.length < 3) row.push('<td width="33%"></td>');
    html += `<table width="100%"><tr>${row.join('')}</tr></table>\n`;
  }
  return html || '<p>No past projects yet.</p>';
}

function injectEditor($, scope) {
  // scope: { type: 'page', name } | { type: 'project', slug }
  $('[data-noedit]').remove();
  $('head').append('<link rel="stylesheet" href="/admin/editor.css">');
  const body = $('body');
  body.attr('data-cms-edit', '1');
  body.attr('data-cms-scope', scope.type);
  if (scope.type === 'page') body.attr('data-cms-page', scope.name);
  if (scope.type === 'project') body.attr('data-cms-slug', scope.slug);
  body.append('<script src="/admin/editor.js"></script>');
}

async function renderPage(client, name, { editMode = false } = {}) {
  const file = PAGES[name];
  if (!file) return null;
  const $ = cheerio.load(loadTemplate(file));
  const contentMap = await fetchContentMap(client);
  applyContent($, contentMap);

  if (name === 'Past') {
    const projects = await client`
      SELECT slug, title, thumbnail, body_html FROM projects
      WHERE status = 'past' ORDER BY sort_order ASC, id ASC`;
    $('#past-grid').html(pastGridHtml(projects));
  }

  if (name === 'Future') {
    const events = await client`
      SELECT id, title, to_char(start_date, 'YYYY-MM-DD') AS date,
             to_char(end_date, 'YYYY-MM-DD') AS "end", link
      FROM events WHERE published = true ORDER BY start_date ASC`;
    $('#dfc-events-data').text(JSON.stringify(events));
  }

  if (editMode) injectEditor($, { type: 'page', name });
  return $.html();
}

async function renderProject(client, slug, { editMode = false } = {}) {
  const rows = await client`SELECT * FROM projects WHERE slug = ${slug}`;
  const project = rows[0];
  if (!project) return null;
  if (!(project.body_html || '').trim() && !editMode) return null; // stub: no public page yet

  const $ = cheerio.load(loadTemplate('project.html'));
  const contentMap = await fetchContentMap(client);
  applyContent($, contentMap);

  const main = $('main[data-cms="project.body"]');
  if (project.layout === 'detail') main.attr('class', 'project-page');
  main.html(project.body_html || defaultProjectBody(project));

  if (editMode) injectEditor($, { type: 'project', slug });
  return $.html();
}

// Scaffold for the standard two-column project page (gallery left, copy right).
function defaultProjectBody(project) {
  return buildProjectBody({
    title: project.title,
    meta: '',
    paragraphs: [],
    links: [],
    images: [],
  });
}

function buildProjectBody({ title, meta, paragraphs, links, images, layout = 'detail' }) {
  const imgs = (images || [])
    .map((im) => `      <img src="${escapeHtml(im.src)}" alt="${escapeHtml(im.alt || title)}">`)
    .join('\n');
  const paras = (paragraphs || [])
    .filter((t) => String(t).trim())
    .map((t) => `      <p>${t}</p>`)
    .join('\n');
  const linkHtml = (links || [])
    .filter((l) => l && l.url)
    .map((l) => `        <h5><a href="${escapeHtml(l.url)}" target="_blank">${escapeHtml(l.label || l.url)}</a></h5>`)
    .join('\n');

  if (layout === 'single') {
    return `<div class="container">
${imgs ? imgs + '\n' : ''}  <h5>${escapeHtml(meta || '')}</h5>
${paras}
${linkHtml ? `  <div class="project-links">\n${linkHtml}\n  </div>\n` : ''}<br><br>
</div>`;
  }

  return `<div class="project-detail">
    <section class="project-gallery" aria-label="${escapeHtml(title)} exhibition images">
${imgs}
    </section>
    <article class="project-copy">
      <h3>${escapeHtml(title)}</h3>
      ${meta ? `<p class="project-meta">${meta}</p>` : '<p class="project-meta"></p>'}
${paras}
      <div class="project-links">
${linkHtml}
      </div>
    </article>
  </div>`;
}

function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dream Farm Commons</title><link rel="stylesheet" href="/Dfc.css"></head>
<body><div class="container" style="padding-top:120px;text-align:center;">
<h3 style="padding:40px 0;">page not found</h3>
<h5><a href="/">back to dream farm commons</a></h5>
</div></body></html>`;
}

module.exports = { PAGES, renderPage, renderProject, buildProjectBody, pastGridHtml, notFoundHtml, fetchContentMap };
