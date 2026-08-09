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
