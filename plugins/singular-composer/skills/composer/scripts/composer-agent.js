#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const tinycolor = require('./runtime-dependencies').load('tinycolor2');
const uuid = require('./runtime-dependencies').load('uuid');
const WebSocket = require('./runtime-dependencies').load('ws');
const credentialSelection = require('./credential-selection');
const {
  captureCompositionPreview,
  createCaptureError,
  MAX_CAPTURE_BYTES
} = require('./capture-composition-preview');
const { createWidgetReferences } = require('./widget-script-references');

const DEFAULT_DEVICE_NAME = 'AI Agent';
const DEFAULT_SERVER_URL = 'https://beta.singular.live/';
const SKILL_VERSION = 50;
const DEFAULT_TIMEOUT_MS = 15000;
const PAIRING_INTENT_WAIT_MS = 2 * 60 * 1000;
const PAIRING_INTENT_RETRY_MS = 1100;
const CREDENTIALS_OVERRIDE_PATH = process.env.COMPOSER_AGENT_CREDENTIALS || null;
const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), '.singular', 'composer-agent.json');
const CREDENTIALS_SCOPE_PATH = path.resolve(__dirname, '..', '..', '..', '..');
const TEMPORARY_CREDENTIALS_PATH = path.join(
  os.tmpdir(),
  'singular-composer-agent',
  crypto.createHash('sha256').update(CREDENTIALS_SCOPE_PATH).digest('hex').slice(0, 16) + '.json'
);
let activeCredentialsPath = CREDENTIALS_OVERRIDE_PATH || DEFAULT_CREDENTIALS_PATH;
let skillUpdateWarningWritten = false;
const TABLE_WIDGET_ID = 1182;
const GRID_WIDGET_ID = 3284;
const MAX_TABLE_ROWS = 1000;
const MAX_TABLE_CONTENT_BYTES = 32 * 1024;
const TABLE_OPTION_FIELDS = [
  'layoutDirection',
  'elementsPerPage',
  'lineSpacing',
  'updateStyle',
  'pageTransitionStyle',
  'pageTransitionOffset',
  'showLayout',
  'currentPage'
];
const GRID_OPTION_FIELDS = [
  'cols', 'rows', 'colsSpacing', 'rowsSpacing', 'updateStyle',
  'pageTransitionStyle', 'pageTransitionOffset', 'showLayout', 'currentPage'
];

// Flags that may be passed with no value (default true) or with an explicit
// true/false value.
const BOOLEAN_OPTIONS = new Set([
  'compact',
  'selected',
  'selection',
  'summary',
  'italic',
  'underline',
  'always-execute',
  'create',
  'remove',
  'preview',
  'replace'
]);
const GLOBAL_COMMAND_OPTIONS = ['server', 'compact', 'template-session'];
let activeTemplateSessionToken = null;

