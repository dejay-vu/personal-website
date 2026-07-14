import {
  CloudFormationClient,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  DetectStackDriftCommand,
  type StackResourceDrift,
} from '@aws-sdk/client-cloudformation';
import {
  CloudFrontClient,
  DescribeFunctionCommand,
  type FunctionConfig,
  GetDistributionConfigCommand,
  GetFunctionCommand,
  PublishFunctionCommand,
  TestFunctionCommand,
  UpdateFunctionCommand,
} from '@aws-sdk/client-cloudfront';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { config } from 'dotenv';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { assertAwsContract } from '../src/modules/media/awsContract';
import { parseCloudFrontFunctionOutput } from './media-edge-output';

config({ path: '.env.local' });
config();

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(
  repositoryRoot,
  'infra/external-media-contract.json',
);
const DRIFT_POLL_INTERVAL_MS = 5_000;
const DRIFT_POLL_LIMIT = 60;

type DriftAllowance = {
  actualValue?: string;
  expectedValue?: string;
  logicalResourceId: string;
  propertyPath: string;
};

type MediaEdgeContract = {
  accountId: string;
  driftPolicy: {
    afterViewerRequestPatch: DriftAllowance[];
    known: DriftAllowance[];
  };
  region: string;
  transformed: {
    cloudFrontDistributionId: string;
  };
  viewerRequest: {
    baselineSourceSha256: string;
    cloudFormationLogicalId: string;
    distributionId: string;
    eventType: 'viewer-request';
    functionName: string;
    ownerStack: string;
    robots: {
      cacheControl: string;
      contentType: string;
      getBody: string;
      methods: ['GET', 'HEAD'];
      path: '/robots.txt';
      statusCode: 200;
    };
    runtime: 'cloudfront-js-1.0';
    sourceFile: string;
    targetSourceSha256: string;
  };
};

type LiveSourceState = 'baseline' | 'target';

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}

function parseMode(args: string[]) {
  if (args.length !== 1 || !['--verify', '--apply'].includes(args[0])) {
    throw new Error('Use exactly one of --verify or --apply.');
  }

  return args[0] === '--apply' ? 'apply' : 'verify';
}

async function loadContract() {
  const value = JSON.parse(await readFile(contractPath, 'utf8')) as unknown;
  assertAwsContract(value);
  return value as MediaEdgeContract;
}

async function assertApplyGitSafety() {
  const [{ stdout: root }, { stdout: branch }, { stdout: status }] =
    await Promise.all([
      execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd: repositoryRoot,
      }),
      execFileAsync('git', ['branch', '--show-current'], {
        cwd: repositoryRoot,
      }),
      execFileAsync('git', ['status', '--porcelain'], {
        cwd: repositoryRoot,
      }),
    ]);

  if (resolve(root.trim()) !== repositoryRoot) {
    throw new Error('Media edge apply must run from this repository.');
  }
  if (branch.trim() !== 'main') {
    throw new Error('Media edge apply is permitted only from main.');
  }
  if (status.trim()) {
    throw new Error('Media edge apply requires a clean working tree.');
  }

  const [{ stdout: head }, { stdout: remoteMain }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
    execFileAsync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
      cwd: repositoryRoot,
    }),
  ]);

  const remoteMainSha = remoteMain.trim().split(/\s+/)[0];
  if (!remoteMainSha || head.trim() !== remoteMainSha) {
    throw new Error(
      'Media edge apply requires local main to equal the current remote main.',
    );
  }
}

async function assertExpectedIdentity(
  client: STSClient,
  contract: MediaEdgeContract,
) {
  const identity = await client.send(new GetCallerIdentityCommand({}));
  if (identity.Account !== contract.accountId) {
    throw new Error('AWS caller account does not match the media contract.');
  }
  if (!identity.Arn || identity.Arn.endsWith(':root')) {
    throw new Error('AWS media edge operations require a non-root principal.');
  }
}

function associationArnMatches(arn: string | undefined, functionName: string) {
  return arn?.endsWith(`:function/${functionName}`) ?? false;
}

async function assertDistributionAssociation(
  client: CloudFrontClient,
  contract: MediaEdgeContract,
) {
  const edge = contract.viewerRequest;
  if (edge.distributionId !== contract.transformed.cloudFrontDistributionId) {
    throw new Error(
      'Edge function distribution does not match transformed media.',
    );
  }

  const result = await client.send(
    new GetDistributionConfigCommand({ Id: edge.distributionId }),
  );
  const behaviors = [
    result.DistributionConfig?.DefaultCacheBehavior,
    ...(result.DistributionConfig?.CacheBehaviors?.Items ?? []),
  ];
  const associations = behaviors.flatMap(
    (behavior) => behavior?.FunctionAssociations?.Items ?? [],
  );
  const matches = associations.filter(
    (association) =>
      association.EventType === edge.eventType &&
      associationArnMatches(association.FunctionARN, edge.functionName),
  );

  if (matches.length !== 1) {
    throw new Error(
      'Expected exactly one viewer-request association for the media edge function.',
    );
  }
}

