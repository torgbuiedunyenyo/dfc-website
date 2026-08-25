#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'migration', 'wix-source');
const migration = JSON.parse(fs.readFileSync(path.join(ROOT, 'migration', 'wix-import.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'manifest.json'), 'utf8'));
const mediaMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'migration', 'wix-media-map.json'), 'utf8'));
const missingMedia = JSON.parse(fs.readFileSync(path.join(ROOT, 'migration', 'wix-media-missing.json'), 'utf8'));

function normalize(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

function pageFor(entry) {
  return JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, entry.file), 'utf8'));
}

const sourcePages = manifest.pages.map(pageFor);
const sourceByPath = new Map(sourcePages.map((page) => [page.path, page]));
const projectByPath = new Map(migration.projects.map((project) => [project.source_path, project]));
const accounted = new Set([
  ...Object.values(migration.top_level_sources),
  ...migration.projects.map((project) => project.source_path),
]);

assert.equal(manifest.errors.length, 0, 'source crawl must have no request errors');
assert.equal(manifest.crawled_page_count, 104, 'expected public source page count changed');
assert.equal(accounted.size, manifest.crawled_page_count, 'every crawled source page must have a destination');
for (const page of sourcePages) assert(accounted.has(page.path), `unmapped source page: ${page.path}`);
assert.equal(migration.integrity_errors.length, 0, 'build reported content-integrity errors');
assert.equal(migration.curated_past_count, 34, 'current source Past link count changed');
assert.deepEqual(
  Object.fromEntries(['Exhibitions + Residencies', 'Selected Talks + Workshops', 'Other Events']
    .map((category) => [category, migration.curated_past.filter((item) => item.category === category).length])),
  { 'Exhibitions + Residencies': 24, 'Selected Talks + Workshops': 6, 'Other Events': 4 },
);

const renderedImageUrls = new Set();
for (const project of migration.projects) {
  const source = sourceByPath.get(project.source_path);
  assert(source, `missing source for ${project.slug}`);
  const $ = cheerio.load(project.body_html);
  const outputText = normalize($.text());
  for (const block of source.rich_text) {
    const text = normalize(block.text);
    assert(!text || outputText.includes(text), `${project.source_path}: rich text was changed or omitted`);
  }
  const sourceImages = source.media.filter((item) => item.type === 'image' && item.src && !item.src.startsWith('data:')).length;
  assert.equal($('img').length, sourceImages, `${project.source_path}: image occurrence count differs`);
  $('img').each((_, image) => renderedImageUrls.add($(image).attr('src')));
}

for (const region of migration.content_regions.filter((item) => item.kind === 'html')) {
  const $ = cheerio.load(region.value);
  $('img').each((_, image) => renderedImageUrls.add($(image).attr('src')));
}

const regions = new Map(migration.content_regions.map((region) => [region.key, region]));
const topPageRegions = {
  '/': ['home.source-content'],
  '/about': ['about.intro', 'about.bios'],
  '/right-now-1': ['current.column-1'],
  '/about-5': ['current.column-2'],
  '/about-1-2': ['future.source-content'],
  '/how-to-support': ['donate.source-content'],
  '/shop': ['shop.source-content'],
};
for (const [sourcePath, keys] of Object.entries(topPageRegions)) {
  const source = sourceByPath.get(sourcePath);
  const html = keys.map((key) => {
    assert(regions.has(key), `missing content region ${key}`);
    return regions.get(key).value;
  }).join('\n');
  const $ = cheerio.load(html);
  const outputText = normalize($.text());
  for (const block of source.rich_text) {
    const text = normalize(block.text);
    assert(!text || outputText.includes(text), `${sourcePath}: top-level rich text was changed or omitted`);
  }
  const htmlImages = $('img').length + (sourcePath === '/about' && regions.get('about.intro-image').value ? 1 : 0);
  assert.equal(htmlImages, source.media.length, `${sourcePath}: top-level image occurrence count differs`);
}

for (const item of migration.curated_past) {
  assert(projectByPath.has(item.source_path), `/past links to an unmigrated project: ${item.source_path}`);
}
assert.equal(migration.curated_past.filter((item) => item.thumbnail).length, sourceByPath.get('/past').media.length,
  '/past thumbnail count differs from the source');

const missingUrls = new Set(missingMedia.missing.map((item) => item.source_url));
const remoteRendered = [...renderedImageUrls].filter((url) => /^https?:/i.test(url));
assert.deepEqual(new Set(remoteRendered), missingUrls, 'only source-unavailable images may remain remote');
assert.equal(mediaMap.downloaded_count, Object.keys(mediaMap.entries).length);
assert.equal(mediaMap.unavailable_count, missingMedia.unavailable_count);
assert.equal(mediaMap.unavailable_count, 15, 'unavailable source media count changed; rerun and review the audit');

for (const item of Object.values(mediaMap.entries)) {
  const file = path.join(ROOT, 'public', item.local_url.replace(/^\//, ''));
  assert(fs.existsSync(file), `downloaded media file is missing: ${item.local_url}`);
  const data = fs.readFileSync(file);
  assert.equal(data.length, item.bytes, `media size mismatch: ${item.local_url}`);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), item.sha256, `media checksum mismatch: ${item.local_url}`);
}

const visitTemplate = fs.readFileSync(path.join(ROOT, 'templates', 'Visit.html'), 'utf8');
const homeTemplate = fs.readFileSync(path.join(ROOT, 'templates', 'Dfc.html'), 'utf8');
assert(homeTemplate.includes('349 15th Street'), 'the homepage footer must include the gallery address');
assert(visitTemplate.includes('Paid metered street parking is available every day of the week.'), 'the user-corrected parking policy must be preserved');
assert(!/free (?:on Sundays|after 6PM)/i.test(visitTemplate), 'outdated free-parking language must not return');

console.log(JSON.stringify({
  verified_source_pages: sourcePages.length,
  verified_projects: migration.projects.length,
  curated_past_projects: migration.curated_past_count,
  downloaded_media: mediaMap.downloaded_count,
  downloaded_megabytes: Number((mediaMap.total_bytes / 1024 / 1024).toFixed(1)),
  unavailable_source_media: mediaMap.unavailable_count,
}, null, 2));
