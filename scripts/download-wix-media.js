#!/usr/bin/env node

/**
 * Download every usable image referenced by the Wix source snapshot into the
 * new site's public assets. Files are named by source-URL hash, and a checksum
 * map keeps the migration auditable and reproducible.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, 'migration', 'wix-source');
const OUTPUT_DIR = path.join(ROOT, 'public', 'ImportedMedia');
const MAP_FILE = path.join(ROOT, 'migration', 'wix-media-map.json');
const MISSING_FILE = path.join(ROOT, 'migration', 'wix-media-missing.json');
const CONCURRENCY = 6;

function digest(value, length = 24) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

function extensionFor(contentType, sourceUrl) {
  const types = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };
  if (types[contentType]) return types[contentType];
  try {
    const ext = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})(?:\/|$)/i);
    return ext ? ext[1].toLowerCase().replace('jpeg', 'jpg') : 'bin';
  } catch (_) {
    return 'bin';
  }
}

function bestSource(media) {
  const candidates = (media.srcset || []).filter((candidate) => candidate.url);
  return candidates.length ? candidates[candidates.length - 1].url : media.src;
}

function sourceCandidates(media) {
  const preferred = bestSource(media);
  return [...new Set([
    preferred,
    ...(media.srcset || []).map((candidate) => candidate.url).filter(Boolean).reverse(),
    media.src,
    media.original_src,
  ].filter(Boolean))];
}

function loadUses() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, 'manifest.json'), 'utf8'));
  const uses = new Map();
  for (const entry of manifest.pages) {
    const page = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, entry.file), 'utf8'));
    for (const media of page.media || []) {
      if (media.type !== 'image' || !media.src || media.src.startsWith('data:')) continue;
      const sourceUrl = bestSource(media);
      if (!uses.has(sourceUrl)) uses.set(sourceUrl, { candidates: [], uses: [] });
      const record = uses.get(sourceUrl);
      record.candidates = [...new Set([...record.candidates, ...sourceCandidates(media)])];
      record.uses.push({
        source_path: page.path,
        media_index: media.index,
        alt: media.alt || '',
        original_src: media.original_src || null,
      });
    }
  }
  return uses;
}

async function download(sourceUrl, candidates) {
  const attempts = [];
  let data;
  let contentType;
  let downloadUrl;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: { 'User-Agent': 'DreamFarmCommonsMigration/1.0 (+https://dfc-website-two.vercel.app/)' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        attempts.push({ url: candidate, error: `${response.status} ${response.statusText}`.trim() });
        continue;
      }
      const candidateType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!candidateType.startsWith('image/')) {
        attempts.push({ url: candidate, error: `unexpected content type ${candidateType || '(none)'}` });
        continue;
      }
      data = Buffer.from(await response.arrayBuffer());
      contentType = candidateType;
      downloadUrl = candidate;
      break;
    } catch (error) {
      attempts.push({ url: candidate, error: error.message });
    }
  }

  if (!data) {
    const error = new Error(attempts.map((attempt) => attempt.error).join('; ') || 'no usable source URL');
    error.attempts = attempts;
    throw error;
  }

  const ext = extensionFor(contentType, sourceUrl);
  const filename = `${digest(sourceUrl)}.${ext}`;
  await fsp.writeFile(path.join(OUTPUT_DIR, filename), data);
  return {
    source_url: sourceUrl,
    ...(downloadUrl === sourceUrl ? {} : { download_url: downloadUrl }),
    local_url: `/ImportedMedia/${filename}`,
    filename,
    content_type: contentType,
    bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  };
}

async function main() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  const uses = loadUses();
  const urls = [...uses.keys()];
  const entries = {};
  const missing = [];
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      const sourceUrl = urls[index];
      const useRecord = uses.get(sourceUrl);
      try {
        const record = await download(sourceUrl, useRecord.candidates);
        entries[sourceUrl] = record;
        process.stdout.write(`downloaded ${index + 1}/${urls.length} ${record.filename}\n`);
      } catch (error) {
        missing.push({
          source_url: sourceUrl,
          error: error.message,
          attempted_urls: error.attempts || [],
          uses: useRecord.uses,
        });
        process.stderr.write(`unavailable ${sourceUrl}: ${error.message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

  const sortedEntries = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  const sortedMissing = missing.sort((a, b) => a.source_url.localeCompare(b.source_url));

  const mediaMap = {
    format_version: 1,
    generated_at: new Date().toISOString(),
    source_url_count: urls.length,
    downloaded_count: Object.keys(sortedEntries).length,
    unavailable_count: sortedMissing.length,
    total_bytes: Object.values(sortedEntries).reduce((sum, item) => sum + item.bytes, 0),
    entries: sortedEntries,
  };
  await fsp.writeFile(MAP_FILE, `${JSON.stringify(mediaMap, null, 2)}\n`);
  await fsp.writeFile(MISSING_FILE, `${JSON.stringify({
    generated_at: mediaMap.generated_at,
    unavailable_count: missing.length,
    note: 'These image URLs are also unavailable on the public Wix source site. Recover exact originals from the Wix Media Manager.',
    missing: sortedMissing,
  }, null, 2)}\n`);
  console.log(`Downloaded ${mediaMap.downloaded_count}/${mediaMap.source_url_count} images (${(mediaMap.total_bytes / 1024 / 1024).toFixed(1)} MB).`);
  console.log(`Unavailable source images: ${mediaMap.unavailable_count}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
