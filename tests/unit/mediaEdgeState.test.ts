import assert from 'node:assert/strict';
import test from 'node:test';

import { getDriftSourceState } from '../../scripts/media-edge-state';

test('uses DEVELOPMENT state for CloudFormation drift policy', () => {
  assert.equal(getDriftSourceState('baseline', 'baseline'), 'baseline');
  assert.equal(getDriftSourceState('baseline', 'target'), 'target');
  assert.equal(getDriftSourceState('target', 'target'), 'target');
});

test('rejects a DEVELOPMENT rollback after the target is LIVE', () => {
  assert.throws(
    () => getDriftSourceState('target', 'baseline'),
    /DEVELOPMENT unexpectedly differs from the published target/,
  );
});
