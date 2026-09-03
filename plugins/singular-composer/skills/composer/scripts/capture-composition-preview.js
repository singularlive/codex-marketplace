#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');

const ROOT_TARGET_SELECTOR = '.onair-renderer.root-onair';
const PREFERRED_BROWSER = 'chrome';
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_MEASUREMENT_BYTES = 1024 * 1024;
const MAX_MEASUREMENT_ELEMENTS = 500;
const MAX_MEASUREMENT_IMAGES_PER_ELEMENT = 10;
const MAX_IMAGE_DIAGNOSTIC_ENTRIES = MAX_MEASUREMENT_ELEMENTS * MAX_MEASUREMENT_IMAGES_PER_ELEMENT;
const MAX_IMAGE_DIAGNOSTIC_URL_LENGTH = 4096;
const TEMP_DIRECTORY_PREFIX = 'composer-agent-capture-';
const SMART_STABILITY_WINDOW_MS = 350;
const SMART_ACTIVITY_CAP_MS = 3000;
const LIFECYCLE_QUIET_WINDOW_MS = 200;
const SCRIPT_DISCOVERY_WINDOW_MS = 250;
const WORKER_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_START_TIMEOUT_MS = 15000;
const WORKER_DIRECTORY = path.join(
  os.tmpdir(),
  `composer-agent-capture-worker-${crypto.createHash('sha256').update(__dirname).digest('hex').slice(0, 12)}`
);
const WORKER_STATE_PATH = path.join(WORKER_DIRECTORY, 'state.json');
const WORKER_LOCK_PATH = path.join(WORKER_DIRECTORY, 'starting.lock');
const WORKER_VERSION = String(fs.statSync(__filename).mtimeMs);

function createCaptureError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function usage() {
  return [
    'Usage:',
    '  node capture-composition-preview.js <endpoint> <width> <height> <composition-token> <output-path> [--measurements <path.json>] [--wait-mode <smart|timed>] [--delay <seconds>] [--timeout <seconds>] [--timeline <In|Out> --at <seconds>] [--composition-id <id>] [--widget-tile-id <id>] [--json]',
    '',
    'Examples:',
    '  node capture-composition-preview.js http://localhost:3000 1920 1080 <token> ./tmp/preview.png --delay 3',
    '  node capture-composition-preview.js http://localhost:3000 1920 1080 <token> ./tmp/subcomp.png --composition-id <id> --json'
  ].join('\n');
}

function fail(message) {
  throw new Error(`${message}\n\n${usage()}`);
}

function parsePositiveInteger(value, name) {
  if (!/^\d+$/.test(value)) {
    fail(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseSeconds(value, name, allowZero) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    fail(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} number of seconds`);
  }
  return parsed;
}

function normalizeEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch (error) {
    fail('endpoint must be a valid URL using http or https');
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    fail('endpoint must be a valid URL using http or https');
  }
  return endpoint.toString().replace(/\/$/, '');
}

function loadPlaywrightCore() {
  return require('./runtime-dependencies').load('playwright-core');
}

function parseOptions(args) {
  const options = {
    settleMs: 1000,
    waitMode: 'smart',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    compositionId: null,
    widgetTileId: null,
    measurementsPath: null,
    timeline: null,
    atSeconds: null,
    json: false
  };
  const seen = new Set();

  for (let index = 5; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) {
      fail(`${flag} may be provided only once`);
    }
    seen.add(flag);

    if (flag === '--json') {
      options.json = true;
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`${flag} requires a value`);
    }
    index++;

    if (flag === '--wait-mode') {
      if (value !== 'smart' && value !== 'timed') {
        fail('--wait-mode must be "smart" or "timed"');
      }
      options.waitMode = value;
    } else if (flag === '--delay') {
      options.settleMs = parseSeconds(value, 'delay', true) * 1000;
    } else if (flag === '--timeout') {
      options.timeoutMs = parseSeconds(value, 'timeout', false) * 1000;
    } else if (flag === '--composition-id') {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
        fail('composition id must contain only letters, numbers, underscores, and hyphens');
      }
      options.compositionId = value;
    } else if (flag === '--widget-tile-id') {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
        fail('widget tile id must contain only letters, numbers, underscores, and hyphens');
      }
      options.widgetTileId = value;
    } else if (flag === '--measurements') {
      options.measurementsPath = value;
    } else if (flag === '--timeline') {
      if (value !== 'In' && value !== 'Out') {
        fail('--timeline must be "In" or "Out"');
      }
      options.timeline = value;
    } else if (flag === '--at') {
      options.atSeconds = parseSeconds(value, 'at', true);
    } else {
      fail(`unknown option ${flag}`);
    }
  }

  if ((options.timeline === null) !== (options.atSeconds === null)) {
    fail('--timeline and --at must be provided together');
  }
  if (options.timeline !== null && options.waitMode !== 'smart') {
    fail('timeline-position capture requires --wait-mode smart');
  }

  return options;
}

function remainingTime(deadline, code, message) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw createCaptureError(code, message);
  return remaining;
}

async function installReadinessTracking(page) {
  await page.addInitScript(function () {
    const state = {
      readyAt: 0,
      downloadsPending: 0,
      downloadStarts: 0,
      downloadCompletes: 0,
      lastDownloadActivityAt: 0,
      scriptsPending: {},
      scriptEvents: 0,
      scriptErrors: 0,
      lastScriptActivityAt: 0,
      activeTimelines: {},
      timelineEvents: 0,
      lastTimelineActivityAt: 0,
      payloadEvents: 0,
      lastPayloadActivityAt: 0
    };
    window.__composerAgentReadiness = state;
    window.addEventListener('message', function (event) {
      if (!event.data || typeof event.data.event !== 'string') return;
      const name = event.data.event;
      const params = event.data.params || {};
      const now = Date.now();
      if (name === '_singular_composition_ready') {
        state.readyAt = now;
      } else if (name === '_singular_composition_download_start') {
        state.downloadsPending++;
        state.downloadStarts++;
        state.lastDownloadActivityAt = now;
      } else if (name === '_singular_composition_download_complete') {
        state.downloadsPending = Math.max(0, state.downloadsPending - 1);
        state.downloadCompletes++;
        state.lastDownloadActivityAt = now;
      } else if (name === '_singular_composition_script_event') {
        const compId = String(params.compId || 'unknown');
        if (params.type === 'eval') {
          state.scriptsPending[compId] = (state.scriptsPending[compId] || 0) + 1;
        } else if (params.type === 'ok' || params.type === 'error') {
          if (state.scriptsPending[compId] > 1) state.scriptsPending[compId]--;
          else delete state.scriptsPending[compId];
          if (params.type === 'error') state.scriptErrors++;
        }
        state.scriptEvents++;
        state.lastScriptActivityAt = now;
      } else if (name === '_singular_composition_timeline_event') {
        const message = params.message || {};
        const key = `${params.compositionId || 'unknown'}:${message.timeline || 'unknown'}`;
        if (message.event === 'start') state.activeTimelines[key] = true;
        else if (message.event === 'stop' || message.event === 'jump') delete state.activeTimelines[key];
        state.timelineEvents++;
        state.lastTimelineActivityAt = now;
      } else if (name === '_singular_composition_payload_changed') {
        state.payloadEvents++;
        state.lastPayloadActivityAt = now;
      }
    });
  });
}

async function getReadinessFrames(page, frame, selector) {
  const targetFrames = await getTargetFrames(frame, selector);
  const frames = [page.mainFrame()].concat(targetFrames.map(function (entry) {
    return entry.frame;
  }));
  return frames.filter(function (candidate, index) {
    return frames.indexOf(candidate) === index;
  });
}

async function readLifecycleStates(page, frame, selector) {
  const frames = await getReadinessFrames(page, frame, selector);
  const states = await Promise.all(frames.map(function (candidate) {
    return candidate.evaluate(function () {
      return window.__composerAgentReadiness || null;
    }).catch(function () { return null; });
  }));
  return states.filter(Boolean);
}

async function waitForLifecycleReady(page, frame, selector, bootstrapAt, deadline) {
  const message = 'Timed out waiting for preview downloads and script initialization';
  const startedAt = Date.now();
  let lastStates = [];
  while (Date.now() < deadline) {
    lastStates = await readLifecycleStates(page, frame, selector);
    const now = Date.now();
    const pendingDownloads = lastStates.reduce(function (total, state) {
      return total + state.downloadsPending;
    }, 0);
    const pendingScripts = lastStates.reduce(function (total, state) {
      return total + Object.keys(state.scriptsPending || {}).length;
    }, 0);
    const latestReadyAt = lastStates.reduce(function (latest, state) {
      return Math.max(latest, state.readyAt || 0);
    }, bootstrapAt);
    const latestActivityAt = lastStates.reduce(function (latest, state) {
      return Math.max(
        latest,
        state.lastDownloadActivityAt || 0,
        state.lastScriptActivityAt || 0,
        state.lastPayloadActivityAt || 0
      );
    }, latestReadyAt);
    if (
      pendingDownloads === 0 &&
      pendingScripts === 0 &&
      now - latestReadyAt >= SCRIPT_DISCOVERY_WINDOW_MS &&
      now - latestActivityAt >= LIFECYCLE_QUIET_WINDOW_MS
    ) {
      return {
        frameCount: lastStates.length,
        downloadStarts: lastStates.reduce(function (total, state) {
          return total + state.downloadStarts;
        }, 0),
        downloadCompletes: lastStates.reduce(function (total, state) {
          return total + state.downloadCompletes;
        }, 0),
        scriptEvents: lastStates.reduce(function (total, state) {
          return total + state.scriptEvents;
        }, 0),
        scriptErrors: lastStates.reduce(function (total, state) {
          return total + state.scriptErrors;
        }, 0),
        payloadEvents: lastStates.reduce(function (total, state) {
          return total + state.payloadEvents;
        }, 0),
        waitMs: now - startedAt,
        quietMs: now - latestActivityAt
      };
    }
    await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  const pendingDownloads = lastStates.reduce(function (total, state) {
    return total + state.downloadsPending;
  }, 0);
  const pendingScripts = lastStates.reduce(function (total, state) {
    return total + Object.keys(state.scriptsPending || {}).length;
  }, 0);
  throw createCaptureError(
    'PREVIEW_READY_TIMEOUT',
    `${message} (pending downloads: ${pendingDownloads}, pending scripts: ${pendingScripts})`
  );
}

function waitForPreviewBootstrap(page, readyPromise, framePromise, deadline) {
  const message = 'Timed out waiting for the composition preview to become ready';
  const timeoutMs = remainingTime(deadline, 'PREVIEW_READY_TIMEOUT', message);
  return Promise.race([
    readyPromise.then(function () { return 'console'; }),
    framePromise.then(function () { return 'frame'; }),
    page.waitForTimeout(timeoutMs).then(function () {
      throw createCaptureError('PREVIEW_READY_TIMEOUT', message);
    })
  ]);
}

async function waitForPlayerFrame(page, deadline) {
  const player = page.locator('#SingularPlayer');
  try {
    await player.waitFor({
      state: 'attached',
      timeout: remainingTime(
        deadline,
        'PREVIEW_FRAME_NOT_FOUND',
        'The SingularPlayer preview frame was not found'
      )
    });
  } catch (error) {
    if (error && error.code) throw error;
    throw createCaptureError('PREVIEW_FRAME_NOT_FOUND', 'The SingularPlayer preview frame was not found');
  }

  while (Date.now() < deadline) {
    const handle = await player.elementHandle().catch(function () { return null; });
    const elementFrame = handle && await handle.contentFrame().catch(function () { return null; });
    const frame = elementFrame || page.frames().find(function (candidateFrame) {
      try {
        return candidateFrame.parentFrame() === page.mainFrame() &&
          new URL(candidateFrame.url()).pathname === '/singularplayer/output';
      } catch (error) {
        return false;
      }
    }) || page.frames().find(function (candidateFrame) {
      return candidateFrame.parentFrame() === page.mainFrame();
    });
    if (frame) return frame;
    await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  throw createCaptureError('PREVIEW_FRAME_NOT_FOUND', 'The SingularPlayer preview frame is unavailable');
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

function readWorkerState() {
  try {
    return JSON.parse(fs.readFileSync(WORKER_STATE_PATH, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeWorkerState(state) {
  fs.mkdirSync(WORKER_DIRECTORY, { recursive: true, mode: 0o700 });
  const temporaryPath = `${WORKER_STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temporaryPath, WORKER_STATE_PATH);
}

function removeWorkerFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function requestWorker(state, route, body) {
  return new Promise(function (resolve, reject) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const requestTimeoutMs = route === '/capture'
      ? Math.max(WORKER_START_TIMEOUT_MS, Number(body && body.timeoutMs) + 5000 || 0)
      : WORKER_START_TIMEOUT_MS;
    const request = http.request({
      host: '127.0.0.1',
      port: state.port,
      path: route,
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${state.secret}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: requestTimeoutMs
    }, function (response) {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) {
        responseBody += chunk;
        if (responseBody.length > 64 * 1024) request.destroy();
      });
      response.on('end', function () {
        let parsed;
        try {
          parsed = JSON.parse(responseBody);
        } catch (error) {
          reject(createCaptureError('CAPTURE_FAILED', 'Standalone capture worker returned an invalid response'));
          return;
        }
        if (response.statusCode !== 200 || !parsed.ok) {
          reject(createCaptureError(
            parsed.code || 'CAPTURE_FAILED',
            parsed.message || 'Standalone capture worker failed'
          ));
          return;
        }
        resolve(parsed.result);
      });
    });
    request.on('timeout', function () { request.destroy(); });
    request.on('error', reject);
    request.end(payload);
  });
}

