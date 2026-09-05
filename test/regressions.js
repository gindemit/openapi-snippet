'use strict';

const test = require('tape');
const har = require('../openapi-to-har');
const snippets = require('../index');

function document(operation = {}, parameters = []) {
  return { openapi: '3.0.3', servers: [{ url: 'https://example.com' }], paths: { '/pets/{id}': { parameters, get: { description: 'Find pets', ...operation } } } };
}
const parameter = (name, location, schema = { type: 'string' }) => ({ name, in: location, schema });

test('HAR defaults and operation discovery skip path metadata', t => {
  const spec = document({}, [parameter('id', 'path')]);
  spec.paths['/pets/{id}'].summary = 'Pets';
  spec.paths['/pets/{id}']['x-extension'] = true;
  spec.paths['/pets/{id}'].servers = [{ url: 'https://path.example.com' }];
  const result = har.getAll(spec);
  t.equal(result.length, 1);
  t.equal(result[0].method, 'GET');
  t.equal(result[0].hars[0].url, 'https://path.example.com/pets/%7Bid%7D');
  t.deepEqual(har.getAll({ paths: {} }), []);
  t.end();
});

test('path substitutions serialize examples, supplied values and repeated placeholders', t => {
  const spec = document({}, [{ ...parameter('id', 'path'), example: 'a b' }]);
  t.equal(har.getEndpoint(spec, '/pets/{id}', 'get')[0].url, 'https://example.com/pets/a%20b');
  t.equal(har.getEndpoint(spec, '/pets/{id}', 'get', { pathParameters: { id: 0 } })[0].url, 'https://example.com/pets/0');
  spec.paths['/pets/{id}/{id}'] = spec.paths['/pets/{id}'];
  t.equal(har.getEndpoint(spec, '/pets/{id}/{id}', 'get', { pathParameters: { id: 'a/b?#' } })[0].url, 'https://example.com/pets/a%2Fb%3F%23/a%2Fb%3F%23');
  t.end();
});

test('query and regular header options preserve falsy overrides and legacy query options', t => {
  const spec = document({}, [parameter('id', 'path'), { ...parameter('count', 'query', { type: 'integer' }), example: 9 }, { ...parameter('X-Enabled', 'header'), example: 'yes' }]);
  t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get', { count: 0 })[0].queryString, [{ name: 'count', value: '0' }]);
  const result = har.getEndpoint(spec, '/pets/{id}', 'get', { queryParameters: { count: false }, headers: { 'X-Enabled': '' } })[0];
  t.deepEqual(result.queryString, [{ name: 'count', value: 'false' }]);
  t.deepEqual(result.headers, [{ name: 'X-Enabled', value: '' }]);
  t.end();
});

test('explicit false explode survives default form serialization', t => {
  for (const location of ['query', 'cookie']) {
    t.deepEqual(har.createHarParameterObjects({ name: 'id', in: location, explode: false }, [1, 2]), [{ name: 'id', value: '1,2' }]);
    t.deepEqual(har.createHarParameterObjects({ name: 'id', in: location, explode: false }, { a: 1, b: 2 }), [{ name: 'id', value: 'a,1,b,2' }]);
  }
  t.deepEqual(har.createHarParameterObjects({ name: 'filter', in: 'query', style: 'deepObject' }, { active: false }), [{ name: 'filter[active]', value: 'false' }]);
  t.throws(() => har.createHarParameterObjects({ name: 'id' }, 1));
  t.end();
});

test('payload overrides replace falsy fields and form text matches serialized fields', t => {
  const schema = { type: 'object', properties: { zero: { type: 'number', example: 0 }, off: { type: 'boolean', example: false }, empty: { type: 'string', example: '' }, ignored: { type: 'string', readOnly: true } } };
  const spec = document({ requestBody: { content: { 'application/json': { schema }, 'application/x-www-form-urlencoded': { schema }, 'multipart/form-data': { schema } } } });
  const result = har.getEndpoint(spec, '/pets/{id}', 'get', { payloads: { zero: 2, off: true, empty: 'a b', unknown: 'no' } });
  t.deepEqual(JSON.parse(result[0].postData.text), { zero: 2, off: true, empty: 'a b' });
  t.equal(result[1].postData.text, 'zero=2&off=true&empty=a+b');
  t.deepEqual(result[2].postData.params, [{ name: 'zero', value: '2' }, { name: 'off', value: 'true' }, { name: 'empty', value: 'a b' }]);
  t.equal(result[0].comment, 'application/json');
  t.match(har.getEndpoint(spec, '/pets/{id}', 'get', {}, undefined, true)[0].postData.text, /\n  "zero"/);
  t.end();
});

