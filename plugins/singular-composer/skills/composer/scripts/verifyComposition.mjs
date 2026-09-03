import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';
import {
  executeVerificationScenario,
  readVerificationScenario
} from './verify-composition-scenario.mjs';
import {
  resolveVerificationTarget, prepareVerificationTarget, restoreVerificationTarget
} from './verify-composition-target.mjs';

const require = createRequire(import.meta.url);

function loadPlaywrightCore() {
  return require('./runtime-dependencies').load('playwright-core');
}

const { chromium } = loadPlaywrightCore();

const defaultOutDir = path.resolve(process.cwd(), 'temp');

// --- CLI args ---
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const hasArg = (name) => args.includes(name);

const frameCount = parseInt(getArg('--frames', '3'), 10);
const intervalMs = parseInt(getArg('--interval', '3000'), 10);
const framesExplicit = hasArg('--frames');
const intervalExplicit = hasArg('--interval');
const headless = hasArg('--no-headless') ? false : true;
const handoffPath = getArg('--handoff-file', null);
const SCREENSHOT_DIR = path.resolve(getArg('--out', defaultOutDir));
const captureMode = getArg('--capture-mode', 'target');
const reportPath = path.resolve(
  getArg('--report', path.join(SCREENSHOT_DIR, 'verification-report.json'))
);
const integrityPath = getArg('--integrity-file', null);
const scenarioPath = getArg('--scenario-file', null);
const freshPagePerFrame = hasArg('--fresh-page-per-frame');
const disableGpu = hasArg('--disable-gpu');

if (!Number.isSafeInteger(frameCount) || frameCount <= 0 || frameCount > 100) {
  throw new Error('--frames must be an integer between 1 and 100');
}
if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > 600000) {
  throw new Error('--interval must be an integer between 1 and 600000 milliseconds');
}

if (captureMode !== 'target' && captureMode !== 'page') {
  throw new Error('--capture-mode must be "target" or "page"');
}

if (hasArg('--token') || hasArg('--host')) {
  throw new Error(
    'Direct --token and --host operation is not supported; provide a composer-agent script handoff'
  );
}

if (!handoffPath) {
  throw new Error('Missing script handoff: provide --handoff-file <path|->');
}

function readHandoff(filePath) {
  const text = filePath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(filePath, 'utf8');
  const handoff = JSON.parse(text);
  if (
    !handoff ||
    handoff.version !== 1 ||
    handoff.kind !== 'composer-agent-script-handoff' ||
    !handoff.host ||
    !handoff.compositionToken
  ) {
    throw new Error(
      'Script handoff must have version 1, kind composer-agent-script-handoff, host, and compositionToken'
    );
  }
  return handoff;
}

const handoff = readHandoff(handoffPath);
const token = handoff.compositionToken;
const host = String(handoff.host).replace(/\/+$/, '');
const targetRequest = resolveVerificationTarget(getArg('--composition-id', 'root'), handoff);

function readIntegrityContract(filePath) {
  if (!filePath) return null;
  const contract = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (!contract || contract.version !== 1 || !Array.isArray(contract.assertions) ||
      !contract.assertions.length || contract.assertions.length > 50) {
    throw new Error('Integrity file must contain version 1 and a non-empty assertions array');
  }
  contract.assertions.forEach(function (assertion, index) {
    const label = assertion && assertion.name ? assertion.name : `assertion-${index + 1}`;
    const region = assertion && assertion.region;
    if (!region || !['px', 'percent'].includes(region.unit || 'px')) {
      throw new Error(`Integrity assertion "${label}" has an invalid region unit`);
    }
    ['x', 'y', 'width', 'height'].forEach(function (key) {
      if (!Number.isFinite(region[key]) || region[key] < 0 ||
          ((key === 'width' || key === 'height') && region[key] <= 0)) {
        throw new Error(`Integrity assertion "${label}" has an invalid region.${key}`);
      }
    });
    const background = assertion.background || { r: 0, g: 0, b: 0 };
    ['r', 'g', 'b'].forEach(function (key) {
      if (!Number.isFinite(background[key]) || background[key] < 0 || background[key] > 255) {
        throw new Error(`Integrity assertion "${label}" has an invalid background.${key}`);
      }
    });
    if (assertion.tolerance !== undefined &&
        (!Number.isFinite(assertion.tolerance) || assertion.tolerance < 0 || assertion.tolerance > 255)) {
      throw new Error(`Integrity assertion "${label}" has an invalid tolerance`);
    }
    ['minimumForegroundPixels', 'minimumOccupiedColumns', 'minimumOccupiedRows'].forEach(function (key) {
      if (assertion[key] !== undefined &&
          (!Number.isSafeInteger(assertion[key]) || assertion[key] < 0)) {
        throw new Error(`Integrity assertion "${label}" has an invalid ${key}`);
      }
    });
  });
  return contract;
}

