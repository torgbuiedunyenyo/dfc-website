const assert = require('node:assert/strict');
const test = require('node:test');

const { pastIndex } = require('../scripts/build-wix-import');
const sourcePast = require('../migration/wix-source/pages/past.json');
const mediaMap = require('../migration/wix-media-map.json').entries;

test('Wix Past thumbnails follow the visual tile pairings instead of DOM array order', () => {
  const curated = pastIndex(sourcePast);
  const byPath = new Map(curated.map((item) => [item.source_path, item.thumbnail]));

  const expectedMediaIndex = {
    '/copy-of-home-2': 0,
    '/about-4-1': 1,
    '/ariel-cooper': 5,
    '/copy-of-annex': 6,
    '/about-1-1': 7,
    '/copy-of-rasa-1': 8,
    '/rickys-tribune-barber-shop': 9,
    '/copy-of-quinn-keck': 10,
    '/copy-of-right-now-laura-van-duren': 11,
    '/copy-of-rickys-tribune-barber-shop': 12,
    '/coming-soon-1': 13,
    '/coming-soon': 14,
    '/copy-of-re-worlding-the-unimaginablee': 15,
    '/nuestra-lucha-es-por-la-vida': 16,
    '/copy-of-right-now-olivia-cueva-resid': 17,
    '/liyang-network-teach-in': 18,
    '/the-witness-to-witness-program': 19,
    '/new-horizons': 20,
    '/object-ify-ourselves': 21,
    '/aesthetics-politics-neoliberalism': 22,
    '/innovator-incubator': 23,
    '/fortaleza-strength': 24,
    '/4continents': 25,
    '/borderless-imaginary-dinner': 26,
    '/pop-up-bookshop': 27,
  };

  for (const [sourcePath, mediaIndex] of Object.entries(expectedMediaIndex)) {
    const media = sourcePast.media[mediaIndex];
    const expected = (mediaMap[media.src] || mediaMap[media.original_src]).local_url;
    assert.equal(byPath.get(sourcePath), expected, `${sourcePath} must use source-grid media ${mediaIndex}`);
  }

  assert.equal(curated.filter((item) => item.thumbnail).length, 25);
  assert.equal(byPath.get('/copy-of-right-now-fertile-dreams'), null);
  assert.equal(byPath.get('/copy-of-right-now-limb-stories'), null);
  assert.equal(byPath.get('/tosha-stimage-residency'), null);
  assert.equal(byPath.get('/mail-art-round-3'), null);
});
