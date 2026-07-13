import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseVerification,
  serializeReleaseVerification,
} from '../../scripts/release-verification';

const commitSha = 'a'.repeat(40);
const deploymentId = 'dpl_1234567890abcdef';
const projectId = 'prj_1234567890abcdef';

function deployment() {
  return {
    alias: ['dejayvu.com', 'www.dejayvu.com'],
    aliasAssigned: true,
    checksConclusion: 'succeeded',
    checksState: 'completed',
    gitSource: { sha: commitSha },
    id: deploymentId,
    projectId,
    readyState: 'READY',
    target: 'production',
    url: 'personal-website-abc.vercel.app',
  };
}

function build(overrides: Record<string, unknown> = {}) {
  return buildReleaseVerification({
    commitSha,
    deployment: { ...deployment(), ...overrides },
    deploymentId,
    productionDomain: 'dejayvu.com',
    projectId,
    tag: 'v0.1.0',
  });
}

test('release verification exposes only allowlisted deployment evidence', () => {
  const verification = build();
  const bytes = serializeReleaseVerification(verification);

  assert.equal(verification.vercel.deploymentId, deploymentId);
  assert.equal(verification.vercel.productionDomain, 'dejayvu.com');
  assert.equal(verification.release.commitSha, commitSha);
  assert.deepEqual(verification.aws, {
    committedStructureContract: 'validated',
  });
  assert.deepEqual(verification.smoke, {
    routes: [
      '/',
      '/darkroom',
      '/field-notes',
      '/the-lab',
      '/api/photos',
      '/api/notes',
    ],
    status: 'passed',
  });
  assert.doesNotMatch(bytes, /token|environment|creator|meta|inspector/i);
  assert.doesNotMatch(bytes, /liveAudit|live AWS/i);
  assert.doesNotMatch(bytes, new RegExp(projectId));
});

test('release verification rejects wrong deployment state and identity', () => {
  assert.throws(() => build({ readyState: 'ERROR' }), /not a READY/);
  assert.throws(
    () => build({ gitSource: { sha: 'b'.repeat(40) } }),
    /Git SHA does not match/,
  );
  assert.throws(
    () => build({ projectId: 'prj_otherproject123' }),
    /different project/,
  );
  assert.throws(() => build({ alias: ['other.example.com'] }), /not assigned/);
  assert.throws(() => build({ checksConclusion: 'failed' }), /did not succeed/);
  assert.throws(() => build({ checksState: 'running' }), /did not succeed/);
  assert.throws(() => build({ checksState: undefined }), /did not succeed/);
  assert.throws(
    () => build({ checksConclusion: undefined }),
    /did not succeed/,
  );
});

test('release verification accepts deployments without configured checks', () => {
  assert.doesNotThrow(() =>
    build({ checksConclusion: undefined, checksState: undefined }),
  );
});
