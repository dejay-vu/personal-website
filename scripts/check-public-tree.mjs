import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED_BASENAMES = new Set([
  '.mcp.json',
  '.cursorrules',
  '.windsurfrules',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'mcp.json',
  'copilot-instructions.md',
  'release-provenance.json',
  'release-verification.json',
  'SKILL.md',
  'skills-lock.json',
]);

const BLOCKED_PREFIXES = [
  'docs/plans-local/',
  'docs/superpowers/',
  'src/generated/prisma/',
];

const BLOCKED_DIRECTORY_NAMES = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.next',
  '.playwright-mcp',
  '.roo',
  '.vercel',
  'blob-report',
  'cdk.out',
  'coverage',
  'domain-backups',
  'migration-manifests',
  'node_modules',
  'playwright-report',
  '.release-evidence',
  'test-results',
]);

const AGENT_NOTE_MARKERS = [
  /For agentic workers/i,
  /Guidance for agents working/i,
  /REQUIRED SUB-SKILL/i,
  /subagent-driven/i,
  /superpowers:/i,
  /^# (?:AGENTS|CLAUDE)\.md/im,
];

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function findBlockedPaths(paths) {
  return paths.filter((path) => {
    const normalized = path.replaceAll('\\', '/');
    const pathBasename = basename(normalized);
    const directorySegments = normalized.split('/').slice(0, -1);
    return (
      BLOCKED_BASENAMES.has(pathBasename) ||
      (pathBasename.startsWith('.env') && normalized !== '.env.example') ||
      /\.(?:bundle|p12|pem|pfx)$/i.test(pathBasename) ||
      directorySegments.some((segment) =>
        BLOCKED_DIRECTORY_NAMES.has(segment),
      ) ||
      BLOCKED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    );
  });
}

export function parsePublicDocsAllowlist(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (
    lines.length === 0 ||
    lines.some((line) => line.trim() !== line || !line)
  ) {
    throw new Error(
      'config/public-docs-allowlist.txt must contain one exact path per non-empty line.',
    );
  }

  const unique = new Set(lines);
  if (unique.size !== lines.length) {
    throw new Error(
      'config/public-docs-allowlist.txt contains duplicate paths.',
    );
  }

  for (const path of lines) {
    if (
      !path.startsWith('docs/') ||
      path.includes('..') ||
      /[*?[\]]/.test(path)
    ) {
      throw new Error(`Invalid public docs allowlist path: ${path}`);
    }
  }

  return [...unique].sort();
}

export function comparePublicDocs(paths, allowedDocs) {
  const actual = paths.filter((path) => path.startsWith('docs/')).sort();
  const expected = [...allowedDocs].sort();
  if (
    actual.length === expected.length &&
    actual.every((path, index) => path === expected[index])
  ) {
    return [];
  }

  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return [
    ...actual
      .filter((path) => !expectedSet.has(path))
      .map((path) => `unexpected: ${path}`),
    ...expected
      .filter((path) => !actualSet.has(path))
      .map((path) => `missing: ${path}`),
  ];
}

export function findAgentNoteMarkers(markdownFiles) {
  const matches = [];
  for (const [path, content] of markdownFiles) {
    if (AGENT_NOTE_MARKERS.some((marker) => marker.test(content))) {
      matches.push(path);
    }
  }
  return matches;
}

function parseTreeArgument(argv) {
  if (argv.length === 0) return null;
  if (argv.length === 2 && argv[0] === '--tree' && argv[1]) return argv[1];
  throw new Error(
    'Usage: node scripts/check-public-tree.mjs [--tree <tree-ish>]',
  );
}

function listPaths(tree) {
  const output = tree
    ? git(['ls-tree', '-rz', '--name-only', tree])
    : git(['ls-files', '-z']);
  return output.split('\0').filter(Boolean);
}

function readBlob(tree, path) {
  return git(['show', tree ? `${tree}:${path}` : `:${path}`]);
}

export function checkPublicTree({ tree = null } = {}) {
  const paths = listPaths(tree);
  const blockedPaths = findBlockedPaths(paths);
  if (blockedPaths.length > 0) {
    throw new Error(
      `Blocked local/Agent material is tracked:\n${blockedPaths.join('\n')}`,
    );
  }

  const allowlist = parsePublicDocsAllowlist(
    readBlob(tree, 'config/public-docs-allowlist.txt'),
  );
  const docsDifference = comparePublicDocs(paths, allowlist);
  if (docsDifference.length > 0) {
    throw new Error(
      `Tracked docs do not match the public allowlist:\n${docsDifference.join('\n')}`,
    );
  }

  const markdownFiles = paths
    .filter((path) => /\.mdx?$/i.test(path))
    .map((path) => [path, readBlob(tree, path)]);
  const noteMarkers = findAgentNoteMarkers(markdownFiles);
  if (noteMarkers.length > 0) {
    throw new Error(
      `Agent-development markers are present in public Markdown:\n${noteMarkers.join('\n')}`,
    );
  }

  return { pathCount: paths.length, tree: tree ?? 'index' };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = checkPublicTree({
      tree: parseTreeArgument(process.argv.slice(2)),
    });
    console.log(
      `Public tree check passed (${result.tree}, ${result.pathCount} tracked paths).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