async function stopStaleWorker(state) {
  if (!state || !processAlive(state.pid)) return;
  try {
    await requestWorker(state, '/stop');
    const deadline = Date.now() + 5000;
    while (processAlive(state.pid) && Date.now() < deadline) {
      await new Promise(function (resolve) { setTimeout(resolve, 50); });
    }
    if (processAlive(state.pid)) {
      throw createCaptureError('CAPTURE_FAILED', 'The previous standalone capture worker did not stop');
    }
  } catch (error) {
    if (error && error.code) throw error;
    if (processAlive(state.pid)) {
      throw createCaptureError('CAPTURE_FAILED', 'The previous standalone capture worker is not reachable');
    }
  }
}

async function getWorkerState() {
  let state = readWorkerState();
  if (state && state.version === WORKER_VERSION && processAlive(state.pid)) {
    try {
      await requestWorker(state, '/status');
      return state;
    } catch (error) {
      state = null;
    }
  }

  const staleState = readWorkerState();
  if (staleState && processAlive(staleState.pid)) {
    await stopStaleWorker(staleState);
  }

  fs.mkdirSync(WORKER_DIRECTORY, { recursive: true, mode: 0o700 });
  let lock;
  try {
    lock = fs.openSync(WORKER_LOCK_PATH, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  if (lock !== undefined) {
    const secret = crypto.randomBytes(32).toString('hex');
    try {
      const child = spawn(process.execPath, [__filename, '--capture-worker'], {
        detached: true,
        stdio: 'ignore',
        env: Object.assign({}, process.env, { COMPOSER_AGENT_CAPTURE_WORKER_SECRET: secret })
      });
      child.unref();
    } finally {
      fs.closeSync(lock);
    }
  }

  const deadline = Date.now() + WORKER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    state = readWorkerState();
    if (state && state.version === WORKER_VERSION && processAlive(state.pid)) {
      try {
        await requestWorker(state, '/status');
        removeWorkerFile(WORKER_LOCK_PATH);
        return state;
      } catch (error) {
        // The state file is written immediately before the server begins
        // accepting requests, so allow a short connection race.
      }
    }
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
  }
  removeWorkerFile(WORKER_LOCK_PATH);
  throw createCaptureError(
    'BROWSER_LAUNCH_FAILED',
    'Unable to start the reusable Chrome worker for standalone capture.'
  );
}

async function waitForTarget(frame, selector, deadline) {
  const target = frame.locator(selector);
  try {
    await target.waitFor({
      state: 'attached',
      timeout: remainingTime(
        deadline,
        'PREVIEW_TARGET_NOT_FOUND',
        'The requested preview renderer was not found'
      )
    });
  } catch (error) {
    if (error && error.code) throw error;
    throw createCaptureError('PREVIEW_TARGET_NOT_FOUND', 'The requested preview renderer was not found');
  }
  try {
    await target.waitFor({
      state: 'visible',
      timeout: remainingTime(
        deadline,
        'PREVIEW_TARGET_NOT_VISIBLE',
        'The requested preview renderer is not visible'
      )
    });
  } catch (error) {
    if (error && error.code) throw error;
    throw createCaptureError('PREVIEW_TARGET_NOT_VISIBLE', 'The requested preview renderer is not visible');
  }
  return target;
}

async function waitForWidgetTarget(page, widgetTileId, compositionId, deadline) {
  const baseSelector = `.onair-renderer.composition-instance[data-composition-id="${compositionId}"]`;
  while (Date.now() < deadline) {
    const candidateFrames = page.frames().filter(function (candidateFrame) {
      const frameName = candidateFrame.name();
      return frameName === widgetTileId || frameName.startsWith(`${widgetTileId}_`);
    });
    for (const candidateFrame of candidateFrames) {
      const instanceId = await candidateFrame.evaluate(function (selector) {
        const candidates = Array.prototype.slice.call(document.querySelectorAll(selector));
        let best = null;
        let bestScore = -1;
        candidates.forEach(function (candidate) {
          const candidateBounds = candidate.getBoundingClientRect();
          if (candidateBounds.width <= 0 || candidateBounds.height <= 0) return;
          const nodes = [candidate].concat(Array.prototype.slice.call(
            candidate.querySelectorAll('[id^="onair"]')
          ));
          const score = nodes.reduce(function (total, node) {
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return total;
            const bounds = node.getBoundingClientRect();
            const opacity = Number.parseFloat(style.opacity);
            if (bounds.width <= 0 || bounds.height <= 0 || opacity <= 0) return total;
            return total + bounds.width * bounds.height * (Number.isFinite(opacity) ? opacity : 1);
          }, 0);
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        });
        return best && best.getAttribute('data-composition-instance-id');
      }, baseSelector).catch(function () { return null; });
      if (instanceId && /^[A-Za-z0-9_-]{1,200}$/.test(instanceId)) {
        const selector = `${baseSelector}[data-composition-instance-id="${instanceId}"]`;
        return {
          frame: candidateFrame,
          selector: selector,
          locator: await waitForTarget(candidateFrame, selector, deadline)
        };
      }
    }
    await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  throw createCaptureError(
    'PREVIEW_TARGET_NOT_FOUND',
    'The widget sub-composition preview renderer was not found'
  );
}

async function getTargetFrames(frame, selector) {
  const targetFrames = [{ frame: frame, selector: selector }];
  const collectDescendants = function (parentFrame) {
    parentFrame.childFrames().forEach(function (childFrame) {
      targetFrames.push({ frame: childFrame, selector: null });
      collectDescendants(childFrame);
    });
  };
  for (const childFrame of frame.childFrames()) {
    let frameElement;
    let belongsToTarget = false;
    try {
      frameElement = await childFrame.frameElement();
      belongsToTarget = await frameElement.evaluate(function (element, targetSelector) {
        const target = document.querySelector(targetSelector);
        return !!target && target.contains(element);
      }, selector);
    } catch (error) {
      belongsToTarget = false;
    } finally {
      if (frameElement) await frameElement.dispose().catch(function () {});
    }
    if (!belongsToTarget) continue;
    targetFrames.push({ frame: childFrame, selector: null });
    collectDescendants(childFrame);
  }
  return targetFrames;
}

async function waitForFrameResources(frame, selector, deadline, resource) {
  const message = `Timed out waiting for preview ${resource}`;
  while (Date.now() < deadline) {
    const targetFrames = await getTargetFrames(frame, selector);
    const ready = await Promise.all(targetFrames.map(function (targetFrame) {
      return targetFrame.frame.evaluate(async function (options) {
        const scope = options.selector ? document.querySelector(options.selector) : document;
        if (!scope) return false;
        if (options.resource === 'fonts') {
          return typeof document.fonts === 'undefined' || document.fonts.status === 'loaded';
        }
        const scopedElements = Array.prototype.slice.call(scope.querySelectorAll('*'));
        if (scope.nodeType === 1) scopedElements.unshift(scope);
        const images = scopedElements.filter(function (element) {
          return element.tagName === 'IMG';
        });
        if (!window.__composerAgentImageDiagnostics) {
          window.__composerAgentImageDiagnostics = new WeakMap();
        }
        const imageDiagnostics = window.__composerAgentImageDiagnostics;
        images.forEach(function (image) {
          if (!image.complete) return;
          const source = image.currentSrc || image.getAttribute('src') || '';
          if (!source) {
            imageDiagnostics.set(image, 'missing-source');
          } else if (image.naturalWidth <= 0) {
            imageDiagnostics.set(image, 'zero-intrinsic-size');
          } else {
            imageDiagnostics.delete(image);
          }
        });
        if (!images.every(function (image) { return image.complete; })) return false;
        const decoded = await Promise.all(images.map(function (image) {
          if (!image.complete || image.naturalWidth <= 0 || typeof image.decode !== 'function') return true;
          return Promise.race([
            image.decode().then(function () {
              imageDiagnostics.delete(image);
              return true;
            }).catch(function () {
              imageDiagnostics.set(image, 'decode-error');
              return true;
            }),
            new Promise(function (resolve) { setTimeout(function () { resolve(false); }, 250); })
          ]);
        }));
        if (!decoded.every(Boolean)) return false;

        if (!window.__composerAgentBackgroundAssets) {
          window.__composerAgentBackgroundAssets = {};
        }
        const urls = {};
        scopedElements.forEach(function (element) {
          const background = window.getComputedStyle(element).backgroundImage || '';
          const expression = /url\(["']?([^"')]+)["']?\)/g;
          let match;
          while ((match = expression.exec(background))) {
            if (match[1] && !match[1].startsWith('data:')) urls[match[1]] = true;
          }
        });
        Object.keys(urls).forEach(function (url) {
          if (window.__composerAgentBackgroundAssets[url]) return;
          const status = { complete: false };
          window.__composerAgentBackgroundAssets[url] = status;
          const image = new Image();
          status.image = image;
          image.onload = image.onerror = function () { status.complete = true; };
          image.src = url;
        });
        return Object.keys(urls).every(function (url) {
          return window.__composerAgentBackgroundAssets[url].complete;
        });
      }, { selector: targetFrame.selector, resource: resource }).catch(function () { return false; });
    }));
    if (ready.every(Boolean)) return;
    await frame.page().waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  throw createCaptureError('PREVIEW_ASSET_TIMEOUT', message);
}

function waitForFonts(frame, selector, deadline) {
  return waitForFrameResources(frame, selector, deadline, 'fonts');
}

function waitForImages(frame, selector, deadline) {
  return waitForFrameResources(frame, selector, deadline, 'images');
}

async function sampleTarget(frame, selector) {
  const sample = await frame.evaluate(function (targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return null;
    const bounds = target.getBoundingClientRect();
    const images = Array.prototype.slice.call(target.querySelectorAll('img'));
    let visualHash = 2166136261;
    const hashValue = function (value) {
      const text = String(value || '');
      for (let index = 0; index < text.length; index++) {
        visualHash ^= text.charCodeAt(index);
        visualHash = Math.imul(visualHash, 16777619);
      }
    };
    [target].concat(Array.prototype.slice.call(target.querySelectorAll('*'))).forEach(function (element) {
      const style = window.getComputedStyle(element);
      const elementBounds = element.getBoundingClientRect();
      hashValue([
        element.tagName,
        element.getAttribute('class') || '',
        element.getAttribute('style') || '',
        element.getAttribute('src') || '',
        element.getAttribute('href') || '',
        element.getAttribute('d') || '',
        element.getAttribute('points') || '',
        element.getAttribute('fill') || '',
        element.getAttribute('stroke') || '',
        element.value || '',
        style.display,
        style.visibility,
        style.opacity,
        style.transform,
        style.backgroundImage,
        style.color,
        style.fontFamily,
        style.fontSize,
        Math.round(elementBounds.left * 10),
        Math.round(elementBounds.top * 10),
        Math.round(elementBounds.width * 10),
        Math.round(elementBounds.height * 10)
      ].join('|'));
    });
    hashValue(target.textContent || '');
    return {
      bounds: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      },
      descendantCount: target.querySelectorAll('*').length,
      textLength: (target.textContent || '').length,
      visualHash: visualHash >>> 0,
      canvasCount: target.querySelectorAll('canvas').length,
      loadedImages: images.filter(function (image) {
        return image.complete && image.naturalWidth > 0;
      }).length,
      failedImages: images.filter(function (image) {
        return image.complete && image.naturalWidth <= 0;
      }).length,
      pendingImages: images.filter(function (image) { return !image.complete; }).length
    };
  }, selector);
  if (!sample) return null;

  const targetFrames = await getTargetFrames(frame, selector);
  const nestedSamples = await Promise.all(targetFrames.slice(1).map(function (targetFrame) {
    return targetFrame.frame.evaluate(function () {
      const images = Array.prototype.slice.call(document.querySelectorAll('img'));
      let visualHash = 2166136261;
      const hashValue = function (value) {
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
          visualHash ^= text.charCodeAt(index);
          visualHash = Math.imul(visualHash, 16777619);
        }
      };
      Array.prototype.forEach.call(document.querySelectorAll('*'), function (element) {
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const value = [
          element.tagName,
          element.getAttribute('class') || '',
          element.getAttribute('style') || '',
          element.getAttribute('src') || '',
          element.getAttribute('href') || '',
          element.getAttribute('d') || '',
          element.getAttribute('points') || '',
          element.getAttribute('fill') || '',
          element.getAttribute('stroke') || '',
          element.value || '',
          style.display,
          style.visibility,
          style.opacity,
          style.transform,
          style.backgroundImage,
          style.color,
          style.fontFamily,
          style.fontSize,
          Math.round(bounds.left * 10),
          Math.round(bounds.top * 10),
          Math.round(bounds.width * 10),
          Math.round(bounds.height * 10)
        ].join('|');
        hashValue(value);
      });
      hashValue((document.body && document.body.textContent) || '');
      return {
        descendantCount: document.querySelectorAll('*').length,
        textLength: ((document.body && document.body.textContent) || '').length,
        fontsReady: typeof document.fonts === 'undefined' || document.fonts.status === 'loaded',
        canvasCount: document.querySelectorAll('canvas').length,
        loadedImages: images.filter(function (image) {
          return image.complete && image.naturalWidth > 0;
        }).length,
        failedImages: images.filter(function (image) {
          return image.complete && image.naturalWidth <= 0;
        }).length,
        pendingImages: images.filter(function (image) { return !image.complete; }).length,
        visualHash: visualHash >>> 0
      };
    }).catch(function () { return null; });
  }));
  const attachedNestedSamples = nestedSamples.filter(Boolean);
  sample.nestedFrameCount = attachedNestedSamples.length;
  sample.nestedDescendantCount = attachedNestedSamples.reduce(function (count, nestedSample) {
    return count + nestedSample.descendantCount;
  }, 0);
  sample.nestedTextLength = attachedNestedSamples.reduce(function (count, nestedSample) {
    return count + nestedSample.textLength;
  }, 0);
  sample.loadingFontFrames = attachedNestedSamples.filter(function (nestedSample) {
    return !nestedSample.fontsReady;
  }).length;
  sample.loadedImages += attachedNestedSamples.reduce(function (count, nestedSample) {
    return count + nestedSample.loadedImages;
  }, 0);
  sample.failedImages += attachedNestedSamples.reduce(function (count, nestedSample) {
    return count + nestedSample.failedImages;
  }, 0);
  sample.pendingImages += attachedNestedSamples.reduce(function (count, nestedSample) {
    return count + nestedSample.pendingImages;
  }, 0);
  sample.nestedVisualHashes = attachedNestedSamples.map(function (nestedSample) {
    return nestedSample.visualHash;
  });
  sample.canvasCount += attachedNestedSamples.reduce(function (count, nestedSample) {
    return count + nestedSample.canvasCount;
  }, 0);
  return sample;
}

async function collectMeasurementSnapshot(frame, selector, options) {
  const snapshot = await frame.evaluate(function (request) {
    const target = document.querySelector(request.selector);
    if (!target) return null;

    const round = function (value) {
      if (!Number.isFinite(value)) return null;
      return Math.round(value * 1000) / 1000;
    };
    const targetBounds = target.getBoundingClientRect();
    const requestImageDiagnostics = Object.create(null);
    (request.imageDiagnostics || []).forEach(function (diagnostic) {
      if (!diagnostic || !diagnostic.url) return;
      requestImageDiagnostics[diagnostic.url] = diagnostic;
    });
    const intersect = function (left, top, right, bottom, bounds) {
      return {
        left: Math.max(left, bounds.left),
        top: Math.max(top, bounds.top),
        right: Math.min(right, bounds.right),
        bottom: Math.min(bottom, bounds.bottom)
      };
    };
    const relativeRect = function (bounds) {
      return {
        left: round(bounds.left - targetBounds.left),
        top: round(bounds.top - targetBounds.top),
        width: round(Math.max(0, bounds.width)),
        height: round(Math.max(0, bounds.height))
      };
    };
    const percentRect = function (bounds) {
      return {
        left: round((bounds.left - targetBounds.left) * 100 / targetBounds.width),
        top: round((bounds.top - targetBounds.top) * 100 / targetBounds.height),
        width: round(bounds.width * 100 / targetBounds.width),
        height: round(bounds.height * 100 / targetBounds.height)
      };
    };
    const relativePercentRect = function (bounds) {
      if (!bounds) return null;
      return {
        left: round(bounds.left * 100 / targetBounds.width),
        top: round(bounds.top * 100 / targetBounds.height),
        width: round(bounds.width * 100 / targetBounds.width),
        height: round(bounds.height * 100 / targetBounds.height)
      };
    };
    const unionRects = function (rects) {
      if (!rects.length) return null;
      let left = rects[0].left;
      let top = rects[0].top;
      let right = rects[0].left + rects[0].width;
      let bottom = rects[0].top + rects[0].height;
      rects.slice(1).forEach(function (rect) {
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.left + rect.width);
        bottom = Math.max(bottom, rect.top + rect.height);
      });
      return {
        left: round(left),
        top: round(top),
        width: round(Math.max(0, right - left)),
        height: round(Math.max(0, bottom - top))
      };
    };
    const visibleRect = function (element, bounds) {
      let clipped = intersect(
        targetBounds.left,
        targetBounds.top,
        targetBounds.right,
        targetBounds.bottom,
        bounds
      );
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== target) {
        const style = window.getComputedStyle(ancestor);
        const clipsX = ['hidden', 'clip', 'scroll', 'auto'].indexOf(style.overflowX) !== -1;
        const clipsY = ['hidden', 'clip', 'scroll', 'auto'].indexOf(style.overflowY) !== -1;
        if (clipsX || clipsY) {
          const ancestorBounds = ancestor.getBoundingClientRect();
          if (clipsX) {
            clipped.left = Math.max(clipped.left, ancestorBounds.left);
            clipped.right = Math.min(clipped.right, ancestorBounds.right);
          }
          if (clipsY) {
            clipped.top = Math.max(clipped.top, ancestorBounds.top);
            clipped.bottom = Math.min(clipped.bottom, ancestorBounds.bottom);
          }
        }
        ancestor = ancestor.parentElement;
      }
      return {
        left: clipped.left,
        top: clipped.top,
        width: Math.max(0, clipped.right - clipped.left),
        height: Math.max(0, clipped.bottom - clipped.top)
      };
    };
    const readQuad = function (element) {
      if (typeof element.getBoxQuads !== 'function') return null;
      const quads = element.getBoxQuads();
      if (!quads || !quads.length) return null;
      const quad = quads[0];
      return [quad.p1, quad.p2, quad.p3, quad.p4].map(function (point) {
        return {
          x: round(point.x - targetBounds.left),
          y: round(point.y - targetBounds.top)
        };
      });
    };
    const readTextMetrics = function (element, type) {
      if (type !== 'widget') return null;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const linePositions = {};
      let textLength = 0;
      let node = walker.nextNode();
      while (node) {
        const text = (node.nodeValue || '').trim();
        if (text) {
          textLength += text.length;
          const range = document.createRange();
          range.selectNodeContents(node);
          Array.prototype.forEach.call(range.getClientRects(), function (rect) {
            if (rect.width <= 0 || rect.height <= 0) return;
            const key = `${Math.round((rect.top - targetBounds.top) * 2) / 2}`;
            linePositions[key] = true;
          });
          if (typeof range.detach === 'function') range.detach();
        }
        node = walker.nextNode();
      }
      return {
        textLength: textLength,
        lineCount: Object.keys(linePositions).length
      };
    };
    const readImages = function (element) {
      const images = Array.prototype.slice.call(element.querySelectorAll('img'));
      return {
        count: images.length,
        truncated: images.length > request.maxImagesPerElement,
        items: images.slice(0, request.maxImagesPerElement).map(function (image) {
          const bounds = image.getBoundingClientRect();
          const style = window.getComputedStyle(image);
          const source = image.currentSrc || image.src || '';
          const requestDiagnostic = source && requestImageDiagnostics[source] || null;
          const localDiagnostics = window.__composerAgentImageDiagnostics;
          const localFailureReason = localDiagnostics && localDiagnostics.get(image) || null;
          const status = !image.complete
            ? 'pending'
            : image.naturalWidth > 0
              ? 'loaded'
              : 'failed';
          let failureReason = null;
          if (status === 'failed') {
            failureReason = requestDiagnostic && requestDiagnostic.failureReason ||
              localFailureReason ||
              (!source ? 'missing-source' : 'zero-intrinsic-size');
          }
          return {
            bounds: relativeRect(bounds),
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            complete: image.complete,
            objectFit: style.objectFit || null,
            status: status,
            failureReason: failureReason,
            httpStatus: requestDiagnostic && requestDiagnostic.httpStatus || null
          };
        })
      };
    };
    const boundedLabel = function (value) {
      if (!value) return null;
      return String(value).slice(0, 200);
    };

    const allElements = Array.prototype.slice.call(
      target.querySelectorAll('[data-singular-type][id^="onair"]')
    );
    const elements = allElements.slice(0, request.maxElements).map(function (element) {
      const bounds = element.getBoundingClientRect();
      const clippedBounds = visibleRect(element, bounds);
      const style = window.getComputedStyle(element);
      const renderer = element.closest('.onair-renderer[data-composition-id]');
      const type = element.getAttribute('data-singular-type') || null;
      const opacity = Number.parseFloat(style.opacity);
      let effectiveOpacity = 1;
      let effectiveVisible = true;
      let visibilityNode = element;
      while (visibilityNode && visibilityNode !== target.parentElement) {
        const visibilityStyle = window.getComputedStyle(visibilityNode);
        const visibilityOpacity = Number.parseFloat(visibilityStyle.opacity);
        if (visibilityStyle.display === 'none' || visibilityStyle.visibility === 'hidden') {
          effectiveVisible = false;
        }
        if (Number.isFinite(visibilityOpacity)) effectiveOpacity *= visibilityOpacity;
        if (visibilityNode === target) break;
        visibilityNode = visibilityNode.parentElement;
      }
      const visible = effectiveVisible && effectiveOpacity > 0 &&
        bounds.width > 0 && bounds.height > 0 && clippedBounds.width > 0 && clippedBounds.height > 0;
      return {
        id: element.getAttribute('id').slice('onair'.length),
        name: boundedLabel(element.getAttribute('data-singular-name')),
        type: type,
        compositionId: renderer && renderer.getAttribute('data-composition-id') || null,
        compositionInstanceId: renderer && renderer.getAttribute('data-composition-instance-id') || null,
        bounds: relativeRect(bounds),
        boundsPercent: percentRect(bounds),
        visibleBounds: relativeRect(clippedBounds),
        clipped: clippedBounds.width + 0.5 < bounds.width || clippedBounds.height + 0.5 < bounds.height,
        visible: visible,
        opacity: Number.isFinite(opacity) ? round(opacity) : null,
        effectiveOpacity: round(effectiveOpacity),
        transform: style.transform === 'none' ? null : style.transform,
        zIndex: style.zIndex === 'auto' ? null : style.zIndex,
        quad: readQuad(element),
        text: readTextMetrics(element, type),
        images: type === 'widget' ? readImages(element) : null,
        svgCount: type === 'widget' ? element.querySelectorAll('svg').length : null,
        canvasCount: type === 'widget' ? element.querySelectorAll('canvas').length : null
      };
    });
    const visibleContentRects = elements.filter(function (element) {
      return element.visible && element.type !== 'group' &&
        element.visibleBounds && element.visibleBounds.width > 0 && element.visibleBounds.height > 0;
    }).map(function (element) { return element.visibleBounds; });
    const contentBounds = unionRects(visibleContentRects);
    const imageItems = [];
    let totalImageCount = 0;
    let imageStatusTruncated = allElements.length > request.maxElements;
    elements.forEach(function (element) {
      if (!element.images) return;
      totalImageCount += element.images.count;
      imageStatusTruncated = imageStatusTruncated || element.images.truncated;
      Array.prototype.push.apply(imageItems, element.images.items);
    });

    return {
      schemaVersion: 1,
      coordinateSpace: 'capture-target',
      sampling: request.sampling,
      waitMode: request.waitMode,
      timeline: request.timeline,
      target: {
        kind: request.target,
        compositionId: target.getAttribute('data-composition-id') || request.compositionId,
        compositionInstanceId: target.getAttribute('data-composition-instance-id') || null,
        widgetTileId: request.widgetTileId,
        width: round(targetBounds.width),
        height: round(targetBounds.height)
      },
      elements: elements,
      summary: {
        elementCount: elements.length,
        totalElementCount: allElements.length,
        truncated: allElements.length > request.maxElements,
        maxElements: request.maxElements,
        visibleElementCount: elements.filter(function (element) { return element.visible; }).length,
        clippedElementCount: elements.filter(function (element) { return element.clipped; }).length,
        contentBounds: contentBounds,
        contentBoundsPercent: relativePercentRect(contentBounds),
        contentBoundsTruncated: allElements.length > request.maxElements,
        imageStatus: {
          total: totalImageCount,
          measured: imageItems.length,
          loaded: imageItems.filter(function (image) { return image.status === 'loaded'; }).length,
          failed: imageItems.filter(function (image) { return image.status === 'failed'; }).length,
          pending: imageItems.filter(function (image) { return image.status === 'pending'; }).length,
          truncated: imageStatusTruncated
        }
      }
    };
  }, {
    selector: selector,
    target: options.target,
    compositionId: options.compositionId,
    widgetTileId: options.widgetTileId,
    sampling: options.waitMode === 'smart'
      ? 'stable-state-immediately-before-screenshot'
      : 'timed-state-immediately-before-screenshot',
    waitMode: options.waitMode,
    timeline: options.timeline,
    imageDiagnostics: options.imageDiagnostics || [],
    maxElements: MAX_MEASUREMENT_ELEMENTS,
    maxImagesPerElement: MAX_MEASUREMENT_IMAGES_PER_ELEMENT
  });
  if (!snapshot) {
    throw createCaptureError('PREVIEW_TARGET_NOT_FOUND', 'The requested preview renderer was removed before measurement');
  }
  return snapshot;
}