const integrityContract = readIntegrityContract(integrityPath);
const verificationScenario = readVerificationScenario(scenarioPath);
const scenarioCaptureCount = verificationScenario
  ? verificationScenario.steps.filter(step => step.action === 'capture').length
  : 0;

if (verificationScenario && freshPagePerFrame) {
  throw new Error('--fresh-page-per-frame cannot be combined with --scenario-file');
}
if (scenarioCaptureCount && (framesExplicit || intervalExplicit)) {
  throw new Error('--frames and --interval cannot be combined with scenario capture steps');
}

function sanitizeText(value) {
  let text = String(value).split(token).join('<redacted>');
  if (handoff.composerAgentAccessToken) text = text.split(handoff.composerAgentAccessToken).join('<redacted>');
  return text;
}

function getPngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Player verification screenshot is not a valid PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

// --- Build HTML ---
function buildHtml() {
  const baseUrl = host;
  return `<!DOCTYPE html>
<html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}</style></head>
<body style="margin:0;padding:0;overflow:hidden;width:100%;height:100%">
  <iframe id="SingularPlayer" style="position:fixed;top:0;left:0;width:100%;height:100%;border:none"></iframe>
  <script>
    var player;
    var playerBaseUrl = ${JSON.stringify(baseUrl)};
    var compositionToken = ${JSON.stringify(token)};
    window.__verificationLifecycle = {
      compositionLoaded: 0,
      message: 0,
      state_changed: 0,
      payload_changed: 0,
      datanode_payload_changed: 0,
      error: 0,
      composition_script_event: 0,
      download_start: 0,
      download_complete: 0
    };
    window.singularDebugFirebaseTraffic = true;
    var loadPlayerSdk = function (cb) {
      var s = document.createElement('script');
      s.src = playerBaseUrl + '/libs/singularplayer/0.1.2/singularplayer.js';
      s.onload = cb;
      s.onerror = function () { console.error('Failed to load SDK from ' + s.src); };
      document.head.appendChild(s);
    };
    var load = function () {
      if (!compositionToken) { console.error('Set compositionToken'); return; }
      Object.keys(window.__verificationLifecycle).forEach(function (eventName) {
        if (eventName === 'compositionLoaded') return;
        player.addListener(eventName, function () {
          window.__verificationLifecycle[eventName] += 1;
        });
      });
      player.loadComposition(compositionToken, function (obj) {
        var loaded = Boolean(obj && obj.success === true);
        console.log('INFO: Composition loaded :' + loaded);
        window.__verificationLifecycle.compositionLoaded += 1;
        window.__compositionLoaded = loaded;
        window.__compositionLoadFailed = !loaded;
      });
    };
    document.addEventListener('DOMContentLoaded', function () {
      document.getElementById('SingularPlayer').src = playerBaseUrl + '/singularplayer/output?bgcolor=black';
      loadPlayerSdk(function () { player = SingularPlayer('SingularPlayer'); load(); });
    });
  </script>
</body></html>`;
}

async function waitForPlayerFrame(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const frame = page.frames().find(f => f.url().includes('singularplayer/output'));
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  throw new Error('Could not find the Singular Player frame');
}

async function waitForCompositor(playerFrame) {
  await playerFrame.evaluate(function () {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  });
}

