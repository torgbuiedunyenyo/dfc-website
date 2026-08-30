#!/usr/bin/env node

/**
 * Reconcile the CMS Past grid with the audited 70-tile Wix visual gallery.
 *
 * Default mode is read-only. Pass --apply to update titles, statuses,
 * categories, sort order, and thumbnails. Project body content is preserved.
 * Gallery-only source tiles are inserted as image-only records, and every
 * write receives a before/after history snapshot.
 */

const fs = require('fs');
const path = require('path');
const { db, getSql, recordVersion } = require('../lib/db');

const IMPORT_FILE = path.join(__dirname, '..', 'migration', 'wix-import.json');
const AUTHOR = 'Past gallery repair 2026-08-30';
// Locally advanced programming can legitimately add projects that the Wix
// Past gallery has not caught up with yet. Never archive these as "stale."
const PRESERVED_LOCAL_PAST_SLUGS = new Set(['GENIUS-LOCI']);

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

function gridFields(project) {
  return {
    title: project.title,
    status: project.status,
    thumbnail: project.thumbnail,
    sort_order: project.sort_order,
    category: project.category,
  };
}

function sameGridFields(existing, desired) {
  return Object.entries(gridFields(desired))
    .every(([key, value]) => (existing[key] == null ? null : existing[key]) === (value == null ? null : value));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const data = JSON.parse(fs.readFileSync(IMPORT_FILE, 'utf8'));
  if (data.integrity_errors.length) throw new Error('Import artifact contains integrity errors');

  const desiredProjects = data.projects.filter((project) => project.status === 'past')
    .sort((a, b) => a.sort_order - b.sort_order);
  if (desiredProjects.length !== 70 || data.curated_past_count !== 70) {
    throw new Error(`Expected the audited 70 Past tiles, found ${desiredProjects.length}`);
  }
  if (new Set(desiredProjects.map((project) => project.slug)).size !== 70) {
    throw new Error('Past tile slugs must be unique');
  }

  const client = await db();
  const existingProjects = await client`SELECT * FROM projects`;
  const existingBySlug = new Map(existingProjects.map((project) => [project.slug, project]));
  const missing = desiredProjects.filter((project) => !existingBySlug.has(project.slug));
  const changes = desiredProjects
    .filter((desired) => existingBySlug.has(desired.slug))
    .map((desired) => ({ desired, existing: existingBySlug.get(desired.slug) }))
    .filter(({ desired, existing }) => !sameGridFields(existing, desired));
  const desiredSlugs = new Set([
    ...desiredProjects.map((project) => project.slug),
    ...PRESERVED_LOCAL_PAST_SLUGS,
  ]);
  const stalePast = existingProjects.filter((project) => project.status === 'past' && !desiredSlugs.has(project.slug));

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'plan',
    desired_tiles: desiredProjects.length,
    create: missing.map((project) => project.slug),
    update: changes.map(({ desired, existing }) => ({
      slug: desired.slug,
      from: gridFields(existing),
      to: gridFields(desired),
    })),
    archive: stalePast.map((project) => project.slug),
  }, null, 2));

  if (apply && (missing.length || changes.length || stalePast.length)) {
    await client.begin(async (tx) => {
      for (const desired of missing) {
        const [created] = await tx`
          INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order,
                                category, source_path, source_url, source_hash)
          VALUES (${desired.slug}, ${desired.title}, 'past', 'detail', ${desired.thumbnail}, '',
                  ${desired.sort_order}, ${desired.category}, ${desired.source_path},
                  ${desired.source_url}, ${desired.source_hash}) RETURNING *`;
        await recordVersion(tx, 'project', created.slug, 'past-gallery-create', projectSnapshot(created), AUTHOR);
      }

      for (const { desired, existing } of changes) {
        await recordVersion(tx, 'project', existing.slug, 'pre-past-gallery-repair', projectSnapshot(existing), AUTHOR);
        const [updated] = await tx`
          UPDATE projects SET title = ${desired.title}, status = 'past', thumbnail = ${desired.thumbnail},
            sort_order = ${desired.sort_order}, category = ${desired.category}, updated_at = now()
          WHERE slug = ${existing.slug} RETURNING *`;
        await recordVersion(tx, 'project', updated.slug, 'past-gallery-repair', projectSnapshot(updated), AUTHOR);
      }

      let archiveOrder = 2000;
      for (const existing of stalePast) {
        await recordVersion(tx, 'project', existing.slug, 'pre-past-gallery-repair', projectSnapshot(existing), AUTHOR);
        const [updated] = await tx`
          UPDATE projects SET status = 'archive', category = 'More from the archive',
            sort_order = ${archiveOrder++}, updated_at = now()
          WHERE slug = ${existing.slug} RETURNING *`;
        await recordVersion(tx, 'project', updated.slug, 'past-gallery-repair', projectSnapshot(updated), AUTHOR);
      }
    });
    console.log(JSON.stringify({
      applied: true,
      created: missing.length,
      updated: changes.length,
      archived: stalePast.length,
    }, null, 2));
  } else if (!apply) {
    console.log('No database changes made. Re-run with --apply after reviewing this plan.');
  }

  await getSql().end();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    try { await getSql().end(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { PRESERVED_LOCAL_PAST_SLUGS };
