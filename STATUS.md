# Dream Farm Commons content migration

## Product purpose

Make the new Dream Farm Commons CMS site a faithful, complete, well-formatted presentation of the public content on `dreamfarmcommons.com`. Preserve every word, link, image, and other public media without editing, summarizing, or truncating it. Reformat and restructure only as needed to fit the new site's visual system, with particular attention to Past Projects.

## Source of truth

- Public source site: `https://www.dreamfarmcommons.com/`
- New production site: `https://dfc-website-two.vercel.app/`
- Source sitemap: `https://www.dreamfarmcommons.com/sitemap.xml`
- The public Wix pages are server-rendered sufficiently for automated extraction. Wix backend access is required only to recover 15 source image files that the public Wix CDN now returns as `403`.

## Current state

- Branch: `main`; the completed migration was published to GitHub in commit `73b0919` and deployed by Vercel.
- The new site is a database-backed Vercel/Neon CMS with page content regions, projects, events, media, and version history.
- The live CMS now contains 105 project rows. Thirty-four are the source site's current curated Past projects; 71 are in the fuller archive. Ninety-five records are source-backed and carry source paths and checksums. The Past overview lists only the 34 projects on the original Past page; archive pages remain available through their direct and legacy URLs without being added to that grid.
- The current Wix sitemap exposes 94 public page URLs, six store-product URLs, and one booking-service URL; internal-link discovery raises the complete public crawl to 104 pages.
- The current Wix `/past` page contains 34 linked project/event items under multiple sections and 28 images. Its current curation differs materially from the new site's seeded Past grid.
- Raw page-specific Wix content can be isolated under `#PAGES_CONTAINER`, including rich text, images, links, and embeds.
- The auditable source snapshot contains 202,607 visible characters, 498 rich-text blocks, 431 media occurrences, 268 links, and two embeds.
- The converter produced 95 project pages and nine top-level source mappings with no text or image-count integrity errors.
- 406 unique source image variants (41.3 MB) are now stored under `public/ImportedMedia` with source URL, byte size, and SHA-256 mappings.
- Fifteen unique Wix image files remain unavailable after trying every supplied responsive URL and each original-media URL. They affect 16 page occurrences and are listed with exact filenames, attempted URLs, and page paths in `migration/wix-media-missing.json`. Seven of them occur inside projects currently linked from the original Past page; the others are in preserved archive/store pages.
- The database import has been applied. Every changed entity received a pre-import restore snapshot; repeated imports now report no content changes.
- Local QA passed for all 104 legacy source paths, desktop 50/50 independently scrolling project columns, mobile stacking, Past row alignment, and the About/Current/Future/Donate/Shop pages.
- A production visual audit loaded and captured all 103 canonical pages (eight top-level pages and 95 source-backed project/store/service pages). No horizontal overflow or true image-ratio distortion was found. All 406 downloaded images were also decoded and visually reviewed in contact sheets; none are corrupt or unintentionally stretched.
- Production QA passed on `https://dfc-website-two.vercel.app/` for the homepage, Past, a representative project, Current, About, Future, Donate, Shop, legacy source paths, local imported media, and the corrected address/parking content.
- The raw Wix homepage content block is retained in the migration manifest and CMS history for fidelity, but is intentionally not rendered: it duplicated the new site's existing Current/Future navigation and reproduced the source site's broken grid formatting beneath the homepage hero.
- `DFC_CL_26Feb/` is an existing untracked user-owned backup and must remain untouched and uncommitted.
- `bd ready` currently reports that no beads database exists in this repository; do not initialize one merely for this migration.

## Migration approach

1. Crawl all public sitemap pages into an auditable source manifest with exact rich HTML, media URLs, links, metadata, ordering, and content counts.
2. Download public media into stable local asset paths and record source URL/checksum mappings.
3. Convert Wix presentation markup into semantic project/page HTML without altering the text or link targets.
4. Reconcile source pages with existing CMS records, preserving existing user edits through database snapshots/version records and idempotent imports.
5. Populate and order Past Projects, add legacy-path redirects, and migrate other public page/store/service content into the appropriate new-site surfaces.
6. Add content-integrity checks, run the site locally, and visually verify desktop/mobile layouts and independently scrolling 50/50 project columns.
7. Apply the reviewed migration to production, push `main`, and verify the Vercel deployment and representative pages.

## Remaining actions

1. Export or grant Wix Media Manager access for the 15 unavailable images in `migration/wix-media-missing.json`.
2. Add those exact originals to the media map and rerun the verified idempotent import.