function parseArguments(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument "${argument}"`);
    }
    const name = argument.slice(2);
    if (BOOLEAN_OPTIONS.has(name)) {
      const booleanValue = argv[index + 1];
      if (booleanValue === 'true' || booleanValue === 'false') {
        options[name] = booleanValue === 'true';
        index++;
      } else {
        options[name] = true;
      }
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }

    options[name] = value;
    index++;
  }
  return { command, options };
}

function readJsonFile(filePath, description) {
  const inputPath = path.resolve(filePath);
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    throw new Error(`Unable to read ${description}: ${err.message}`);
  }
}

function readJsonOptionFile(options, name, description, required) {
  const filePath = required
    ? requireOption(options, name)
    : options[name];
  if (filePath === undefined) return undefined;
  return readJsonFile(filePath, description);
}

function parseIds(value) {
  if (value.trim().startsWith('[')) {
    throw new Error('--ids accepts comma-separated IDs only; JSON arrays are not supported');
  }
  const ids = value.split(',').map(function (id) {
    return id.trim();
  }).filter(Boolean);
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('--ids must be a comma-separated list');
  }
  return ids;
}

function compactResult(command, result) {
  if (command === 'get' && result && result.widget) {
    return {
      elementType: result.elementType,
      managed: result.managed,
      element: {
        id: result.element.id,
        name: result.element.name,
        type: result.element.type,
        widget: result.element.widget,
        version: result.element.version,
        layout: result.element.layout,
        effects: result.element.effects,
        keyframes: result.element.keyframes
      },
      values: result.data,
      fields: (result.widget.fields || []).map(function (field) {
        // Dynamic effect choices/ranges cannot be recovered from primitives.
        if (result.widget.id === 4706 || result.widget.id === 4758) return field;
        return {
          id: field.id,
          title: field.title,
          type: field.type,
          runtime: field.runtime
        };
      }),
      subCompositions: result.widget.subCompositions || []
    };
  }
  return result;
}

function createWidgetTemplateIdentityScope(options) {
  const scope = {
    kind: 'widget-template-edit-session',
    lifetime: 'current-open-template-only',
    discardAfter: ['leave-template', 'reopen-template', 'later-task-or-turn'],
    internalIds: [
      'compositionId',
      'descendantElementIds',
      'controlNodeKeyIds',
      'widgetNodeKeyIds',
      'linkLocations'
    ],
    widgetNodeAddressing: 'declared-field-id'
  };
  if (options && options.compositionId) {
    scope.sessionCompositionId = options.compositionId;
  }
  if (options && options.sessionToken) {
    scope.sessionToken = options.sessionToken;
    scope.requiredOption = '--template-session';
    scope.enforcement = {
      missing: 'WIDGET_TEMPLATE_SESSION_REQUIRED',
      stale: 'WIDGET_TEMPLATE_SESSION_STALE'
    };
  }
  if (options && options.widgetTileId && options.widgetFieldId) {
    scope.durableLocator = {
      widgetTileId: options.widgetTileId,
      widgetFieldId: options.widgetFieldId
    };
  }
  return scope;
}

function addWidgetTemplateIdentityScope(result, options) {
  if (!result || typeof result !== 'object') return result;
  result.identityScope = createWidgetTemplateIdentityScope(options || {});
  return result;
}

function writeWorkLifecycleReminder(command, succeeded) {
  if (!command || command === 'pair' || command === 'pair-intent') return;

  if (command === 'finish-work' && succeeded) {
    console.error('COMPOSER_WORK_RELEASED: Composer input is unlocked.');
    return;
  }

  if (command === 'complete' && succeeded) {
    console.error('COMPOSER_AUTHORIZATION_REVOKED: Composer work is released and the saved authorization is revoked.');
    return;
  }

  console.error(
    'COMPOSER_FINALIZATION_REQUIRED: If start-work succeeded in this task, run finish-work before yielding.'
  );
}

function requireOption(options, name) {
  if (!options[name]) {
    throw new Error(`--${name} is required`);
  }
  return options[name];
}

function assertAllowedOptions(options, allowed, command) {
  Object.keys(options).forEach(function (name) {
    if (!allowed.includes(name) && !GLOBAL_COMMAND_OPTIONS.includes(name)) {
      throw new Error(`--${name} is not available for ${command}`);
    }
  });
}

function requireBooleanOption(options, name) {
  const value = requireOption(options, name);
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`--${name} must be "true" or "false"`);
}

// Directional effects take a named direction; dial effects take a numeric angle.
function parseAnimationProperty(raw) {
  const numeric = Number(raw);
  return raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw;
}

function normalizeServerUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('--server must use http or https');
  }
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function validatePairedServerOption(options) {
  if (options.server === undefined) return;
  const requestedServer = normalizeServerUrl(options.server);
  const pairedServer = normalizeServerUrl(readCredentials().server);
  if (requestedServer !== pairedServer) {
    throw new Error('--server must match the paired Composer server. Pair with the requested server first.');
  }
}

function readCredentials() {
  const candidates = CREDENTIALS_OVERRIDE_PATH
    ? [CREDENTIALS_OVERRIDE_PATH]
    : [DEFAULT_CREDENTIALS_PATH, TEMPORARY_CREDENTIALS_PATH];
  const availableCredentials = [];
  let expiredCredentialsFound = false;
  let incompleteCredentialsFound = false;
  for (const candidate of candidates) {
    let candidateCredentials;
    try {
      candidateCredentials = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      if (!CREDENTIALS_OVERRIDE_PATH && candidate === DEFAULT_CREDENTIALS_PATH &&
          isCredentialPermissionError(err)) continue;
      const credentialCategory = CREDENTIALS_OVERRIDE_PATH
        ? 'configured'
        : candidate === TEMPORARY_CREDENTIALS_PATH ? 'temporary' : 'default';
      const readError = new Error(
        `Unable to read Composer credentials from the ${credentialCategory} credential location. ` +
        'Pair again or select a valid writable COMPOSER_AGENT_CREDENTIALS file.'
      );
      readError.code = 'CREDENTIAL_READ_FAILED';
      throw readError;
    }

    if (candidateCredentials.expiresAt &&
        new Date(candidateCredentials.expiresAt).getTime() <= Date.now()) {
      expiredCredentialsFound = true;
      if (candidate === TEMPORARY_CREDENTIALS_PATH) {
        activeCredentialsPath = candidate;
        removeTemporaryCredentials();
      }
      continue;
    }

    if (!credentialSelection.isCompleteCredential(candidateCredentials)) {
      incompleteCredentialsFound = true;
      continue;
    }
    availableCredentials.push({ path: candidate, credentials: candidateCredentials });
  }
  const selected = credentialSelection.selectNewestCredentialCandidate(availableCredentials);
  if (!selected) {
    if (expiredCredentialsFound) {
      throw new Error('Stored Composer credentials have expired. Pair again.');
    }
    if (incompleteCredentialsFound) {
      throw new Error('Stored Composer credentials are incomplete. Pair again.');
    }
    throw new Error('Composer is not paired. Run the pair command first.');
  }

  activeCredentialsPath = selected.path;
  return selected.credentials;
}

function isCredentialPermissionError(error) {
  return error && ['EACCES', 'EPERM', 'EROFS'].includes(error.code);
}

function writeCredentials(filePath, credentials) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    filePath,
    JSON.stringify(credentials, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );
}

function saveCredentials(credentials) {
  const requestedPath = CREDENTIALS_OVERRIDE_PATH || DEFAULT_CREDENTIALS_PATH;
  try {
    writeCredentials(requestedPath, credentials);
    activeCredentialsPath = requestedPath;
    return CREDENTIALS_OVERRIDE_PATH ? 'override' : 'default';
  } catch (error) {
    if (CREDENTIALS_OVERRIDE_PATH || !isCredentialPermissionError(error)) {
      const writeError = new Error(
        'Unable to write Composer credentials to the configured credential path. ' +
        'Choose a writable COMPOSER_AGENT_CREDENTIALS location and pair again.'
      );
      writeError.code = 'CREDENTIAL_WRITE_FAILED';
      throw writeError;
    }
  }

  try {
    writeCredentials(TEMPORARY_CREDENTIALS_PATH, credentials);
    activeCredentialsPath = TEMPORARY_CREDENTIALS_PATH;
    return 'temporary';
  } catch (error) {
    const writeError = new Error(
      'Unable to write Composer credentials to the default or temporary credential location. ' +
      'Set COMPOSER_AGENT_CREDENTIALS to a writable file and pair again.'
    );
    writeError.code = 'CREDENTIAL_WRITE_FAILED';
    throw writeError;
  }
}

function removeTemporaryCredentials() {
  if (activeCredentialsPath !== TEMPORARY_CREDENTIALS_PATH) return;
  try {
    fs.unlinkSync(TEMPORARY_CREDENTIALS_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const cleanupError = new Error('Unable to remove temporary Composer credentials after completion.');
      cleanupError.code = 'CREDENTIAL_CLEANUP_FAILED';
      throw cleanupError;
    }
  }
}

async function parseErrorResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch (err) {
    return `Request failed with status ${response.status}`;
  }
  return body && body.error && body.error.message
    ? body.error.message
    : `Request failed with status ${response.status}`;
}

async function pair(options) {
  const server = normalizeServerUrl(options.server || DEFAULT_SERVER_URL);
  const code = requireOption(options, 'code').toUpperCase();
  const response = await fetch(server + '/composer-agent/pairing/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: code,
      deviceName: options['device-name'] || DEFAULT_DEVICE_NAME
    })
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return finishPairing(server, await response.json());
}

async function pairIntent(options) {
  const server = normalizeServerUrl(options.server || DEFAULT_SERVER_URL);
  const intentId = requireOption(options, 'intent-id');
  const intentSecret = readIntentSecret(options);
  const deadline = Date.now() + PAIRING_INTENT_WAIT_MS;

  while (true) {
    const response = await fetch(server + '/composer-agent/pairing/claim-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intentId: intentId,
        intentSecret: intentSecret,
        deviceName: options['device-name'] || DEFAULT_DEVICE_NAME
      })
    });

    if (response.ok) {
      return finishPairing(server, await response.json());
    }
    if (response.status !== 409 && response.status !== 429) {
      throw new Error(await parseErrorResponse(response));
    }
    if (Date.now() + PAIRING_INTENT_RETRY_MS > deadline) {
      throw new Error('Timed out waiting for Composer to bind the pairing intent');
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, PAIRING_INTENT_RETRY_MS);
    });
  }
}

// The intent secret is a credential. Only accept inputs that keep it out of
// the process argument list and shell history: COMPOSER_AGENT_INTENT_SECRET or
// `--intent-secret -` with the secret piped through stdin.
function readIntentSecret(options) {
  const flagValue = options['intent-secret'];
  if (flagValue === '-') {
    const stdinValue = fs.readFileSync(0, 'utf8').trim();
    if (!stdinValue) {
      throw new Error('--intent-secret - requires the intent secret on stdin');
    }
    return stdinValue;
  }
  if (flagValue !== undefined) {
    throw new Error('--intent-secret only accepts "-"; use stdin or COMPOSER_AGENT_INTENT_SECRET');
  }
  const envValue = process.env.COMPOSER_AGENT_INTENT_SECRET;
  if (envValue) return envValue;
  throw new Error(
    'intent secret is required: set COMPOSER_AGENT_INTENT_SECRET or pass --intent-secret - with the secret on stdin'
  );
}

async function finishPairing(server, pairing) {
  const credentialStorage = saveCredentials({
    server: server,
    accessToken: pairing.accessToken,
    socketPath: pairing.socketPath,
    sceneId: pairing.sceneId,
    sceneName: pairing.sceneName,
    capabilities: pairing.capabilities,
    pairedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + pairing.expiresIn * 1000).toISOString()
  });

  let acknowledged = false;
  try {
    await sendSessionMessage(null, 'pairing_acknowledged');
    acknowledged = true;
  } catch (err) {
    // Pair credentials are still useful if the editor is reconnecting. The
    // caller can see that the Composer acknowledgement was not delivered.
  }

  console.log(JSON.stringify({
    paired: true,
    acknowledged: acknowledged,
    sceneId: pairing.sceneId,
    sceneName: pairing.sceneName,
    capabilities: pairing.capabilities,
    credentialStorage: credentialStorage,
    expiresIn: pairing.expiresIn
  }, null, 2));
}

function createSocketUrl(credentials) {
  const socketUrl = new URL(credentials.socketPath, credentials.server);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return socketUrl.toString();
}

function warnIfSkillUpdateAvailable(authentication) {
  const serverVersion = authentication && authentication.composerAgentVersion;
  if (
    skillUpdateWarningWritten ||
    !Number.isInteger(serverVersion) ||
    serverVersion <= SKILL_VERSION
  ) {
    return;
  }
  skillUpdateWarningWritten = true;
  console.error(
    `COMPOSER_SKILL_UPDATE_AVAILABLE: Composer server version ${serverVersion} is newer than downloaded skill version ${SKILL_VERSION}. Download the latest Composer skill.`
  );
}

function sendSessionMessage(message, acknowledgementType) {
  const credentials = readCredentials();
  const activityId = message && message.type === 'activity' ? uuid.v4() : null;
  const outgoingMessage = activityId
    ? Object.assign({}, message, { activityId: activityId })
    : message;

  return new Promise(function (resolve, reject) {
    const socket = new WebSocket(createSocketUrl(credentials));
    let settled = false;
    const timeout = setTimeout(function () {
      finish(new Error('Timed out waiting for the open Composer session'));
    }, DEFAULT_TIMEOUT_MS);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000);
      }
      if (err) reject(err);
      else resolve(result);
    }

    socket.on('open', function () {
      socket.send(JSON.stringify({
        type: 'authenticate',
        token: credentials.accessToken
      }));
    });

    socket.on('message', function (rawMessage) {
      let response;
      try {
        response = JSON.parse(rawMessage.toString());
      } catch (err) {
        finish(new Error('Composer relay returned invalid JSON'));
        return;
      }
      if (response.type === 'authenticated') {
        warnIfSkillUpdateAvailable(response);
        if (outgoingMessage) socket.send(JSON.stringify(outgoingMessage));
      } else if (
        response.type === acknowledgementType &&
        (!activityId || response.activityId === activityId)
      ) {
        finish(null, { sent: true });
      } else if (response.type === 'session_cancelled') {
        const cancelledError = new Error('Composer operation was canceled by the user. Pair again.');
        cancelledError.code = 'SESSION_CANCELLED';
        finish(cancelledError);
      } else if (response.type === 'operation_cancelled') {
        const interruptedError = new Error('Composer operation was canceled by the user.');
        interruptedError.code = 'OPERATION_CANCELLED';
        finish(interruptedError);
      } else if (response.type === 'error') {
        finish(new Error(response.error && response.error.message
          ? response.error.message
          : 'Composer relay error'));
      }
    });

    socket.on('error', function (err) {
      finish(new Error(`Unable to connect to Composer: ${err.message}`));
    });

    socket.on('close', function (code, reason) {
      if (!settled) {
        const detail = reason ? `: ${reason.toString()}` : '';
        finish(new Error('Composer connection closed' + detail + ` (code ${code})`));
      }
    });
  });
}

function executeCommand(method, params, commandTimeoutMs) {
  const credentials = readCredentials();
  const request = {
    id: uuid.v4(),
    method: method,
    params: params || {}
  };
  if (activeTemplateSessionToken) {
    request.templateSessionToken = activeTemplateSessionToken;
  }

  return new Promise(function (resolve, reject) {
    const socket = new WebSocket(createSocketUrl(credentials));
    let authenticated = false;
    let settled = false;
    const timeout = setTimeout(function () {
      finish(new Error('Timed out waiting for the open Composer session'));
    }, commandTimeoutMs || DEFAULT_TIMEOUT_MS);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000);
      }
      if (err) reject(err);
      else resolve(result);
    }

    socket.on('open', function () {
      socket.send(JSON.stringify({
        type: 'authenticate',
        token: credentials.accessToken
      }));
    });

    socket.on('message', function (rawMessage) {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch (err) {
        finish(new Error('Composer relay returned invalid JSON'));
        return;
      }

      if (message.type === 'authenticated') {
        authenticated = true;
        warnIfSkillUpdateAvailable(message);
        socket.send(JSON.stringify({ type: 'command', request: request }));
      } else if (
        message.type === 'response' &&
        message.response &&
        message.response.id === request.id
      ) {
        if (message.response.error) {
          const commandError = new Error(message.response.error.message || 'Composer command failed');
          commandError.code = message.response.error.code;
          finish(commandError);
        } else {
          finish(null, message.response.result);
        }
      } else if (
        message.type === 'editor_status' &&
        message.status === 'disconnected'
      ) {
        finish(new Error('The paired Composer session is not open'));
      } else if (message.type === 'session_cancelled') {
        const cancelledError = new Error('Composer operation was canceled by the user. Pair again.');
        cancelledError.code = 'SESSION_CANCELLED';
        finish(cancelledError);
      } else if (message.type === 'operation_cancelled') {
        const interruptedError = new Error('Composer operation was canceled by the user.');
        interruptedError.code = 'OPERATION_CANCELLED';
        finish(interruptedError);
      } else if (message.type === 'error') {
        finish(new Error(message.error && message.error.message
          ? message.error.message
          : 'Composer relay error'));
      }
    });

    socket.on('error', function (err) {
      finish(new Error(`Unable to connect to Composer: ${err.message}`));
    });

    socket.on('close', function (code, reason) {
      if (!settled) {
        const detail = reason ? `: ${reason.toString()}` : '';
        const prefix = authenticated
          ? 'Composer connection closed'
          : 'Composer authentication failed';
        finish(new Error(prefix + detail + ` (code ${code})`));
      }
    });
  });
}

function getElementParams(options) {
  const elementType = requireOption(options, 'type');
  if (elementType !== 'tile' && elementType !== 'group') {
    throw new Error('--type must be "tile" or "group"');
  }
  return {
    elementType: elementType,
    id: requireOption(options, 'id')
  };
}

function requireWidgetTile(result, id) {
  if (!result || result.elementType !== 'tile' || !result.element || result.element.type !== 'widget') {
    throw new Error(`tile "${id}" is not a widget`);
  }
  return result;
}

function selectWidgetSubComposition(result, options, allowUnassigned) {
  const subCompositions = result.widget && Array.isArray(result.widget.subCompositions)
    ? result.widget.subCompositions
    : [];
  const fieldId = options.field;
  const matches = fieldId
    ? subCompositions.filter(function (item) { return item.fieldId === fieldId; })
    : subCompositions;
  if (matches.length === 0) {
    throw new Error(fieldId
      ? `widget tile "${result.element.id}" has no sub-composition field "${fieldId}"`
      : `widget tile "${result.element.id}" has no sub-compositions`);
  }
  if (matches.length > 1) {
    throw new Error(`widget tile "${result.element.id}" has multiple sub-compositions; pass --field`);
  }
  const selected = matches[0];
  if (selected.compositionId && !selected.exists) {
    throw new Error(
      `widget sub-composition "${selected.fieldId}" on tile "${result.element.id}" references a missing composition`
    );
  }
  if (!selected.compositionId && !allowUnassigned) {
    throw new Error(
      `widget sub-composition "${selected.fieldId}" on tile "${result.element.id}" is not assigned`
    );
  }
  return selected;
}

async function inspectWidgetSubCompositions(options) {
  const id = requireOption(options, 'id');
  const result = requireWidgetTile(await executeCommand('element.get', {
    elementType: 'tile',
    id: id
  }), id);
  return {
    tile: {
      id: result.element.id,
      name: result.element.name,
      widget: result.widget && result.widget.id,
      version: result.widget && result.widget.version
    },
    subCompositions: result.widget && result.widget.subCompositions || []
  };
}

async function openWidgetSubComposition(options) {
  const id = requireOption(options, 'id');
  const result = requireWidgetTile(await executeCommand('element.get', {
    elementType: 'tile',
    id: id
  }), id);
  const subComposition = selectWidgetSubComposition(result, options, options.create === true);
  const opened = await executeCommand('composition.open', {
    widgetTileId: result.element.id,
    fieldId: subComposition.fieldId,
    createIfMissing: true
  });
  const relationship = opened && opened.widgetSubComposition;
  const scoped = addWidgetTemplateIdentityScope(opened, {
    compositionId: relationship && relationship.compositionId,
    widgetTileId: result.element.id,
    widgetFieldId: subComposition.fieldId,
    sessionToken: relationship && relationship.sessionToken
  });
  if (relationship) delete relationship.sessionToken;
  return scoped;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validateTableControlValue(control, value, pathLabel, widgetLabel = 'table') {
  if (!['text', 'image', 'number', 'color'].includes(control.type)) {
    throw new Error(`${widgetLabel} template control "${control.id}" has unsupported type "${control.type}"`);
  }
  if ((control.type === 'text' || control.type === 'image') && typeof value !== 'string') {
    throw new Error(`${pathLabel} must be a string for ${control.type} control "${control.id}"`);
  }
  if (control.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${pathLabel} must be a finite number for control "${control.id}"`);
  }
  if (
    control.type === 'color' &&
    !tinycolor(value).isValid()
  ) {
    throw new Error(`${pathLabel} must be a tinycolor2-compatible value for control "${control.id}"`);
  }
}