function serializeMeasurementSnapshot(snapshot) {
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MEASUREMENT_BYTES) {
    throw createCaptureError(
      'MEASUREMENT_TOO_LARGE',
      'Player measurement snapshot exceeds the 1 MB limit'
    );
  }
  return serialized;
}

function prepareMeasurementOutput(outputPath) {
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } catch (error) {
    throw createCaptureError('MEASUREMENT_WRITE_FAILED', 'Unable to prepare the Player measurement output path');
  }
}

function saveMeasurementSnapshot(serialized, outputPath) {
  try {
    fs.writeFileSync(outputPath, serialized, 'utf8');
  } catch (error) {
    throw createCaptureError('MEASUREMENT_WRITE_FAILED', 'Unable to save the Player measurement snapshot');
  }
  return Buffer.byteLength(serialized, 'utf8');
}

function isVisibleSample(sample) {
  if (!sample || !sample.bounds) return false;
  const bounds = sample.bounds;
  return Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0;
}

async function waitForStableTarget(frame, selector, deadline) {
  const startedAt = Date.now();
  let previous = await sampleTarget(frame, selector);
  let stableSince = Date.now();
  let stableSamples = 1;
  let resets = 0;
  while (Date.now() < deadline) {
    await frame.evaluate(function () {
      return new Promise(function (resolve) {
        requestAnimationFrame(function () { requestAnimationFrame(resolve); });
      });
    });
    const current = await sampleTarget(frame, selector);
    if (!current) {
      throw createCaptureError('PREVIEW_TARGET_NOT_FOUND', 'The requested preview renderer was removed');
    }
    if (!isVisibleSample(current)) {
      throw createCaptureError('PREVIEW_TARGET_NOT_VISIBLE', 'The requested preview renderer has no visible area');
    }
    if (previous && JSON.stringify(previous) === JSON.stringify(current)) {
      stableSamples++;
      if (Date.now() - stableSince >= SMART_STABILITY_WINDOW_MS) {
        return {
          stableSamples: stableSamples,
          resets: resets,
          waitMs: Date.now() - startedAt,
          quietMs: Date.now() - stableSince,
          sample: current
        };
      }
    } else {
      stableSince = Date.now();
      stableSamples = 1;
      resets++;
    }
    if (resets > 0 && Date.now() - startedAt >= SMART_ACTIVITY_CAP_MS) {
      throw createCaptureError(
        'PREVIEW_CONTINUOUS_ACTIVITY',
        `Preview output kept changing in smart mode (stability resets: ${resets}); use timed mode for continuous output`
      );
    }
    previous = current;
  }
  throw createCaptureError(
    'PREVIEW_READY_TIMEOUT',
    `Timed out waiting for stable preview renderer output (stability resets: ${resets})`
  );
}

