import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const baseline = readFileSync(
  'prisma/migrations/00000000000000_baseline/migration.sql',
  'utf8',
);
const lock = readFileSync('prisma/migrations/migration_lock.toml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const baselineWorkflow = readFileSync(
  '.github/workflows/db-baseline.yml',
  'utf8',
);
const deployWorkflow = readFileSync('.github/workflows/db-deploy.yml', 'utf8');

test('baseline migration creates the complete stable-domain schema', () => {
  for (const table of [
    'categories',
    'media_assets',
    'notes',
    'photos',
    'photo_tags',
    'photo_tag_assignments',
    'admin_upload_intents',
    'admin_audit_logs',
    'storage_deletion_jobs',
    '_CategoryToNote',
  ]) {
    assert.match(baseline, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(baseline, /\bDROP\b/i);
  assert.doesNotMatch(baseline, /_prisma_migrations/);
  assert.match(lock, /provider = "postgresql"/);
});

test('test databases replay migrations instead of pushing schema state', () => {
  assert.match(packageJson.scripts['db:test:reset'], /migrate reset --force/);
  assert.doesNotMatch(packageJson.scripts['test:integration'], /db push/);
  assert.doesNotMatch(packageJson.scripts['test:e2e:prepare'], /db push/);
});

test('production build never applies migrations', () => {
  assert.equal(packageJson.scripts.build, 'prisma generate && next build');
  assert.doesNotMatch(packageJson.scripts.build, /migrate|db push/);
});

test('production database writes stay in manual protected workflows', () => {
  for (const workflow of [baselineWorkflow, deployWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /environment: Production/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(workflow, /continue-on-error:/);
    assert.doesNotMatch(workflow, /actions\/.+@v4\b/);
    assert.doesNotMatch(workflow.split('    steps:')[0], /secrets\./);
    assert.match(workflow, /group: production-database/);
    assert.doesNotMatch(workflow, /\bpush:/);
  }
  assert.match(baselineWorkflow, /PRODUCTION_BASELINE_APPROVAL/);
  assert.match(baselineWorkflow, /PRODUCTION_RESTORE_EVIDENCE_ID/);
  assert.match(baselineWorkflow, /PRODUCTION_RESTORE_EVIDENCE_CREATED_AT/);
  assert.match(deployWorkflow, /db:migrate:deploy/);
  assert.match(deployWorkflow, /db:migrate:preflight/);
});