function validateTableOption(name, value) {
  if (name === 'layoutDirection' && !['horizontal', 'vertical'].includes(value)) {
    throw new Error('options.layoutDirection must be "horizontal" or "vertical"');
  }
  if (name === 'updateStyle' && !['update', 'timeline'].includes(value)) {
    throw new Error('options.updateStyle must be "update" or "timeline"');
  }
  if (
    name === 'pageTransitionStyle' &&
    !['topToBottom', 'bottomToTop', 'random'].includes(value)
  ) {
    throw new Error('options.pageTransitionStyle is invalid');
  }
  if (name === 'showLayout' && typeof value !== 'boolean') {
    throw new Error('options.showLayout must be a boolean');
  }
  if (name === 'elementsPerPage') {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
      throw new Error('options.elementsPerPage must be an integer from 1 to 100');
    }
  }
  if (name === 'lineSpacing' || name === 'pageTransitionOffset') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`options.${name} must be a non-negative number`);
    }
  }
  if (name === 'currentPage') {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new Error('options.currentPage must be a non-negative integer');
    }
  }
}

function validateGridOption(name, value) {
  if (name === 'showLayout' || name === 'updateStyle') {
    return validateTableOption(name, value);
  }
  if (name === 'pageTransitionStyle') {
    if (!['topToBottom', 'bottomToTop', 'leftToRight', 'rightToLeft', 'random'].includes(value)) {
      throw new Error('options.pageTransitionStyle is invalid');
    }
    return;
  }
  if (typeof value === 'string' && Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_TABLE_CONTENT_BYTES) {
    throw new Error(`options.${name} exceeds the 32 KB widget-data limit`);
  }
  const numeric = Number(value);
  if (!['string', 'number'].includes(typeof value) ||
      (typeof value === 'string' && !value.trim()) || !Number.isFinite(numeric)) {
    throw new Error(`options.${name} must be a finite number or numeric string`);
  }
  const limits = {
    cols: [1, 100], rows: [1, 100], colsSpacing: [-100, 100], rowsSpacing: [-100, 100],
    pageTransitionOffset: [0, 30], currentPage: [0, 99]
  };
  const range = limits[name];
  if (!range || numeric < range[0] || numeric > range[1] ||
      (['cols', 'rows', 'currentPage'].includes(name) && !Number.isInteger(numeric))) {
    throw new Error(`options.${name} is outside the supported Grid range`);
  }
}

function normalizeTableOption(currentValue, value, name, isGrid) {
  (isGrid ? validateGridOption : validateTableOption)(name, value);
  if (typeof currentValue === 'string') return String(value);
  if (typeof currentValue === 'boolean' && typeof value === 'boolean') return value;
  if (typeof currentValue === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`options.${name} must preserve the ${isGrid ? 'grid' : 'table'} widget's current runtime type`);
}

