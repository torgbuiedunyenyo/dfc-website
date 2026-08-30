const assert = require('node:assert/strict');
const test = require('node:test');
const cheerio = require('cheerio');

const { venueHeader, clearedColumn, futureToColumn, futureTitle, CLEARED_FUTURE } = require('../lib/move');

const COLUMN = `<h3>DREAM FARM COMMONS</h3>
<img src="/ImportedMedia/a.jpg" alt="one">
<p><span>MARGO MAJEWSKA</span></p>
<p><span>Opening August 1, 4-7PM</span></p>`;

const FUTURE = `<div class="source-content-grid">
  <section class="source-content-media" aria-label="coming soon">
<img src="/ImportedMedia/f1.jpg" alt="">
<img src="/ImportedMedia/f2.jpg" alt="poster">
  </section>
  <article class="source-content-copy">
<p><span>SEA CHANGE</span></p>
<p>CURATED BY GLENNA COLE ALLEE</p>
<p>Fourteen artists share an exhibition moored by themes of migration.</p>
  </article>
</div>`;

test('should keep only the venue header and a placeholder when a current column is cleared', () => {
  assert.equal(venueHeader(COLUMN), 'DREAM FARM COMMONS');
  const cleared = clearedColumn(COLUMN);
  const $ = cheerio.load(cleared);
  assert.equal($('h3').text(), 'DREAM FARM COMMONS');
  assert.equal($('img').length, 0);
  assert.match($('p').text(), /coming soon/i);
  assert.ok(!/MARGO/.test(cleared), 'moved show copy must not remain in the column');
});

test('should clear a header-less column to just the placeholder paragraph', () => {
  const cleared = clearedColumn('<p>only text</p>');
  const $ = cheerio.load(cleared);
  assert.equal($('h3').length, 0);
  assert.match($('p').text(), /coming soon/i);
});

test('should reshape future source content into a column with venue header, images, then copy', () => {
  const col = futureToColumn(FUTURE, 'THE ANNEX');
  const $ = cheerio.load(`<div id="c">${col}</div>`);
  assert.equal($('#c > h3').first().text(), 'THE ANNEX');
  assert.deepEqual(
    $('#c img').toArray().map((el) => $(el).attr('src')),
    ['/ImportedMedia/f1.jpg', '/ImportedMedia/f2.jpg']
  );
  assert.match($('#c').text(), /SEA CHANGE/);
  assert.match($('#c').text(), /migration/);
  assert.equal($('#c .source-content-grid').length, 0, 'grid wrapper should not carry over');
  // header must come before the images, images before the copy
  assert.ok(col.indexOf('<h3>') < col.indexOf('<img'), 'header precedes images');
  assert.ok(col.indexOf('f2.jpg') < col.indexOf('SEA CHANGE'), 'images precede copy');
});

test('should detect the future show title from the first meaningful text block', () => {
  assert.equal(futureTitle(FUTURE), 'SEA CHANGE');
  assert.equal(futureTitle('<p></p><p>  </p><p>Solo Show</p>'), 'Solo Show');
  assert.equal(futureTitle(''), '');
});

test('should leave the future page with a valid placeholder block after a move', () => {
  const $ = cheerio.load(CLEARED_FUTURE);
  assert.equal($('.source-content-grid .source-content-copy p').length, 1);
  assert.match($('p').text(), /announced soon/i);
});
