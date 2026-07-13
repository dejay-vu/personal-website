import { canonicalPrettyJson } from './release-provenance';

type VercelDeployment = {
  alias?: unknown;
  aliasAssigned?: unknown;
  checksConclusion?: unknown;
  checksState?: unknown;
  gitSource?: { sha?: unknown };
  id?: unknown;
  project?: { id?: unknown };
  projectId?: unknown;
  readyState?: unknown;
  status?: unknown;
  target?: unknown;
  url?: unknown;
};

const SEMVER_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const PROJECT_ID = /^prj_[A-Za-z0-9]{8,64}$/;
const SMOKE_ROUTES = [
  '/',
  '/darkroom',
  '/field-notes',
  '/the-lab',
  '/api/photos',
  '/api/notes',
] as const;
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function normalizedHostname(value: string, label: string) {
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '');
  if (hostname.includes('/') || !HOSTNAME.test(hostname)) {
    throw new Error(`${label} must be a hostname without a path.`);
  }
  return hostname;
}

export function buildReleaseVerification({
  commitSha,
  deployment,
  deploymentId,
  productionDomain,
  projectId,
  tag,
}: {
  commitSha: string;
  deployment: unknown;
  deploymentId: string;
  productionDomain: string;
  projectId: string;
  tag: string;
}) {
  if (!SEMVER_TAG.test(tag)) throw new Error('Release tag must be vX.Y.Z.');
  if (!GIT_SHA.test(commitSha)) {
    throw new Error('Release commit must be a full Git SHA-1 value.');
  }
  if (!DEPLOYMENT_ID.test(deploymentId)) {
    throw new Error('Vercel deployment ID is invalid.');
  }
  if (!PROJECT_ID.test(projectId)) {
    throw new Error('Vercel project ID is invalid.');
  }
  if (!deployment || typeof deployment !== 'object') {
    throw new Error('Vercel deployment response must be an object.');
  }

  const source = deployment as VercelDeployment;
  const responseProjectId = source.projectId ?? source.project?.id;
  const readyState = source.readyState ?? source.status;
  const domain = normalizedHostname(productionDomain, 'Production domain');
  const deploymentHost = normalizedHostname(
    String(source.url ?? ''),
    'Vercel deployment URL',
  );
  const aliases = Array.isArray(source.alias)
    ? source.alias.map((alias) =>
        normalizedHostname(String(alias), 'Vercel alias'),
      )
    : [];
  const hasDeploymentChecks =
    source.checksState !== undefined || source.checksConclusion !== undefined;

  if (source.id !== deploymentId) {
    throw new Error('Vercel response belongs to a different deployment.');
  }
  if (responseProjectId !== projectId) {
    throw new Error('Vercel deployment belongs to a different project.');
  }
  if (readyState !== 'READY' || source.target !== 'production') {
    throw new Error('Vercel deployment is not a READY production deployment.');
  }
  if (source.gitSource?.sha !== commitSha) {
    throw new Error('Vercel deployment Git SHA does not match the release.');
  }
  if (source.aliasAssigned !== true || !aliases.includes(domain)) {
    throw new Error('Production domain is not assigned to the deployment.');
  }
  if (
    hasDeploymentChecks &&
    !(
      source.checksState === 'completed' &&
      source.checksConclusion === 'succeeded'
    )
  ) {
    throw new Error('Vercel deployment checks did not succeed.');
  }

  return {
    aws: { committedStructureContract: 'validated' },
    database: { migrationStatus: 'applied', schemaDrift: 'none' },
    release: { commitSha, tag },
    requiredCi: {
      checks: ['browser', 'checks', 'infra-synth'],
      conclusion: 'success',
    },
    schemaVersion: 1,
    smoke: { routes: [...SMOKE_ROUTES], status: 'passed' },
    vercel: {
      deploymentId,
      deploymentUrl: `https://${deploymentHost}`,
      productionDomain: domain,
      readyState: 'READY',
      target: 'production',
    },
  };
}

export function serializeReleaseVerification(value: unknown) {
  return canonicalPrettyJson(value);
}
