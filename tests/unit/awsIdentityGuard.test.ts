import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExpectedNonRootAwsIdentity } from '../../src/modules/media/awsIdentityGuard';

const account = '123456789012';
const principal =
  'arn:aws:sts::123456789012:assumed-role/site-media-maintenance';

test('accepts only the expected non-root AWS identity', () => {
  const input = {
    actualAccount: account,
    actualArn: `${principal}/release-session`,
    expectedAccount: account,
    expectedPrincipalArnPrefix: principal,
  };

  assert.doesNotThrow(() => assertExpectedNonRootAwsIdentity(input));
  assert.throws(
    () =>
      assertExpectedNonRootAwsIdentity({
        ...input,
        actualArn: `arn:aws:iam::${account}:root`,
      }),
    /expected non-root maintenance principal/,
  );
  assert.throws(
    () =>
      assertExpectedNonRootAwsIdentity({
        ...input,
        actualArn: `${principal}-other/release-session`,
      }),
    /expected non-root maintenance principal/,
  );
  assert.throws(
    () =>
      assertExpectedNonRootAwsIdentity({
        ...input,
        expectedAccount: '1234',
      }),
    /12-digit account ID/,
  );
});