async function updateTable(options, isGrid = false) {
  const widgetTitle = isGrid ? 'Grid' : 'Table';
  const widgetLabel = widgetTitle.toLowerCase();
  const id = requireOption(options, 'id');
  const specification = readJsonFile(requireOption(options, 'file'), `${widgetLabel} specification`);
  if (!isPlainObject(specification) || !Array.isArray(specification.rows)) {
    throw new Error(`${widgetLabel} specification must contain a rows array`);
  }
  if (specification.rows.length > MAX_TABLE_ROWS) {
    throw new Error(`${widgetLabel} specification supports at most ${MAX_TABLE_ROWS} rows`);
  }
  const table = requireWidgetTile(await executeCommand('element.get', {
    elementType: 'tile',
    id: id
  }), id);
  if (!table.widget || (isGrid ? table.widget.id !== GRID_WIDGET_ID :
    (table.widget.id !== TABLE_WIDGET_ID && table.widget.name !== 'Table'))) {
    throw new Error(`widget tile "${id}" is not a supported ${widgetTitle} widget`);
  }
  const subComposition = selectWidgetSubComposition(table, { field: 'composition' });
  const controls = Array.isArray(subComposition.controls) ? subComposition.controls : [];
  const controlsById = new Map();
  controls.forEach(function (control) {
    if (!control.id || controlsById.has(control.id)) {
      throw new Error(`the ${widgetLabel} template exposes duplicate or unnamed control nodes`);
    }
    controlsById.set(control.id, control);
  });
  specification.rows.forEach(function (row, rowIndex) {
    if (!isPlainObject(row)) {
      throw new Error(`rows[${rowIndex}] must be an object`);
    }
    const keys = Object.keys(row);
    keys.forEach(function (key) {
      if (!controlsById.has(key)) {
        throw new Error(`rows[${rowIndex}].${key} is not exposed by the ${widgetLabel} template`);
      }
      validateTableControlValue(controlsById.get(key), row[key], `rows[${rowIndex}].${key}`, widgetLabel);
    });
    controls.forEach(function (control) {
      if (!Object.prototype.hasOwnProperty.call(row, control.id)) {
        throw new Error(`rows[${rowIndex}] is missing template control "${control.id}"`);
      }
    });
  });

  const tableContent = JSON.stringify({ content: specification.rows }, null, 2);
  if (Buffer.byteLength(tableContent, 'utf8') > MAX_TABLE_CONTENT_BYTES) {
    throw new Error(`serialized ${widgetLabel} content exceeds the 32 KB widget-data limit`);
  }
  const requestedOptions = specification.options === undefined ? {} : specification.options;
  if (!isPlainObject(requestedOptions)) {
    throw new Error(`${widgetLabel} specification options must be an object`);
  }
  Object.keys(requestedOptions).forEach(function (name) {
    if (!(isGrid ? GRID_OPTION_FIELDS : TABLE_OPTION_FIELDS).includes(name)) {
      throw new Error(`unsupported ${widgetLabel} option "${name}"`);
    }
  });
  const updates = Object.keys(requestedOptions).map(function (name) {
    if (!Object.prototype.hasOwnProperty.call(table.data, name)) {
      throw new Error(`${widgetLabel} widget has no data field "${name}"`);
    }
    return {
      name: name,
      previous: table.data[name],
      value: normalizeTableOption(table.data[name], requestedOptions[name], name, isGrid)
    };
  });
  if (isGrid) {
    const cols = requestedOptions.cols === undefined ? table.data.cols : requestedOptions.cols;
    const rows = requestedOptions.rows === undefined ? table.data.rows : requestedOptions.rows;
    validateGridOption('cols', cols);
    validateGridOption('rows', rows);
    if (Number(cols) * Number(rows) > 1000) {
      throw new Error('Grid supports at most 1,000 visible cells (options.cols * options.rows)');
    }
    // A dimension swap may otherwise briefly exceed the renderer's allocation
    // cap. Apply shrinking dimensions before growing dimensions.
    updates.sort((a, b) => {
      const rank = update => ['cols', 'rows'].includes(update.name)
        ? (Number(update.value) <= Number(update.previous) ? -1 : 1) : 0;
      return rank(a) - rank(b);
    });
  }
  updates.push({
    name: 'tableContent',
    previous: table.data.tableContent,
    value: tableContent
  });

  const applied = [];
  try {
    for (const update of updates) {
      await executeCommand('element.update', {
        elementType: 'tile',
        id: id,
        namespace: 'data',
        path: update.name,
        value: update.value
      });
      applied.push(update);
    }
  } catch (err) {
    const rollbackErrors = [];
    for (const update of applied.reverse()) {
      try {
        await executeCommand('element.update', {
          elementType: 'tile',
          id: id,
          namespace: 'data',
          path: update.name,
          value: update.previous
        });
      } catch (rollbackError) {
        rollbackErrors.push(update.name);
      }
    }
    if (rollbackErrors.length) {
      throw new Error(`${err.message}; rollback failed for: ${rollbackErrors.join(', ')}`);
    }
    throw err;
  }

  const verified = await executeCommand('element.get', { elementType: 'tile', id: id });
  return {
    [isGrid ? 'grid' : 'table']: { id: id, name: verified.element.name, widget: verified.widget.id },
    widgetSubComposition: subComposition,
    rows: specification.rows.length,
    options: Object.keys(requestedOptions).reduce(function (result, name) {
      result[name] = verified.data[name];
      return result;
    }, {}),
    tableContent: verified.data.tableContent
  };
}

function parseCaptureSeconds(options, name, defaultValue, allowZero) {
  if (options[name] === undefined) return defaultValue;
  const value = Number(options[name]);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`--${name} must be ${allowZero ? 'a non-negative' : 'a positive'} number of seconds`);
  }
  return value;
}

function normalizeCaptureTarget(options) {
  const target = options.target || 'root';
  if (target !== 'root' && target !== 'active') {
    throw createCaptureError('INVALID_CAPTURE_TARGET', '--target must be "root" or "active"');
  }
  return target;
}

function validateCaptureServer(serverValue) {
  if (serverValue === undefined) return null;
  const requestedServer = normalizeServerUrl(serverValue);
  const pairedServer = normalizeServerUrl(readCredentials().server);
  if (requestedServer !== pairedServer) {
    throw createCaptureError(
      'CAPTURE_SERVER_MISMATCH',
      '--server must match the paired Composer server. Pair with the requested server before capturing.'
    );
  }
  return requestedServer;
}

function normalizeCaptureOptions(options) {
  assertAllowedOptions(
    options,
    ['target', 'output', 'measurements', 'timeout', 'settle', 'wait-mode', 'timeline', 'at', 'server', 'compact'],
    'capture'
  );
  validateCaptureServer(options.server);
  const target = normalizeCaptureTarget(options);
  const waitMode = options['wait-mode'] || 'smart';
  if (waitMode !== 'smart' && waitMode !== 'timed') {
    throw createCaptureError(
      'INVALID_CAPTURE_WAIT_MODE',
      '--wait-mode must be "smart" or "timed"'
    );
  }
  const hasTimeline = options.timeline !== undefined;
  const hasAt = options.at !== undefined;
  if (hasTimeline !== hasAt) {
    throw createCaptureError(
      'INVALID_CAPTURE_TIMELINE',
      '--timeline and --at must be provided together'
    );
  }
  let timeline = null;
  let atSeconds = null;
  if (hasTimeline) {
    timeline = options.timeline;
    if (timeline !== 'In' && timeline !== 'Out') {
      throw createCaptureError('INVALID_CAPTURE_TIMELINE', '--timeline must be "In" or "Out"');
    }
    atSeconds = parseCaptureSeconds(options, 'at', null, true);
    if (waitMode !== 'smart') {
      throw createCaptureError(
        'INVALID_CAPTURE_TIMELINE',
        'Timeline-position capture requires --wait-mode smart'
      );
    }
  }
  return {
    target: target,
    outputPath: requireOption(options, 'output'),
    measurementsPath: options.measurements || null,
    waitMode: waitMode,
    timeoutMs: parseCaptureSeconds(options, 'timeout', 30, false) * 1000,
    settleMs: parseCaptureSeconds(
      options,
      'settle',
      waitMode === 'timed' ? 2 : 0,
      true
    ) * 1000,
    timeline: timeline,
    atSeconds: atSeconds
  };
}

function getActiveCaptureTarget(inspection) {
  const activeComposition = inspection && inspection.activeComposition;
  const stack = activeComposition && activeComposition.stack;
  if (!Array.isArray(stack) || stack.length <= 1) {
    return { compositionId: null, widgetTileId: null };
  }
  const activeEntry = stack[stack.length - 1];
  return {
    compositionId: activeComposition.id || (activeEntry && activeEntry.id) || null,
    widgetTileId: activeComposition.widgetSubComposition &&
      activeComposition.widgetSubComposition.widgetTileId || null
  };
}

function validateCaptureFile(result) {
  if (!result || !result.output || !fs.existsSync(result.output)) {
    throw createCaptureError('CAPTURE_FAILED', 'Capture did not create the requested PNG');
  }
  const sizeBytes = fs.statSync(result.output).size;
  if (sizeBytes <= 0) {
    throw createCaptureError('CAPTURE_FAILED', 'Capture created an empty PNG');
  }
  if (sizeBytes > MAX_CAPTURE_BYTES) {
    throw createCaptureError('CAPTURE_TOO_LARGE', 'Composer preview capture exceeds the 8 MB limit');
  }
  result.sizeBytes = sizeBytes;
  return result;
}

