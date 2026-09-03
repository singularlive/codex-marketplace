'use strict';
const path = require('node:path');
const allowed = new Set(['tinycolor2', 'uuid', 'ws', 'playwright-core']);
function load(name) {
  if (!allowed.has(name)) throw new Error('Unknown packaged dependency');
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('NODE_UNSUPPORTED: Use Node.js 22 or newer.');
  }
  try {
    return require(path.join(__dirname, '..', '..', '..', 'runtime', 'node_modules', name));
  } catch (cause) {
    const error = new Error(`PLUGIN_RUNTIME_INCOMPLETE: Reinstall the complete Singular Composer plugin (${name}).`);
    error.code = 'PLUGIN_RUNTIME_INCOMPLETE';
    throw error;
  }
}
module.exports = { load };
