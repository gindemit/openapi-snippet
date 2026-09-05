'use strict';

const path = require('node:path');
const files = process.argv.slice(2);
for (const file of files.length ? files : ['test/test.js', 'test/regressions.js']) {
  require(path.resolve(file));
}
