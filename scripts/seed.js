// One-time (idempotent) migration: extracts the site's existing content into
// the CMS database. Safe to re-run — it never overwrites rows that already exist.
//
// Usage: node --env-file=.env.local scripts/seed.js

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { db, getSql } = require('../lib/db');

const ROOT = path.join(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const SEED_PROJECTS = path.join(ROOT, 'seed-data', 'projects');
const SEED_ROOT = path.join(ROOT, 'seed-data');

const PAGE_TEMPLATES = ['Dfc.html', 'About.html', 'Current.html', 'Future.html', 'Past.html', 'Visit.html', 'Donate.html', 'Shop.html'];

// The Past Projects grid in original display order. file: html file the entry
// links to (null = stub with no page yet). Grid titles are the curated display titles.
const GRID = [
  { title: 'Always Hungry Never Perfect', file: 'root:AHNP.html', slug: 'AHNP' },
  { title: 'Rad Tender', file: 'RadT.html', slug: 'RadT' },
  { title: 'Temple Wyrm', file: 'TW.html', slug: 'TW' },
  { title: 'Food Bank Monument', file: 'FBM.html', slug: 'FBM' },
  { title: 'Encounters', file: 'Encounters.html', slug: 'Encounters' },
  { title: 'Quinn Keck', file: 'QuinnKeck.html', slug: 'QuinnKeck' },
  { title: 'Chaves Smith', file: 'ChavesSmith.html', slug: 'ChavesSmith' },
  { title: 'Laura Van Duren', file: 'LauraVanDuren.html', slug: 'LauraVanDuren' },
  { title: 'Thinking Outside', file: 'ThinkingOutside.html', slug: 'ThinkingOutside' },
  { title: 'RASA', file: 'RASA.html', slug: 'RASA' },
  { title: 'Salt, Vessels + Tender', file: 'SaltVessels.html', slug: 'SaltVessels' },
  { title: 'Macrowaves', file: 'Macrowaves.html', slug: 'Macrowaves' },
  { title: 'More Limb Stories', file: 'MoreLimbStories.html', slug: 'MoreLimbStories' },
  { title: 'a leaf, a gourd, a shell', file: 'LeafGourdShell.html', slug: 'LeafGourdShell' },
  { title: 'All Land is Holy', file: 'AllLandIsHoly.html', slug: 'AllLandIsHoly' },
  { title: 'Limb Stories', file: 'LimbStories.html', slug: 'LimbStories' },
  { title: 'Kim Anno & SIGNs', file: 'KimAnnoSigns.html', slug: 'KimAnnoSigns' },
  { title: 'FERTILE DREAMS', file: 'FertileDreams.html', slug: 'FertileDreams' },
  { title: 'JES YOUNG AIR', file: 'JesYoungAir.html', slug: 'JesYoungAir' },
  { title: 'MAST YEAR', file: 'MastYear.html', slug: 'MastYear' },
  { title: 'MOM', file: 'MOM.html', slug: 'MOM' },
  { title: 'TO THE NAKED', file: null, slug: 'ToTheNaked' },
  { title: 'Indigo, Cotton, Sugar', file: 'IndigoCotton.html', slug: 'IndigoCotton' },
  { title: 'Poetics of Desire', file: null, slug: 'PoeticsOfDesire' },
  { title: 'Nuestra Lucha', file: null, slug: 'NuestraLucha' },
  { title: 'Tosha Stimage Residency', file: 'ToshaStimage.html', slug: 'ToshaStimage' },
  { title: 'Everything and More', file: null, slug: 'EverythingAndMore' },
  { title: 'Cat Lauigan Residency', file: 'CatLauigan.html', slug: 'CatLauigan' },
  { title: 'Loose Ends', file: 'LooseEnds.html', slug: 'LooseEnds' },
  { title: 'Mickey-Me, Shipwreck + Possibility', file: null, slug: 'MickeyMeShipwreck' },
  { title: 'Dreamlines & Dirt Scars', file: null, slug: 'DreamlinesDirtScars' },
  { title: 'Fruitful Bodies', file: null, slug: 'FruitfulBodies' },
  { title: 'Solar Mothers', file: 'SolarMothers.html', slug: 'SolarMothers' },
  { title: 'For Democracy', file: null, slug: 'ForDemocracy' },
  { title: 'The Future Emergent', file: null, slug: 'TheFutureEmergent' },
  { title: 'Activists, Ancestors & Comrades', file: 'ActivistsAncestors.html', slug: 'ActivistsAncestors' },
  { title: 'Mail Art', file: 'MailArt.html', slug: 'MailArt' },
  { title: 'My Hammock is your Hammock', file: null, slug: 'MyHammock' },
  { title: 'AIR: Serena JV Elston', file: null, slug: 'SerenaJVElston' },
  { title: 'In the Neighborhood of Freedom', file: null, slug: 'NeighborhoodOfFreedom' },
  { title: 'Rad Craft + Design', file: null, slug: 'RadCraftDesign' },
  { title: "What's Mine in Yours", file: 'WhatsMineIsYours.html', slug: 'WhatsMineIsYours' },
  { title: 'Subterranean Borders', file: 'SubterraneanBorders.html', slug: 'SubterraneanBorders' },
  { title: 'The White Privilege Reading Room', file: null, slug: 'WhitePrivilegeReadingRoom' },
  { title: 'You Meaning Me', file: null, slug: 'YouMeaningMe' },
  { title: 'The Life of a Bloak', file: null, slug: 'LifeOfABloak' },
  { title: 'Artifacts', file: null, slug: 'Artifacts' },
  { title: 'Desperate Holdings', file: 'DesperateHoldings.html', slug: 'DesperateHoldings' },
  { title: 'Tipping Point', file: 'TippingPoint.html', slug: 'TippingPoint' },
  { title: 'Mini Residencies', file: null, slug: 'MiniResidencies' },
  { title: 'Nègre', file: 'Negre.html', slug: 'Negre' },
  { title: 'Political Birthdays', file: 'PoliticalBirthdays.html', slug: 'PoliticalBirthdays' },
  { title: 'Bloodroot', file: 'Bloodroot.html', slug: 'Bloodroot' },
  { title: 'Radical Departures', file: null, slug: 'RadicalDepartures' },
  { title: 'Body Body Body', file: 'BodyBodyBody.html', slug: 'BodyBodyBody' },
];

// Events copied from the original hand-coded calendar on Future.html
const EVENTS = [
  { date: '2026-03-01', end: '2026-03-31', title: 'Cassie Thornton' },
  { date: '2026-04-01', end: '2026-04-30', title: 'Three Years Upstream' },
  { date: '2026-06-05', end: '2026-06-05', title: 'Opening Reception — Summer Group Show' },
  { date: '2026-06-06', end: '2026-07-18', title: 'Summer Group Show' },
  { date: '2026-06-20', end: '2026-06-20', title: 'Artist Talk: Panel Discussion' },
  { date: '2026-07-10', end: '2026-07-10', title: 'Poetry Reading + Sound Performance' },
  { date: '2026-07-18', end: '2026-07-18', title: 'Closing Party — Summer Group Show' },
  { date: '2026-08-01', end: '2026-08-28', title: 'Residency: Open Studios' },
  { date: '2026-08-15', end: '2026-08-15', title: 'Film Screening + Discussion' },
  { date: '2026-09-04', end: '2026-09-04', title: 'Opening Reception — Fall Exhibition' },
  { date: '2026-09-05', end: '2026-10-17', title: 'Fall Exhibition' },
];

const PLACEHOLDER = '/Images/PPHoldingImage.jpg';

function normalizeUrls(html) {
  return html
    .replace(/(src|href)="(\.\.\/)?Images\//g, '$1="/Images/')
    .replace(/href="(\.\.\/)?(About|Current|Future|Past|Visit|Donate|Dfc)\.html"/g, 'href="/$2.html"')
    .replace(/href="(\.\.\/)?(AHNP|RadT|TW|FBM)\.html"/g, 'href="/projects/$2.html"');
}

function extractProject(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(raw);
  const main = $('main');
  if (!main.length) return null;
  const layout = (main.attr('class') || '').includes('project-page') ? 'detail' : 'single';
  const body = normalizeUrls(main.html() || '').trim();
  const $$ = cheerio.load(`<div id="x">${body}</div>`);
  const firstImg = $$('#x img').first().attr('src') || null;
  let title = $$('#x h3').first().text().trim() || $$('#x h5').first().text().trim();
  title = title.replace(/\s+/g, ' ').trim();
  return { layout, body, thumbnail: firstImg, fileTitle: title };
}

async function main() {
  const client = await db();
  console.log('Schema ready.');

  /* ---- content regions from templates ---- */
  let contentCount = 0;
  for (const file of PAGE_TEMPLATES) {
    const $ = cheerio.load(fs.readFileSync(path.join(TEMPLATES, file), 'utf8'));
    for (const el of $('[data-cms]').toArray()) {
      const $el = $(el);
      const key = $el.attr('data-cms');
      const isImage = $el.attr('data-cms-type') === 'image';
      const value = isImage ? ($el.attr('src') || '') : ($el.html() || '').trim();
      if (!key || !value) continue;
      const result = await client`
        INSERT INTO content (key, kind, value) VALUES (${key}, ${isImage ? 'image' : 'html'}, ${value})
        ON CONFLICT (key) DO NOTHING`;
      if (result.count > 0) contentCount++;
    }
  }
  console.log(`Content regions seeded: ${contentCount}`);

  /* ---- past projects grid ---- */
  let projCount = 0;
  const seededSlugs = new Set();
  for (let i = 0; i < GRID.length; i++) {
    const entry = GRID[i];
    seededSlugs.add(entry.slug);
    let layout = 'single';
    let body = '';
    let thumbnail = PLACEHOLDER;
    if (entry.file) {
      const filePath = entry.file.startsWith('root:')
        ? path.join(SEED_ROOT, entry.file.slice(5))
        : path.join(SEED_PROJECTS, entry.file);
      const parsed = extractProject(filePath);
      if (parsed) {
        layout = parsed.layout;
        body = parsed.body;
        thumbnail = parsed.thumbnail || PLACEHOLDER;
      } else {
        console.warn(`WARN: no <main> found in ${filePath}`);
      }
    }
    const result = await client`
      INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order)
      VALUES (${entry.slug}, ${entry.title}, 'past', ${layout}, ${thumbnail}, ${body}, ${i})
      ON CONFLICT (slug) DO NOTHING`;
    if (result.count > 0) projCount++;
  }

  /* ---- project pages that exist but were never linked from the grid ---- */
  const gridFiles = new Set(GRID.filter((g) => g.file && !g.file.startsWith('root:')).map((g) => g.file));
  const allFiles = fs.readdirSync(SEED_PROJECTS).filter((f) => f.endsWith('.html'));
  let order = GRID.length;
  for (const file of allFiles.sort()) {
    if (gridFiles.has(file)) continue;
    const slug = file.replace(/\.html$/, '');
    if (seededSlugs.has(slug)) continue;
    const parsed = extractProject(path.join(SEED_PROJECTS, file));
    if (!parsed) { console.warn(`WARN: no <main> in ${file}`); continue; }
    const title = parsed.fileTitle || slug.replace(/([a-z])([A-Z])/g, '$1 $2');
    const result = await client`
      INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order)
      VALUES (${slug}, ${title}, 'archive', ${parsed.layout}, ${parsed.thumbnail || PLACEHOLDER}, ${parsed.body}, ${order++})
      ON CONFLICT (slug) DO NOTHING`;
    if (result.count > 0) projCount++;
  }
  console.log(`Projects seeded: ${projCount}`);

  /* ---- calendar events ---- */
  const [{ count: existingEvents }] = await client`SELECT count(*)::int AS count FROM events`;
  if (existingEvents === 0) {
    for (const e of EVENTS) {
      await client`INSERT INTO events (title, start_date, end_date) VALUES (${e.title}, ${e.date}, ${e.end || null})`;
    }
    console.log(`Events seeded: ${EVENTS.length}`);
  } else {
    console.log(`Events already present (${existingEvents}), skipping.`);
  }

  /* ---- baseline versions: every entity gets an initial history entry so the
         original migrated state can always be restored ---- */
  const vc1 = await client`
    INSERT INTO versions (entity_type, entity_key, action, snapshot, author)
    SELECT 'content', c.key, 'create',
           jsonb_build_object('key', c.key, 'kind', c.kind, 'value', c.value), 'site migration'
    FROM content c
    WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.entity_type = 'content' AND v.entity_key = c.key)`;
  const vc2 = await client`
    INSERT INTO versions (entity_type, entity_key, action, snapshot, author)
    SELECT 'project', p.slug, 'create',
           jsonb_build_object('slug', p.slug, 'title', p.title, 'status', p.status, 'layout', p.layout,
                              'thumbnail', p.thumbnail, 'body_html', p.body_html, 'sort_order', p.sort_order),
           'site migration'
    FROM projects p
    WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.entity_type = 'project' AND v.entity_key = p.slug)`;
  const vc3 = await client`
    INSERT INTO versions (entity_type, entity_key, action, snapshot, author)
    SELECT 'event', e.id::text, 'create',
           jsonb_build_object('id', e.id, 'title', e.title,
                              'start_date', to_char(e.start_date, 'YYYY-MM-DD'),
                              'end_date', to_char(e.end_date, 'YYYY-MM-DD'),
                              'link', e.link, 'published', e.published),
           'site migration'
    FROM events e
    WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.entity_type = 'event' AND v.entity_key = e.id::text)`;
  console.log(`Baseline versions added: ${vc1.count + vc2.count + vc3.count}`);

  const [{ count: pc }] = await client`SELECT count(*)::int AS count FROM projects`;
  const [{ count: cc }] = await client`SELECT count(*)::int AS count FROM content`;
  console.log(`Done. Totals — projects: ${pc}, content regions: ${cc}`);
  await getSql().end();
}

main().catch((err) => { console.error(err); process.exit(1); });
