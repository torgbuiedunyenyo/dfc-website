const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cheerio = require('cheerio');

const cycle = require('../migration/programming-cycle-2026-08-30');
const wixImport = require('../migration/wix-import.json');
const { futureToColumn } = require('../lib/move');
const { renderPage } = require('../lib/render');
const { PRESERVED_LOCAL_PAST_SLUGS } = require('../scripts/repair-past-grid');

const root = path.join(__dirname, '..');

function normalize(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTitle(value) {
  const $ = cheerio.load(value || '');
  return $('h1,h2,h3,p').first().text().replace(/\s+/g, ' ').trim();
}

test('Here After preserves the exact live Coming Soon text and both source images', () => {
  const $ = cheerio.load(cycle.future.html);
  $('br').replaceWith('\n');

  assert.equal(normalize($.root().text()), normalize(cycle.future.expected_visible_text));
  assert.equal(contentTitle(cycle.future.html), 'Here After');
  assert.deepEqual(
    $('.source-content-media img').toArray().map((img) => $(img).attr('src')),
    cycle.future.images.map((image) => image.local_url),
  );

  for (const image of cycle.future.images) {
    const file = path.join(root, 'public', image.local_url);
    const data = fs.readFileSync(file);
    assert.equal(data.length, image.bytes, `${image.local_url} byte count changed`);
    assert.equal(
      crypto.createHash('sha256').update(data).digest('hex'),
      image.sha256,
      `${image.local_url} checksum changed`,
    );
  }
});

test('SEA CHANGE becomes the Current main-gallery content without losing its imported media or copy', () => {
  const seaChange = wixImport.content_regions.find((region) => region.key === 'future.source-content');
  assert.ok(seaChange, 'missing audited SEA CHANGE source region');
  assert.equal(contentTitle(seaChange.value), 'SEA CHANGE');

  const current = futureToColumn(seaChange.value, 'DREAM FARM COMMONS');
  const source = cheerio.load(seaChange.value);
  const moved = cheerio.load(current);
  assert.equal(moved('img').length, source('img').length);
  assert.match(moved.root().text(), /SEA CHANGE/);
  assert.match(moved.root().text(), /Visitors are encouraged to visit each three-week phase/);
});

test('an intentionally empty Annex disappears publicly but remains editable', async () => {
  const rows = [
    { key: 'current.column-1', kind: 'html', value: '<h3>DREAM FARM COMMONS</h3><p>SEA CHANGE</p>' },
    { key: 'current.column-2', kind: 'html', value: '<h3>THE ANNEX</h3>' },
  ];
  const client = async () => rows;

  const publicPage = cheerio.load(await renderPage(client, 'Current'));
  assert.equal(publicPage('.current-exhibition').length, 1);
  assert.equal(publicPage('#annex').length, 0);
  assert.equal(publicPage('.current-section-links a[href="#annex"]').length, 0);

  const editorPage = cheerio.load(await renderPage(client, 'Current', { editMode: true }));
  assert.equal(editorPage('.current-exhibition').length, 2);
  assert.equal(editorPage('#annex').attr('data-cms'), 'current.column-2');
});

test('Past-grid repair preserves the locally archived GENIUS LOCI addition', () => {
  assert.ok(PRESERVED_LOCAL_PAST_SLUGS.has(cycle.past_addition.slug));
  assert.equal(cycle.past_addition.category, 'Exhibitions + Residencies');
});
