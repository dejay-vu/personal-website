import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCloudFrontFunctionOutput } from '../../scripts/media-edge-output';

test('unwraps generated response output from TestFunction', () => {
  assert.deepEqual(
    parseCloudFrontFunctionOutput(
      JSON.stringify({
        response: {
          body: { data: 'User-agent: *\nAllow: /\n', encoding: 'text' },
          statusCode: 200,
        },
      }),
    ),
    {
      body: { data: 'User-agent: *\nAllow: /\n', encoding: 'text' },
      statusCode: 200,
    },
  );
});

test('unwraps rewritten request output from TestFunction', () => {
  assert.deepEqual(
    parseCloudFrontFunctionOutput(
      JSON.stringify({
        request: {
          querystring: {},
          uri: '/media/photo.jpg/format=webp,width=2048',
        },
      }),
    ),
    {
      querystring: {},
      uri: '/media/photo.jpg/format=webp,width=2048',
    },
  );
});

test('accepts a direct object and rejects malformed envelopes', () => {
  assert.deepEqual(parseCloudFrontFunctionOutput('{"statusCode":200}'), {
    statusCode: 200,
  });
  assert.throws(
    () => parseCloudFrontFunctionOutput('not-json'),
    /returned invalid JSON/,
  );
  assert.throws(
    () => parseCloudFrontFunctionOutput('{"response":null}'),
    /response output must be a JSON object/,
  );
});