async function getFunctionSource(
  client: CloudFrontClient,
  name: string,
  stage: 'DEVELOPMENT' | 'LIVE',
) {
  const result = await client.send(
    new GetFunctionCommand({ Name: name, Stage: stage }),
  );
  if (!result.FunctionCode || !result.ETag) {
    throw new Error(`CloudFront ${stage} function code or ETag is missing.`);
  }

  return {
    code: result.FunctionCode,
    etag: result.ETag,
  };
}

function sourceState(
  hash: string,
  contract: MediaEdgeContract,
): LiveSourceState {
  if (hash === contract.viewerRequest.baselineSourceSha256) return 'baseline';
  if (hash === contract.viewerRequest.targetSourceSha256) return 'target';
  throw new Error(
    `CloudFront Function source hash ${hash} is neither the approved baseline nor target.`,
  );
}

async function assertFunctionIdentity(
  client: CloudFrontClient,
  contract: MediaEdgeContract,
) {
  const edge = contract.viewerRequest;
  const [description, source] = await Promise.all([
    client.send(
      new DescribeFunctionCommand({ Name: edge.functionName, Stage: 'LIVE' }),
    ),
    getFunctionSource(client, edge.functionName, 'LIVE'),
  ]);
  const summary = description.FunctionSummary;

  if (
    summary?.Name !== edge.functionName ||
    summary.FunctionConfig?.Runtime !== edge.runtime ||
    summary.FunctionMetadata?.Stage !== 'LIVE'
  ) {
    throw new Error('CloudFront Function identity or runtime does not match.');
  }
  if (description.ETag && source.etag && description.ETag !== source.etag) {
    throw new Error('CloudFront Function changed during verification.');
  }

  const hash = sha256(source.code);
  return { hash, state: sourceState(hash, contract) };
}

function driftDifferenceMatches(
  difference: NonNullable<StackResourceDrift['PropertyDifferences']>[number],
  allowance: DriftAllowance,
) {
  return (
    difference.PropertyPath === allowance.propertyPath &&
    (allowance.expectedValue === undefined ||
      difference.ExpectedValue === allowance.expectedValue) &&
    (allowance.actualValue === undefined ||
      difference.ActualValue === allowance.actualValue) &&
    difference.DifferenceType === 'NOT_EQUAL'
  );
}

function assertAllowedDrift(
  drifts: StackResourceDrift[],
  allowances: DriftAllowance[],
) {
  const remaining = [...allowances];

  for (const drift of drifts) {
    if (drift.StackResourceDriftStatus === 'IN_SYNC') continue;
    if (drift.StackResourceDriftStatus !== 'MODIFIED') {
      throw new Error(
        `Unexpected ${drift.StackResourceDriftStatus ?? 'unknown'} drift for ${drift.LogicalResourceId ?? 'unknown resource'}.`,
      );
    }
    const differences = drift.PropertyDifferences ?? [];
    if (differences.length === 0) {
      throw new Error(
        `Modified resource ${drift.LogicalResourceId ?? 'unknown'} has no property differences.`,
      );
    }

    for (const difference of differences) {
      const allowanceIndex = remaining.findIndex(
        (allowance) =>
          allowance.logicalResourceId === drift.LogicalResourceId &&
          driftDifferenceMatches(difference, allowance),
      );
      if (allowanceIndex === -1) {
        throw new Error(
          `Unapproved stack drift: ${drift.LogicalResourceId ?? 'unknown'} ${difference.PropertyPath ?? 'unknown path'}.`,
        );
      }
      remaining.splice(allowanceIndex, 1);
    }
  }

  if (remaining.length > 0) {
    throw new Error(
      `Expected stack drift was not detected: ${remaining
        .map(
          (allowance) =>
            `${allowance.logicalResourceId} ${allowance.propertyPath}`,
        )
        .join(', ')}.`,
    );
  }
}