test('references decode JSON pointer tokens without mutating schemas or request bodies', t => {
  const spec = document({ requestBody: { $ref: '#/components/requestBodies/a~1b' } }, [{ $ref: '#/components/parameters/q' }]);
  spec.components = { parameters: { q: { name: 'q', in: 'query', schema: { $ref: '#/components/schemas/Q' } } }, schemas: { Q: { type: 'integer', default: 0 } }, requestBodies: { 'a/b': { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } };
  const before = JSON.stringify(spec);
  const result = har.getEndpoint(spec, '/pets/{id}', 'get');
  t.deepEqual(result[0].queryString, [{ name: 'q', value: '0' }]);
  t.deepEqual(JSON.parse(result[0].postData.text), { id: 0 });
  t.equal(JSON.stringify(spec), before);
  t.end();
});

test('Swagger root security and OAS operation security produce independent credentials', t => {
  const swagger = { swagger: '2.0', host: 'example.com', paths: { '/pets': { get: {} } }, securityDefinitions: { key: { type: 'apiKey', name: 'X-Key', in: 'header' } }, security: [{ key: [] }] };
  t.deepEqual(har.getEndpoint(swagger, '/pets', 'get', { headers: { 'X-Key': 'secret' } })[0].headers, [{ name: 'X-Key', value: 'secret' }]);
  const spec = document({ security: [{ bearer: [], key: [] }] });
  spec.components = { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, key: { type: 'apiKey', name: 'X-Key', in: 'header' } } };
  t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get', { headers: { bearer: 'token', 'X-Key': 'secret' } })[0].headers, [{ name: 'Authorization', value: 'Bearer token' }, { name: 'X-Key', value: 'secret' }]);
  spec.security = [{ bearer: [] }];
  spec.paths['/pets/{id}'].get.security = [];
  t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get')[0].headers, []);
  t.end();
});

test('invalid endpoints, references and targets fail visibly', t => {
  t.throws(() => har.getEndpoint(document(), '/missing', 'get'), /endpoint/i);
  t.throws(() => har.getEndpoint(document(), '/pets/{id}', 'post'), /endpoint/i);
  const spec = document({}, [{ $ref: '#/components/parameters/missing' }]);
  t.throws(() => har.getAll(spec), /reference/i);
  t.throws(() => snippets.getEndpointSnippets(document(), '/pets/{id}', 'get', ['invalid']), /Invalid target/);
  t.end();
});

test('snippet output preserves metadata and resource sorting', t => {
  const spec = document({}, [{ ...parameter('id', 'path'), example: 1 }]);
  const result = snippets.getEndpointSnippets(spec, '/pets/{id}', 'get', ['shell_curl']);
  t.equal(result.description, 'Find pets');
  t.equal(result.resource, 'pets');
  t.equal(result.method, 'GET');
  t.equal(result.snippets[0].id, 'shell_curl');
  t.match(result.snippets[0].content, /https:\/\/example.com\/pets\/1/);
  spec.paths['/animals'] = { delete: {}, get: {}, post: {}, options: {}, head: {} };
  t.deepEqual(snippets.getSnippets(spec, ['shell']).map(item => [item.resource, item.method]), [['animals', 'GET'], ['animals', 'POST'], ['animals', 'DELETE'], ['animals', 'OPTIONS'], ['animals', 'HEAD'], ['pets', 'GET']]);
  t.end();
});

