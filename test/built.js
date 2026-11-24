'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const loadBundle = window => {
  const context = {window, crypto: webcrypto, console, URL, URLSearchParams, TextEncoder, TextDecoder, setTimeout, clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/openapisnippet.min.js'), 'utf8'), context);
  return context;
};

const context = loadBundle({});
const api = context.window.OpenAPISnippets;
assert.equal(typeof api.getEndpointSnippets, 'function');
assert.equal(typeof api.getResponseSample, 'function');
assert.equal(api.httpStatusCodes[200], 'OK');
assert.equal(typeof context.window.OpenAPISampler.sample, 'function');
assert.equal(context.window.OpenAPISampler.sample({type: 'integer', minimum: 1, multipleOf: 2}), 2);
const spec = { openapi: '3.0.3', servers: [{ url: 'https://example.com' }], paths: { '/pets': { get: {} } } };
const result = api.getEndpointSnippets(spec, '/pets', 'get', ['shell_curl']);
assert.match(result.snippets[0].content, /https:\/\/example.com\/pets/);
const responseSpec = {openapi: '3.0.3', paths: {'/pets': {get: {responses: {'200': {content: {'application/json': {schema: {type: 'object', properties: {id: {type: 'integer', example: 7}}}}}}}}}}};
assert.equal(JSON.stringify(api.getResponseSample(responseSpec, '/pets', 'get', '200')), '{"id":7}');
const exampleSpec = {
  ...spec,
  paths: {
    '/pets': {
      post: {
        requestBody: {content: {'application/json': {example: {allowed: false}}}},
        responses: {'200': {$ref: '#/components/responses/State'}},
      },
    },
  },
  components: {
    responses: {State: {content: {'application/json': {examples: {empty: {value: ''}}}}}},
  },
};
const exampleRequest = api.getEndpointSnippets(exampleSpec, '/pets', 'post', ['shell_curl']);
assert.match(exampleRequest.snippets[0].content, /content-type: application\/json/i);
assert.match(exampleRequest.snippets[0].content, /"allowed":false/);
assert.equal(api.getResponseSample(exampleSpec, '/pets', 'post', 200), '');
const uploadSpec = {openapi: '3.0.3', servers: [{url: 'https://example.com'}], paths: {'/upload': {post: {requestBody: {content: {'multipart/form-data': {schema: {type: 'object', properties: {name: {type: 'string', example: 'pet'}}}}}}}}}};
const upload = api.getEndpointSnippets(uploadSpec, '/upload', 'post', ['node_native']);
assert.match(upload.snippets[0].content, /multipart\/form-data/);
const nativeContext = loadBundle({FormData});
const nativeUpload = nativeContext.window.OpenAPISnippets.getEndpointSnippets(uploadSpec, '/upload', 'post', ['node_native']);
assert.match(nativeUpload.snippets[0].content, /name=\"name\"/);
console.log('Browser bundle loads and generates snippets through fallback and native FormData paths without Node require.');
