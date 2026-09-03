'use strict';
// Maintainer-only: exercise a relocated package with no repository/global modules.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const plugin = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'singular-plugin-smoke-'));
const isolated = path.join(temporary, 'singular-composer');
const checks = [];
async function main() {
  fs.cpSync(path.join(plugin, 'skills'), path.join(isolated, 'skills'), { recursive: true });
  fs.cpSync(path.join(plugin, 'runtime'), path.join(isolated, 'runtime'), { recursive: true });
  const skill = path.join(isolated, 'skills', 'composer');
  const scripts = path.join(skill, 'scripts');
  const guard = path.join(temporary, 'guard.cjs');
  fs.writeFileSync(guard, `const Module = require('node:module');
const path = require('node:path');
const original = Module._resolveFilename;
Module._resolveFilename = function (...args) {
  const resolved = original.apply(this, args);
  if (path.isAbsolute(resolved) && !resolved.startsWith(${JSON.stringify(isolated + path.sep)})) {
    throw new Error('AMBIENT_MODULE_REJECTED');
  }
  return resolved;
};`);
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  env.COMPOSER_AGENT_CREDENTIALS = path.join(temporary, 'unused-credentials.json');
  function run(file, args, expectedCode = 0) {
    const result = spawnSync(process.execPath, ['--require', guard, path.join(scripts, file), ...args], {
      cwd: temporary, env, encoding: 'utf8', timeout: 45000, windowsHide: true
    });
    assert.equal(result.status, expectedCode, `${file}: exit ${result.status}`);
    assert.ok(!/AMBIENT_MODULE_REJECTED|Cannot find module/.test(result.stdout + result.stderr), file);
    return result;
  }
  const doctor = JSON.parse(run('doctor.js', process.argv.includes('--browser') ? ['--browser'] : []).stdout);
  assert.equal(doctor.authoring, 'ready');
  if (process.argv.includes('--browser')) assert.equal(doctor.browser, 'ready');
  checks.push('relocated-runtime-doctor');
  assert.match(run('composer-agent.js', [], 1).stderr, /Usage:/);
  checks.push('composer-cli-loads-without-ambient-packages');
  assert.match(run('verifyComposition.mjs', ['--frames', '0'], 1).stderr, /frames/i);
  checks.push('esm-verifier-loads-packaged-playwright');

  const { load } = require(path.join(scripts, 'runtime-dependencies.js'));
  assert.equal(load('tinycolor2')('#004aad').isValid(), true);
  assert.match(load('uuid').v4(), /^[0-9a-f-]{36}$/);
  const ws = load('ws');
  const server = new ws.WebSocketServer({ host: '127.0.0.1', port: 0 });
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    server.on('connection', socket => socket.on('message', value => socket.send(value)));
    await new Promise((resolve, reject) => {
      const socket = new ws(`ws://127.0.0.1:${server.address().port}`);
      const timer = setTimeout(() => { socket.terminate(); reject(new Error('LOCAL_WS_TIMEOUT')); }, 5000);
      socket.once('error', reject);
      socket.once('open', () => socket.send('packaged-runtime'));
      socket.once('message', value => {
        try { assert.equal(value.toString(), 'packaged-runtime'); clearTimeout(timer); socket.close(); resolve(); }
        catch (error) { clearTimeout(timer); socket.terminate(); reject(error); }
      });
    });
    checks.push('packaged-color-uuid-websocket-roundtrip');
  } finally {
    for (const socket of server.clients) socket.terminate();
    await new Promise(resolve => server.close(resolve));
  }
  const report = { status: 'passed', platform: process.platform, architecture: process.arch,
    node: process.version, checks, browser: doctor.browser, browserVersion: doctor.browserVersion,
    liveComposer: 'not-tested', otherPlatforms: 'not-tested', checkedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(plugin, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  // Delete only this exact directory created by mkdtemp, checked against the OS temp root.
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith('singular-plugin-smoke-'));
  fs.rmSync(temporary, { recursive: true, force: true });
});
