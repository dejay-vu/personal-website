import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

type EdgeRequest = {
  headers: Record<string, { value: string }>;
  method: string;
  querystring: Record<string, { value: string }>;
  uri: string;
};

type EdgeResponse = {
  body?: string;
  headers?: Record<string, { value: string }>;
  querystring?: Record<string, { value: string }>;
  statusCode?: number;
  uri?: string;
};

type EdgeHandler = (event: { request: EdgeRequest }) => EdgeResponse;

const sourcePath = 'infra/cloudfront/url-rewrite-function.js';
const source = readFileSync(sourcePath, 'utf8');
const contract = JSON.parse(
  readFileSync('infra/external-media-contract.json', 'utf8'),
) as {
  viewerRequest: {
    baselineSourceSha256: string;
    robots: {
      cacheControl: string;
      contentType: string;
      getBody: string;
      path: string;
      statusCode: number;
    };
    sourceFile: string;
    targetSourceSha256: string;
  };
};
const context: Record<string, unknown> = {};
vm.runInNewContext(`${source}\nthis.edgeHandler = handler;`, context);
const handler = context.edgeHandler as EdgeHandler;

function request({
  accept = 'image/webp',
  method = 'GET',
  querystring = {},
  uri,
}: {
  accept?: string;
  method?: string;
  querystring?: Record<string, { value: string }>;
  uri: string;
}) {
  return {
    request: {
      headers: { accept: { value: accept } },
      method,
      querystring,
      uri,
    },
  };
}

test('committed edge source matches the approved target hash', () => {
  assert.equal(contract.viewerRequest.sourceFile, sourcePath);
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    contract.viewerRequest.targetSourceSha256,
  );
  assert.equal(
    contract.viewerRequest.baselineSourceSha256,
    'a3d26e2b38b616c6b503a1d5f5db0cef905fe36783710ed33199480dfbc4ca2e',
  );
  assert.match(source, /Copyright Amazon\.com/);
  assert.match(source, /SPDX-License-Identifier: MIT-0/);
});

test('returns crawlable robots content for GET regardless of query string', () => {
  const response = handler(
    request({
      querystring: { ignored: { value: '1' } },
      uri: contract.viewerRequest.robots.path,
    }),
  );

  assert.equal(response.statusCode, contract.viewerRequest.robots.statusCode);
  assert.equal(response.body, contract.viewerRequest.robots.getBody);
  assert.equal(
    response.headers?.['content-type']?.value,
    contract.viewerRequest.robots.contentType,
  );
  assert.equal(
    response.headers?.['cache-control']?.value,
    contract.viewerRequest.robots.cacheControl,
  );
});

test('returns the same robots headers without a body for HEAD', () => {
  const response = handler(
    request({
      method: 'HEAD',
      querystring: { format: { value: 'webp' } },
      uri: contract.viewerRequest.robots.path,
    }),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(Object.hasOwn(response, 'body'), false);
  assert.equal(
    response.headers?.['content-type']?.value,
    'text/plain; charset=utf-8',
  );
});

test('keeps non-GET robots and ordinary paths in the image rewrite flow', () => {
  const robotsPost = handler(request({ method: 'POST', uri: '/robots.txt' }));
  const ordinary = handler(
    request({
      querystring: {
        height: { value: '0' },
        quality: { value: '150' },
        width: { value: '2048px' },
      },
      uri: '/media/photos/example/original.jpg',
    }),
  );

  assert.equal(robotsPost.uri, '/robots.txt/original');
  assert.equal(
    ordinary.uri,
    '/media/photos/example/original.jpg/quality=100,width=2048',
  );
  assert.equal(JSON.stringify(ordinary.querystring), '{}');
});

test('normalizes automatic format from the viewer Accept header', () => {
  const avif = handler(
    request({
      accept: 'image/avif,image/webp,*/*',
      querystring: { format: { value: 'auto' } },
      uri: '/media/photo.jpg',
    }),
  );
  const webp = handler(
    request({
      accept: 'image/webp,*/*',
      querystring: { format: { value: 'auto' } },
      uri: '/media/photo.jpg',
    }),
  );

  assert.equal(avif.uri, '/media/photo.jpg/format=avif');
  assert.equal(webp.uri, '/media/photo.jpg/format=webp');
});
