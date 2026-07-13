# DeJay Vu

The site combines engineering writing, photography, a contact workflow, and a small private admin workspace for managing notes and photos.

Live site: [dejayvu.com](https://dejayvu.com)

## What It Does

- Presents a personal homepage with social links, a timeline, and responsive dark/light theme support.
- Publishes software engineering notes in Markdown with syntax-highlighted code, categories, reading metadata, and article SEO.
- Displays photography in Darkroom with searchable metadata and optimized CloudFront image variants.
- Provides a contact form with validation, email delivery, and private attachment handling.
- Includes a GitHub-protected admin area for uploading, archiving, restoring, and purging notes or photos.
- Generates SEO metadata, Open Graph data, `robots.txt`, `sitemap.xml`, and structured data for key public pages.

## Tech Stack

- **App framework:** Next.js App Router, React, TypeScript
- **UI:** HeroUI, Tailwind CSS, next-themes
- **Database:** PostgreSQL with Prisma
- **Auth:** NextAuth with GitHub OAuth
- **Media:** AWS S3 for source assets, CloudFront image transformation for optimized delivery
- **Email:** Resend and React Email
- **Infrastructure:** AWS CDK for contact storage; an external contract for the existing media pipeline
- **Hosting:** Vercel

## Implementation Overview

The site is organized around stable photos, notes, and projects domains. Their current public venues are Darkroom `/darkroom`, Field Notes `/field-notes`, and The Lab `/the-lab`; brand names remain in presentation adapters. Deep read and admin modules own domain behavior, while client modules handle endless scrolling, image modals, theme switching, and admin controls.

Note Markdown and metadata are stored atomically in PostgreSQL. S3 stores immutable binary Media Assets under entity-ID and asset-ID keys; changing a slug never moves storage. Images are rendered through CloudFront transformation URLs rather than loading full-size originals. Contact form attachments are stored separately in a private S3 bucket and shared only through short-lived signed URLs.

The admin workspace uses GitHub sign-in, but write access is enforced server-side through an allowlist. Uploads go through a staging step before being finalized into database records and public media keys. Archive retains media; purge permanently removes the database record and commits a retryable deletion of every original S3 version, delete marker, and transformed cache object.

## Project Structure

```text
src/app/             App Router pages, route handlers, metadata routes
src/components/      UI modules for home, notes, photos, contact, and admin
src/modules/         Deep domain modules for photos, notes, admin, and media
src/services/        AWS helpers and contact attachment storage
src/lib/             Shared auth, media, SEO, validation, and utility logic
prisma/              Prisma schema
infra/               AWS CDK contact stack and external media contract
scripts/             Guarded domain reset, verification, and media prewarming
```

## Local Development

Use Node 24 and npm 11.

```bash
nvm use
corepack enable npm
corepack npm ci
cp .env.example .env.local
corepack npm run prisma:generate
corepack npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
corepack npm test
corepack npm run test:integration
corepack npm run test:e2e
corepack npm run check:naming
corepack npm run check:aws-contract
corepack npm run check:workflows
corepack npm run lint
corepack npm run typecheck
corepack npm run build
```

The integration and E2E commands reset data and therefore require both
database URLs to identify the same explicitly disposable `test` or `ci`
database; the guard rejects every other target before reset.

## Configuration

Local secrets belong in `.env.local`. Production secrets belong in Vercel Project Settings. Do not commit database URLs, OAuth secrets, AWS credentials, email API keys, or Vercel environment dumps.

The example file [`.env.example`](./.env.example) documents the variables needed for local development and deployment without including real values.

Important configuration groups:

- Database connection for Prisma/PostgreSQL
- GitHub OAuth and admin allowlist
- AWS S3 and CloudFront media settings
- Contact form email and private attachment storage
- Vercel production URL and runtime settings

## Deployment

The production site is deployed on Vercel from the GitHub `main` branch. Vercel uses the Node version specified in `package.json`; `vercel.json` sends install and build commands through Corepack so the exact pinned npm version is retained.

Before deploying changes that affect data or media, verify:

- Vercel environment variables are present for Production.
- The GitHub OAuth app callback points to the deployed domain.
- The Prisma schema matches the production database.
- S3 buckets, CloudFront domains, and both distribution IDs match the environment configuration; the AWS identity can call `cloudfront:CreateInvalidation`.
- The committed storage layout version matches the application key builders (`corepack npm run check:aws-contract`).
- `CRON_SECRET` is set so Vercel can authenticate the daily deletion-job recovery run.
- `corepack npm test`, `corepack npm run test:integration`, `corepack npm run check:naming`, `corepack npm run lint`, `corepack npm run typecheck`, and `corepack npm run build` pass locally.

## SEO

SEO metadata is generated centrally for the public site identity and per-page content. Public pages include canonical URLs, Open Graph metadata, and structured data where appropriate. Admin and API routes are excluded from indexing.

Google Search Console verification is served from `public/google5eb57925c4750681.html`.