async function captureStandalone(options) {
  const inspection = await executeCommand('composition.inspect');
  const preview = inspection && inspection.preview;
  if (!preview || !preview.compositionToken) {
    throw createCaptureError(
      'COMPOSITION_TOKEN_REQUIRED',
      'Standalone capture requires a Composition API token. Generate one in Composer and inspect again.'
    );
  }
  const activeTarget = options.target === 'active'
    ? getActiveCaptureTarget(inspection)
    : { compositionId: null, widgetTileId: null };
  if (activeTarget.widgetTileId) {
    const widgetScope = inspection.activeComposition &&
      inspection.activeComposition.widgetSubComposition;
    const currentToken = widgetScope && widgetScope.sessionToken;
    if (!activeTemplateSessionToken) {
      const error = new Error(
        'The active widget-owned template requires --template-session from its current inspect or open-widget-subcomposition result'
      );
      error.code = 'WIDGET_TEMPLATE_SESSION_REQUIRED';
      throw error;
    }
    if (!currentToken || activeTemplateSessionToken !== currentToken) {
      const error = new Error(
        'The supplied widget-template session does not match the active edit session; inspect the template and use its current token'
      );
      error.code = 'WIDGET_TEMPLATE_SESSION_STALE';
      throw error;
    }
  }
  const result = await captureCompositionPreview({
    endpoint: preview.endpoint,
    width: preview.width,
    height: preview.height,
    compositionToken: preview.compositionToken,
    outputPath: options.outputPath,
    measurementsPath: options.measurementsPath,
    target: options.target,
    compositionId: activeTarget.compositionId,
    widgetTileId: activeTarget.widgetTileId,
    waitMode: options.waitMode,
    timeoutMs: options.timeoutMs,
    settleMs: options.settleMs,
    timeline: options.timeline,
    atSeconds: options.atSeconds
  });
  result.editorResolution = { width: preview.width, height: preview.height };
  return validateCaptureFile(result);
}

function createActiveCompositionStructure(inspection) {
  const tiles = Array.isArray(inspection.tiles) ? inspection.tiles : [];
  const tileById = {};
  tiles.forEach(function (tile) {
    tileById[tile.id] = tile;
  });

  return {
    compName: inspection.activeComposition.name,
    compId: inspection.activeComposition.id,
    children: [],
    groups: (inspection.groups || []).map(function (group) {
      return {
        id: group.id,
        name: group.name,
        tiles: (group.itemIds || []).map(function (tileId) {
          return tileById[tileId];
        }).filter(Boolean)
      };
    }),
    tiles: tiles
  };
}

function createScriptControlContext(inspection, controlInspection) {
  const controlNode = controlInspection && controlInspection.controlNode;
  const fields = controlNode && Array.isArray(controlNode.fields)
    ? controlNode.fields
    : [];
  const links = controlInspection && Array.isArray(controlInspection.links)
    ? controlInspection.links
    : [];

  return {
    compName: inspection.activeComposition.name,
    compId: inspection.activeComposition.id,
    models: fields.map(function (field) {
      return {
        keyId: field.keyId,
        id: field.id,
        title: field.title || field.id,
        type: field.type,
        index: field.index,
        value: field.value
      };
    }),
    datalinks: links.map(function (link) {
      return {
        tileId: link.tileId,
        property: link.propertyId,
        link: {
          location: link.location,
          locationId: link.locationId,
          index: link.index,
          key: link.key,
          keyId: link.keyId,
          type: link.type
        }
      };
    }),
    noderefs: controlInspection && Array.isArray(controlInspection.nodeRefs)
      ? controlInspection.nodeRefs
      : []
  };
}

async function buildScriptHandoff(credentials, inspection) {
  const preview = inspection && inspection.preview;
  const inspectedActiveComposition = inspection && inspection.activeComposition;
  const activeComposition = inspectedActiveComposition && {
    ...inspectedActiveComposition,
    widgetSubComposition: inspectedActiveComposition.widgetSubComposition && {
      ...inspectedActiveComposition.widgetSubComposition
    }
  };
  if (activeComposition && activeComposition.widgetSubComposition) {
    delete activeComposition.widgetSubComposition.sessionToken;
  }
  if (!preview || !preview.endpoint || !preview.compositionToken) {
    throw new Error('The open composition does not expose a Composition API token');
  }
  if (!activeComposition || !activeComposition.id) {
    throw new Error('Composer did not report an active composition for script handoff');
  }

  const controlInspection = inspection.scriptControlContext ||
    await executeCommand('controlNode.inspect', {});
  const isRoot = Array.isArray(activeComposition.stack) &&
    activeComposition.stack.length === 1;
  const scriptNames = {
    global: 'Global Script',
    overlay: 'Overlay Script'
  };
  scriptNames[activeComposition.id] = activeComposition.name ||
    (isRoot ? 'Root Composition' : activeComposition.id);

  return {
    version: 1,
    kind: 'composer-agent-script-handoff',
    host: preview.endpoint,
    compositionToken: preview.compositionToken,
    composerAgentAccessToken: credentials.accessToken,
    scene: inspection.scene,
    preview: {
      width: preview.width,
      height: preview.height
    },
    activeComposition: activeComposition,
    mainComposition: isRoot ? activeComposition.id : null,
    suggestedScript: {
      id: activeComposition.id,
      name: scriptNames[activeComposition.id],
      type: isRoot ? 'root' : 'composition'
    },
    scriptIds: [activeComposition.id],
    scriptNames: scriptNames,
    compositionStructure: createActiveCompositionStructure(inspection),
    widgetReferences: createWidgetReferences(inspection.tiles),
    widgetNodes: inspection.scriptWidgetContext || null,
    modelsDataLinksNodeRefs: [
      createScriptControlContext(inspection, controlInspection)
    ],
    scope: 'active-composition'
  };
}

async function createScriptHandoff(options) {
  const credentials = readCredentials();
  const requestedOption = options && options['composition-id'];
  if (!requestedOption) {
    return buildScriptHandoff(credentials, await executeCommand('composition.inspect', {
      scriptHandoff: true
    }));
  }

  const originalInspection = await executeCommand('composition.inspect', {});
  const originalComposition = originalInspection && originalInspection.activeComposition;
  if (!originalComposition || !originalComposition.id) {
    throw new Error('Composer did not report an active composition before scoped script handoff');
  }
  if (originalComposition.widgetSubComposition) {
    throw new Error(
      '--composition-id cannot preserve a widget-owned editing scope because its composition ID ' +
      'may change on exit; return to root or an ordinary sub-composition first'
    );
  }
  const originalStack = Array.isArray(originalComposition.stack)
    ? originalComposition.stack
    : [];
  const requestedCompositionId = requestedOption === 'root'
    ? originalStack[0] && originalStack[0].id
    : requestedOption;
  if (!requestedCompositionId) {
    throw new Error('Composer did not report a root composition for scoped script handoff');
  }

  const shouldRestore = requestedCompositionId !== originalComposition.id;
  let handoff;
  let handoffError = null;
  let restoreError = null;

  try {
    if (shouldRestore) {
      const navigation = await executeCommand('composition.open', {
        id: requestedCompositionId,
        ordinaryOnly: true
      });
      const openedId = navigation && navigation.activeComposition && navigation.activeComposition.id;
      if (openedId !== requestedCompositionId) {
        throw new Error(`Composer did not open ordinary composition "${requestedCompositionId}"`);
      }
    }

    const inspection = await executeCommand('composition.inspect', {
      scriptHandoff: true
    });
    const activeComposition = inspection && inspection.activeComposition;
    if (!activeComposition || activeComposition.id !== requestedCompositionId) {
      throw new Error(`Composer did not inspect requested composition "${requestedCompositionId}"`);
    }
    if (activeComposition.widgetSubComposition) {
      throw new Error(
        '--composition-id supports root and ordinary sub-compositions only; ' +
        'use open-widget-subcomposition for widget-owned templates'
      );
    }
    handoff = await buildScriptHandoff(credentials, inspection);
  } catch (error) {
    handoffError = error;
  }

  if (shouldRestore) {
    try {
      const restoreTarget = originalStack.length === 1 ? 'root' : originalComposition.id;
      const restoration = await executeCommand('composition.open', { id: restoreTarget });
      const restoredId = restoration && restoration.activeComposition && restoration.activeComposition.id;
      if (restoredId !== originalComposition.id) {
        throw new Error(`Composer did not restore composition "${originalComposition.id}"`);
      }
    } catch (error) {
      restoreError = error;
    }
  }

  if (handoffError) {
    if (restoreError) {
      handoffError.message += `; navigation restoration also failed: ${restoreError.message}`;
    }
    throw handoffError;
  }
  if (restoreError) throw restoreError;
  return handoff;
}

let invokedCommand;

