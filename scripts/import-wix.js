#!/usr/bin/env node

/**
 * Reversible Wix-to-CMS import.
 *
 * Default mode is a read-only plan. Pass --apply to write. Every changed
 * entity receives a pre-import version snapshot before it is updated.
 */

const fs = require('fs');
const path = require('path');
const { db, getSql, recordVersion } = require('../lib/db');

const IMPORT_FILE = path.join(__dirname, '..', 'migration', 'wix-import.json');
const AUTHOR = 'public Wix migration 2026-07-31';

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

function contentSnapshot(content) {
  return { key: content.key, kind: content.kind, value: content.value };
}

function sameProject(a, b) {
  return ['title', 'status', 'layout', 'thumbnail', 'body_html', 'sort_order', 'category', 'source_path', 'source_url', 'source_hash']
    .every((key) => (a[key] == null ? null : a[key]) === (b[key] == null ? null : b[key]));
}

async function plan(client, data) {
  const existingProjects = await client`SELECT * FROM projects`;
  const existingContent = await client`SELECT key, kind, value FROM content`;
  const bySlug = new Map(existingProjects.map((project) => [project.slug, project]));
  const bySourcePath = new Map(existingProjects.filter((project) => project.source_path).map((project) => [project.source_path, project]));
  const contentByKey = new Map(existingContent.map((item) => [item.key, item]));
  const result = {
    projects_create: 0,
    projects_update: 0,
    projects_unchanged: 0,
    existing_projects_to_archive: 0,
    content_create: 0,
    content_update: 0,
    content_unchanged: 0,
  };
  const importedSlugs = new Set();
  for (const project of data.projects) {
    const existing = bySlug.get(project.slug) || bySourcePath.get(project.source_path);
    importedSlugs.add(existing ? existing.slug : project.slug);
    if (!existing) result.projects_create += 1;
    else if (sameProject(existing, project)) result.projects_unchanged += 1;
    else result.projects_update += 1;
  }
  for (const project of existingProjects) {
    if (project.status === 'past' && !importedSlugs.has(project.slug)) result.existing_projects_to_archive += 1;
  }
  for (const content of data.content_regions) {
    const existing = contentByKey.get(content.key);
    if (!existing) result.content_create += 1;
    else if (existing.kind === content.kind && existing.value === content.value) result.content_unchanged += 1;
    else result.content_update += 1;
  }
  return result;
}

async function applyImport(client, data) {
  return client.begin(async (tx) => {
    const importedSlugs = new Set();
    const changes = { projects_created: 0, projects_updated: 0, projects_archived: 0, content_created: 0, content_updated: 0 };

    for (const content of data.content_regions) {
      const [existing] = await tx`SELECT key, kind, value FROM content WHERE key = ${content.key}`;
      if (existing && existing.kind === content.kind && existing.value === content.value) continue;
      if (existing) await recordVersion(tx, 'content', existing.key, 'pre-import', contentSnapshot(existing), AUTHOR);
      await tx`
        INSERT INTO content (key, kind, value, updated_at)
        VALUES (${content.key}, ${content.kind}, ${content.value}, now())
        ON CONFLICT (key) DO UPDATE SET kind = ${content.kind}, value = ${content.value}, updated_at = now()`;
      await recordVersion(tx, 'content', content.key, 'import', contentSnapshot(content), AUTHOR);
      if (existing) changes.content_updated += 1;
      else changes.content_created += 1;
    }

    for (const incoming of data.projects) {
      const rows = await tx`SELECT * FROM projects WHERE slug = ${incoming.slug} OR source_path = ${incoming.source_path} ORDER BY (slug = ${incoming.slug}) DESC LIMIT 1`;
      const existing = rows[0];
      const targetSlug = existing ? existing.slug : incoming.slug;
      importedSlugs.add(targetSlug);
      const desired = { ...incoming, slug: targetSlug };
      if (existing && sameProject(existing, desired)) continue;
      if (existing) {
        await recordVersion(tx, 'project', targetSlug, 'pre-import', projectSnapshot(existing), AUTHOR);
        const [updated] = await tx`
          UPDATE projects SET title = ${desired.title}, status = ${desired.status}, layout = ${desired.layout},
            thumbnail = ${desired.thumbnail}, body_html = ${desired.body_html}, sort_order = ${desired.sort_order},
            category = ${desired.category}, source_path = ${desired.source_path}, source_url = ${desired.source_url},
            source_hash = ${desired.source_hash}, updated_at = now()
          WHERE slug = ${targetSlug} RETURNING *`;
        await recordVersion(tx, 'project', targetSlug, 'import', projectSnapshot(updated), AUTHOR);
        changes.projects_updated += 1;
      } else {
        const [created] = await tx`
          INSERT INTO projects (slug, title, status, layout, thumbnail, body_html, sort_order,
                                category, source_path, source_url, source_hash)
          VALUES (${desired.slug}, ${desired.title}, ${desired.status}, ${desired.layout}, ${desired.thumbnail},
                  ${desired.body_html}, ${desired.sort_order}, ${desired.category}, ${desired.source_path},
                  ${desired.source_url}, ${desired.source_hash}) RETURNING *`;
        await recordVersion(tx, 'project', desired.slug, 'import', projectSnapshot(created), AUTHOR);
        changes.projects_created += 1;
      }
    }

    const stalePast = await tx`SELECT * FROM projects WHERE status = 'past' AND NOT (slug = ANY(${[...importedSlugs]}::text[]))`;
    let archiveOrder = 1000 + data.projects.length;
    for (const project of stalePast) {
      await recordVersion(tx, 'project', project.slug, 'pre-import', projectSnapshot(project), AUTHOR);
      const [updated] = await tx`
        UPDATE projects SET status = 'archive', category = 'More from the archive',
          sort_order = ${archiveOrder++}, updated_at = now() WHERE slug = ${project.slug} RETURNING *`;
      await recordVersion(tx, 'project', project.slug, 'import', projectSnapshot(updated), AUTHOR);
      changes.projects_archived += 1;
    }
    return changes;
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const data = JSON.parse(fs.readFileSync(IMPORT_FILE, 'utf8'));
  if (data.integrity_errors.length) throw new Error('Import artifact contains integrity errors');
  const client = await db();
  const summary = await plan(client, data);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'plan', ...summary }, null, 2));
  if (apply) {
    const changes = await applyImport(client, data);
    console.log(JSON.stringify({ applied: true, ...changes }, null, 2));
  } else {
    console.log('No database changes made. Re-run with --apply after reviewing this plan.');
  }
  await getSql().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
