'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {}, console, URL, URLSearchParams, TextEncoder, TextDecoder, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/openapisnippet.min.js'), 'utf8'), context);
const api = context.window.OpenAPISnippets;
assert.equal(typeof api.getEndpointSnippets, 'function');
const spec = { openapi: '3.0.3', servers: [{ url: 'https://example.com' }], paths: { '/pets': { get: {} } } };
const result = api.getEndpointSnippets(spec, '/pets', 'get', ['shell_curl']);
assert.match(result.snippets[0].content, /https:\/\/example.com\/pets/);
console.log('Browser bundle loads and generates cURL without Node require.');
