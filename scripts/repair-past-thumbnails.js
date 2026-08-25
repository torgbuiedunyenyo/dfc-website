#!/usr/bin/env node

/**
 * Repair only the Past grid thumbnails after the Wix visual-pairing fix.
 *
 * Default mode is read-only. Pass --apply to update the thumbnail column for
 * the 34 curated Past projects. No page copy, project body, ordering, status,
 * or other CMS content is touched. Every changed row receives before/after
 * history snapshots.
 */

const fs = require('fs');
const path = require('path');
const { db, getSql, recordVersion } = require('../lib/db');

const IMPORT_FILE = path.join(__dirname, '..', 'migration', 'wix-import.json');
const AUTHOR = 'Past thumbnail repair 2026-08-25';

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

async function main() {
  const apply = process.argv.includes('--apply');
  const data = JSON.parse(fs.readFileSync(IMPORT_FILE, 'utf8'));
  if (data.integrity_errors.length) throw new Error('Import artifact contains integrity errors');

  const desiredProjects = data.projects.filter((project) => project.status === 'past');
  if (desiredProjects.length !== data.curated_past_count || desiredProjects.length !== 34) {
    throw new Error(`Expected 34 curated Past projects, found ${desiredProjects.length}`);
  }

  const client = await db();
  const existingProjects = await client`
    SELECT * FROM projects WHERE source_path = ANY(${desiredProjects.map((project) => project.source_path)}::text[])
  `;
  const existingByPath = new Map(existingProjects.map((project) => [project.source_path, project]));
  const missing = desiredProjects.filter((project) => !existingByPath.has(project.source_path));
  if (missing.length) throw new Error(`Missing CMS projects: ${missing.map((project) => project.source_path).join(', ')}`);

  const changes = desiredProjects.map((desired) => ({ desired, existing: existingByPath.get(desired.source_path) }))
    .filter(({ desired, existing }) => desired.thumbnail !== existing.thumbnail);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'plan',
    curated_projects: desiredProjects.length,
    thumbnails_to_update: changes.length,
    changes: changes.map(({ desired, existing }) => ({
      source_path: desired.source_path,
      title: existing.title,
      from: existing.thumbnail,
      to: desired.thumbnail,
    })),
  }, null, 2));

  if (apply && changes.length) {
    await client.begin(async (tx) => {
      for (const { desired, existing } of changes) {
        await recordVersion(tx, 'project', existing.slug, 'pre-thumbnail-repair', projectSnapshot(existing), AUTHOR);
        const [updated] = await tx`
          UPDATE projects SET thumbnail = ${desired.thumbnail}, updated_at = now()
          WHERE slug = ${existing.slug} RETURNING *
        `;
        await recordVersion(tx, 'project', existing.slug, 'thumbnail-repair', projectSnapshot(updated), AUTHOR);
      }
    });
    console.log(JSON.stringify({ applied: true, thumbnails_updated: changes.length }, null, 2));
  } else if (!apply) {
    console.log('No database changes made. Re-run with --apply after reviewing this plan.');
  }

  await getSql().end();
}

main().catch(async (error) => {
  console.error(error);
  try { await getSql().end(); } catch (_) {}
  process.exit(1);
});
