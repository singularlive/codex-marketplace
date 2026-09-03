'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ARTIFACT_KIND = 'composer-browser-capture-artifact';
const ARTIFACT_SCHEMA_VERSION = 1;
const EVIDENCE_SCHEMA_VERSION = 1;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const GEOMETRY_TOLERANCE = 1;

function createArtifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function finiteNumber(value, name, options) {
  const settings = options || {};
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || (settings.positive && numeric <= 0)) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_EVIDENCE_INVALID',
      `${name} must be ${settings.positive ? 'a positive' : 'a finite'} number`
    );
  }
  return numeric;
}

function normalizeRect(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createArtifactError('CAPTURE_ARTIFACT_EVIDENCE_INVALID', `${name} must be an object`);
  }
  return {
    x: finiteNumber(value.x, `${name}.x`),
    y: finiteNumber(value.y, `${name}.y`),
    width: finiteNumber(value.width, `${name}.width`, { positive: true }),
    height: finiteNumber(value.height, `${name}.height`, { positive: true })
  };
}

function normalizeSize(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createArtifactError('CAPTURE_ARTIFACT_EVIDENCE_INVALID', `${name} must be an object`);
  }
  return {
    width: finiteNumber(value.width, `${name}.width`, { positive: true }),
    height: finiteNumber(value.height, `${name}.height`, { positive: true })
  };
}

function closeEnough(left, right) {
  return Math.abs(left - right) <= GEOMETRY_TOLERANCE;
}

function requireClose(left, right, message) {
  if (!closeEnough(left, right)) {
    throw createArtifactError('CAPTURE_ARTIFACT_GEOMETRY_MISMATCH', message);
  }
}

function normalizeBrowserName(value) {
  const browser = String(value || 'unspecified').trim();
  if (!browser || browser.length > 100 || !/^[\w .()-]+$/.test(browser)) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_EVIDENCE_INVALID',
      '--browser must be a short display name containing only letters, numbers, spaces, dots, parentheses, underscores, or hyphens'
    );
  }
  return browser;
}

function writeNewManifest(filePath, value) {
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(resolvedPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw createArtifactError(
        'CAPTURE_ARTIFACT_EXISTS',
        'Browser capture artifact manifest already exists; choose a new path'
      );
    }
    throw createArtifactError(
      'CAPTURE_ARTIFACT_WRITE_FAILED',
      'Unable to write the Browser capture artifact manifest'
    );
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return resolvedPath;
}

function writeExistingManifest(filePath, value) {
  const resolvedPath = path.resolve(filePath);
  try {
    fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
  } catch (error) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_WRITE_FAILED',
      'Unable to update the Browser capture artifact manifest'
    );
  }
  return resolvedPath;
}

function createPreparedManifest(result, filePath) {
  if (!result || !result.captureId || !result.editorResolution) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_INVALID',
      'Browser capture preparation did not return the metadata required for an artifact manifest'
    );
  }
  const manifest = {
    kind: ARTIFACT_KIND,
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    status: 'prepared',
    source: 'browser',
    preparedAt: new Date().toISOString(),
    preparation: {
      captureId: result.captureId,
      target: result.target,
      compositionId: result.compositionId || null,
      editorResolution: result.editorResolution,
      devicePixelRatio: result.devicePixelRatio || 1,
      diagnosticClip: result.clip || null,
      readiness: result.readiness || null,
      timeline: result.timeline || null,
      measurements: result.measurements || null
    }
  };
  const output = writeNewManifest(filePath, manifest);
  return {
    manifest,
    metadata: {
      output,
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      status: manifest.status
    }
  };
}

function readPreparedManifest(filePath, captureId) {
  const resolvedPath = path.resolve(filePath);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_READ_FAILED',
      'Unable to read the Browser capture artifact manifest'
    );
  }
  if (
    !manifest ||
    manifest.kind !== ARTIFACT_KIND ||
    manifest.schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
    manifest.status !== 'prepared' ||
    !manifest.preparation ||
    manifest.preparation.captureId !== captureId
  ) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_INVALID',
      'Browser capture artifact manifest is not the matching prepared transaction'
    );
  }
  return { manifest, resolvedPath };
}

function readEvidence(filePath) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_EVIDENCE_INVALID',
      'Unable to read Browser capture geometry evidence'
    );
  }
  if (!evidence || evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_EVIDENCE_INVALID',
      'Browser capture geometry evidence must use schemaVersion 1'
    );
  }
  if (!['viewport', 'clip', 'full-page'].includes(evidence.mode)) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_EVIDENCE_INVALID',
      'Browser capture geometry evidence mode must be "viewport", "clip", or "full-page"'
    );
  }
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    mode: evidence.mode,
    targetBounds: normalizeRect(evidence.targetBounds, 'targetBounds'),
    viewport: normalizeSize(evidence.viewport, 'viewport'),
    page: evidence.page === undefined || evidence.page === null
      ? null
      : normalizeSize(evidence.page, 'page'),
    devicePixelRatio: evidence.devicePixelRatio === undefined
      ? null
      : finiteNumber(evidence.devicePixelRatio, 'devicePixelRatio', { positive: true })
  };
}

