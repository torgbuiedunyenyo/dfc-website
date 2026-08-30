#!/usr/bin/env node

/**
 * Apply the live 2026-08-30 programming cycle without re-running the older,
 * whole-site Wix import. The default mode is read-only; pass --apply after
 * reviewing the plan. Every CMS change receives before/after history entries.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, getSql, recordVersion } = require('../lib/db');
const { futureToColumn } = require('../lib/move');
const cycle = require('../migration/programming-cycle-2026-08-30');
const wixImport = require('../migration/wix-import.json');

const AUTHOR = 'Programming cycle sync 2026-08-30';
const EMPTY_ANNEX = '<h3>THE ANNEX</h3>';

function projectSnapshot(project) {
  return {
    slug: project.slug,
    title: project.title,
    status: project.status,
    layout: project.layout,
    thumbnail: project.thumbnail,
    body_html: project.body_html,
    sort_order: project.sort_order,
    category: project.category,
    source_path: project.source_path,
    source_url: project.source_url,
    source_hash: project.source_hash,
  };
}

function validateAssets() {
  for (const image of cycle.future.images) {
    const file = path.join(__dirname, '..', 'public', image.local_url);
    if (!fs.existsSync(file)) throw new Error(`Missing Here After image: ${image.local_url}`);
    const data = fs.readFileSync(file);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (data.length !== image.bytes || sha256 !== image.sha256) {
      throw new Error(`Here After image checksum mismatch: ${image.local_url}`);
    }
  }
}

function contentTitle(value) {
  const match = String(value || '').match(/<(?:h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|p)>/i);
  return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim() : '';
}

function sourceSeaChangeHtml() {
  const region = wixImport.content_regions.find((item) => item.key === 'future.source-content');
  if (!region) throw new Error('The audited Wix artifact does not contain SEA CHANGE');
  if (contentTitle(region.value) !== cycle.current.title) {
    throw new Error(`Expected ${cycle.current.title} in the audited Wix artifact`);
  }
  return region.value;
}

function shortDescription(key, value) {
  return {
    key,
    chars: value.length,
    title: contentTitle(value) || value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  validateAssets();

  const seaChange = sourceSeaChangeHtml();
  const desiredContent = new Map([
    ['current.column-1', futureToColumn(seaChange, 'DREAM FARM COMMONS')],
    ['current.column-2', EMPTY_ANNEX],
    ['future.source-content', cycle.future.html],
  ]);

  const client = await db();
  const keys = [...desiredContent.keys()];
  const existingContent = await client`SELECT key, kind, value FROM content WHERE key = ANY(${keys})`;
  const existingByKey = new Map(existingContent.map((row) => [row.key, row]));
  const contentChanges = keys
    .map((key) => ({ key, previous: existingByKey.get(key), value: desiredContent.get(key) }))
    .filter(({ previous, value }) => !previous || previous.kind !== 'html' || previous.value !== value);

  const [genius] = await client`SELECT * FROM projects WHERE slug = ${cycle.past_addition.slug}`;
  if (!genius) throw new Error('GENIUS LOCI project is missing; refusing to create a duplicate from partial content');
  const sourcePathOwner = await client`
    SELECT slug FROM projects WHERE source_path = ${cycle.past_addition.source_path}
      AND slug <> ${cycle.past_addition.slug}`;
  if (sourcePathOwner.length) {
    throw new Error(`${cycle.past_addition.source_path} already belongs to ${sourcePathOwner[0].slug}`);
  }
  const geniusChanges = {
    status: 'past',
    category: cycle.past_addition.category,
    sort_order: -1,
    source_path: cycle.past_addition.source_path,
    source_url: cycle.past_addition.source_url,
  };
  const updateGenius = Object.entries(geniusChanges).some(([key, value]) => genius[key] !== value);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'plan',
    content: contentChanges.map(({ key, previous, value }) => ({
      from: previous ? shortDescription(key, previous.value) : null,
      to: shortDescription(key, value),
    })),
    past: updateGenius ? {
      slug: genius.slug,
      from: {
        status: genius.status,
        category: genius.category,
        sort_order: genius.sort_order,
        source_path: genius.source_path,
      },
      to: geniusChanges,
    } : null,
    annex_duplicate_created: false,
  }, null, 2));

  if (apply && (contentChanges.length || updateGenius)) {
    await client.begin(async (tx) => {
      for (const { key, previous, value } of contentChanges) {
        if (previous) {
          await recordVersion(tx, 'content', key, 'pre-programming-cycle', {
            key,
            kind: previous.kind,
            value: previous.value,
          }, AUTHOR);
        }
        await tx`
          INSERT INTO content (key, kind, value, updated_at)
          VALUES (${key}, 'html', ${value}, now())
          ON CONFLICT (key) DO UPDATE SET kind = 'html', value = ${value}, updated_at = now()`;
        await recordVersion(tx, 'content', key, 'programming-cycle', {
          key,
          kind: 'html',
          value,
        }, AUTHOR);
      }

      if (updateGenius) {
        await recordVersion(tx, 'project', genius.slug, 'pre-programming-cycle', projectSnapshot(genius), AUTHOR);
        const [updated] = await tx`
          UPDATE projects SET status = 'past', category = ${cycle.past_addition.category},
            sort_order = -1, source_path = ${cycle.past_addition.source_path},
            source_url = ${cycle.past_addition.source_url}, updated_at = now()
          WHERE slug = ${genius.slug} RETURNING *`;
        await recordVersion(tx, 'project', updated.slug, 'programming-cycle', projectSnapshot(updated), AUTHOR);
      }
    });
    console.log(JSON.stringify({
      applied: true,
      content_updated: contentChanges.length,
      genius_loci_added_to_past: updateGenius,
      workshop_duplicate_created: false,
    }, null, 2));
  } else if (!apply) {
    console.log('No database changes made. Re-run with --apply after the matching site assets are deployed.');
  }

  await getSql().end();
}

main().catch(async (error) => {
  console.error(error);
  try { await getSql().end(); } catch (_) {}
  process.exit(1);
});
