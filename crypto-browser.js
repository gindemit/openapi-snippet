'use strict';

const {Buffer} = require('buffer');

const randomBytes = function (size) {
  const bytes = Buffer.alloc(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

module.exports = {randomBytes};