async function evaluateIntegrity(page, pngBuffer, contract) {
  if (!contract) return { requested: false, passed: true, assertions: [] };
  const assertions = await page.evaluate(async function (input) {
    const image = new Image();
    image.src = 'data:image/png;base64,' + input.pngBase64;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return input.assertions.map(function (assertion, index) {
      const region = assertion.region;
      const unit = region.unit || 'px';
      const scaleX = unit === 'percent' ? image.naturalWidth / 100 : 1;
      const scaleY = unit === 'percent' ? image.naturalHeight / 100 : 1;
      const x = Math.max(0, Math.floor(region.x * scaleX));
      const y = Math.max(0, Math.floor(region.y * scaleY));
      const width = Math.min(image.naturalWidth - x, Math.ceil(region.width * scaleX));
      const height = Math.min(image.naturalHeight - y, Math.ceil(region.height * scaleY));
      if (width <= 0 || height <= 0) {
        return { name: assertion.name || `assertion-${index + 1}`, passed: false, reason: 'region-outside-screenshot' };
      }
      const background = assertion.background || { r: 0, g: 0, b: 0 };
      const tolerance = Number.isFinite(assertion.tolerance) ? assertion.tolerance : 8;
      const minimumForegroundPixels = Number.isSafeInteger(assertion.minimumForegroundPixels)
        ? assertion.minimumForegroundPixels : 1;
      const minimumOccupiedColumns = Number.isSafeInteger(assertion.minimumOccupiedColumns)
        ? assertion.minimumOccupiedColumns : 1;
      const minimumOccupiedRows = Number.isSafeInteger(assertion.minimumOccupiedRows)
        ? assertion.minimumOccupiedRows : 1;
      const pixels = context.getImageData(x, y, width, height).data;
      const columns = new Set();
      const rows = new Set();
      let foregroundPixels = 0;
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const offset = (row * width + column) * 4;
          const foreground = Math.abs(pixels[offset] - background.r) > tolerance ||
            Math.abs(pixels[offset + 1] - background.g) > tolerance ||
            Math.abs(pixels[offset + 2] - background.b) > tolerance;
          if (foreground && pixels[offset + 3] > 0) {
            foregroundPixels += 1;
            columns.add(column);
            rows.add(row);
          }
        }
      }
      const passed = foregroundPixels >= minimumForegroundPixels &&
        columns.size >= minimumOccupiedColumns && rows.size >= minimumOccupiedRows;
      return {
        name: assertion.name || `assertion-${index + 1}`,
        passed,
        region: { x, y, width, height },
        foregroundPixels,
        occupiedColumns: columns.size,
        occupiedRows: rows.size,
        required: { minimumForegroundPixels, minimumOccupiedColumns, minimumOccupiedRows }
      };
    });
  }, { pngBase64: pngBuffer.toString('base64'), assertions: contract.assertions });
  return {
    requested: true,
    passed: assertions.every(assertion => assertion.passed),
    assertions
  };
}

async function prepareVerificationPage(browser, viewport, logs, runtime) {
  const page = await browser.newPage({ viewport });
  page.on('console', msg => logs.push({ type: msg.type(), text: sanitizeText(msg.text()) }));
  await page.setContent(buildHtml(), { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.__compositionLoaded === true || window.__compositionLoadFailed === true,
      null, { timeout: 30000 });
  } catch (error) {
    throw new Error('PLAYER_LOAD_TIMEOUT: composition load did not complete before the deadline');
  }
  if (await page.evaluate(() => window.__compositionLoadFailed === true)) {
    throw new Error('PLAYER_LOAD_FAILED: the Player rejected the composition load');
  }
  runtime.compositionLoaded = true;
  runtime.loadCount += 1;
  await page.waitForTimeout(2000);
  const playerFrame = await waitForPlayerFrame(page);
  const { target, identity } = await prepareVerificationTarget(page, playerFrame, targetRequest);
  return { page, playerFrame, target, identity };
}

async function sampleVerificationTarget(target) {
  if (await target.count() !== 1) {
    throw new Error('PLAYER_TARGET_AMBIGUOUS: target renderer disappeared or became ambiguous');
  }
  const targetBounds = await target.boundingBox();
  if (!targetBounds || targetBounds.width <= 0 || targetBounds.height <= 0) {
    throw new Error('Player verification target has no positive visible bounds');
  }
  const domState = await target.evaluate(function (root) {
    const elements = Array.from(root.querySelectorAll('*'));
    return {
      text: (root.textContent || '').trim(),
      elementCount: elements.length,
      svgElementCount: root.querySelectorAll('svg, svg *').length,
      canvasCount: root.querySelectorAll('canvas').length,
      visibleElementCount: elements.filter(function (element) {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0 && bounds.width > 0 && bounds.height > 0;
      }).length
    };
  });
  return {
    targetBounds,
    dom: {
      textLength: domState.text.length,
      textHash: hashText(domState.text),
      elementCount: domState.elementCount,
      svgElementCount: domState.svgElementCount,
      canvasCount: domState.canvasCount,
      visibleElementCount: domState.visibleElementCount
    }
  };
}

function summarizeLogs(logs) {
  return logs.reduce(function (summary, entry) {
    const level = entry.type === 'warn' ? 'warning' : entry.type;
    summary.total += 1;
    if (Object.prototype.hasOwnProperty.call(summary, level)) summary[level] += 1;
    return summary;
  }, { total: 0, debug: 0, info: 0, log: 0, warning: 0, error: 0 });
}

