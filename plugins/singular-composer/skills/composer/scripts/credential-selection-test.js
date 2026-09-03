#!/usr/bin/env node

const assert = require('assert');
const selection = require('./credential-selection');

function credential(pairedAt, token) {
  return {
    server: 'http://localhost:3000',
    socketPath: '/composer-agent/socket',
    accessToken: token,
    pairedAt: pairedAt
  };
}

const olderDefault = { path: 'default', credentials: credential('2026-08-28T00:00:00.000Z', 'old') };
const newerTemporary = { path: 'temporary', credentials: credential('2026-08-29T00:00:00.000Z', 'new') };
assert.strictEqual(
  selection.selectNewestCredentialCandidate([olderDefault, newerTemporary]),
  newerTemporary
);
assert.strictEqual(
  selection.selectNewestCredentialCandidate([newerTemporary, olderDefault]),
  newerTemporary
);
assert.strictEqual(selection.selectNewestCredentialCandidate([
  { path: 'incomplete', credentials: { pairedAt: '2026-08-30T00:00:00.000Z' } },
  olderDefault
]), olderDefault);
assert.strictEqual(selection.selectNewestCredentialCandidate([]), null);
assert.strictEqual(selection.isCompleteCredential(olderDefault.credentials), true);
assert.strictEqual(selection.isCompleteCredential({}), false);

process.stdout.write(JSON.stringify({ status: 'passed', assertions: 6 }) + '\n');
