#!/usr/bin/env node

/**
 * Crawl the public Dream Farm Commons Wix site into an auditable source
 * manifest. This script is intentionally read-only with respect to the CMS.
 *
 * It records exact rich-text HTML, visible page text, links, media references,
 * embeds, and document order. A later import step can therefore restructure
 * the content without silently rewriting it.
 */

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const cheerio = require('cheerio');

const SOURCE_ORIGIN = 'https://www.dreamfarmcommons.com';
const SITEMAP_URL = `${SOURCE_ORIGIN}/sitemap.xml`;
const OUTPUT_DIR = path.join(process.cwd(), 'migration', 'wix-source');
const PAGES_DIR = path.join(OUTPUT_DIR, 'pages');
const CONCURRENCY = 4;
const MAX_PAGES = 250;
const PAGE_ASSET_EXTENSIONS = /\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|json|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|svg|tiff?|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function normalizePageUrl(value, base = SOURCE_ORIGIN) {
  if (!value || /^(?:mailto:|tel:|javascript:|data:)/i.test(value)) return null;
  let url;
  try {
    url = new URL(value, base);
  } catch (_) {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (!['dreamfarmcommons.com', 'www.dreamfarmcommons.com'].includes(url.hostname.toLowerCase())) return null;
  if (PAGE_ASSET_EXTENSIONS.test(url.pathname)) return null;
  url.protocol = 'https:';
  url.hostname = 'www.dreamfarmcommons.com';
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
  return url.href;
}

function absoluteUrl(value, base) {
  if (!value) return null;
  try {
    return new URL(value, base).href;
  } catch (_) {
    return value;
  }
}

function originalWixMediaUrl(value) {
  if (!value) return null;
  const absolute = absoluteUrl(value, SOURCE_ORIGIN);
  if (!absolute || !/^https:\/\/static\.wixstatic\.com\/media\//i.test(absolute)) return absolute;
  return absolute.split('/v1/')[0];
}

function parseSrcset(value, base) {
  if (!value) return [];
  const candidates = [];
  const pattern = /(?:^|,\s*)((?:https?:\/\/|\/)\S+?)\s+([0-9.]+[wx])(?=,\s*|$)/g;
  let match;
  while ((match = pattern.exec(value))) {
    candidates.push({ url: absoluteUrl(match[1], base), descriptor: match[2] });
  }
  return candidates;
}

function pageFileName(pageUrl) {
  const url = new URL(pageUrl);
  const raw = url.pathname === '/' ? 'home' : url.pathname.replace(/^\//, '').replace(/\//g, '__');
  return `${raw.replace(/[^a-zA-Z0-9._-]+/g, '-')}.json`;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DreamFarmCommonsMigration/1.0 (+https://dfc-website-two.vercel.app/)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { body, response };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Unable to fetch ${url}: ${lastError && lastError.message}`);
}

function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => match[1].replace(/&amp;/g, '&').trim())
    .filter(Boolean);
}

async function loadSitemaps(url, seen = new Set()) {
  if (seen.has(url)) return [];
  seen.add(url);
  const { body } = await fetchText(url);
  const locs = sitemapLocs(body);
  const nested = locs.filter((loc) => /(?:sitemap[^/]*|sitemap)\.xml(?:$|\?)/i.test(loc));
  const pages = locs.filter((loc) => !nested.includes(loc));
  for (const child of nested) pages.push(...await loadSitemaps(child, seen));
  return pages;
}

function extractPage(pageUrl, html, response) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const scope = $('#PAGES_CONTAINER').first().length ? $('#PAGES_CONTAINER').first() : $('body').first();
  const canonical = $('link[rel="canonical"]').attr('href') || response.url || pageUrl;
  const richText = [];
  const media = [];
  const links = [];
  const embeds = [];
  const looseText = [];
  const orderedContent = [];
  const discoveredPages = new Set();
  const assets = new Set();

  scope.find('.wixui-rich-text').each((index, el) => {
    const htmlValue = $(el).html() || '';
    const textValue = normalizeWhitespace($(el).text());
    const item = {
      index,
      id: $(el).attr('id') || null,
      text: textValue,
      html: htmlValue,
      sha256: sha256(htmlValue),
    };
    richText.push(item);
    orderedContent.push({ node: el, type: 'rich_text', index });
  });

  scope.find('a[href]').each((index, el) => {
    const rawHref = $(el).attr('href') || '';
    const href = absoluteUrl(rawHref, pageUrl);
    const item = {
      index,
      label: normalizeWhitespace($(el).text()) || $(el).attr('aria-label') || null,
      raw_href: rawHref,
      href,
      target: $(el).attr('target') || null,
      rel: $(el).attr('rel') || null,
    };
    links.push(item);
    if (!$(el).closest('.wixui-rich-text').length) {
      orderedContent.push({ node: el, type: 'link', index });
    }
    const normalized = normalizePageUrl(href, pageUrl);
    if (normalized) discoveredPages.add(normalized);
    else if (href && PAGE_ASSET_EXTENSIONS.test(new URL(href, pageUrl).pathname)) assets.add(href);
  });

  scope.find('img').each((index, el) => {
    const rawSrc = $(el).attr('src') || $(el).attr('data-src') || '';
    if (!rawSrc) return;
    const src = absoluteUrl(rawSrc, pageUrl);
    const srcset = parseSrcset($(el).attr('srcset'), pageUrl);
    const linked = $(el).closest('a[href]').first();
    const original = originalWixMediaUrl(src);
    const item = {
      index: media.length,
      type: 'image',
      src,
      original_src: original,
      srcset,
      alt: $(el).attr('alt') || '',
      width: Number($(el).attr('width')) || null,
      height: Number($(el).attr('height')) || null,
      linked_href: linked.length ? absoluteUrl(linked.attr('href'), pageUrl) : null,
    };
    media.push(item);
    orderedContent.push({ node: el, type: 'media', index: item.index });
    if (original) assets.add(original);
  });

  scope.find('iframe,video,audio').each((_, el) => {
    const tag = String(el.tagName || el.name || '').toLowerCase();
    const sources = [];
    const direct = $(el).attr('src');
    if (direct) sources.push(absoluteUrl(direct, pageUrl));
    $(el).find('source[src]').each((__, source) => sources.push(absoluteUrl($(source).attr('src'), pageUrl)));
    const item = {
      index: embeds.length,
      type: tag,
      sources,
      title: $(el).attr('title') || null,
      poster: absoluteUrl($(el).attr('poster'), pageUrl),
      html: $.html(el),
    };
    embeds.push(item);
    orderedContent.push({ node: el, type: 'embed', index: item.index });
    for (const source of sources) if (source) assets.add(source);
    if (item.poster) assets.add(item.poster);
  });

  scope.find('button').each((index, el) => {
    if ($(el).closest('.wixui-rich-text').length) return;
    const label = normalizeWhitespace($(el).text()) || $(el).attr('aria-label') || null;
    if (label) orderedContent.push({ node: el, type: 'button', index, label });
  });

  // Preserve text rendered by Wix components that is not part of a rich-text,
  // anchor, or button component (for example prices and commerce labels).
  scope.find('*').contents().each((_, node) => {
    if (node.type !== 'text') return;
    const parent = node.parent;
    if (!parent) return;
    const $parent = $(parent);
    if ($parent.closest('.wixui-rich-text,a,button,script,style,noscript,template,svg').length) return;
    const value = normalizeWhitespace(node.data || '');
    if (!value) return;
    const item = {
      index: looseText.length,
      text: value,
      parent_tag: String(parent.tagName || parent.name || '').toLowerCase() || null,
      parent_class: $parent.attr('class') || null,
    };
    looseText.push(item);
    orderedContent.push({ node: parent, type: 'loose_text', index: item.index });
  });

  const documentOrder = new Map();
  let position = 0;
  scope.find('*').each((_, el) => documentOrder.set(el, position++));
  orderedContent.sort((a, b) => (documentOrder.get(a.node) || 0) - (documentOrder.get(b.node) || 0));
  const ordered = orderedContent.map(({ node: _node, ...item }) => item);

  const textScope = scope.clone();
  textScope.find('script,style,noscript,template,svg').remove();
  const plainText = normalizeWhitespace(textScope.text());
  const contentForHash = { plain_text: plainText, rich_text: richText, loose_text: looseText, media, links, embeds, ordered_content: ordered };

  return {
    source_url: pageUrl,
    final_url: response.url,
    canonical_url: absoluteUrl(canonical, pageUrl),
    path: new URL(pageUrl).pathname,
    http_status: response.status,
    title: normalizeWhitespace($('title').first().text()),
    meta_description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null,
    og_image: absoluteUrl($('meta[property="og:image"]').attr('content'), pageUrl),
    plain_text: plainText,
    rich_text: richText,
    loose_text: looseText,
    media,
    links,
    embeds,
    ordered_content: ordered,
    discovered_pages: [...discoveredPages],
    asset_urls: [...assets],
    counts: {
      characters: plainText.length,
      rich_text_blocks: richText.length,
      loose_text_nodes: looseText.length,
      media: media.length,
      links: links.length,
      embeds: embeds.length,
    },
    content_sha256: sha256(JSON.stringify(contentForHash)),
  };
}

async function crawlPage(pageUrl) {
  const { body, response } = await fetchText(pageUrl);
  return extractPage(pageUrl, body, response);
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  await fs.mkdir(PAGES_DIR, { recursive: true });
  const sitemapUrls = await loadSitemaps(SITEMAP_URL);
  const queue = [];
  const seen = new Set();
  const enqueue = (url) => {
    const normalized = normalizePageUrl(url);
    if (!normalized || seen.has(normalized) || queue.includes(normalized)) return;
    queue.push(normalized);
  };
  sitemapUrls.forEach(enqueue);
  enqueue(SOURCE_ORIGIN);

  const pages = [];
  const errors = [];
  while (queue.length && seen.size < MAX_PAGES) {
    const batch = queue.splice(0, CONCURRENCY * 3).filter((url) => !seen.has(url));
    batch.forEach((url) => seen.add(url));
    const crawled = await mapConcurrent(batch, CONCURRENCY, async (url) => {
      try {
        const page = await crawlPage(url);
        process.stdout.write(`crawled ${page.path} (${page.counts.characters} chars, ${page.counts.media} media)\n`);
        return page;
      } catch (error) {
        process.stderr.write(`failed ${url}: ${error.message}\n`);
        errors.push({ url, error: error.message });
        return null;
      }
    });
    for (const page of crawled.filter(Boolean)) {
      pages.push(page);
      page.discovered_pages.forEach(enqueue);
    }
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  const pageIndex = [];
  for (const page of pages) {
    const file = pageFileName(page.source_url);
    await fs.writeFile(path.join(PAGES_DIR, file), `${JSON.stringify(page, null, 2)}\n`);
    pageIndex.push({
      path: page.path,
      source_url: page.source_url,
      file: `pages/${file}`,
      title: page.title,
      counts: page.counts,
      content_sha256: page.content_sha256,
    });
  }

  const uniqueAssets = [...new Set(pages.flatMap((page) => page.asset_urls))].sort();
  const manifest = {
    format_version: 1,
    generated_at: new Date().toISOString(),
    source_origin: SOURCE_ORIGIN,
    sitemap_url: SITEMAP_URL,
    sitemap_url_count: sitemapUrls.length,
    crawled_page_count: pages.length,
    unique_asset_count: uniqueAssets.length,
    errors,
    pages: pageIndex,
    asset_urls: uniqueAssets,
  };
  await fs.writeFile(path.join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, 'README.md'), `# Wix source snapshot\n\nGenerated from the public Dream Farm Commons site at ${manifest.generated_at}.\n\n- Sitemap URLs: ${manifest.sitemap_url_count}\n- Crawled pages (including internally discovered pages): ${manifest.crawled_page_count}\n- Unique media/document URLs: ${manifest.unique_asset_count}\n- Crawl errors: ${manifest.errors.length}\n\nThe page JSON files preserve exact rich-text HTML and source media/link relationships. They are migration inputs, not hand-edited content.\n`);
  process.stdout.write(`\nwrote ${pages.length} pages and ${uniqueAssets.length} unique assets to ${OUTPUT_DIR}\n`);
  if (errors.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  extractPage,
  normalizePageUrl,
  normalizeWhitespace,
  originalWixMediaUrl,
  sitemapLocs,
};