async function run() {
  const parsed = parseArguments(process.argv.slice(2));
  invokedCommand = parsed.command;
  activeTemplateSessionToken = parsed.options['template-session'] || null;
  let result;
  if (!['pair', 'pair-intent', 'capture'].includes(parsed.command)) {
    validatePairedServerOption(parsed.options);
  }

  switch (parsed.command) {
    case 'pair':
      await pair(parsed.options);
      return;
    case 'pair-intent':
      await pairIntent(parsed.options);
      return;
    case 'status':
      result = await sendSessionMessage({
        type: 'activity',
        message: requireOption(parsed.options, 'message')
      }, 'activity_sent');
      break;
    case 'start-work':
      result = await sendSessionMessage({ type: 'work_start' }, 'work_started');
      break;
    case 'finish-work':
      result = await sendSessionMessage({ type: 'work_finish' }, 'work_finished');
      break;
    case 'complete':
      result = await sendSessionMessage({ type: 'session_complete' }, 'session_completed');
      removeTemporaryCredentials();
      break;
    case 'inspect': {
      const params = {};
      if (parsed.options.selection) params.selection = true;
      if (parsed.options.summary) params.summary = true;
      result = await executeCommand('composition.inspect', params);
      // Fallback filtering keeps the flags working against servers that return
      // the full inspection payload instead of honoring the params.
      if (parsed.options.selection && result && result.selection) {
        result = { selection: result.selection };
      } else if (parsed.options.summary && result && result.summary) {
        result = { summary: result.summary };
      } else if (
        result && result.activeComposition &&
        result.activeComposition.widgetSubComposition
      ) {
        const owner = result.activeComposition.widgetSubComposition;
        const sessionToken = owner.sessionToken;
        result.activeComposition.identityScope = createWidgetTemplateIdentityScope({
          compositionId: result.activeComposition.id,
          widgetTileId: owner.widgetTileId,
          widgetFieldId: owner.widgetFieldId,
          sessionToken: sessionToken
        });
        delete owner.sessionToken;
      }
      break;
    }
    case 'script-handoff':
      assertAllowedOptions(parsed.options, ['composition-id', 'compact'], 'script-handoff');
      result = await createScriptHandoff(parsed.options);
      break;
    case 'control-composition': {
      const state = requireOption(parsed.options, 'state').toLowerCase();
      if (state !== 'in' && state !== 'out') {
        throw new Error('--state must be "in" or "out"');
      }
      result = await executeCommand('composition.control', {
        id: requireOption(parsed.options, 'id'),
        state: state === 'in' ? 'In' : 'Out'
      });
      break;
    }
    case 'create-composition': {
      const params = { name: requireOption(parsed.options, 'name') };
      if (parsed.options['group-id']) {
        params.groupId = parsed.options['group-id'];
      }
      result = await executeCommand('composition.create', params);
      break;
    }
    case 'orchestrate':
      result = await executeCommand(
        'composition.orchestrate',
        readJsonFile(requireOption(parsed.options, 'file'), 'composition orchestration manifest')
      );
      break;
    case 'create-revision':
      result = await executeCommand('composition.revision.create', {
        description: requireOption(parsed.options, 'description')
      });
      break;
    case 'list-revisions':
      result = await executeCommand('composition.revision.list', {});
      break;
    case 'read-revision':
      result = await executeCommand('composition.revision.read', {
        revisionId: requireOption(parsed.options, 'revision-id')
      });
      break;
    case 'compare-revision':
      result = await executeCommand('composition.revision.compare', {
        revisionId: requireOption(parsed.options, 'revision-id')
      });
      break;
    case 'restore-revision':
      result = await executeCommand('composition.revision.restore', {
        revisionId: requireOption(parsed.options, 'revision-id')
      });
      break;
    case 'delete-revision':
      result = await executeCommand('composition.revision.delete', {
        revisionId: requireOption(parsed.options, 'revision-id')
      });
      break;
    case 'delete-composition':
      result = await executeCommand('composition.delete', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    case 'open-composition':
      result = await executeCommand('composition.open', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    case 'widget-subcompositions':
      result = await inspectWidgetSubCompositions(parsed.options);
      break;
    case 'open-widget-subcomposition':
      result = await openWidgetSubComposition(parsed.options);
      break;
    case 'update-table':
      result = await updateTable(parsed.options);
      break;
    case 'update-grid':
      result = await updateTable(parsed.options, true);
      break;
    case 'timeline2':
      result = await executeCommand('composition.timeline2.set', {
        active: requireBooleanOption(parsed.options, 'active')
      });
      break;
    case 'control-nodes':
      result = await executeCommand('controlNode.inspect');
      break;
    case 'metric-fonts': {
      assertAllowedOptions(parsed.options, ['source', 'family', 'compact'], 'metric-fonts');
      result = await executeCommand('metricFonts.list', {
        source: parsed.options.source,
        family: parsed.options.family
      });
      break;
    }
    case 'widget-nodes': {
      assertAllowedOptions(parsed.options, ['source-composition', 'compact'], 'widget-nodes');
      result = await executeCommand('widgetNode.inspect', {
        sourceCompositionId: parsed.options['source-composition']
      });
      addWidgetTemplateIdentityScope(result, {
        compositionId: result && result.compositionId,
        sessionToken: activeTemplateSessionToken
      });
      break;
    }
    case 'link-widget-nodes':
    case 'unlink-widget-nodes': {
      assertAllowedOptions(parsed.options, ['file', 'compact'], parsed.command);
      const manifest = readJsonFile(requireOption(parsed.options, 'file'), 'Widget Node link specification');
      result = await executeCommand(parsed.command === 'link-widget-nodes' ? 'widgetNode.linkMany' : 'widgetNode.unlinkMany', {
        links: Array.isArray(manifest) ? manifest : manifest && manifest.links
      });
      addWidgetTemplateIdentityScope(result, {
        compositionId: result && result.compositionId,
        sessionToken: activeTemplateSessionToken
      });
      break;
    }
    case 'set-control-value': {
      assertAllowedOptions(parsed.options, ['id', 'value-file', 'compact'], 'set-control-value');
      result = await executeCommand('controlNode.value.set', {
        id: requireOption(parsed.options, 'id'),
        value: readJsonOptionFile(
          parsed.options,
          'value-file',
          'control-node value file',
          true
        )
      });
      break;
    }
    case 'press-control': {
      assertAllowedOptions(parsed.options, ['id', 'compact'], 'press-control');
      result = await executeCommand('controlNode.button.press', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    }
    case 'timer-action':
    case 'control-time': {
      assertAllowedOptions(parsed.options, ['id', 'action', 'compact'], parsed.command);
      const action = requireOption(parsed.options, 'action');
      if (!['start', 'play', 'pause', 'reset'].includes(action)) {
        throw new Error('--action must be "start", "play", "pause", or "reset"');
      }
      result = await executeCommand('controlNode.timeControl.control', {
        id: requireOption(parsed.options, 'id'),
        action: action
      });
      break;
    }
    case 'set-control-font': {
      assertAllowedOptions(parsed.options, [
        'id', 'family', 'weight', 'style', 'subset', 'font-source', 'compact'
      ], 'set-control-font');
      result = await executeCommand('controlNode.metricFont.set', {
        id: requireOption(parsed.options, 'id'),
        family: parsed.options.family,
        weight: parsed.options.weight,
        style: parsed.options.style,
        subset: parsed.options.subset,
        source: parsed.options['font-source']
      });
      break;
    }
    case 'create-table-control': {
      assertAllowedOptions(parsed.options, ['file', 'source-composition', 'compact'], 'create-table-control');
      const tableSpecification = readJsonFile(
        requireOption(parsed.options, 'file'),
        'Table Control Node specification'
      );
      result = await executeCommand(
        'controlNode.table.create',
        {
          ...tableSpecification,
          sourceCompositionId: parsed.options['source-composition']
        }
      );
      break;
    }
    case 'set-table-control': {
      assertAllowedOptions(parsed.options, ['id', 'file', 'compact'], 'set-table-control');
      const tableRows = readJsonFile(requireOption(parsed.options, 'file'), 'Table Control Node rows');
      result = await executeCommand('controlNode.table.set', {
        id: requireOption(parsed.options, 'id'),
        rows: Array.isArray(tableRows) ? tableRows : tableRows && tableRows.rows
      });
      break;
    }
    case 'update-table-control': {
      assertAllowedOptions(parsed.options, ['id', 'file', 'preview', 'compact'], 'update-table-control');
      const tableUpdate = readJsonFile(
        requireOption(parsed.options, 'file'),
        'Table Control Node update specification'
      );
      if (!tableUpdate || Array.isArray(tableUpdate) || typeof tableUpdate !== 'object') {
        throw new Error('Table Control Node update specification must be a JSON object');
      }
      result = await executeCommand('controlNode.table.update', {
        ...tableUpdate,
        id: requireOption(parsed.options, 'id'),
        preview: parsed.options.preview === true
      });
      break;
    }
    case 'link-table-control': {
      assertAllowedOptions(parsed.options, [
        'id', 'tile-id', 'property', 'source-composition', 'replace', 'compact'
      ], 'link-table-control');
      result = await executeCommand('controlNode.table.link', {
        id: requireOption(parsed.options, 'id'),
        tileId: requireOption(parsed.options, 'tile-id'),
        propertyId: requireOption(parsed.options, 'property'),
        sourceCompositionId: parsed.options['source-composition'],
        replace: parsed.options.replace === true
      });
      break;
    }
    case 'unlink-table-control': {
      assertAllowedOptions(parsed.options, ['tile-id', 'property', 'compact'], 'unlink-table-control');
      result = await executeCommand('controlNode.table.unlink', {
        tileId: requireOption(parsed.options, 'tile-id'),
        propertyId: requireOption(parsed.options, 'property')
      });
      break;
    }
    case 'update-control': {
      const patch = readJsonFile(
        requireOption(parsed.options, 'file'),
        'control node metadata patch'
      );
      result = await executeCommand('controlNode.metadata.update', {
        id: requireOption(parsed.options, 'id'),
        patch: patch
      });
      break;
    }
    case 'create-control-container': {
      assertAllowedOptions(parsed.options, ['file', 'compact'], 'create-control-container');
      result = await executeCommand('controlNode.container.create', readJsonFile(
        requireOption(parsed.options, 'file'), 'Control Node container specification'
      ));
      break;
    }
    case 'configure-control-container': {
      assertAllowedOptions(parsed.options, ['id', 'file', 'compact'], 'configure-control-container');
      result = await executeCommand('controlNode.container.configure', {
        ...readJsonFile(requireOption(parsed.options, 'file'), 'Control Node container configuration'),
        id: requireOption(parsed.options, 'id')
      });
      break;
    }
    case 'delete-control-container': {
      assertAllowedOptions(parsed.options, ['id', 'compact'], 'delete-control-container');
      result = await executeCommand('controlNode.container.delete', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    }
    case 'create-control': {
      assertAllowedOptions(parsed.options, [
        'name', 'node-type', 'target', 'tile-id', 'element-type',
        'element-id', 'property', 'value-file', 'info-mode', 'replace',
        'source-composition', 'options-file', 'options-url', 'use-reload',
        'family', 'weight', 'style', 'subset', 'font-source', 'compact'
      ], 'create-control');
      const type = requireOption(parsed.options, 'node-type');
      if (![
        'text', 'textarea', 'number', 'normalizednumber', 'counter', 'color',
        'image', 'checkbox', 'audio', 'video', 'data', 'jsonfile', 'json', 'datetime', 'location', 'selection', 'button', 'timecontrol', 'infotext', 'metricfont'
      ].includes(type)) {
        throw new Error(
          '--node-type must be "text", "textarea", "number", "normalizednumber", ' +
          '"counter", "color", "image", "checkbox", "audio", "video", "data", ' +
          '"jsonfile", "json", "datetime", "location", "selection", "button", "timecontrol", "infotext", or "metricfont"'
        );
      }
      const target = parsed.options.target || (parsed.options['element-id'] ? 'layout' : 'data');
      if (!['data', 'layout', 'standalone'].includes(target)) {
        throw new Error('--target must be "data", "layout", or "standalone"');
      }
      if (target === 'standalone' && !['button', 'timecontrol', 'metricfont'].includes(type)) {
        requireOption(parsed.options, 'value-file');
      }
      const metricFontOptions = ['family', 'weight', 'style', 'subset', 'font-source'];
      const hasMetricFontOptions = metricFontOptions.some(function (option) {
        return parsed.options[option] !== undefined;
      });
      if (type === 'metricfont') {
        if (parsed.options['value-file'] !== undefined) {
          throw new Error('Metric Font creation accepts font flags instead of --value-file');
        }
        if (target !== 'standalone' && hasMetricFontOptions) {
          throw new Error('Linked Metric Font controls copy the target value and do not accept font flags');
        }
      } else if (hasMetricFontOptions) {
        throw new Error('Metric Font flags require a Metric Font control');
      }
      if (type === 'button' && target !== 'standalone') {
        throw new Error('Button requires --target standalone');
      }
      if (type === 'button' && parsed.options['value-file'] !== undefined) {
        throw new Error('Button creation does not accept --value-file');
      }
      if (type === 'timecontrol' && target === 'standalone' && parsed.options['value-file'] !== undefined) {
        throw new Error('Time Control creation does not accept --value-file');
      }
      if (type === 'infotext') {
        if (target !== 'standalone') throw new Error('Info Text requires --target standalone');
        requireOption(parsed.options, 'info-mode');
      } else if (parsed.options['info-mode'] !== undefined) {
        throw new Error('--info-mode is only supported for Info Text controls');
      }
      if (type === 'selection') {
        const hasOptionsFile = parsed.options['options-file'] !== undefined;
        const hasOptionsUrl = parsed.options['options-url'] !== undefined;
        if (target === 'standalone' && hasOptionsFile === hasOptionsUrl) {
          throw new Error('standalone Selection requires exactly one of --options-file or --options-url');
        }
        if (target !== 'standalone' && hasOptionsFile && hasOptionsUrl) {
          throw new Error('linked Selection accepts at most one of --options-file or --options-url');
        }
        if (target === 'layout' && (hasOptionsFile || hasOptionsUrl)) {
          throw new Error('Selection option-source flags are not supported for layout controls');
        }
        if (parsed.options['use-reload'] !== undefined && !hasOptionsUrl) {
          throw new Error('--use-reload requires --options-url');
        }
      } else if (
        parsed.options['options-file'] !== undefined ||
        parsed.options['options-url'] !== undefined ||
        parsed.options['use-reload'] !== undefined
      ) {
        throw new Error('Selection option-source flags require a Selection control');
      }
      result = await executeCommand('controlNode.createAndLink', {
        name: requireOption(parsed.options, 'name'),
        type: type,
        target: target,
        tileId: target === 'data' ? requireOption(parsed.options, 'tile-id') : undefined,
        elementType: target === 'layout' ? requireOption(parsed.options, 'element-type') : undefined,
        elementId: target === 'layout' ? requireOption(parsed.options, 'element-id') : undefined,
        propertyId: target === 'standalone' ? undefined : requireOption(parsed.options, 'property'),
        value: target === 'standalone'
          ? type === 'button'
            ? { __singularButton: true, ts: 0 }
            : type === 'timecontrol'
            ? undefined
            : type === 'metricfont'
            ? undefined
            : readJsonOptionFile(
              parsed.options,
              'value-file',
              'standalone control value file',
              true
            )
          : undefined,
        font: type === 'metricfont' && target === 'standalone'
          ? {
            family: parsed.options.family,
            weight: parsed.options.weight,
            style: parsed.options.style,
            subset: parsed.options.subset,
            source: parsed.options['font-source']
          }
          : undefined,
        mode: type === 'infotext' ? parsed.options['info-mode'] : undefined,
        selections: type === 'selection' && parsed.options['options-file'] !== undefined
          ? readJsonOptionFile(
            parsed.options,
            'options-file',
            'selection options file',
            true
          )
          : undefined,
        sourceUrl: type === 'selection'
          ? parsed.options['options-url']
          : undefined,
        useReload: parsed.options['use-reload'] === undefined
          ? undefined
          : requireBooleanOption(parsed.options, 'use-reload'),
        replace: parsed.options.replace === true,
        sourceCompositionId: parsed.options['source-composition']
      });
      break;
    }
    case 'create-controls': {
      const controlsFile = readJsonFile(
        requireOption(parsed.options, 'file'),
        'control-node specification'
      );
      const controls = Array.isArray(controlsFile)
        ? controlsFile
        : controlsFile.controls;
      result = await executeCommand('controlNode.createMany', {
        controls: Array.isArray(controls)
          ? controls.map(function (control) {
            return {
              name: control.name,
              type: control.type,
              target: control.target || (control.elementId ? 'layout' : 'data'),
              tileId: control.tileId,
              elementType: control.elementType,
              elementId: control.elementId,
              propertyId: control.propertyId || control.property,
              value: control.value,
              mode: control.mode,
              selections: control.selections,
              sourceUrl: control.sourceUrl,
              useReload: control.useReload,
              replace: control.replace === true,
              sourceCompositionId: control.sourceCompositionId || control.sourceComposition
            };
          })
          : controls
      });
      break;
    }
    case 'delete-control':
      result = await executeCommand('controlNode.delete', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    case 'get':
      if (parsed.options.selected) {
        const inspected = await executeCommand('composition.inspect', { selection: true });
        const selection = inspected && inspected.selection;
        if (!selection || !selection.id) {
          throw new Error('Nothing is selected in Composer; select a tile or group first');
        }
        result = await executeCommand('element.get', {
          elementType: selection.type === 'group' ? 'group' : 'tile',
          id: selection.id
        });
      } else {
        result = await executeCommand('element.get', getElementParams(parsed.options));
      }
      break;
    case 'get-many':
      assertAllowedOptions(parsed.options, ['type', 'ids', 'compact'], 'get-many');
      result = await executeCommand('element.getMany', {
        elementType: parsed.options.type || 'tile',
        ids: parseIds(requireOption(parsed.options, 'ids'))
      });
      break;
    case 'select':
      result = await executeCommand('element.select', getElementParams(parsed.options));
      break;
    case 'move': {
      const params = {
        id: requireOption(parsed.options, 'id'),
        groupId: requireOption(parsed.options, 'group-id')
      };
      if (parsed.options.index !== undefined) {
        const index = Number(parsed.options.index);
        if (!Number.isInteger(index)) {
          throw new Error('--index must be an integer');
        }
        params.index = index;
      }
      result = await executeCommand('element.move', params);
      break;
    }
    case 'update': {
      assertAllowedOptions(parsed.options, [
        'type', 'id', 'namespace', 'path', 'value-file', 'compact'
      ], 'update');
      const params = getElementParams(parsed.options);
      params.path = requireOption(parsed.options, 'path');
      if (parsed.options.namespace) {
        params.namespace = parsed.options.namespace;
      }
      params.value = readJsonOptionFile(
        parsed.options,
        'value-file',
        'element update value file',
        true
      );
      result = await executeCommand('element.update', params);
      break;
    }
    case 'fonts': {
      const params = {};
      if (parsed.options.source) params.source = parsed.options.source;
      if (parsed.options.family) params.family = parsed.options.family;
      result = await executeCommand('fonts.list', params);
      break;
    }
    case 'set-font': {
      const params = { id: requireOption(parsed.options, 'id') };
      ['family', 'source', 'weight', 'alignment'].forEach(function (option) {
        if (parsed.options[option] !== undefined) params[option] = parsed.options[option];
      });
      ['italic', 'underline'].forEach(function (option) {
        if (parsed.options[option] !== undefined) params[option] = parsed.options[option];
      });
      result = await executeCommand('text.font.set', params);
      break;
    }
    case 'timeline-animations':
      result = await executeCommand('timelineAnimations.list', {});
      break;
    case 'set-timeline-animation': {
      assertAllowedOptions(parsed.options, [
        'type', 'id', 'timeline', 'effect', 'property', 'params-file',
        'easing-file', 'start', 'duration', 'compact'
      ], 'set-timeline-animation');
      const params = {
        elementType: parsed.options.type || 'tile',
        id: requireOption(parsed.options, 'id'),
        timeline: requireOption(parsed.options, 'timeline'),
        effect: requireOption(parsed.options, 'effect')
      };
      if (parsed.options.property !== undefined) {
        params.property = parseAnimationProperty(parsed.options.property);
      }
      if (parsed.options['params-file'] !== undefined) {
        params.params = readJsonOptionFile(
          parsed.options,
          'params-file',
          'Timeline-animation parameters file'
        );
      }
      if (parsed.options['easing-file'] !== undefined) {
        params.easing = readJsonOptionFile(
          parsed.options,
          'easing-file',
          'Timeline-animation easing file'
        );
      }
      ['start', 'duration'].forEach(function (option) {
        if (parsed.options[option] === undefined) return;
        const value = Number(parsed.options[option]);
        if (!Number.isFinite(value)) {
          throw new Error(`--${option} must be a number of seconds`);
        }
        params[option] = value;
      });
      result = await executeCommand('timelineAnimation.set', params);
      break;
    }
    case 'set-timeline-animations':
      assertAllowedOptions(parsed.options, ['file', 'compact'], 'set-timeline-animations');
      result = await executeCommand(
        'timelineAnimation.setMany',
        readJsonFile(requireOption(parsed.options, 'file'), 'Timeline-animation choreography')
      );
      break;
    case 'update-animations':
      result = await executeCommand('updateAnimations.list', {});
      break;
    case 'set-update-animation': {
      assertAllowedOptions(parsed.options, [
        'id', 'phase', 'effect', 'property', 'params-file', 'easing-file',
        'duration', 'active', 'always-execute', 'offset', 'compact'
      ], 'set-update-animation');
      const params = {
        id: requireOption(parsed.options, 'id'),
        phase: requireOption(parsed.options, 'phase'),
        effect: requireOption(parsed.options, 'effect')
      };
      if (parsed.options.property !== undefined) {
        params.property = parseAnimationProperty(parsed.options.property);
      }
      if (parsed.options['params-file'] !== undefined) {
        params.params = readJsonOptionFile(
          parsed.options,
          'params-file',
          'Update-animation parameters file'
        );
      }
      if (parsed.options['easing-file'] !== undefined) {
        params.easing = readJsonOptionFile(
          parsed.options,
          'easing-file',
          'Update-animation easing file'
        );
      }
      if (parsed.options.active !== undefined) {
        params.active = requireBooleanOption(parsed.options, 'active');
      }
      if (parsed.options['always-execute'] !== undefined) {
        params.alwaysExecute = parsed.options['always-execute'];
      }
      ['duration', 'offset'].forEach(function (option) {
        if (parsed.options[option] === undefined) return;
        const value = Number(parsed.options[option]);
        if (!Number.isFinite(value)) throw new Error(`--${option} must be a number of seconds`);
        params[option] = value;
      });
      result = await executeCommand('updateAnimation.set', params);
      break;
    }
    case 'set-update-animations':
      assertAllowedOptions(parsed.options, ['file', 'compact'], 'set-update-animations');
      result = await executeCommand(
        'updateAnimation.setMany',
        readJsonFile(requireOption(parsed.options, 'file'), 'Update-animation assignments')
      );
      break;
    case 'behaviors':
      result = parsed.options.id
        ? await executeCommand('behavior.inspect', { id: parsed.options.id })
        : await executeCommand('behaviors.list', {});
      break;
    case 'set-behavior': {
      assertAllowedOptions(parsed.options, [
        'id', 'property', 'effect', 'active', 'remove', 'easing-file',
        'value-min', 'value-max', 'duration', 'duration-range', 'delay',
        'delay-range', 'compact'
      ], 'set-behavior');
      const params = {
        id: requireOption(parsed.options, 'id'),
        property: requireOption(parsed.options, 'property')
      };
      if (parsed.options.effect !== undefined) params.effect = parsed.options.effect;
      if (parsed.options.active !== undefined) params.active = requireBooleanOption(parsed.options, 'active');
      if (parsed.options.remove !== undefined) params.remove = parsed.options.remove;
      if (parsed.options['easing-file'] !== undefined) {
        params.easing = readJsonOptionFile(
          parsed.options,
          'easing-file',
          'continuous-behavior easing file'
        );
      }
      [
        ['value-min', 'valueMin'],
        ['value-max', 'valueMax'],
        ['duration', 'duration'],
        ['duration-range', 'durationRange'],
        ['delay', 'delay'],
        ['delay-range', 'delayRange']
      ].forEach(function (entry) {
        if (parsed.options[entry[0]] === undefined) return;
        const value = Number(parsed.options[entry[0]]);
        if (!Number.isFinite(value)) throw new Error(`--${entry[0]} must be a finite number`);
        params[entry[1]] = value;
      });
      result = await executeCommand('behavior.set', params);
      break;
    }
    case 'set-behaviors':
      assertAllowedOptions(parsed.options, ['file', 'compact'], 'set-behaviors');
      result = await executeCommand(
        'behavior.setMany',
        readJsonFile(requireOption(parsed.options, 'file'), 'continuous-behavior assignments')
      );
      break;
    case 'create-group': {
      assertAllowedOptions(parsed.options, ['name', 'layout-file', 'compact'], 'create-group');
      const params = { name: requireOption(parsed.options, 'name') };
      if (parsed.options['layout-file'] !== undefined) {
        params.layout = readJsonOptionFile(
          parsed.options,
          'layout-file',
          'group layout file'
        );
      }
      result = await executeCommand('group.create', params);
      break;
    }
    case 'configure-group':
      assertAllowedOptions(parsed.options, ['id', 'layout-file', 'compact'], 'configure-group');
      result = await executeCommand('group.configure', {
        id: requireOption(parsed.options, 'id'),
        layout: readJsonOptionFile(
          parsed.options,
          'layout-file',
          'group layout file',
          true
        )
      });
      break;
    case 'move-group': {
      const index = Number(requireOption(parsed.options, 'index'));
      if (!Number.isInteger(index)) {
        throw new Error('--index must be an integer');
      }
      result = await executeCommand('group.move', {
        id: requireOption(parsed.options, 'id'),
        index: index
      });
      break;
    }
    case 'delete-group':
      result = await executeCommand('group.delete', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    case 'capture':
      result = await captureStandalone(normalizeCaptureOptions(parsed.options));
      break;
    case 'primitives':
      result = await executeCommand('primitives.list');
      if (parsed.options.primitive) {
        const match = (result.primitives || []).find(function (entry) {
          return entry.primitive === parsed.options.primitive;
        });
        if (!match) {
          throw new Error(`primitive "${parsed.options.primitive}" is not available`);
        }
        result = { primitives: [match] };
      }
      break;
    case 'ensure-group':
      result = await executeCommand('managedGroup.ensure');
      break;
    case 'create': {
      const params = {
        primitive: requireOption(parsed.options, 'primitive')
      };
      if (parsed.options.name) {
        params.name = parsed.options.name;
      }
      result = await executeCommand('primitive.create', params);
      break;
    }
    case 'delete':
      result = await executeCommand('primitive.delete', {
        id: requireOption(parsed.options, 'id')
      });
      break;
    case 'apply': {
      const specification = readJsonFile(
        requireOption(parsed.options, 'file'),
        'graphics specification'
      );
      result = await executeCommand('graphics.apply', specification);
      break;
    }
    case 'validate': {
      const specification = readJsonFile(
        requireOption(parsed.options, 'file'),
        'graphics specification'
      );
      result = await executeCommand('graphics.validate', specification);
      break;
    }
    default:
      throw new Error(
      'Usage: composer-agent.js <pair|pair-intent|start-work|finish-work|status|complete|inspect|script-handoff|control-composition|create-composition|orchestrate|create-revision|list-revisions|read-revision|compare-revision|restore-revision|delete-revision|delete-composition|open-composition|widget-subcompositions|open-widget-subcomposition|update-table|update-grid|timeline2|control-nodes|metric-fonts|widget-nodes|link-widget-nodes|unlink-widget-nodes|set-control-value|set-control-font|create-table-control|set-table-control|update-table-control|link-table-control|unlink-table-control|press-control|timer-action|control-time|update-control|create-control-container|configure-control-container|delete-control-container|create-control|create-controls|delete-control|get|get-many|select|move|update|fonts|set-font|timeline-animations|set-timeline-animation|set-timeline-animations|update-animations|set-update-animation|set-update-animations|behaviors|set-behavior|set-behaviors|create-group|configure-group|move-group|delete-group|capture|primitives|ensure-group|create|delete|validate|apply> [options]'
      );
  }

  const output = parsed.options.compact
    ? compactResult(parsed.command, result)
    : result;
  console.log(JSON.stringify(output, null, parsed.options.compact ? 0 : 2));
}

run().then(function () {
  writeWorkLifecycleReminder(invokedCommand, true);
}).catch(function (err) {
  const prefix = err.code ? `${err.code}: ` : '';
  console.error(prefix + err.message);
  writeWorkLifecycleReminder(invokedCommand, false);
  process.exitCode = 1;
});
