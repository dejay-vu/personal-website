import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export type DomainLanguageViolation = {
  file: string;
  line: number;
  token: string;
};

const ACTIVE_ROOTS = ['prisma/', 'scripts/', 'src/'];
const IGNORED_PREFIXES = [
  'docs/adr/',
  'docs/superpowers/',
  'node_modules/',
  'src/generated/',
];
const IGNORED_FILES = new Set(['scripts/check-domain-language.ts']);
const ACTIVE_EXTENSION = /\.(?:css|prisma|ts|tsx)$/;
const LEGACY_PATH_SEGMENTS = new Set(['gallery', 'thoughts']);
const LEGACY_STORAGE_PREFIXES = [
  ['content', 'thoughts'].join('/') + '/',
  ['media', 'thoughts'].join('/') + '/',
  ['media', 'gallery'].join('/') + '/',
  ['admin', 'staging'].join('-') + '/',
];
const LEGACY_STORAGE_PATTERN = new RegExp(
  `(?:${LEGACY_STORAGE_PREFIXES.join('|')})`,
);
const LEGACY_LINE_PATTERNS = [
  /\b(?:gallery|thoughts)\b/i,
  /\b(?:Post|posts|postSlug)\b/,
  LEGACY_STORAGE_PATTERN,
];

function isActiveFile(file: string) {
  return (
    ACTIVE_EXTENSION.test(file) &&
    ACTIVE_ROOTS.some((prefix) => file.startsWith(prefix)) &&
    !IGNORED_FILES.has(file) &&
    !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

function findPathViolation(file: string): DomainLanguageViolation | null {
  const token = file
    .split('/')
    .find((segment) => LEGACY_PATH_SEGMENTS.has(segment));

  return token ? { file, line: 1, token } : null;
}

function findContentViolation(
  file: string,
  content: string,
): DomainLanguageViolation | null {
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const pattern of LEGACY_LINE_PATTERNS) {
      const match = line.match(pattern);
      if (match) return { file, line: index + 1, token: match[0] };
    }
  }

  return null;
}

export function findDomainLanguageViolations(
  files: Record<string, string>,
): DomainLanguageViolation[] {
  return Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([file, content]) => {
      if (!isActiveFile(file)) return [];

      const violation =
        findPathViolation(file) ?? findContentViolation(file, content);
      return violation ? [violation] : [];
    });
}

function readTrackedActiveFiles() {
  const paths = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter(isActiveFile)
    .filter(existsSync);

  return Object.fromEntries(
    paths.map((file) => [file, readFileSync(file, 'utf8')]),
  );
}

function main() {
  const violations = findDomainLanguageViolations(readTrackedActiveFiles());

  for (const { file, line, token } of violations) {
    console.error(`${file}:${line}: ${token}`);
  }

  if (violations.length > 0) process.exitCode = 1;
}

if (require.main === module) main();
