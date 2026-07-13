import assert from 'node:assert/strict';
import test from 'node:test';

import { markdownContentSchema } from '../../src/modules/notes/types';

test('validates Markdown without rewriting its bytes', () => {
  const content = '\r\n# Exact Markdown\r\n';

  assert.equal(markdownContentSchema.parse(content), content);
  assert.throws(() => markdownContentSchema.parse(' \r\n\t'));
});