function validateEvidence(evidence, preparation) {
  const target = evidence.targetBounds;
  const viewport = evidence.viewport;
  const resolution = normalizeSize(preparation.editorResolution, 'editorResolution');
  requireClose(target.width, resolution.width, 'Browser target width does not match the editor resolution');
  requireClose(target.height, resolution.height, 'Browser target height does not match the editor resolution');
  if (
    target.x < -GEOMETRY_TOLERANCE ||
    target.y < -GEOMETRY_TOLERANCE ||
    target.x + target.width > viewport.width + GEOMETRY_TOLERANCE ||
    target.y + target.height > viewport.height + GEOMETRY_TOLERANCE
  ) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_GEOMETRY_MISMATCH',
      'Browser capture target is not fully contained by the recorded viewport'
    );
  }
  if (evidence.mode === 'viewport') {
    requireClose(target.x, 0, 'Viewport capture target must begin at x=0');
    requireClose(target.y, 0, 'Viewport capture target must begin at y=0');
    requireClose(target.width, viewport.width, 'Viewport capture target width must equal the viewport');
    requireClose(target.height, viewport.height, 'Viewport capture target height must equal the viewport');
  }
  if (evidence.mode === 'full-page') {
    if (!evidence.page) {
      throw createArtifactError(
        'CAPTURE_ARTIFACT_EVIDENCE_INVALID',
        'Full-page capture evidence requires page dimensions'
      );
    }
    requireClose(target.x, 0, 'Full-page capture target must begin at x=0');
    requireClose(target.y, 0, 'Full-page capture target must begin at y=0');
    requireClose(target.width, evidence.page.width, 'Full-page capture target width must equal the page');
    requireClose(target.height, evidence.page.height, 'Full-page capture target height must equal the page');
  }
  return { target, viewport, resolution };
}

function readPngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return {
    format: 'png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isStartOfFrame = (
      marker >= 0xc0 && marker <= 0xc3 ||
      marker >= 0xc5 && marker <= 0xc7 ||
      marker >= 0xc9 && marker <= 0xcb ||
      marker >= 0xcd && marker <= 0xcf
    );
    if (isStartOfFrame && length >= 7) {
      return {
        format: 'jpeg',
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3)
      };
    }
    offset += length;
  }
  return null;
}

function readImageArtifact(filePath) {
  const resolvedPath = path.resolve(filePath);
  let image;
  try {
    image = fs.readFileSync(resolvedPath);
  } catch (error) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_READ_FAILED',
      'Unable to read the Browser capture image'
    );
  }
  if (image.length === 0) {
    throw createArtifactError('CAPTURE_ARTIFACT_INVALID', 'Browser capture image is empty');
  }
  if (image.length > MAX_CAPTURE_BYTES) {
    throw createArtifactError('CAPTURE_TOO_LARGE', 'Browser capture image exceeds the 8 MB limit');
  }
  const dimensions = readPngDimensions(image) || readJpegDimensions(image);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_FORMAT_UNSUPPORTED',
      'Browser capture image must be a valid PNG or JPEG'
    );
  }
  return {
    output: resolvedPath,
    format: dimensions.format,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: image.length,
    sha256: crypto.createHash('sha256').update(image).digest('hex')
  };
}

function validateImageDimensions(image, geometry, evidence, preparation) {
  const cssWidth = evidence.mode === 'full-page' && evidence.page
    ? evidence.page.width
    : evidence.mode === 'viewport' ? evidence.viewport.width : geometry.target.width;
  const cssHeight = evidence.mode === 'full-page' && evidence.page
    ? evidence.page.height
    : evidence.mode === 'viewport' ? evidence.viewport.height : geometry.target.height;
  const dpr = evidence.devicePixelRatio || preparation.devicePixelRatio || 1;
  const cssMatch = closeEnough(image.width, cssWidth) && closeEnough(image.height, cssHeight);
  const deviceMatch = closeEnough(image.width, cssWidth * dpr) && closeEnough(image.height, cssHeight * dpr);
  if (!cssMatch && !deviceMatch) {
    throw createArtifactError(
      'CAPTURE_ARTIFACT_DIMENSION_MISMATCH',
      'Browser capture image dimensions do not match the recorded CSS or device-pixel geometry'
    );
  }
  return cssMatch ? 1 : dpr;
}

function finalizeManifest(manifest, options) {
  const evidence = readEvidence(options.evidencePath);
  const geometry = validateEvidence(evidence, manifest.preparation);
  const image = readImageArtifact(options.outputPath);
  const pixelScale = validateImageDimensions(image, geometry, evidence, manifest.preparation);
  return Object.assign({}, manifest, {
    status: 'complete',
    completedAt: new Date().toISOString(),
    browser: normalizeBrowserName(options.browser),
    screenshot: Object.assign(image, {
      mode: evidence.mode,
      pixelScale
    }),
    evidence
  });
}

function failManifest(manifest, error) {
  return Object.assign({}, manifest, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    failure: {
      code: error && error.code || 'CAPTURE_ARTIFACT_FAILED',
      message: error && error.message || 'Browser capture artifact finalization failed'
    }
  });
}

module.exports = {
  ARTIFACT_KIND,
  ARTIFACT_SCHEMA_VERSION,
  createPreparedManifest,
  readPreparedManifest,
  finalizeManifest,
  failManifest,
  writeExistingManifest
};
