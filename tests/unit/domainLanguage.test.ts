import assert from 'node:assert/strict';
import test from 'node:test';

import { findDomainLanguageViolations } from '../../scripts/check-domain-language';

test('flags legacy business vocabulary in active source', () => {
  const violations = findDomainLanguageViolations({
    'src/modules/notes/example.ts': 'export type Post = { thoughts: string }',
    'src/app/api/notes/route.ts': 'export async function POST() {}',
  });

  assert.deepEqual(
    violations.map(({ file }) => file),
    ['src/modules/notes/example.ts'],
  );
});
