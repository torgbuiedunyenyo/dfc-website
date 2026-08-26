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
  assert.match($('[data-cms="about.intro"]').text(), /Founded by Ann Schnake, Robert Gomez Hernandez, and Stacey Goodman in 2018/);
});

test('visual editor exposes the required block, font, alignment, and image controls', () => {
  const source = fs.readFileSync(path.join(root, 'public/admin/editor.js'), 'utf8');

  for (const control of [
    'cms-blockstyle',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Quote',
    'cms-font',
    'Melodrama',
    'Aktiv Grotesk',
    'Roboto',
    'Lato',
    'Story Script',
    'cms-align',
    'cms-bold',
    'cms-italic',
    'cms-underline',
    'cms-addimage',
  ]) {
    assert.ok(source.includes(control), `missing editor control: ${control}`);
  }
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

test('page presentation adjustments apply to CMS-backed colleague feedback', async () => {
  const client = async () => [
    {
      key: 'about.intro',
      kind: 'html',
      value: 'Originally founded in 2018, the dream became a shared gathering place.',
    },
    {
      key: 'current.column-1',
      kind: 'html',
      value: '<h3>DREAM FARM COMMONS</h3><p>Main gallery exhibition.</p>',
    },
    {
      key: 'visit.body',
      kind: 'html',
      value: '<p>Restrooms are downstairs by elevator.</p><img src="/Images/Dfcstreetview.jpg" alt="Street View">',
    },
  ];

  const about = cheerio.load(await renderPage(client, 'About'));
  assert.match(about('[data-cms="about.intro"]').text(), /Founded by Ann Schnake, Robert Gomez Hernandez, and Stacey Goodman in 2018/);

  const current = cheerio.load(await renderPage(client, 'Current'));
  assert.equal(current('[data-cms="current.column-1"] h3').first().text(), 'IN MAIN GALLERY');

  const visit = cheerio.load(await renderPage(client, 'Visit'));
  assert.match(visit('.visit-highlight').text(), /349 15th Street, Oakland, CA 94612/);
  assert.match(visit('[data-cms="visit.body"]').text(), /one step up to the elevator/);
  assert.equal(visit('.visit-access-note').nextAll('img').length, 1);
});

test('site colors are controlled by a reusable muted palette', () => {
  const siteCss = fs.readFileSync(path.join(root, 'public/Dfc.css'), 'utf8');
  for (const token of ['--site-bg', '--site-header-bg', '--site-accent', '--site-text', '--site-muted', '--site-border']) {
    assert.ok(siteCss.includes(token), `missing palette token: ${token}`);
  }
  assert.match(siteCss, /body\s*\{[^}]*background-color:\s*var\(--site-bg\)/s);
  assert.match(siteCss, /\.site-header\s*\{[^}]*background-color:\s*var\(--site-bg\)/s);
  assert.match(siteCss, /\.future-source-content \.source-content-media\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
  assert.match(siteCss, /\.donate-intro\s*\{[^}]*padding-bottom:\s*14px/s);
});