async function readTimelineStatus(page, frame, selector) {
  const frames = await getReadinessFrames(page, frame, selector);
  const statuses = await Promise.all(frames.map(function (candidate) {
    return candidate.evaluate(function () {
      const readiness = window.__composerAgentReadiness || {};
      let active = Object.keys(readiness.activeTimelines || {}).length;
      let pending = active;
      let inspected = 0;
      const onairRef = window.singularOnAirRef;
      const owners = onairRef && onairRef.props && onairRef.props.rootTimelines;
      if (owners) {
        Object.keys(owners).forEach(function (ownerId) {
          const compositions = owners[ownerId] || {};
          Object.keys(compositions).forEach(function (compositionId) {
            const timelines = compositions[compositionId] || {};
            Object.keys(timelines).forEach(function (name) {
              const timeline = timelines[name];
              if (!timeline || typeof timeline.isActive !== 'function') return;
              inspected++;
              if (timeline.isActive()) active++;
              if (timeline.data && timeline.data.completed === false) pending++;
            });
          });
        });
      }
      return {
        active: active,
        pending: pending,
        inspected: inspected,
        events: readiness.timelineEvents || 0,
        lastActivityAt: readiness.lastTimelineActivityAt || 0
      };
    }).catch(function () { return null; });
  }));
  return statuses.filter(Boolean).reduce(function (result, status) {
    result.active += status.active;
    result.pending += status.pending;
    result.inspected += status.inspected;
    result.events += status.events;
    result.lastActivityAt = Math.max(result.lastActivityAt, status.lastActivityAt);
    return result;
  }, { active: 0, pending: 0, inspected: 0, events: 0, lastActivityAt: 0 });
}

