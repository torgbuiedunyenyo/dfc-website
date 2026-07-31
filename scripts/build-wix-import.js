#!/usr/bin/env node

/**
 * Convert the Wix crawl snapshot into clean, CMS-ready two-column project
 * records. This step does not connect to or write to the database.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, 'migration', 'wix-source');
const OUTPUT_FILE = path.join(ROOT, 'migration', 'wix-import.json');
const MEDIA_MAP_FILE = path.join(ROOT, 'migration', 'wix-media-map.json');
let LOCAL_MEDIA = {};
try {
  LOCAL_MEDIA = JSON.parse(fs.readFileSync(MEDIA_MAP_FILE, 'utf8')).entries || {};
} catch (_) {
  LOCAL_MEDIA = {};
}

const TOP_LEVEL = {
  '/': 'home',
  '/about': 'about',
  '/right-now-1': 'current-gallery',
  '/about-5': 'current-annex',
  '/about-1-2': 'future',
  '/past': 'past-index',
  '/contact': 'visit',
  '/how-to-support': 'donate',
  '/shop': 'shop',
};

// Preserve the slugs already used by the new CMS where a source page has an
// established counterpart. This prevents duplicate project cards and keeps
// existing inbound links working.
const SLUG_OVERRIDES = {
  '/copy-of-right-now-fertile-dreams': 'FertileDreams',
  '/copy-of-right-now-limb-stories': 'LimbStories',
  '/about-1': 'AllLandIsHoly',
  '/copy-of-right-now-jes-young-air': 'JesYoungAir',
  '/copy-of-right-now-alicia-escott-air': 'MastYear',
  '/copy-of-right-now-mom': 'MOM',
  '/copy-of-right-now-signs': 'KimAnnoSigns',
  '/copy-of-right-now-olivia-cueva-resid': 'LeafGourdShell',
  '/nuestra-lucha-es-por-la-vida': 'MoreLimbStories',
  '/copy-of-re-worlding-the-unimaginablee': 'Macrowaves',
  '/coming-soon': 'SaltVessels',
  '/copy-of-rickys-tribune-barber-shop': 'ThinkingOutside',
  '/coming-soon-1': 'RASA',
  '/copy-of-right-now-laura-van-duren': 'LauraVanDuren',
  '/rickys-tribune-barber-shop': 'QuinnKeck',
  '/copy-of-rasa-1': 'Encounters',
  '/copy-of-quinn-keck': 'ChavesSmith',
  '/ariel-cooper': 'RadT',
  '/copy-of-annex': 'TW',
  '/about-1-1': 'FBM',
  '/tosha-stimage-residency': 'ToshaStimage',
  '/mail-art-round-3': 'MailArt',
  '/the-witness-to-witness-program': 'WitnessProgram',
  '/liyang-network-teach-in': 'LiyangTeachIn',
  '/new-horizons': 'NewHorizons',
  '/object-ify-ourselves': 'ObjectifyOurselves',
  '/innovator-incubator': 'InnovatorIncubator',
  '/aesthetics-politics-neoliberalism': 'NeoliberalismAnxiety',
  '/borderless-imaginary-dinner': 'BorderlessDinner',
  '/pop-up-bookshop': 'PopUpBookshop',
  '/4continents': 'FourContinents',
  '/fortaleza-strength': 'Fortaleza',
  '/loose-ends-tracy-ren': 'LooseEnds',
  '/everything-and-more': 'EverythingAndMore',
  '/carissa-lillian-clark': 'CarissaClark',
  '/body-body-body': 'BodyBodyBody',
  '/mailart-r2': 'MailArtR2',
  '/you-meaning-me': 'YouMeaningMe',
  '/radical-departures': 'RadicalDepartures',
  '/mini-residencies': 'MiniResidencies',
  '/mailart-r1': 'MailArtR1',
  '/activists-ancestors-and-comrades': 'ActivistsAncestors',
  '/subterranean-borders': 'SubterraneanBorders',
  '/the-white-privilege-research-room': 'WhitePrivilegeReadingRoom',
  '/right-now-future-emergent': 'TheFutureEmergent',
  '/cat-lauigan-residency': 'CatLauigan',
  '/whats-mine-is-yours': 'WhatsMineIsYours',
  '/tipping-point': 'TippingPoint',
  '/desperate-holdings': 'DesperateHoldings',
  '/political-birthdays': 'PoliticalBirthdays',
  '/the-solar-mothers': 'SolarMothers',
  '/monuments-of-memory': 'MonumentsOfMemory',
  '/right-now-for-democracy': 'ForDemocracy',
  '/copy-of-right-now-to-the-naked-eye': 'ToTheNaked',
  '/copy-of-now-nuestra-lucha-es-por-l': 'NuestraLucha',
  '/copy-of-right-now-carissa-lillian-clark': 'MickeyMeShipwreck',
  '/copy-of-right-now-indigo-cotton': 'IndigoCotton',
  '/artifacts': 'Artifacts',
  '/negre': 'Negre',
  '/bloodroot': 'Bloodroot',
};

const SECTION_NAMES = new Set([
  'Exhibitions + Residencies',
  'Selected Talks + Workshops',
  'Other Events',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugFromPath(sourcePath) {
  return sourcePath.replace(/^\//, '').replace(/\//g, '--') || 'home';
}

function loadSnapshot() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, 'manifest.json'), 'utf8'));
  const pages = manifest.pages.map((entry) => {
    const page = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, entry.file), 'utf8'));
    return page;
  });
  return { manifest, pages, byPath: new Map(pages.map((page) => [page.path, page])) };
}

function internalDestination(href, byPath) {
  if (!href) return href;
  let url;
  try { url = new URL(href, 'https://www.dreamfarmcommons.com'); } catch (_) { return href; }
  if (!['dreamfarmcommons.com', 'www.dreamfarmcommons.com'].includes(url.hostname.toLowerCase())) return href;
  const sourcePath = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
  const top = TOP_LEVEL[sourcePath];
  if (top === 'home') return '/Dfc.html';
  if (top === 'about') return '/About.html';
  if (top === 'current-gallery' || top === 'current-annex') return '/Current.html';
  if (top === 'future') return '/Future.html';
  if (top === 'past-index') return '/Past.html';
  if (top === 'visit') return '/Visit.html';
  if (top === 'donate' || top === 'shop') return '/Donate.html';
  if (!byPath.has(sourcePath)) return href;
  const slug = SLUG_OVERRIDES[sourcePath] || slugFromPath(sourcePath);
  return `/projects/${encodeURIComponent(slug)}.html`;
}

function preserveSemanticStyle($, el) {
  const $el = $(el);
  const style = String($el.attr('style') || '').toLowerCase();
  const isBold = /font-weight\s*:\s*(?:bold|[6-9]00)/.test(style);
  const isItalic = /font-style\s*:\s*italic/.test(style);
  const isUnderline = /text-decoration[^;]*underline/.test(style);
  let inner = $el.html() || '';
  if (isUnderline) inner = `<u>${inner}</u>`;
  if (isItalic) inner = `<em>${inner}</em>`;
  if (isBold) inner = `<strong>${inner}</strong>`;
  $el.html(inner);
}

function cleanRichHtml(blockHtml, byPath) {
  const $ = cheerio.load(`<div id="root">${blockHtml || ''}</div>`, { decodeEntities: false });
  $('#root script,#root style,#root noscript,#root template,#root svg').remove();
  $('#root span').each((_, el) => preserveSemanticStyle($, el));
  $('#root a[href]').each((_, el) => {
    const $el = $(el);
    $el.attr('href', internalDestination($el.attr('href'), byPath));
    if (/^https?:\/\//i.test($el.attr('href') || '')) {
      $el.attr('target', '_blank');
      $el.attr('rel', 'noopener noreferrer');
    } else {
      $el.removeAttr('target rel');
    }
  });
  $('#root *').each((_, el) => {
    const $el = $(el);
    for (const attr of Object.keys(el.attribs || {})) {
      if ($el.is('a') && ['href', 'target', 'rel'].includes(attr)) continue;
      if (($el.is('ol') || $el.is('li')) && ['start', 'value'].includes(attr)) continue;
      $el.removeAttr(attr);
    }
  });
  $('#root span').each((_, el) => $(el).replaceWith($(el).html() || ''));
  $('#root p,#root h1,#root h2,#root h3,#root h4,#root h5,#root h6,#root li').each((_, el) => {
    const text = normalizeText($(el).text());
    if (!text && !$(el).find('img,video,audio,iframe').length) $(el).remove();
  });
  return ($('#root').html() || '').trim();
}

function bestImageSource(media) {
  const candidates = (media.srcset || []).filter((candidate) => candidate.url);
  const remote = candidates.length ? candidates[candidates.length - 1].url : media.src;
  return LOCAL_MEDIA[remote] ? LOCAL_MEDIA[remote].local_url : remote;
}

function imageHtml(media, fallbackAlt, byPath, indent = '') {
  const image = `<img src="${escapeHtml(bestImageSource(media))}" alt="${escapeHtml(media.alt || fallbackAlt)}">`;
  if (!media.linked_href) return `${indent}${image}`;
  const destination = internalDestination(media.linked_href, byPath);
  const external = /^https?:\/\//i.test(destination);
  return `${indent}<a href="${escapeHtml(destination)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${image}</a>`;
}

function deriveTitle(page, curatedTitle) {
  if (curatedTitle) return curatedTitle;
  let title = String(page.title || '').replace(/\s*\|\s*Dreamfarmcommons\s*$/i, '').trim();
  if (!title || /^(?:Art Exhibition & Project Space|Gallery)(?:\s*\||$)/i.test(title)) {
    const first = page.rich_text.find((block) => normalizeText(block.text));
    title = first ? String(first.text).split('\n').map(normalizeText).find(Boolean) : '';
  }
  return title || page.path.replace(/^\//, '') || 'Dream Farm Commons';
}

function buildProjectBody(page, title, byPath) {
  const rich = page.rich_text.map((block) => cleanRichHtml(block.html, byPath)).filter(Boolean);
  let copyHtml = rich.join('\n');
  let copyText = normalizeText(cheerio.load(`<div>${copyHtml}</div>`)('div').text());
  if (title && !copyText.toLowerCase().includes(normalizeText(title).toLowerCase())) {
    copyHtml = `<h3 class="project-source-title">${escapeHtml(title)}</h3>\n${copyHtml}`;
    copyText = normalizeText(`${title} ${copyText}`);
  }

  const extras = [];
  for (const item of page.loose_text || []) {
    if (!copyText.includes(normalizeText(item.text))) {
      extras.push(`<p>${escapeHtml(item.text)}</p>`);
      copyText = normalizeText(`${copyText} ${item.text}`);
    }
  }

  const seenLinks = new Set();
  const remainingLinks = [];
  for (const link of page.links || []) {
    const label = normalizeText(link.label);
    if (!label || !link.href) continue;
    const destination = internalDestination(link.href, byPath);
    const key = `${label}\n${destination}`;
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    const linkAlreadyPresent = copyHtml.includes(`href="${destination}"`) && copyText.includes(label);
    if (!linkAlreadyPresent) remainingLinks.push({ label, href: destination });
  }

  const gallery = page.media.filter((item) => item.type === 'image' && item.src && !item.src.startsWith('data:'))
    .map((item) => imageHtml(item, title, byPath, '      ')).join('\n');

  const linkHtml = remainingLinks.map((link) => {
    const external = /^https?:\/\//i.test(link.href);
    return `        <h5><a href="${escapeHtml(link.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(link.label)}</a></h5>`;
  }).join('\n');

  const embedHtml = (page.embeds || []).map((embed) => {
    if (embed.type === 'iframe' && embed.sources[0]) {
      return `<iframe src="${escapeHtml(embed.sources[0])}" title="${escapeHtml(embed.title || title)}" loading="lazy"></iframe>`;
    }
    if ((embed.type === 'video' || embed.type === 'audio') && embed.sources.length) {
      const sources = embed.sources.map((source) => `<source src="${escapeHtml(source)}">`).join('');
      return `<${embed.type} controls>${sources}</${embed.type}>`;
    }
    return '';
  }).filter(Boolean).join('\n');

  return `<div class="project-detail" data-source-path="${escapeHtml(page.path)}">
    <section class="project-gallery" aria-label="${escapeHtml(title)} images">
${gallery || '      <!-- This source page contains no images. -->'}
    </section>
    <article class="project-copy">
${copyHtml}
${extras.join('\n')}
${embedHtml}
${linkHtml ? `      <div class="project-links">\n${linkHtml}\n      </div>` : ''}
    </article>
  </div>`;
}

function remainingPageLinks(page, copyHtml, byPath) {
  const copyText = normalizeText(cheerio.load(`<div>${copyHtml}</div>`)('div').text());
  const seen = new Set();
  return (page.links || []).filter((link) => {
    const label = normalizeText(link.label);
    if (!label || !link.href) return false;
    const destination = internalDestination(link.href, byPath);
    const key = `${label}\n${destination}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !(copyHtml.includes(`href="${destination}"`) && copyText.includes(label));
  }).map((link) => ({ label: normalizeText(link.label), href: internalDestination(link.href, byPath) }));
}

function pageContentHtml(page, byPath, heading = '') {
  let copyHtml = page.rich_text.map((block) => cleanRichHtml(block.html, byPath)).filter(Boolean).join('\n');
  let copyText = normalizeText(cheerio.load(`<div>${copyHtml}</div>`)('div').text());
  const loose = [];
  for (const item of page.loose_text || []) {
    if (!copyText.includes(normalizeText(item.text))) {
      loose.push(`<p>${escapeHtml(item.text)}</p>`);
      copyText = normalizeText(`${copyText} ${item.text}`);
    }
  }
  const links = remainingPageLinks(page, copyHtml, byPath);
  const gallery = page.media.filter((item) => item.type === 'image' && item.src && !item.src.startsWith('data:'))
    .map((item) => imageHtml(item, heading, byPath)).join('\n');
  const linkHtml = links.map((link) => {
    const external = /^https?:\/\//i.test(link.href);
    return `<h5><a href="${escapeHtml(link.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(link.label)}</a></h5>`;
  }).join('\n');
  return `<div class="source-content-grid">
  <section class="source-content-media" aria-label="${escapeHtml(heading || page.title)} images">
${gallery}
  </section>
  <article class="source-content-copy">
${heading ? `<h3>${escapeHtml(heading)}</h3>` : ''}
${copyHtml}
${loose.join('\n')}
${linkHtml ? `<div class="project-links">${linkHtml}</div>` : ''}
  </article>
</div>`;
}

function currentColumnHtml(page, heading, byPath) {
  const full = cheerio.load(pageContentHtml(page, byPath, heading));
  return `<h3>${escapeHtml(heading)}</h3>\n${full('.source-content-media').html() || ''}\n${full('.source-content-copy').children().not('h3').map((_, el) => full.html(el)).get().join('\n')}`;
}

function aboutRegions(page, byPath) {
  const clean = page.rich_text.map((block) => cleanRichHtml(block.html, byPath));
  const hero = page.media[0] ? bestImageSource(page.media[0]) : '';
  const intro = [clean[0], clean[1], clean[2], clean[3]].filter(Boolean).join('\n');
  const rows = [];
  for (let i = 0; i < 7; i += 1) {
    const media = page.media[i + 1];
    const bio = clean[i + 4];
    if (!media && !bio) continue;
    rows.push(`<div class="about-source-row">
  <div class="about-source-portrait">${media ? imageHtml(media, '', byPath) : ''}</div>
  <div class="about-source-bio">${bio || ''}</div>
</div>`);
  }
  const closingImages = page.media.slice(8).map((media) => imageHtml(media, '', byPath)).join('\n');
  const bios = `${rows.join('\n')}
<section class="about-source-visit">${clean[11] || ''}</section>
<div class="about-source-gallery">${closingImages}</div>
<section class="about-source-caption">${clean[12] || ''}</section>`;
  return { hero, intro, bios };
}

function buildContentRegions(byPath) {
  const home = byPath.get('/');
  const about = byPath.get('/about');
  const gallery = byPath.get('/right-now-1');
  const annex = byPath.get('/about-5');
  const future = byPath.get('/about-1-2');
  const donate = byPath.get('/how-to-support');
  const shop = byPath.get('/shop');
  const aboutParts = aboutRegions(about, byPath);
  return [
    { key: 'home.source-content', kind: 'html', value: pageContentHtml(home, byPath), source_paths: ['/'] },
    { key: 'about.intro-image', kind: 'image', value: aboutParts.hero, source_paths: ['/about'] },
    { key: 'about.intro', kind: 'html', value: aboutParts.intro, source_paths: ['/about'] },
    { key: 'about.bios', kind: 'html', value: aboutParts.bios, source_paths: ['/about'] },
    { key: 'current.column-1', kind: 'html', value: currentColumnHtml(gallery, 'DREAM FARM COMMONS', byPath), source_paths: ['/right-now-1'] },
    { key: 'current.column-2', kind: 'html', value: currentColumnHtml(annex, 'THE ANNEX', byPath), source_paths: ['/about-5'] },
    { key: 'future.source-content', kind: 'html', value: pageContentHtml(future, byPath), source_paths: ['/about-1-2'] },
    { key: 'donate.source-content', kind: 'html', value: pageContentHtml(donate, byPath), source_paths: ['/how-to-support'] },
    { key: 'shop.source-content', kind: 'html', value: pageContentHtml(shop, byPath), source_paths: ['/shop'] },
  ];
}

function pastIndex(page) {
  const groups = new Map([...SECTION_NAMES].map((name) => [name, { name, links: [], images: [] }]));
  let section = null;
  for (const item of page.ordered_content || []) {
    if (item.type === 'rich_text') {
      const heading = normalizeText(page.rich_text[item.index] && page.rich_text[item.index].text);
      if (SECTION_NAMES.has(heading)) section = heading;
    } else if (section && item.type === 'link') {
      const link = page.links[item.index];
      if (link && link.label && link.href) groups.get(section).links.push(link);
    } else if (section && item.type === 'media') {
      const media = page.media[item.index];
      if (media) groups.get(section).images.push(media);
    }
  }

  const result = [];
  for (const group of groups.values()) {
    group.links.forEach((link, index) => {
      const sourcePath = new URL(link.href).pathname.replace(/\/$/, '') || '/';
      result.push({
        source_path: sourcePath,
        title: normalizeText(link.label),
        category: group.name,
        thumbnail: group.images[index] ? bestImageSource(group.images[index]) : null,
      });
    });
  }
  return result;
}

function main() {
  const { manifest, pages, byPath } = loadSnapshot();
  const sourcePast = byPath.get('/past');
  if (!sourcePast) throw new Error('The source snapshot does not contain /past');
  const curated = pastIndex(sourcePast);
  const curatedByPath = new Map(curated.map((item) => [item.source_path, item]));
  const usedSlugs = new Map();
  const projects = [];
  const integrityErrors = [];

  for (const page of pages) {
    if (TOP_LEVEL[page.path]) continue;
    const curatedItem = curatedByPath.get(page.path);
    let slug = SLUG_OVERRIDES[page.path] || slugFromPath(page.path);
    if (usedSlugs.has(slug)) slug = slugFromPath(page.path);
    usedSlugs.set(slug, page.path);
    const title = deriveTitle(page, curatedItem && curatedItem.title);
    const body = buildProjectBody(page, title, byPath);
    const $body = cheerio.load(body);
    const bodyText = normalizeText($body.text());
    const missingRichText = page.rich_text.map((block) => normalizeText(block.text))
      .filter((text) => text && !bodyText.includes(text));
    const sourceImageCount = page.media.filter((item) => item.type === 'image' && item.src && !item.src.startsWith('data:')).length;
    const outputImageCount = $body('img').length;
    if (missingRichText.length || sourceImageCount !== outputImageCount) {
      integrityErrors.push({ page: page.path, missing_rich_text: missingRichText, source_images: sourceImageCount, output_images: outputImageCount });
    }
    const firstImage = page.media.find((item) => item.type === 'image' && item.src && !item.src.startsWith('data:'));
    projects.push({
      slug,
      title,
      status: curatedItem ? 'past' : 'archive',
      category: curatedItem ? curatedItem.category : 'More from the archive',
      layout: 'detail',
      thumbnail: (curatedItem && curatedItem.thumbnail) || (firstImage && bestImageSource(firstImage)) || null,
      body_html: body,
      sort_order: curatedItem ? curated.findIndex((item) => item.source_path === page.path) : 1000 + projects.length,
      source_path: page.path,
      source_url: page.source_url,
      source_hash: page.content_sha256,
      body_sha256: sha256(body),
      source_counts: page.counts,
    });
  }

  const output = {
    format_version: 1,
    generated_at: new Date().toISOString(),
    source_manifest_generated_at: manifest.generated_at,
    source_page_count: manifest.crawled_page_count,
    source_asset_count: manifest.unique_asset_count,
    top_level_sources: Object.fromEntries(Object.entries(TOP_LEVEL).map(([sourcePath, destination]) => [destination, sourcePath])),
    curated_past_count: curated.length,
    project_count: projects.length,
    integrity_errors: integrityErrors,
    curated_past: curated,
    content_regions: buildContentRegions(byPath),
    projects,
  };
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${projects.length} project records (${curated.length} curated Past entries) to ${OUTPUT_FILE}`);
  console.log(`Integrity errors: ${integrityErrors.length}`);
  if (integrityErrors.length) {
    console.error(JSON.stringify(integrityErrors.slice(0, 10), null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildProjectBody,
  cleanRichHtml,
  deriveTitle,
  internalDestination,
  normalizeText,
  pastIndex,
};