test('security credentials cover basic, bearer, oauth and missing definitions', t => {
  for (const [definition, headerName, placeholder, options, supplied] of [
    [{ type: 'basic' }, 'Authorization', 'Basic REPLACE_BASIC_AUTH', { basic: 'secret' }, 'Basic secret'],
    [{ type: 'http', scheme: 'basic' }, 'Authorization', 'Basic REPLACE_BASIC_AUTH', { basic: '' }, 'Basic '],
    [{ type: 'oauth2' }, 'Authorization', 'Bearer REPLACE_BEARER_TOKEN', { bearer: 'secret' }, 'Bearer secret'],
    [{ type: 'http', scheme: 'bearer' }, 'Authorization', 'Bearer REPLACE_BEARER_TOKEN', { bearer: '' }, 'Bearer '],
    [{ type: 'apiKey', in: 'header', name: 'X-Key' }, 'X-Key', 'REPLACE_KEY_VALUE', { 'X-Key': '' }, ''],
  ]) {
    const spec = document({ security: [{ auth: [] }] });
    spec.components = { securitySchemes: { auth: definition } };
    t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get')[0].headers, [{ name: headerName, value: placeholder }]);
    t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get', { headers: options })[0].headers, [{ name: headerName, value: supplied }]);
  }
  t.throws(() => har.getEndpoint(document({ security: [{ missing: [] }] }), '/pets/{id}', 'get'), /Unknown security scheme/);
  t.end();
});

test('base URL overrides, Swagger produces and payload sampling errors are observable', t => {
  const spec = { swagger: '2.0', host: 'example.com', basePath: '/', produces: ['application/json'], paths: { '/pets': { post: { consumes: ['application/xml'], parameters: [{ in: 'body', name: 'body', schema: { type: 'object', properties: { count: { type: 'integer', default: 0 } } } }] } } } };
  const result = har.getEndpoint(spec, '/pets', 'post', { payloads: { count: 3 } }, 'https://override.example.com/', true)[0];
  t.equal(result.url, 'https://override.example.com/pets');
  t.deepEqual(result.headers[0], { name: 'accept', value: 'application/json' });
  t.deepEqual(JSON.parse(result.postData.text), { count: 3 });
  spec.paths['/pets'].post.parameters[0].schema = { $ref: '#/missing' };
  t.throws(() => har.getAll(spec));
  t.end();
});

test('test runner propagates assertion and uncaught exception failures', t => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snippet-runner-'));
  const fixture = path.join(directory, 'probe.js');
  try {
    for (const source of [
      `require(${JSON.stringify(require.resolve('tape'))})('failure probe', t => { t.equal(1, 2); t.end(); });`,
      'throw new Error("failure probe");',
    ]) {
      fs.writeFileSync(fixture, source);
      const result = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), fixture], { encoding: 'utf8' });
      t.equal(result.status, 1);
      t.match(result.stdout + result.stderr, /failure probe/);
    }
  } finally {
    fs.unlinkSync(fixture);
    fs.rmdirSync(directory);
  }
  t.end();
});

test('prototype-named parameters retain examples and explicit values across locations', t => {
  for (const name of ['__proto__', 'constructor', 'toString']) {
    for (const location of ['query', 'header', 'cookie']) {
      const spec = document({}, [{ ...parameter(name, location), example: 'document-value' }]);
      const collection = { query: 'queryString', header: 'headers', cookie: 'cookies' }[location];
      t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get')[0][collection],
        [{ name, value: 'document-value' }], `${location} ${name} uses its declared example`);
      if (location !== 'cookie') {
        const values = JSON.parse(`{"${name}":"provided-value"}`);
        const options = location === 'query' ? { queryParameters: values } : { headers: values };
        t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get', options)[0][collection],
          [{ name, value: 'provided-value' }], `${location} ${name} preserves own override`);
      }
    }
  }
  t.end();
});

test('operation parameters override prototype-named path-level parameters safely', t => {
  const spec = document({ parameters: [{ ...parameter('__proto__', 'query'), example: 'operation' }] },
    [{ ...parameter('__proto__', 'query'), example: 'path' }, { ...parameter('other', 'query'), example: 'retained' }]);
  t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get')[0].queryString,
    [{ name: '__proto__', value: 'operation' }, { name: 'other', value: 'retained' }]);
  t.end();
});

test('prototype-named API keys use placeholders and own overrides', t => {
  for (const name of ['__proto__', 'constructor', 'toString']) {
    const spec = document({ security: [{ auth: [] }] });
    spec.components = { securitySchemes: { auth: { type: 'apiKey', in: 'header', name } } };
    t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get')[0].headers,
      [{ name, value: 'REPLACE_KEY_VALUE' }]);
    const headers = JSON.parse(`{"${name}":"own-key"}`);
    t.deepEqual(har.getEndpoint(spec, '/pets/{id}', 'get', { headers })[0].headers,
      [{ name, value: 'own-key' }]);
    t.equal(Object.getPrototypeOf(headers), Object.prototype, 'caller overrides keep their prototype');
  }
  t.end();
});
