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
const FOOTER_ADDRESS = '349 15th Street, Oakland, CA 94612';
const MAILCHIMP_SUBSCRIBE_URL = 'https://dreamfarmcommons.us18.list-manage.com/subscribe/post';
const MAILCHIMP_ACCOUNT_ID = 'b8ff844e25e27b150bd35536c';
const MAILCHIMP_AUDIENCE_ID = '5fb357c21c';

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

function ensureFooterAddress($) {
  $('footer').each((_, el) => {
    const $footer = $(el);
    if (!$footer.text().includes(FOOTER_ADDRESS)) {
      $footer.prepend(`${FOOTER_ADDRESS}<br>\n`);
    }
  });
}

// Mailchimp's public hosted-form identifiers are intentionally embedded in
// signup forms; no API key or other private credential is exposed here.
function injectNewsletterSignup($) {
  const footer = $('footer').first();
  if (!footer.length || $('.newsletter-signup').length) return;

  footer.before(`<section class="newsletter-signup" aria-labelledby="newsletter-signup-title">
  <div class="newsletter-signup__inner">
    <div class="newsletter-signup__copy">
      <p class="newsletter-signup__eyebrow">stay in the loop</p>
      <h2 class="newsletter-signup__title" id="newsletter-signup-title">News from Dream Farm Commons</h2>
      <p class="newsletter-signup__description">Exhibitions, openings, workshops, and other news—sent occasionally.</p>
    </div>
    <form class="newsletter-signup__form" action="${MAILCHIMP_SUBSCRIBE_URL}" method="post" target="mailchimp-signup">
      <input type="hidden" name="u" value="${MAILCHIMP_ACCOUNT_ID}">
      <input type="hidden" name="id" value="${MAILCHIMP_AUDIENCE_ID}">
      <input type="hidden" name="mc_signupsource" value="hosted">
      <div class="newsletter-signup__honeypot" aria-hidden="true">
        <label for="newsletter-b-name">Leave this field empty</label>
        <input id="newsletter-b-name" name="b_name" type="text" tabindex="-1" autocomplete="off">
        <label for="newsletter-b-email">Leave this field empty</label>
        <input id="newsletter-b-email" name="b_email" type="email" tabindex="-1" autocomplete="off">
        <label for="newsletter-b-comment">Leave this field empty</label>
        <textarea id="newsletter-b-comment" name="b_comment" tabindex="-1"></textarea>
      </div>
      <div class="newsletter-signup__field">
        <label for="newsletter-email">Email address</label>
        <input id="newsletter-email" name="MERGE0" type="email" inputmode="email" autocomplete="email" required placeholder="you@example.com" aria-describedby="newsletter-signup-note">
      </div>
      <button type="submit">Subscribe</button>
      <p class="newsletter-signup__note" id="newsletter-signup-note">Mailchimp opens a confirmation page. Unsubscribe anytime.</p>
    </form>
  </div>
</section>`);
}

function hasCurrentProgram(value) {
  const $ = cheerio.load(`<div id="current-program">${value || ''}</div>`);
  const root = $('#current-program');
  if (root.find('img,video,audio,iframe').length) return true;
  root.find('h1,h2,h3,h4,h5,h6').remove();
  return root.text().replace(/[\s\u200B-\u200D\uFEFF]/g, '').length > 0;
}

// A gallery space between shows still renders — venue header plus a
// placeholder — so the page always presents both spaces.
function fillEmptyCurrentSections($, contentMap) {
  $('.current-exhibition[data-cms]').each((_, el) => {
    const section = $(el);
    const key = section.attr('data-cms');
    const row = contentMap[key];
    if (!row || hasCurrentProgram(row.value)) return;
    section.append('<p class="cms-placeholder" contenteditable="false">New exhibition coming soon.</p>');
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
  const preferredOrder = ['Exhibitions + Residencies', 'Selected Talks + Workshops', 'Other Events'];
  const groups = new Map();
  for (const project of projects) {
    const category = project.category || 'Past Projects';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(project);
  }
  const categories = [...groups.keys()].sort((a, b) => {
    const ai = preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return categories.map((category) => pastGridSection(category, groups.get(category))).join('\n');
}

function pastGridSection(category, projects) {
  const cells = projects.map((p) => {
    const thumb = p.thumbnail || PLACEHOLDER_THUMB;
    const hasPage = (p.body_html || '').trim().length > 0;
    const title = escapeHtml(p.title);
    const href = hasPage ? `/projects/${encodeURIComponent(p.slug)}.html` : thumb;
    const link = escapeHtml(href);
    return `<td width="33%"><a class="past-card-image" href="${link}"><img src="${escapeHtml(thumb)}" alt="${title}" width="100%"></a><h5><a href="${link}">${title}</a></h5></td>`;
  });
  let html = `<section class="past-section"><h3>${escapeHtml(category)}</h3>`;
  for (let i = 0; i < cells.length; i += 3) {
    const row = cells.slice(i, i + 3);
    while (row.length < 3) row.push('<td width="33%"></td>');
    html += `<table width="100%"><tr>${row.join('')}</tr></table>\n`;
  }
  return `${html}</section>`;
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
  ensureFooterAddress($);
  if (name === 'Current') fillEmptyCurrentSections($, contentMap);

  if (name === 'Past') {
    const projects = await client`
      SELECT slug, title, thumbnail, body_html, status, category FROM projects
      WHERE status = 'past'
      ORDER BY sort_order ASC, id ASC`;
    $('#past-grid').html(pastGridHtml(projects));
  }

  if (name === 'Future') {
    const events = await client`
      SELECT id, title, to_char(start_date, 'YYYY-MM-DD') AS date,
             to_char(end_date, 'YYYY-MM-DD') AS "end", link
      FROM events WHERE published = true ORDER BY start_date ASC`;
    $('#dfc-events-data').text(JSON.stringify(events));
  }

  injectNewsletterSignup($);

  if (editMode) injectEditor($, { type: 'page', name });
  return $.html();
}

async function renderProject(client, slug, { editMode = false } = {}) {
  const rows = await client`SELECT * FROM projects WHERE slug = ${slug}`;
  const project = rows[0];
  if (!project) return null;
  if (!(project.body_html || '').trim() && !editMode) return null; // stub: no public page yet

  const $ = cheerio.load(loadTemplate('project.html'));
  $('title').text(`${project.title} | Dream Farm Commons`);
  const contentMap = await fetchContentMap(client);
  applyContent($, contentMap);
  ensureFooterAddress($);

  const main = $('main[data-cms="project.body"]');
  if (project.layout === 'detail') main.attr('class', 'project-page');
  main.html(project.body_html || defaultProjectBody(project));

  injectNewsletterSignup($);

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

module.exports = {
  PAGES,
  renderPage,
  renderProject,
  buildProjectBody,
  pastGridHtml,
  notFoundHtml,
  fetchContentMap,
  hasCurrentProgram,
  injectNewsletterSignup,
};
