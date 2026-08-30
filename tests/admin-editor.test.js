const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cheerio = require('cheerio');

const { renderPage } = require('../lib/render');

const root = path.join(__dirname, '..');

test('edit-mode pages load the visual editor without altering CMS region content', async () => {
  const client = async () => [];
  const html = await renderPage(client, 'About', { editMode: true });
  const $ = cheerio.load(html);

  assert.equal($('body').attr('data-cms-edit'), '1');
  assert.equal($('body').attr('data-cms-page'), 'About');
  assert.equal($('link[href="/admin/editor.css"]').length, 1);
  assert.equal($('script[src="/admin/editor.js"]').length, 1);
  assert.match($('[data-cms="about.intro"]').text(), /Originally founded in 2018/);
});

test('visual editor exposes block, alignment, and image controls but no font picker', () => {
  const source = fs.readFileSync(path.join(root, 'public/admin/editor.js'), 'utf8');

  for (const control of [
    'cms-blockstyle',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Quote',
    'cms-align',
    'cms-bold',
    'cms-italic',
    'cms-underline',
    'cms-addimage',
  ]) {
    assert.ok(source.includes(control), `missing editor control: ${control}`);
  }

  // Fonts are locked to the site defaults: no font picker, and saved HTML
  // is scrubbed of custom font styling.
  assert.ok(!source.includes('cms-font'), 'font picker should be removed');
  assert.ok(!source.includes("wrapSelection('span', 'fontFamily'"), 'font wrapping should be removed');
  assert.match(source, /removeProperty\('font-family'\)/);
  assert.match(source, /querySelectorAll\('font'\)/);
});

test('inserted image blocks are persisted while editor-only upload buttons are stripped', () => {
  const source = fs.readFileSync(path.join(root, 'public/admin/editor.js'), 'utf8');
  const siteCss = fs.readFileSync(path.join(root, 'public/Dfc.css'), 'utf8');

  assert.match(source, /image\.className = 'cms-image-block'/);
  assert.match(source, /region\.appendChild\(image\)/);
  assert.match(source, /cms-bar, \.cms-imgbar, \.cms-toast, \.cms-addimg/);
  assert.match(source, /dirty = \{\};\s*location\.reload\(\)/);
  assert.match(siteCss, /img\.cms-image-block\s*\{/);
  assert.match(siteCss, /blockquote\s*\{/);
});

test('current exhibitions are stacked scroll regions with links to each gallery space', async () => {
  const client = async () => [];
  const html = await renderPage(client, 'Current');
  const $ = cheerio.load(html);

  assert.equal($('.current-exhibitions > .current-exhibition').length, 2);
  assert.equal($('.current-section-links a[href="#main-gallery"]').text(), 'Main Gallery');
  assert.equal($('.current-section-links a[href="#annex"]').text(), 'The Annex');
  assert.equal($('#main-gallery').attr('data-cms'), 'current.column-1');
  assert.equal($('#annex').attr('data-cms'), 'current.column-2');

  const siteCss = fs.readFileSync(path.join(root, 'public/Dfc.css'), 'utf8');
  assert.match(siteCss, /\.current-exhibitions\s*\{[^}]*display:\s*grid/s);
  assert.match(siteCss, /\.current-exhibition\s*\{[^}]*max-height:[^;}]+;[^}]*overflow-y:\s*auto/s);
});

test('home and shared footers retain the gallery address after CMS content is applied', async () => {
  const client = async () => [
    { key: 'home.footer', kind: 'html', value: 'Home hours and contact links' },
    { key: 'global.footer', kind: 'html', value: 'Shared hours and contact links' },
  ];

  for (const page of ['Dfc', 'Current']) {
    const html = await renderPage(client, page);
    const $ = cheerio.load(html);
    assert.match($('footer').text(), /349 15th Street, Oakland, CA 94612/);
    assert.match($('footer').text(), page === 'Dfc' ? /Home hours/ : /Shared hours/);
  }
});

test('admin events are newest-first while the public calendar stays chronological', () => {
  const apiSource = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');
  const renderSource = fs.readFileSync(path.join(root, 'lib/render.js'), 'utf8');
  assert.match(apiSource, /FROM events ORDER BY start_date DESC, id DESC/);
  assert.match(renderSource, /FROM events WHERE published = true ORDER BY start_date ASC/);
});

test('image toolbar offers move, size, and placement controls for free-form regions only', () => {
  const source = fs.readFileSync(path.join(root, 'public/admin/editor.js'), 'utf8');

  for (const control of [
    'data-act="moveup"',
    'data-act="movedown"',
    'cms-imgsize',
    'cms-imgplace',
    'Full width',
    'text wraps',
  ]) {
    assert.ok(source.includes(control), `missing image control: ${control}`);
  }

  // Fixed image slots (standalone data-cms images) stay replace-only.
  assert.match(source, /var standalone = img\.hasAttribute\('data-cms'\)/);
  assert.match(source, /if \(!standalone\) \{/);
  // "Full width" spans the whole row inside the two-column gallery grid.
  assert.match(source, /gridColumn = '1 \/ -1'/);
  // Wrap placements give the image a width so text actually flows beside it.
  assert.match(source, /img\.style\.float = val/);
});