async function waitForSmartTimelines(page, frame, selector, deadline) {
  const message = 'Timed out waiting for Singular timelines to finish';
  const startedAt = Date.now();
  let status = { active: 0, pending: 0, inspected: 0, events: 0, lastActivityAt: 0 };
  while (Date.now() < deadline) {
    status = await readTimelineStatus(page, frame, selector);
    const quietFor = Date.now() - status.lastActivityAt;
    if (
      status.active === 0 &&
      status.pending === 0 &&
      (status.lastActivityAt === 0 || quietFor >= LIFECYCLE_QUIET_WINDOW_MS)
    ) {
      status.quietMs = status.lastActivityAt === 0 ? null : quietFor;
      status.waitMs = Date.now() - startedAt;
      return status;
    }
    await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  throw createCaptureError(
    'PREVIEW_READY_TIMEOUT',
    `${message} (active: ${status.active}, pending: ${status.pending}, inspected: ${status.inspected})`
  );
}

async function seekRootTimeline(frame, timeline, atSeconds) {
  const result = await frame.evaluate(function (request) {
    const onairRef = window.singularOnAirRef;
    if (!onairRef || typeof onairRef.getTweenTimelines !== 'function' ||
      typeof onairRef.setTimelinePosition !== 'function') {
      return { ok: false, reason: 'runtime-unavailable' };
    }
    const timelines = onairRef.getTweenTimelines();
    const selected = timelines && timelines[request.timeline];
    if (!selected || typeof selected.duration !== 'function' || typeof selected.time !== 'function') {
      return { ok: false, reason: 'timeline-unavailable' };
    }
    const durationSeconds = selected.duration();
    if (!Number.isFinite(durationSeconds)) {
      return { ok: false, reason: 'duration-unavailable' };
    }
    if (request.atSeconds > durationSeconds) {
      return { ok: false, reason: 'position-out-of-range', durationSeconds: durationSeconds };
    }
    const source = typeof onairRef.getTimelineId === 'function'
      ? onairRef.getTimelineId()
      : selected.data && selected.data.timelineId;
    if (!source) return { ok: false, reason: 'timeline-owner-unavailable' };
    onairRef.setTimelinePosition(source, request.timeline, request.atSeconds);
    return {
      ok: true,
      timeline: request.timeline,
      requestedSeconds: request.atSeconds,
      actualSeconds: selected.time(),
      durationSeconds: durationSeconds
    };
  }, { timeline: timeline, atSeconds: atSeconds }).catch(function () {
    return { ok: false, reason: 'evaluation-failed' };
  });

  if (!result || !result.ok) {
    const suffix = result && result.reason === 'position-out-of-range'
      ? `; ${timeline} duration is ${result.durationSeconds} seconds`
      : '';
    throw createCaptureError(
      'PREVIEW_TIMELINE_SEEK_FAILED',
      `Unable to seek the root ${timeline} timeline to ${atSeconds} seconds${suffix}`
    );
  }
  if (Math.abs(result.actualSeconds - atSeconds) > 0.001) {
    throw createCaptureError(
      'PREVIEW_TIMELINE_SEEK_FAILED',
      `The root ${timeline} timeline did not reach ${atSeconds} seconds`
    );
  }
  return result;
}

async function seekActiveTimeline(page, frame, compositionId, timeline, atSeconds, deadline) {
  const requested = await page.evaluate(function (request) {
    const player = window.SingularPlayerInstance;
    if (!player || typeof player.getCompositionInfo !== 'function' ||
      typeof player.getCompositionById !== 'function') {
      return { ok: false, reason: 'player-unavailable' };
    }
    const info = player.getCompositionInfo();
    const durations = info && info.compositionDuration && info.compositionDuration[request.compositionId];
    const durationSeconds = durations && Number(durations[request.timeline]);
    if (!Number.isFinite(durationSeconds)) {
      return { ok: false, reason: 'duration-unavailable' };
    }
    if (request.atSeconds > durationSeconds) {
      return { ok: false, reason: 'position-out-of-range', durationSeconds: durationSeconds };
    }
    const composition = player.getCompositionById(request.compositionId);
    if (!composition || typeof composition.seek !== 'function') {
      return { ok: false, reason: 'composition-unavailable' };
    }
    const inDuration = Number(durations.In) || 0;
    const masterSeconds = request.timeline === 'Out'
      ? inDuration + request.atSeconds
      : request.atSeconds;
    composition.seek(masterSeconds);
    return {
      ok: true,
      timeline: request.timeline,
      requestedSeconds: request.atSeconds,
      durationSeconds: durationSeconds,
      masterSeconds: masterSeconds
    };
  }, {
    compositionId: compositionId,
    timeline: timeline,
    atSeconds: atSeconds
  }).catch(function () {
    return { ok: false, reason: 'evaluation-failed' };
  });

  if (!requested || !requested.ok) {
    const suffix = requested && requested.reason === 'position-out-of-range'
      ? `; ${timeline} duration is ${requested.durationSeconds} seconds`
      : '';
    throw createCaptureError(
      'PREVIEW_TIMELINE_SEEK_FAILED',
      `Unable to seek composition ${compositionId} ${timeline} to ${atSeconds} seconds${suffix}`
    );
  }

  while (Date.now() < deadline) {
    const actualSeconds = await frame.evaluate(function (request) {
      const onairRef = window.singularOnAirRef;
      const owners = onairRef && onairRef.props && onairRef.props.rootTimelines;
      if (!owners) return null;
      const ownerIds = Object.keys(owners);
      for (let index = 0; index < ownerIds.length; index++) {
        const timelines = owners[ownerIds[index]] && owners[ownerIds[index]][request.compositionId];
        const selected = timelines && timelines[request.timeline];
        if (selected && typeof selected.time === 'function') return selected.time();
      }
      return null;
    }, { compositionId: compositionId, timeline: timeline }).catch(function () { return null; });
    if (Number.isFinite(actualSeconds) && Math.abs(actualSeconds - atSeconds) <= 0.001) {
      requested.actualSeconds = actualSeconds;
      delete requested.masterSeconds;
      return requested;
    }
    await page.waitForTimeout(Math.min(25, Math.max(1, deadline - Date.now())));
  }

  throw createCaptureError(
    'PREVIEW_TIMELINE_SEEK_FAILED',
    `Composition ${compositionId} ${timeline} did not reach ${atSeconds} seconds`
  );
}

function isolateTarget(frame, targetSelector) {
  return frame.evaluate(function (selectors) {
    const targetElement = document.querySelector(selectors.targetSelector);
    const root = document.querySelector(selectors.rootSelector);
    if (!targetElement || !root) return false;
    const hidden = [];
    let branch = targetElement;
    while (branch && branch !== root) {
      const parent = branch.parentNode;
      if (!parent) break;
      Array.prototype.forEach.call(parent.children || [], function (sibling) {
        if (sibling === branch || !sibling.style) return;
        hidden.push({ element: sibling, visibility: sibling.style.visibility });
        sibling.style.visibility = 'hidden';
      });
      branch = parent;
    }
    window.__composerAgentCaptureHidden = hidden;
    return true;
  }, { targetSelector: targetSelector, rootSelector: ROOT_TARGET_SELECTOR });
}

function restoreIsolatedTarget(frame) {
  return frame.evaluate(function () {
    const hidden = window.__composerAgentCaptureHidden || [];
    hidden.forEach(function (item) {
      item.element.style.visibility = item.visibility;
    });
    delete window.__composerAgentCaptureHidden;
  }).catch(function () {});
}

function removeTemporaryDirectory(tempDirectory) {
  if (!tempDirectory) return;
  const resolvedDirectory = path.resolve(tempDirectory);
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const expectedPrefix = path.join(resolvedTempRoot, TEMP_DIRECTORY_PREFIX);
  if (!resolvedDirectory.startsWith(expectedPrefix) || path.dirname(resolvedDirectory) !== resolvedTempRoot) {
    return;
  }
  try {
    fs.rmSync(resolvedDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    // The capture has already closed its private browser context. A failed
    // best-effort cleanup must not expose the temporary profile path.
  }
}

async function captureCompositionPreviewDirect(options) {
  const captureOptions = options || {};
  const endpoint = normalizeEndpoint(captureOptions.endpoint);
  const width = Number(captureOptions.width);
  const height = Number(captureOptions.height);
  const timeoutMs = captureOptions.timeoutMs === undefined
    ? DEFAULT_TIMEOUT_MS
    : Number(captureOptions.timeoutMs);
  const waitMode = captureOptions.waitMode || 'smart';
  const settleMs = captureOptions.settleMs === undefined
    ? (waitMode === 'timed' ? 2000 : 0)
    : Number(captureOptions.settleMs);
  const target = captureOptions.target || 'root';
  const compositionId = captureOptions.compositionId || null;
  const widgetTileId = captureOptions.widgetTileId || null;
  const timeline = captureOptions.timeline || null;
  const atSeconds = captureOptions.atSeconds === undefined || captureOptions.atSeconds === null
    ? null
    : Number(captureOptions.atSeconds);
  const measurementsPath = captureOptions.measurementsPath
    ? path.resolve(captureOptions.measurementsPath)
    : null;

  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw createCaptureError('CAPTURE_FAILED', 'Preview width and height must be positive integers');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw createCaptureError('CAPTURE_FAILED', 'Capture timeout must be a positive number of milliseconds');
  }
  if (!Number.isFinite(settleMs) || settleMs < 0) {
    throw createCaptureError('CAPTURE_FAILED', 'Capture settle time must be a non-negative number of milliseconds');
  }
  if (waitMode !== 'smart' && waitMode !== 'timed') {
    throw createCaptureError('INVALID_CAPTURE_WAIT_MODE', 'Capture wait mode must be "smart" or "timed"');
  }
  if (target !== 'root' && target !== 'active') {
    throw createCaptureError('INVALID_CAPTURE_TARGET', 'capture target must be "root" or "active"');
  }
  if (widgetTileId && (!compositionId || target !== 'active')) {
    throw createCaptureError(
      'INVALID_CAPTURE_TARGET',
      'widget tile targeting requires an active composition id'
    );
  }
  if ((timeline === null) !== (atSeconds === null)) {
    throw createCaptureError(
      'INVALID_CAPTURE_TIMELINE',
      'Timeline and position must be provided together'
    );
  }
  if (timeline !== null) {
    if (timeline !== 'In' && timeline !== 'Out') {
      throw createCaptureError('INVALID_CAPTURE_TIMELINE', 'Timeline must be "In" or "Out"');
    }
    if (!Number.isFinite(atSeconds) || atSeconds < 0) {
      throw createCaptureError('INVALID_CAPTURE_TIMELINE', 'Timeline position must be zero or greater');
    }
    if (widgetTileId || (target === 'active' && !compositionId)) {
      throw createCaptureError(
        'INVALID_CAPTURE_TIMELINE',
        'Timeline-position capture does not support widget-owned active compositions'
      );
    }
    if (waitMode !== 'smart') {
      throw createCaptureError(
        'INVALID_CAPTURE_TIMELINE',
        'Timeline-position capture requires smart wait mode'
      );
    }
  }
  if (!captureOptions.compositionToken) {
    throw createCaptureError(
      'COMPOSITION_TOKEN_REQUIRED',
      'Standalone capture requires a Composition API token. Generate one in Composer and inspect again.'
    );
  }

  const outputPath = path.resolve(captureOptions.outputPath);
  if (measurementsPath && measurementsPath === outputPath) {
    throw createCaptureError(
      'MEASUREMENT_WRITE_FAILED',
      'Measurement output must be different from the PNG output path'
    );
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const previewUrl = `${endpoint}/compositions/${encodeURIComponent(captureOptions.compositionToken)}/preview?bgcolor=black`;
  let targetSelector = target === 'active' && compositionId
    ? `#onair${compositionId}`
    : ROOT_TARGET_SELECTOR;
  const captureStartedAt = Date.now();
  const deadline = captureStartedAt + timeoutMs;
  const readiness = {
    waitMode: waitMode,
    bootstrap: null,
    consoleReady: false,
    frameAttached: false,
    targetVisible: false,
    fontsReady: false,
    imagesReady: false,
    imageGateComplete: false,
    allImagesLoaded: null,
    imageStatus: null,
    stableSamples: 0,
    stability: null,
    lifecycle: null,
    timelines: null,
    seek: null,
    gates: {},
    settleMs: settleMs
  };

  let context;
  let frame;
  let isolated = false;
  let tempDirectory;
  try {
    if (captureOptions.browser) {
      context = await captureOptions.browser.newContext({ viewport: { width: width, height: height } });
    } else {
      const playwright = loadPlaywrightCore();
      tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIRECTORY_PREFIX));
      try {
        context = await playwright.chromium.launchPersistentContext(tempDirectory, {
          channel: captureOptions.browserName || PREFERRED_BROWSER,
          headless: true,
          viewport: { width: width, height: height }
        });
      } catch (error) {
        throw createCaptureError(
          'BROWSER_LAUNCH_FAILED',
          'Unable to launch Chrome for standalone capture. Confirm that the Playwright Chrome browser is installed.'
        );
      }
    }

    const page = context.pages()[0] || await context.newPage();
    await installReadinessTracking(page);
    const imageRequestDiagnostics = new Map();
    const recordImageRequestDiagnostic = function (url, diagnostic) {
      if (typeof url !== 'string' || !url || url.length > MAX_IMAGE_DIAGNOSTIC_URL_LENGTH) return;
      if (!imageRequestDiagnostics.has(url) && imageRequestDiagnostics.size >= MAX_IMAGE_DIAGNOSTIC_ENTRIES) return;
      imageRequestDiagnostics.set(url, diagnostic);
    };
    page.on('response', function (response) {
      try {
        const request = response.request();
        if (request.resourceType() !== 'image') return;
        const status = response.status();
        if (status >= 200 && status < 400) return;
        recordImageRequestDiagnostic(request.url(), {
          failureReason: 'http-error',
          httpStatus: status
        });
      } catch (error) {
        // Image diagnostics are best-effort and never block capture readiness.
      }
    });
    page.on('requestfailed', function (request) {
      try {
        if (request.resourceType() !== 'image') return;
        recordImageRequestDiagnostic(request.url(), {
          failureReason: 'network-error',
          httpStatus: null
        });
      } catch (error) {
        // Image diagnostics are best-effort and never expose raw request errors.
      }
    });
    let signalConsoleReady;
    let consoleReadySeen = false;
    const consoleReady = new Promise(function (resolve) { signalConsoleReady = resolve; });
    page.on('console', function (message) {
      if (message.text().includes('comp is ready')) {
        consoleReadySeen = true;
        signalConsoleReady();
      }
    });

    let gateStartedAt = Date.now();
    try {
      await page.goto(previewUrl, {
        timeout: remainingTime(
          deadline,
          'PREVIEW_NAVIGATION_FAILED',
          'Timed out navigating to the composition preview'
        )
      });
    } catch (error) {
      if (error && error.code) throw error;
      throw createCaptureError(
        'PREVIEW_NAVIGATION_FAILED',
        'Unable to load the composition preview. Confirm the endpoint and Composition API token.'
      );
    }
    readiness.gates.navigationMs = Date.now() - gateStartedAt;

    gateStartedAt = Date.now();
    const playerFrame = waitForPlayerFrame(page, deadline);
    readiness.bootstrap = await waitForPreviewBootstrap(page, consoleReady, playerFrame, deadline);
    const bootstrapAt = Date.now();
    readiness.consoleReady = consoleReadySeen;
    frame = await playerFrame;
    readiness.frameAttached = true;
    readiness.gates.bootstrapMs = Date.now() - gateStartedAt;
    gateStartedAt = Date.now();
    let targetLocator;
    if (target === 'active' && compositionId && widgetTileId) {
      const widgetTarget = await waitForWidgetTarget(page, widgetTileId, compositionId, deadline);
      frame = widgetTarget.frame;
      targetSelector = widgetTarget.selector;
      targetLocator = widgetTarget.locator;
    } else {
      targetLocator = await waitForTarget(frame, targetSelector, deadline);
    }
    readiness.targetVisible = true;
    readiness.gates.targetMs = Date.now() - gateStartedAt;
    if (target === 'active' && compositionId && !widgetTileId) {
      isolated = await isolateTarget(frame, targetSelector);
    }

    readiness.lifecycle = await waitForLifecycleReady(
      page,
      frame,
      targetSelector,
      bootstrapAt,
      deadline
    );
    gateStartedAt = Date.now();
    await waitForFonts(frame, targetSelector, deadline);
    readiness.gates.fontsMs = Date.now() - gateStartedAt;
    readiness.fontsReady = true;
    gateStartedAt = Date.now();
    await waitForImages(frame, targetSelector, deadline);
    readiness.gates.imagesMs = Date.now() - gateStartedAt;
    readiness.imagesReady = true;
    readiness.imageGateComplete = true;
    let stability;
    if (waitMode === 'smart') {
      readiness.timelines = await waitForSmartTimelines(page, frame, targetSelector, deadline);
      if (timeline !== null) {
        readiness.seek = target === 'active'
          ? await seekActiveTimeline(page, frame, compositionId, timeline, atSeconds, deadline)
          : await seekRootTimeline(frame, timeline, atSeconds);
      }
      stability = await waitForStableTarget(frame, targetSelector, deadline);
      readiness.stableSamples = stability.stableSamples;
      readiness.stability = {
        quietMs: stability.quietMs,
        resets: stability.resets,
        canvasCount: stability.sample.canvasCount,
        loadedImages: stability.sample.loadedImages,
        failedImages: stability.sample.failedImages,
        pendingImages: stability.sample.pendingImages
      };
    }
    if (settleMs > 0) {
      const available = remainingTime(
        deadline,
        'PREVIEW_READY_TIMEOUT',
        'Timed out during the requested capture settle time'
      );
      if (available < settleMs) {
        throw createCaptureError('PREVIEW_READY_TIMEOUT', 'Timed out during the requested capture settle time');
      }
      await page.waitForTimeout(settleMs);
      readiness.gates.settleMs = settleMs;
    }
    if (waitMode === 'timed') {
      gateStartedAt = Date.now();
      await waitForFonts(frame, targetSelector, deadline);
      readiness.gates.timedFontsRecheckMs = Date.now() - gateStartedAt;
      gateStartedAt = Date.now();
      await waitForImages(frame, targetSelector, deadline);
      readiness.gates.timedImagesRecheckMs = Date.now() - gateStartedAt;
      const sample = await sampleTarget(frame, targetSelector);
      if (!sample) {
        throw createCaptureError('PREVIEW_TARGET_NOT_FOUND', 'The requested preview renderer was removed');
      }
      if (!isVisibleSample(sample)) {
        throw createCaptureError('PREVIEW_TARGET_NOT_VISIBLE', 'The requested preview renderer has no visible area');
      }
      stability = { stableSamples: 1, sample: sample };
      readiness.stableSamples = 1;
      readiness.stability = {
        bypassed: true,
        reason: 'timed-mode',
        canvasCount: sample.canvasCount,
        loadedImages: sample.loadedImages,
        failedImages: sample.failedImages,
        pendingImages: sample.pendingImages
      };
    }
    readiness.imageStatus = {
      loaded: stability.sample.loadedImages,
      failed: stability.sample.failedImages,
      pending: stability.sample.pendingImages
    };
    readiness.allImagesLoaded = stability.sample.failedImages === 0 && stability.sample.pendingImages === 0;

    let measurementSnapshot = null;
    let serializedMeasurements = null;
    if (measurementsPath) {
      measurementSnapshot = await collectMeasurementSnapshot(frame, targetSelector, {
        target: target,
        compositionId: target === 'active' ? compositionId : null,
        widgetTileId: target === 'active' ? widgetTileId : null,
        waitMode: waitMode,
        timeline: readiness.seek ? {
          name: readiness.seek.timeline,
          positionSeconds: readiness.seek.actualSeconds,
          durationSeconds: readiness.seek.durationSeconds
        } : null,
        imageDiagnostics: Array.from(imageRequestDiagnostics.entries()).map(function (entry) {
          return {
            url: entry[0],
            failureReason: entry[1].failureReason,
            httpStatus: entry[1].httpStatus
          };
        })
      });
      serializedMeasurements = serializeMeasurementSnapshot(measurementSnapshot);
      prepareMeasurementOutput(measurementsPath);
    }

    try {
      await targetLocator.screenshot({ path: outputPath });
    } catch (error) {
      throw createCaptureError('CAPTURE_FAILED', 'Unable to save the composition preview PNG');
    }
    if (!fs.existsSync(outputPath)) {
      throw createCaptureError('CAPTURE_FAILED', 'Standalone capture did not create a PNG');
    }
    const sizeBytes = fs.statSync(outputPath).size;
    if (sizeBytes <= 0) {
      throw createCaptureError('CAPTURE_FAILED', 'Standalone capture created an empty PNG');
    }
    if (sizeBytes > MAX_CAPTURE_BYTES) {
      throw createCaptureError('CAPTURE_TOO_LARGE', 'Composer preview capture exceeds the 8 MB limit');
    }
    let measurements = null;
    if (measurementSnapshot) {
      const measurementSizeBytes = saveMeasurementSnapshot(serializedMeasurements, measurementsPath);
      measurements = {
        output: measurementsPath,
        schemaVersion: measurementSnapshot.schemaVersion,
        elementCount: measurementSnapshot.summary.elementCount,
        truncated: measurementSnapshot.summary.truncated,
        sizeBytes: measurementSizeBytes
      };
    }
    readiness.totalMs = Date.now() - captureStartedAt;

    const result = {
      output: outputPath,
      source: 'standalone',
      target: target,
      width: Math.round(stability.sample.bounds.width),
      height: Math.round(stability.sample.bounds.height),
      sizeBytes: sizeBytes,
      compositionId: target === 'active' ? compositionId : null,
      widgetTileId: target === 'active' ? widgetTileId : null,
      editorResolution: { width: width, height: height },
      readiness: readiness,
      fallback: null
    };
    if (measurements) result.measurements = measurements;
    return result;
  } finally {
    if (isolated && frame) await restoreIsolatedTarget(frame);
    if (context) await context.close().catch(function () {});
    removeTemporaryDirectory(tempDirectory);
  }
}

