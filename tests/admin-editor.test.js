const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cheerio = require('cheerio');

const { PAGES, renderPage, renderProject } = require('../lib/render');

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
  assert.match(source, /JUNK_STYLES = \['font-family', 'font-size', 'font', 'color', 'background', 'background-color'/);
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

test('every public page has one accessible Mailchimp signup immediately above its footer', async () => {
  const client = async () => [];

  for (const page of Object.keys(PAGES)) {
    const html = await renderPage(client, page);
    const $ = cheerio.load(html);
    const signup = $('.newsletter-signup');
    const form = signup.find('form.newsletter-signup__form');

    assert.equal(signup.length, 1, `${page} should have one signup section`);
    assert.equal($('footer').prev().is('.newsletter-signup'), true, `${page} signup should sit above the footer`);
    assert.equal(form.attr('action'), 'https://dreamfarmcommons.us18.list-manage.com/subscribe/post');
    assert.equal(form.attr('method'), 'post');
    assert.equal(form.attr('target'), 'mailchimp-signup');
    assert.equal(form.find('input[name="u"]').attr('value'), 'b8ff844e25e27b150bd35536c');
    assert.equal(form.find('input[name="id"]').attr('value'), '5fb357c21c');
    assert.equal(form.find('input[name="MERGE0"][type="email"]').is('[required]'), true);
    assert.equal(form.find('input[name="b_name"][tabindex="-1"]').length, 1);
    assert.equal(form.find('button[type="submit"]').text(), 'Subscribe');
  }

  const about = cheerio.load(await renderPage(client, 'About'));
  assert.equal(about('.about-mailing-list').length, 0, 'the obsolete email-us callout should not compete with the form');
});

test('project pages receive the same newsletter signup without changing project content', async () => {
  let query = 0;
  const client = async () => {
    query += 1;
    if (query === 1) {
      return [{
        slug: 'sample-project', title: 'Sample Project', layout: 'detail',
        body_html: '<article><p>Project copy remains intact.</p></article>',
      }];
    }
    return [];
  };

  const html = await renderProject(client, 'sample-project');
  const $ = cheerio.load(html);
  assert.match($('main').text(), /Project copy remains intact/);
  assert.equal($('.newsletter-signup').length, 1);
  assert.equal($('footer').prev().is('.newsletter-signup'), true);
});

test('newsletter signup styling preserves the desktop split and stacks the form on small screens', () => {
  const css = fs.readFileSync(path.join(root, 'public/Dfc.css'), 'utf8');
  assert.match(css, /\.newsletter-signup__inner\s*\{[^}]*grid-template-columns:\s*minmax\(0, 0\.9fr\) minmax\(360px, 1\.1fr\)/s);
  assert.match(css, /@media screen and \(max-width: 768px\)[\s\S]*?\.newsletter-signup__inner\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media screen and \(max-width: 480px\)[\s\S]*?\.newsletter-signup__form\s*\{[^}]*grid-template-columns:\s*1fr/s);
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
  // Images are selected by click (hover retargeted after layout shifts) and
  // the selection outline class never reaches saved HTML.
  assert.ok(!/mouseover/.test(source.split('image toolbar')[1] || source), 'image toolbar must not use hover selection');
  assert.match(source, /cms-img-selected/);
  assert.match(source, /classList\.remove\('cms-img-selected'\)/);
});

test('admin has no Shop card and reads calendar events with a cache-buster', () => {
  const source = fs.readFileSync(path.join(root, 'public/admin/admin.js'), 'utf8');
  assert.ok(!source.includes("'Shop'"), 'Shop page was removed from the site; admin must not list it');
  assert.match(source, /\/api\/events\?ts=/, 'admin must bypass the CDN cache when listing events');
});

test('an empty gallery space renders its header and placeholder in both public and edit views', async () => {
  const client = async () => [
    { key: 'current.column-2', kind: 'html', value: '<h3>THE ANNEX</h3>' },
  ];
  for (const editMode of [false, true]) {
    const html = await renderPage(client, 'Current', { editMode });
    const $ = cheerio.load(html);
    assert.equal($('.current-exhibitions > .current-exhibition').length, 2, 'both spaces render');
    assert.equal($('.current-section-links a[href="#annex"]').text(), 'The Annex', 'nav link kept');
    assert.match($('#annex h3').text(), /THE ANNEX/);
    assert.match($('#annex p.cms-placeholder').text(), /coming soon/i, 'placeholder visible, editMode=' + editMode);
  }
  // saves must never persist the placeholder
  const editor = fs.readFileSync(path.join(root, 'public/admin/editor.js'), 'utf8');
  assert.match(editor, /cms-addimg, \.cms-placeholder'/);
});

test('pasted rich text is flattened to toolbar-supported formatting only', () => {
  const source = fs.readFileSync(path.join(root, 'public/admin/editor.js'), 'utf8');
  assert.match(source, /addEventListener\('paste'/);
  assert.match(source, /sanitizePastedHtml/);
  assert.match(source, /PASTE_INLINE = \{ STRONG: 1, B: 1, EM: 1, I: 1, U: 1, A: 1 \}/);
  // block wrappers are flattened so a pasted <div> can never split a <p) region
  assert.match(source, /PASTE_BLOCK/);
  assert.match(source, /execCommand\('insertHTML'/);
});
