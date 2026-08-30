# Dream Farm Commons Website

Website + CMS for [Dream Farm Commons](https://dreamfarmcommons.com), a contemporary art gallery at 349 15th Street, Oakland CA 94612.

Deployed on Vercel — pushes to `main` deploy automatically. Content lives in a Neon Postgres database and is edited through the built-in admin panel at **`/admin`** — no code changes or deploys needed for day-to-day content edits.

## How content editing works

- **`/admin`** — password-protected admin panel (password is the `ADMIN_PASSWORD` env var on Vercel).
  - **Pages** — click-to-edit the live pages: text is edited in place, images are replaced by hovering them. Editable regions are the elements marked `data-cms="…"` in `templates/`.
  - **Projects** — create/reorder/delete past-project pages. New projects use the standard two-column layout (photos left, copy right). The Past Projects grid is generated from this list.
  - **Calendar** — events shown on the Future Projects page calendar.
  - **History** — every save is versioned (Google-Docs style). Any version of anything can be previewed and restored; restores are themselves versioned, so nothing is ever lost.
- Uploaded images are stored in Postgres and served from `/api/media/<id>` with immutable caching. They are downscaled in the browser before upload.

## Architecture

```
├── api/index.js        # Single serverless function: page rendering + JSON API
├── lib/                # db (schema bootstrap), auth (sessions), render (cheerio templating)
├── templates/          # HTML page templates; data-cms attributes mark editable regions
├── public/             # Static assets served as-is (css, Images, fonts, script, admin app)
│   ├── ImportedMedia/  # Checksummed copies of the public Wix media
│   └── admin/          # Admin SPA + in-page visual editor (vanilla JS, no build step)
├── migration/          # Auditable Wix snapshot, import artifact, and media maps
├── scripts/            # CMS seed plus the crawl/build/import/verification tools
├── seed-data/          # The original hand-coded project pages (source for the seed)
└── vercel.json         # Rewrites: all page URLs → /api/index?__path=page/…
```

Request flow: static files in `public/` are served directly; every page URL is rewritten to the function, which loads the template, overlays content from Postgres (`content`, `projects`, `events` tables), and returns HTML with a short edge cache (`s-maxage=10`). With `?cmsedit=1` and a valid session, the renderer injects the visual editor.

Database tables: `content` (page regions), `projects`, `events`, `media` (uploaded images), `versions` (full history of every change), `sessions`.

## Development

```bash
npm install
vercel env pull            # writes .env.local (DB credentials + ADMIN_PASSWORD)
vercel dev                 # local server with functions + rewrites
node --env-file=.env.local scripts/seed.js   # idempotent; safe to re-run
```

## Public Wix migration

The public Wix site is captured and converted without rewriting its editorial content. The import is idempotent, and every changed database record receives a pre-import version snapshot.

```bash
npm run crawl:wix            # refresh the public source snapshot
npm run download:wix-media   # copy available source images into public/ImportedMedia
npm run build:wix-import     # build semantic CMS content without DB writes
npm run verify:wix           # verify page coverage, text, image counts, and checksums
npm run import:wix           # read-only database change plan
npm run import:wix -- --apply
npm run repair:past-grid     # compare CMS ordering/images to the audited 70-tile gallery
npm run repair:past-grid -- --apply
```

`migration/wix-media-missing.json` lists source images that Wix itself no longer serves publicly. Exact originals must be exported from the Wix Media Manager rather than replaced with unrelated files.

## Deploying

```bash
git push origin main       # Vercel builds and deploys automatically
```

- Vercel project: https://vercel.com/handshake1/dfc-website (production: dfc-website-two.vercel.app)
- Database: Neon Postgres via the Vercel marketplace integration (env vars are managed by the integration; all environments share one database)