async function captureCompositionPreview(options) {
  const state = await getWorkerState();
  try {
    return await requestWorker(state, '/capture', options || {});
  } catch (error) {
    if (error && error.code) throw error;
    throw createCaptureError('CAPTURE_FAILED', 'Unable to communicate with the standalone capture worker');
  }
}

async function runCaptureWorker() {
  const secret = process.env.COMPOSER_AGENT_CAPTURE_WORKER_SECRET;
  if (!secret) throw new Error('Capture worker secret is required');
  delete process.env.COMPOSER_AGENT_CAPTURE_WORKER_SECRET;

  const playwright = loadPlaywrightCore();
  let browser;
  try {
    browser = await playwright.chromium.launch({ channel: PREFERRED_BROWSER, headless: true });
  } catch (error) {
    throw createCaptureError(
      'BROWSER_LAUNCH_FAILED',
      'Unable to launch Chrome for standalone capture. Confirm that the Playwright Chrome browser is installed.'
    );
  }

  let activeRequest = false;
  let idleTimer;
  let server;
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearTimeout(idleTimer);
    try {
      removeWorkerFile(WORKER_STATE_PATH);
    } catch (error) {
      // State cleanup is best-effort; clients validate both the PID and the
      // authenticated status endpoint before reusing a worker.
    }
    if (server) await new Promise(function (resolve) { server.close(resolve); });
    await browser.close().catch(function () {});
  }
  function scheduleIdleShutdown() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { shutdown().then(function () { process.exit(0); }); }, WORKER_IDLE_TIMEOUT_MS);
    idleTimer.unref();
  }

  server = http.createServer(async function (request, response) {
    function send(statusCode, value) {
      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    }
    if (request.headers.authorization !== `Bearer ${secret}`) {
      send(401, { ok: false, code: 'CAPTURE_FAILED', message: 'Capture worker authorization failed' });
      return;
    }
    if (request.method === 'GET' && request.url === '/status') {
      send(200, { ok: true, result: { ready: true } });
      return;
    }
    if (request.method === 'GET' && request.url === '/stop') {
      send(200, { ok: true, result: { stopped: true } });
      setImmediate(function () { shutdown().then(function () { process.exit(0); }); });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/capture') {
      send(404, { ok: false, code: 'CAPTURE_FAILED', message: 'Unknown capture worker request' });
      return;
    }
    if (activeRequest) {
      send(409, { ok: false, code: 'CAPTURE_FAILED', message: 'Standalone capture worker is already capturing' });
      return;
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', function (chunk) {
      body += chunk;
      if (body.length > 64 * 1024) request.destroy();
    });
    request.on('end', async function () {
      if (activeRequest) {
        send(409, { ok: false, code: 'CAPTURE_FAILED', message: 'Standalone capture worker is already capturing' });
        return;
      }
      activeRequest = true;
      clearTimeout(idleTimer);
      try {
        const options = JSON.parse(body);
        const result = await captureCompositionPreviewDirect(
          Object.assign({}, options, { browser: browser })
        );
        send(200, { ok: true, result: result });
      } catch (error) {
        send(500, {
          ok: false,
          code: error.code || 'CAPTURE_FAILED',
          message: error.message || 'Standalone capture failed'
        });
      } finally {
        activeRequest = false;
        scheduleIdleShutdown();
      }
    });
  });

  await new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  writeWorkerState({
    pid: process.pid,
    port: address.port,
    secret: secret,
    version: WORKER_VERSION,
    idleTimeoutMs: WORKER_IDLE_TIMEOUT_MS
  });
  removeWorkerFile(WORKER_LOCK_PATH);
  browser.on('disconnected', function () {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      removeWorkerFile(WORKER_STATE_PATH);
    } catch (error) {}
    if (server) server.close(function () { process.exit(1); });
  });
  scheduleIdleShutdown();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    fail('expected endpoint, width, height, composition token, output path, and optional flags');
  }

  const endpoint = normalizeEndpoint(args[0]);
  const width = parsePositiveInteger(args[1], 'width');
  const height = parsePositiveInteger(args[2], 'height');
  const compositionToken = args[3];
  if (!compositionToken) {
    throw createCaptureError('COMPOSITION_TOKEN_REQUIRED', 'composition token must not be empty');
  }
  const options = parseOptions(args);
  const result = await captureCompositionPreview({
    endpoint: endpoint,
    width: width,
    height: height,
    compositionToken: compositionToken,
    outputPath: args[4],
    target: options.compositionId ? 'active' : 'root',
    compositionId: options.compositionId,
    widgetTileId: options.widgetTileId,
    measurementsPath: options.measurementsPath,
    waitMode: options.waitMode,
    timeoutMs: options.timeoutMs,
    settleMs: options.settleMs,
    timeline: options.timeline,
    atSeconds: options.atSeconds
  });

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Saved composition preview to ${result.output}`);
}

if (require.main === module) {
  const entryPoint = process.argv[2] === '--capture-worker' ? runCaptureWorker : main;
  entryPoint().catch(function (error) {
    const prefix = error.code ? `${error.code}: ` : '';
    console.error(prefix + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  captureCompositionPreview: captureCompositionPreview,
  createCaptureError: createCaptureError,
  MAX_CAPTURE_BYTES: MAX_CAPTURE_BYTES
};
