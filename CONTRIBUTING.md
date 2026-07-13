# Contributing

This repository uses Node.js 24 and the npm version pinned by `packageManager` and `devEngines`. Run `corepack enable npm` once, verify `corepack npm --version`, install the exact dependency graph with `corepack npm ci`, and keep `package-lock.json` synchronized with `package.json`.

## Branches and commits

Create short-lived branches from `main` using `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `ci/`, or `chore/`. Changes reach `main` through a pull request and squash merge.

Every commit and pull-request title must use Conventional Commits:

```text
feat(photos): add camera filters
fix(db): preserve keyset ordering
docs(release): explain production checks
```

Allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`. Scopes are optional; useful scopes include `app`, `home`, `photos`, `notes`, `feeds`, `admin`, `media`, `db`, `infra`, `e2e`, `release`, `deps`, and `docs`.

## Required checks

Run checks that match the change, and run the complete set before a release:

```bash
corepack npm run prisma:generate
corepack npm run check:public-tree
corepack npm run check:migrations
corepack npm run check:aws-contract
corepack npm run format:check
corepack npm run check:workflows
corepack npm run check:naming
corepack npm run lint
corepack npm run typecheck
corepack npm test
corepack npm run test:integration
corepack npm run test:e2e
corepack npm run build
corepack npm run infra:synth
git diff --check
```

Integration and browser tests require explicit disposable PostgreSQL URLs. Their database names must be `ci`, `test`, or end in `_test`/`-test`. The guard must never be bypassed.

Localhost test databases are accepted directly. A remote disposable test database additionally requires `TEST_DATABASE_RESET_APPROVAL` to equal its exact target fingerprint. Development migrations require an explicit `DEVELOPMENT_DATABASE_FINGERPRINT`; Prisma Studio uses the same development-only guard.

## Public repository boundary

Local editor state, prompts, tool configuration, development-session notes, credentials, database dumps, and generated artifacts must not be committed. `corepack npm run check:public-tree` enforces blocked paths and the exact public documentation allowlist. Do not bypass it with `git add -f`.

Public architecture decisions and operational runbooks must be durable project documentation. Add each new `docs/` file explicitly to `config/public-docs-allowlist.txt`; directory wildcards are not accepted.

## Database changes

- Commit `prisma/schema.prisma`, every migration SQL file, and `migration_lock.toml` together.
- Create migrations only against an isolated development database. Never run `migrate dev`, `db push`, or reset commands against production.
- Never edit or delete a migration that has reached a shared or production database.
- CI must rebuild a disposable database from committed migrations before integration and browser tests.
- Production uses the protected database workflows and `prisma migrate deploy`. Do not run migrations from the Vercel build.
- Design production changes as backward-compatible expand/contract releases. Prefer a forward fix over an unplanned down migration.

The protected GitHub `Production` environment stores the direct database URL and the output of `corepack npm run db:target:fingerprint`. The one-time baseline workflow additionally requires a verified Neon restore/backup reference and an approval value in the form `00000000000000_baseline:<migration.sql sha256>`. It records the migration as already applied; it must never execute the baseline SQL against an existing production schema.

## AWS changes

The contact attachment bucket is CDK-managed. Existing media buckets, CloudFront distributions, and the image Lambda are external resources referenced by a documented contract. Run `corepack npm run infra:synth` for every infrastructure change and review `cdk diff` before a manual deployment. Do not import or replace existing resources as part of an unrelated application change.

Persisted S3 key structure is versioned independently of product releases. `STORAGE_LAYOUT_VERSION` in the key builders must equal `storageLayoutVersion` in the external media contract. Increment it only when a persisted namespace or key shape changes, and include backward-compatible reads or a reviewed migration plus updated golden tests. Public routes, labels, slugs, object contents, and S3 Object Versioning state do not change the layout version.

Admin purge deliberately deletes every version and delete marker for the selected immutable original key. That product behavior is independent of the release structure contract. Never use an account root key for runtime or maintenance operations.

## Releases

Release Please owns routine version bumps, `CHANGELOG.md`, `package.json`, the lockfile, and `.release-please-manifest.json`. Feature commits bump the minor version before 1.0, fixes bump patch, and breaking changes bump minor. Do not create competing manual version commits.

Merging the Release Please PR creates a `vX.Y.Z` tag and a draft GitHub Release. The protected `Finalize Production Release` workflow accepts only a tag at the current `main` commit and the matching Vercel deployment ID. Do not merge another commit until that draft is finalized. The workflow requires successful CI for one coherent `main` push run, a clean production migration ledger/schema diff, a matching READY production deployment and production alias, and public-route smoke tests before publishing the draft.

Do not publish a draft Release directly from the GitHub UI or API. The post-publish audit is read-only and fails when either protected evidence asset is missing or inconsistent; it is not a substitute for the Production finalizer.

Every published Release receives two allowlisted JSON assets:

- `release-provenance.json` is deterministic structure evidence for Git, Prisma migrations, the storage layout version, Contact template, and external media contract.
- `release-verification.json` records only the new production deployment and successful release gates.

The AWS entry in public verification means only that the committed, credential-free structure contract passed validation. A protected-environment approver must separately confirm the read-only live audit and root-key rotation gate using private operational evidence; the public artifact never claims or embeds that evidence.

Neither artifact may contain database targets or rows, restore evidence, AWS identities, environment variables, S3 objects, old deployment details, local paths, timestamps, or development-session material.

## Pull requests

Keep pull requests focused. Describe user-visible behavior, tests, database or AWS effects, environment changes, rollout, and rollback constraints. Never paste secrets or production data into commits, logs, pull requests, or release artifacts.