async function waitForDriftDetection(
  client: CloudFormationClient,
  detectionId: string,
) {
  for (let attempt = 0; attempt < DRIFT_POLL_LIMIT; attempt += 1) {
    const result = await client.send(
      new DescribeStackDriftDetectionStatusCommand({
        StackDriftDetectionId: detectionId,
      }),
    );
    if (result.DetectionStatus === 'DETECTION_COMPLETE') return;
    if (result.DetectionStatus === 'DETECTION_FAILED') {
      throw new Error(
        `CloudFormation drift detection failed: ${result.DetectionStatusReason ?? 'unknown reason'}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, DRIFT_POLL_INTERVAL_MS));
  }

  throw new Error('CloudFormation drift detection timed out.');
}

async function verifyStackDrift(
  client: CloudFormationClient,
  contract: MediaEdgeContract,
  state: LiveSourceState,
) {
  const stackName = contract.viewerRequest.ownerStack;
  const detection = await client.send(
    new DetectStackDriftCommand({ StackName: stackName }),
  );
  if (!detection.StackDriftDetectionId) {
    throw new Error('CloudFormation did not return a drift detection ID.');
  }
  await waitForDriftDetection(client, detection.StackDriftDetectionId);

  const drifts: StackResourceDrift[] = [];
  let nextToken: string | undefined;
  do {
    const result = await client.send(
      new DescribeStackResourceDriftsCommand({
        NextToken: nextToken,
        StackName: stackName,
        StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED'],
      }),
    );
    drifts.push(...(result.StackResourceDrifts ?? []));
    nextToken = result.NextToken;
  } while (nextToken);

  const allowances = [
    ...contract.driftPolicy.known,
    ...(state === 'target' ? contract.driftPolicy.afterViewerRequestPatch : []),
  ];
  assertAllowedDrift(drifts, allowances);
}

function cloudFrontTestEvent({
  accept = 'image/webp',
  method,
  querystring = {},
  uri,
}: {
  accept?: string;
  method: 'GET' | 'HEAD';
  querystring?: Record<string, { value: string }>;
  uri: string;
}) {
  return {
    version: '1.0',
    context: {
      eventType: 'viewer-request',
    },
    viewer: { ip: '198.51.100.1' },
    request: {
      method,
      uri,
      querystring,
      headers: {
        accept: { value: accept },
        host: { value: 'resizer.dejayvu.com' },
      },
      cookies: {},
    },
  };
}

async function runFunctionTest({
  client,
  etag,
  event,
  name,
}: {
  client: CloudFrontClient;
  etag: string;
  event: ReturnType<typeof cloudFrontTestEvent>;
  name: string;
}) {
  const result = await client.send(
    new TestFunctionCommand({
      EventObject: Buffer.from(JSON.stringify(event)),
      IfMatch: etag,
      Name: name,
      Stage: 'DEVELOPMENT',
    }),
  );
  if (result.TestResult?.FunctionErrorMessage) {
    throw new Error(
      `CloudFront Function test failed: ${result.TestResult.FunctionErrorMessage}`,
    );
  }
  if (!result.TestResult?.FunctionOutput) {
    throw new Error('CloudFront Function test returned no output.');
  }

  return parseCloudFrontFunctionOutput(result.TestResult.FunctionOutput);
}

function decodeFunctionBody(value: unknown) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const body = value as { data?: unknown; encoding?: unknown };
  if (typeof body.data !== 'string') return undefined;
  if (body.encoding === 'base64') {
    return Buffer.from(body.data, 'base64').toString('utf8');
  }
  if (body.encoding === undefined || body.encoding === 'text') return body.data;
  return undefined;
}

async function testDevelopmentFunction(
  client: CloudFrontClient,
  contract: MediaEdgeContract,
  etag: string,
) {
  const edge = contract.viewerRequest;
  const getOutput = await runFunctionTest({
    client,
    etag,
    event: cloudFrontTestEvent({
      method: 'GET',
      querystring: { ignored: { value: '1' } },
      uri: edge.robots.path,
    }),
    name: edge.functionName,
  });
  const getHeaders = getOutput.headers as
    | Record<string, { value?: string }>
    | undefined;
  if (
    getOutput.statusCode !== edge.robots.statusCode ||
    decodeFunctionBody(getOutput.body) !== edge.robots.getBody ||
    getHeaders?.['content-type']?.value !== edge.robots.contentType ||
    getHeaders?.['cache-control']?.value !== edge.robots.cacheControl
  ) {
    throw new Error('CloudFront Function robots GET contract test failed.');
  }

  const headOutput = await runFunctionTest({
    client,
    etag,
    event: cloudFrontTestEvent({
      method: 'HEAD',
      querystring: { ignored: { value: '1' } },
      uri: edge.robots.path,
    }),
    name: edge.functionName,
  });
  if (
    headOutput.statusCode !== edge.robots.statusCode ||
    (Object.hasOwn(headOutput, 'body') &&
      decodeFunctionBody(headOutput.body) !== '')
  ) {
    throw new Error('CloudFront Function robots HEAD contract test failed.');
  }

  const rewriteOutput = await runFunctionTest({
    client,
    etag,
    event: cloudFrontTestEvent({
      accept: 'image/avif,image/webp,*/*',
      method: 'GET',
      querystring: {
        ignored: { value: '1' },
        quality: { value: '150' },
        width: { value: '2048px' },
        format: { value: 'auto' },
      },
      uri: '/media/photos/test/original.jpg',
    }),
    name: edge.functionName,
  });
  if (
    rewriteOutput.uri !==
      '/media/photos/test/original.jpg/format=avif,quality=100,width=2048' ||
    JSON.stringify(rewriteOutput.querystring) !== '{}'
  ) {
    throw new Error('CloudFront Function image rewrite contract test failed.');
  }
}

async function publishTarget(
  client: CloudFrontClient,
  contract: MediaEdgeContract,
  targetCode: Uint8Array,
) {
  const edge = contract.viewerRequest;
  const [developmentDescription, developmentSource] = await Promise.all([
    client.send(
      new DescribeFunctionCommand({
        Name: edge.functionName,
        Stage: 'DEVELOPMENT',
      }),
    ),
    getFunctionSource(client, edge.functionName, 'DEVELOPMENT'),
  ]);
  const developmentHash = sha256(developmentSource.code);
  sourceState(developmentHash, contract);
  const functionConfig = developmentDescription.FunctionSummary
    ?.FunctionConfig as FunctionConfig | undefined;
  let developmentEtag = developmentDescription.ETag;

  if (!functionConfig || !developmentEtag) {
    throw new Error(
      'CloudFront DEVELOPMENT function config or ETag is missing.',
    );
  }
  if (
    developmentDescription.FunctionSummary?.Name !== edge.functionName ||
    developmentDescription.FunctionSummary?.FunctionMetadata?.Stage !==
      'DEVELOPMENT' ||
    functionConfig.Runtime !== edge.runtime
  ) {
    throw new Error(
      'CloudFront DEVELOPMENT function identity or runtime does not match.',
    );
  }
  if (developmentDescription.ETag !== developmentSource.etag) {
    throw new Error(
      'CloudFront DEVELOPMENT function changed during verification.',
    );
  }

  if (developmentHash !== edge.targetSourceSha256) {
    const update = await client.send(
      new UpdateFunctionCommand({
        FunctionCode: targetCode,
        FunctionConfig: functionConfig,
        IfMatch: developmentEtag,
        Name: edge.functionName,
      }),
    );
    if (!update.ETag) {
      throw new Error('CloudFront Function update returned no ETag.');
    }
    developmentEtag = update.ETag;
  }

  await testDevelopmentFunction(client, contract, developmentEtag);
  const publication = await client.send(
    new PublishFunctionCommand({
      IfMatch: developmentEtag,
      Name: edge.functionName,
    }),
  );
  if (
    publication.FunctionSummary?.FunctionMetadata?.Stage !== 'LIVE' ||
    publication.FunctionSummary?.FunctionConfig?.Runtime !== edge.runtime
  ) {
    throw new Error('CloudFront Function publication did not reach LIVE.');
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const live = await getFunctionSource(client, edge.functionName, 'LIVE');
    if (sha256(live.code) === edge.targetSourceSha256) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    'Published CloudFront Function does not match target source.',
  );
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const contract = await loadContract();
  const targetCode = await readFile(
    resolve(repositoryRoot, contract.viewerRequest.sourceFile),
  );
  const targetHash = sha256(targetCode);
  if (targetHash !== contract.viewerRequest.targetSourceSha256) {
    throw new Error(
      'Committed CloudFront Function source hash is inconsistent.',
    );
  }
  if (mode === 'apply') await assertApplyGitSafety();

  const clientConfig = { region: contract.region };
  const cloudFront = new CloudFrontClient(clientConfig);
  const cloudFormation = new CloudFormationClient(clientConfig);
  const sts = new STSClient(clientConfig);

  await assertExpectedIdentity(sts, contract);
  await assertDistributionAssociation(cloudFront, contract);
  const live = await assertFunctionIdentity(cloudFront, contract);
  await verifyStackDrift(cloudFormation, contract, live.state);

  if (mode === 'verify') {
    console.log(
      `Media edge verified: LIVE source is the approved ${live.state} (${live.hash}).`,
    );
    return;
  }
  if (live.state === 'target') {
    console.log(
      'Media edge already matches the approved target; no update made.',
    );
    return;
  }

  await publishTarget(cloudFront, contract, targetCode);
  await verifyStackDrift(cloudFormation, contract, 'target');
  console.log('Media edge target tested in DEVELOPMENT and published to LIVE.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
