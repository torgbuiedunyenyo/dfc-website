const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cheerio = require('cheerio');

const { pastIndex } = require('../scripts/build-wix-import');
const { tiles } = require('../migration/wix-past-grid');
const { pastGridHtml } = require('../lib/render');
const mediaMap = require('../migration/wix-media-map.json').entries;

const expectedTitles = [
  '3 years Upstream',
  'Workshop of Care & Repair',
  'The World is Our Hospital',
  'Szívküldi Lakótelep: Judit Navratil',
  'Ariel Cooper',
  'Rad Tender',
  'Wyrm Temple',
  'Food Monument',
  'Encounters',
  'Quinn Keck',
  'Chaves Smith',
  'Laura Van Duren',
  'Thinking Outside of the Box',
  'RASA',
  'Salt, Vessels and Tender Emissions',
  'Macrowaves',
  'More Limb Stories',
  'a leaf, a gourd, a shell...',
  'All Land Is Holy',
  'Limb Stories & Other Bodily Extensions',
  'Kim Anno & SIGNs',
  'Fertile Dreams',
  'Jes Young AIR',
  'Mast Year',
  'MOM',
  'TO THE NAKED',
  'Indigo, Cotton, Sugar, Salt, Silver, Gold',
  'Poetics of Desire',
  'Nuestra Lucha',
  'Monuments of Memory',
  'Everything and More',
  'Cat Lauigan Residency',
  'Loose Ends',
  'Mickey-Me, Shipwreck and Possibility',
  'Dreamlines & Dirt Scars',
  'Tosha Stimage Residency',
  'Fruitful Bodies',
  'Solar Mothers',
  'For Democracy',
  'The Future Emergent',
  'Activists, Ancestors & Comrades',
  'Mail Art',
  'My Hammock is your Hammock',
  'AIR: Serena JV Elston',
  'In The Neighborhood of Freedom',
  'Rad Craft + Design',
  "What's Mine Is Yours",
  'Subterranean Borders',
  'The White Privilege Reading Room',
  'You Meaning Me',
  'The Life of a Block',
  'Artifacts',
  'Desperate Holdings',
  'Tipping Point',
  'Mini Residencies',
  'Nègre',
  'Political Birthdays',
  'Bloodroot',
  'Radical Departures',
  'Body Body Body',
  'Liyang Network Teach-In',
  'The Witness to Witness Program',
  'New Horizons',
  '"Object-ify" Ourselves!',
  'Neoliberalism & Anxiety',
  'Innovator Incubator',
  'FORTALEZA = STRENGTH',
  '4 Continents',
  'Borderless Imaginary Dinner',
  'Pop-Up Bookshop',
];

test('Past manifest preserves all 70 visible Wix tiles in exact visual order', () => {
  assert.deepEqual(tiles.map((tile) => tile.title), expectedTitles);
  assert.deepEqual(
    tiles.reduce((counts, tile) => ({ ...counts, [tile.category]: (counts[tile.category] || 0) + 1 }), {}),
    {
      'Exhibitions + Residencies': 60,
      'Selected Talks + Workshops': 6,
      'Other Events': 4,
    },
  );
  assert.equal(new Set(tiles.map((tile) => tile.slug)).size, 70);
  assert.equal(new Set(tiles.map((tile) => tile.media_id)).size, 70);
});

test('every Past tile resolves to its own downloaded gallery image', () => {
  const curated = pastIndex();
  assert.equal(curated.length, 70);

  for (const [index, item] of curated.entries()) {
    const media = mediaMap[item.source_url];
    assert.ok(media, `missing media map entry for tile ${index}: ${item.title}`);
    assert.equal(item.thumbnail, media.local_url);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', media.local_url)), `missing file for tile ${index}: ${item.title}`);
  }
  assert.equal(new Set(curated.map((item) => item.thumbnail)).size, 70);
});

test('Past card images link to matching project pages or their gallery-only image', () => {
  const html = pastGridHtml([
    {
      slug: 'project-with-page',
      title: 'Project With Page',
      category: 'Exhibitions + Residencies',
      thumbnail: '/ImportedMedia/page.jpg',
      body_html: '<p>Project content</p>',
    },
    {
      slug: 'gallery-only',
      title: 'Gallery Only',
      category: 'Exhibitions + Residencies',
      thumbnail: '/ImportedMedia/gallery.jpg',
      body_html: '',
    },
  ]);
  const $ = cheerio.load(html);
  const cards = $('td').slice(0, 2);

  assert.equal(cards.eq(0).find('.past-card-image').attr('href'), '/projects/project-with-page.html');
  assert.equal(cards.eq(0).find('h5 a').attr('href'), '/projects/project-with-page.html');
  assert.equal(cards.eq(1).find('.past-card-image').attr('href'), '/ImportedMedia/gallery.jpg');
  assert.equal(cards.eq(1).find('h5 a').attr('href'), '/ImportedMedia/gallery.jpg');
});
