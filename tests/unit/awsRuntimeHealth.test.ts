import type { ListObjectsV2CommandInput } from '@aws-sdk/client-s3';
import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAwsHealthRequest } from '../../src/app/api/admin/aws-health/handler';
import {
  type AwsRuntimeHealthProbe,
  checkAwsRuntimeHealth,
} from '../../src/modules/media/awsRuntimeHealth';

const account = '123456789012';
const principal = `arn:aws:iam::${account}:user/personal-website-vercel`;
const env: NodeJS.ProcessEnv = {
  AWS_EXPECTED_ACCOUNT_ID: account,
  AWS_REGION: 'eu-west-2',
  AWS_RUNTIME_PRINCIPAL_ARN_PREFIX: principal,
  NODE_ENV: 'test',
  S3_BUCKET_NAME: 'original-media',
  TRANSFORMED_IMAGE_BUCKET_NAME: 'transformed-media',
};

function createProbe({
  accountId = account,
  arn = principal,
  listObjects = async () => ({}),
}: {
  accountId?: string;
  arn?: string;
  listObjects?: AwsRuntimeHealthProbe['listObjects'];
} = {}): AwsRuntimeHealthProbe {
  return {
    getCallerIdentity: async () => ({ Account: accountId, Arn: arn }),
    listObjects,
  };
}

test('checks the expected non-root identity and both media buckets read-only', async () => {
  const inputs: ListObjectsV2CommandInput[] = [];
  const result = await checkAwsRuntimeHealth({
    env,
    probe: createProbe({
      listObjects: async (input) => {
        inputs.push(input);
        return {};
      },
    }),
  });

  assert.deepEqual(result, {
    identity: 'ok',
    originals: 'ok',
    transformed: 'ok',
  });
  assert.deepEqual(inputs, [
    {
      Bucket: 'original-media',
      ExpectedBucketOwner: account,
      MaxKeys: 1,
      Prefix: 'media/health-check/',
    },
    {
      Bucket: 'transformed-media',
      ExpectedBucketOwner: account,
      MaxKeys: 1,
      Prefix: 'media/health-check/',
    },
  ]);
});

test('rejects a wrong account, root identity, or unexpected principal before S3', async () => {
  for (const probe of [
    createProbe({ accountId: '999999999999' }),
    createProbe({ arn: `arn:aws:iam::${account}:root` }),
    createProbe({
      arn: `arn:aws:iam::${account}:user/unexpected-runtime`,
    }),
  ]) {
    let listCalls = 0;
    probe.listObjects = async () => {
      listCalls += 1;
      return {};
    };

    await assert.rejects(
      checkAwsRuntimeHealth({ env, probe }),
      /configured non-root principal/,
    );
    assert.equal(listCalls, 0);
  }
});

test('retains S3 failures and aborts a health check that exceeds its timeout', async () => {
  const s3Failure = new Error('simulated S3 failure');
  await assert.rejects(
    checkAwsRuntimeHealth({
      env,
      probe: createProbe({
        listObjects: async () => {
          throw s3Failure;
        },
      }),
    }),
    (error: unknown) => error === s3Failure,
  );

  let observedSignal: AbortSignal | undefined;
  await assert.rejects(
    checkAwsRuntimeHealth({
      env,
      probe: {
        getCallerIdentity: async (signal) => {
          observedSignal = signal;
          return new Promise(() => {});
        },
        listObjects: async () => ({}),
      },
      timeoutMs: 5,
    }),
    /timed out/,
  );
  assert.equal(observedSignal?.aborted, true);
});

test('fails closed when runtime identity configuration is incomplete', async () => {
  let identityCalls = 0;
  const probe = createProbe();
  probe.getCallerIdentity = async () => {
    identityCalls += 1;
    return { Account: account, Arn: principal };
  };

  await assert.rejects(
    checkAwsRuntimeHealth({
      env: { ...env, AWS_RUNTIME_PRINCIPAL_ARN_PREFIX: undefined },
      probe,
    }),
    /AWS_RUNTIME_PRINCIPAL_ARN_PREFIX/,
  );
  await assert.rejects(
    checkAwsRuntimeHealth({
      env: {
        ...env,
        AWS_RUNTIME_PRINCIPAL_ARN_PREFIX: `arn:aws:iam::${account}:root`,
      },
      probe,
    }),
    /identity configuration/,
  );
  await assert.rejects(
    checkAwsRuntimeHealth({
      env: { ...env, TRANSFORMED_IMAGE_BUCKET_NAME: 'original-media' },
      probe,
    }),
    /distinct resources/,
  );
  assert.equal(identityCalls, 0);
});

test('the route is owner-gated and marks every response no-store', async () => {
  let checks = 0;
  const response = await handleAwsHealthRequest(
    new Request('https://example.test/api/admin/aws-health'),
    {
      authorize: async () => ({
        ok: false,
        response: Response.json(
          { error: { message: 'Unauthorized', status: 401 }, ok: false },
          { status: 401 },
        ),
      }),
      checkHealth: async () => {
        checks += 1;
        return {
          identity: 'ok',
          originals: 'ok',
          transformed: 'ok',
        };
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(checks, 0);
});

test('the route returns only status markers and a generic failure', async () => {
  const success = await handleAwsHealthRequest(
    new Request('https://example.test/api/admin/aws-health'),
    {
      authorize: async () => ({ ok: true }),
      checkHealth: async () => ({
        identity: 'ok',
        originals: 'ok',
        transformed: 'ok',
      }),
    },
  );
  const successBody = await success.text();

  assert.equal(success.status, 200);
  assert.equal(success.headers.get('cache-control'), 'no-store');
  assert.deepEqual(JSON.parse(successBody), {
    data: {
      identity: 'ok',
      originals: 'ok',
      transformed: 'ok',
    },
    ok: true,
  });
  assert.doesNotMatch(
    successBody,
    /arn:aws|123456789012|original-media|transformed-media/,
  );

  const errors: unknown[] = [];
  const failure = await handleAwsHealthRequest(
    new Request('https://example.test/api/admin/aws-health'),
    {
      authorize: async () => ({ ok: true }),
      checkHealth: async () => {
        throw new Error(
          'arn:aws:iam::123456789012:user/private in private-bucket',
        );
      },
      logError: (_message, error) => errors.push(error),
    },
  );
  const failureBody = await failure.text();

  assert.equal(failure.status, 500);
  assert.equal(failure.headers.get('cache-control'), 'no-store');
  assert.deepEqual(JSON.parse(failureBody), {
    error: {
      message: 'AWS runtime health check failed.',
      status: 500,
    },
    ok: false,
  });
  assert.doesNotMatch(failureBody, /arn:aws|123456789012|private-bucket/);
  assert.equal(errors.length, 1);
});