// --- Main ---
async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const browser = await chromium.launch({
    headless,
    channel: 'chrome',
    args: disableGpu ? ['--disable-gpu'] : []
  });
  const viewport = {
    width: handoff.preview && Number.isSafeInteger(handoff.preview.width) ? handoff.preview.width : 1920,
    height: handoff.preview && Number.isSafeInteger(handoff.preview.height) ? handoff.preview.height : 1080
  };

  const logs = [];
  let page = null;
  let playerFrame = null;
  let target = null;
  let identity = null;

  const plannedFrameCount = scenarioCaptureCount || frameCount;
  const report = {
    version: 1,
    status: 'running',
    captureMode,
    frameCount: plannedFrameCount,
    intervalMs,
    viewport,
    diagnostics: { freshPagePerFrame, disableGpu },
    target: { ...targetRequest, status: 'pending' },
    runtime: { compositionLoaded: false, loadCount: 0 },
    scenario: { requested: Boolean(verificationScenario), status: verificationScenario ? 'pending' : 'not-requested' },
    screenshot: { successfulFrames: 0 },
    visualIntegrity: { requested: Boolean(integrityContract), passed: true },
    frames: []
  };

  try {
    ({ page, playerFrame, target, identity } = await prepareVerificationPage(browser, viewport, logs, report.runtime));
    report.target = { ...identity, status: 'ready' };

    const captureFrame = async function (checkpoint) {
      await waitForCompositor(playerFrame);
      const sampled = await sampleVerificationTarget(target);
      const lifecycle = await page.evaluate(() => ({ ...window.__verificationLifecycle }));
      const pngBuffer = captureMode === 'target'
        ? await target.screenshot({ type: 'png' })
        : await page.screenshot({ type: 'png', fullPage: true });
      const dimensions = getPngDimensions(pngBuffer);
      const index = report.frames.length;
      const fname = `frame-${index}.png`;
      fs.writeFileSync(path.join(SCREENSHOT_DIR, fname), pngBuffer);
      const integrity = await evaluateIntegrity(page, pngBuffer, integrityContract);
      const frame = {
        index,
        file: fname,
        screenshot: {
          success: true,
          width: dimensions.width,
          height: dimensions.height,
          bytes: pngBuffer.length
        },
        targetBounds: sampled.targetBounds,
        dom: sampled.dom,
        lifecycle,
        integrity
      };
      if (checkpoint) frame.checkpoint = checkpoint;
      report.frames.push(frame);
      report.screenshot.successfulFrames += 1;
      report.visualIntegrity.passed = report.visualIntegrity.passed && integrity.passed;
      console.log(`[verify] Screenshot: ${fname}`);
      return frame;
    };

    if (verificationScenario) {
      report.scenario = await executeVerificationScenario({
        scenario: verificationScenario,
        page,
        defaultCompositionId: identity.kind === 'composition' ? identity.compositionId : null,
        sample: () => sampleVerificationTarget(target),
        capture: captureFrame
      });
    }

    for (let i = 0; i < (scenarioCaptureCount ? 0 : frameCount); i++) {
      if (i > 0 && freshPagePerFrame) {
        await restoreVerificationTarget(playerFrame);
        await page.close();
        const previousIdentity = identity;
        ({ page, playerFrame, target, identity } = await prepareVerificationPage(browser, viewport, logs, report.runtime));
        if (identity.kind !== previousIdentity.kind || identity.compositionId !== previousIdentity.compositionId) {
          throw new Error('PLAYER_TARGET_CHANGED: the resolved composition changed after reload');
        }
      }
      await captureFrame(null);
      if (i < frameCount - 1) await page.waitForTimeout(intervalMs);
    }

    report.runtime.console = summarizeLogs(logs);
    report.status = report.visualIntegrity.passed ? 'passed' : 'failed';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('[verify] Report:', reportPath);
    console.log('[verify] Runtime:', JSON.stringify(report.runtime));
    console.log('[verify] Screenshot:', JSON.stringify(report.screenshot));
    console.log('[verify] Visual integrity:', JSON.stringify(report.visualIntegrity));
    if (!report.visualIntegrity.passed) {
      throw new Error('VISUAL_INTEGRITY_FAILED: one or more requested screenshot assertions failed');
    }
  } catch (error) {
    report.status = 'failed';
    if (report.target.status === 'pending') report.target.status = 'failed';
    report.error = sanitizeText(error && error.message ? error.message : error);
    if (error && error.scenarioResult) report.scenario = error.scenarioResult;
    report.runtime.console = summarizeLogs(logs);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    throw error;
  } finally {
    await restoreVerificationTarget(playerFrame);
    await browser.close();
  }
  console.log(`[verify] Done. ${report.frames.length} screenshots in ${SCREENSHOT_DIR}`);
}

main().catch(err => { console.error('[verify] Error:', sanitizeText(err)); process.exit(1); });
