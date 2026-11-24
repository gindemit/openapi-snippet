'use strict';

const sampler = require('openapi-sampler');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function resolveRef(openApi, ref) {
  if (!ref.startsWith('#/')) throw new Error('Unsupported reference: ' + ref);
  const parts = decodeURIComponent(ref.slice(2)).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let value = openApi;
  for (const part of parts) {
    if (!value || !hasOwn(value, part)) throw new Error('Unresolved reference: ' + ref);
    value = value[part];
  }
  return value;
}

function resolveReference(openApi, object) {
  const seen = new Set();
  while (object && object.$ref) {
    if (seen.has(object.$ref)) throw new Error('Circular reference: ' + object.$ref);
    seen.add(object.$ref);
    object = resolveRef(openApi, object.$ref);
  }
  return object;
}

function getMediaSample(openApi, media, options) {
  if (!media) return undefined;
  if (hasOwn(media, 'example') && media.example !== undefined) return media.example;

  for (const example of Object.values(media.examples || {})) {
    let resolved;
    try {
      resolved = resolveReference(openApi, example);
    } catch (_error) {
      // A locally unavailable example leaves the next named example or schema usable.
      continue;
    }
    if (resolved && hasOwn(resolved, 'value') && resolved.value !== undefined) return resolved.value;
  }

  return media.schema ? sampler.sample(media.schema, options, openApi) : undefined;
}

module.exports = { getMediaSample, resolveRef, resolveReference };
