import fs from 'fs';
import path from 'path';

const MAX_SCENARIO_BYTES = 64 * 1024;
const MAX_STEPS = 50;
const MAX_VALUE_BYTES = 32 * 1024;
const MAX_WAIT_MS = 600000;
const MAX_STEP_TIMEOUT_MS = 60000;
const LIFECYCLE_EVENTS = new Set([
  'compositionLoaded',
  'message',
  'state_changed',
  'payload_changed',
  'datanode_payload_changed',
  'error',
  'composition_script_event',
  'download_start',
  'download_complete'
]);
const ACTIONS = new Set([
  'wait',
  'setPayload',
  'sendMessage',
  'playTo',
  'jumpTo',
  'waitForLifecycle',
  'assertLifecycle',
  'assertState',
  'assertDom',
  'capture'
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) {
    throw new Error(`${label} has unsupported field "${unknown[0]}"`);
  }
}

function assertBoundedJsonValue(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be a JSON object`);
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_VALUE_BYTES) {
    throw new Error(`${label} exceeds ${MAX_VALUE_BYTES} bytes`);
  }
}

function assertOptionalCompositionId(step, label) {
  if (step.compositionId !== undefined &&
      (typeof step.compositionId !== 'string' || !step.compositionId.length || step.compositionId.length > 128)) {
    throw new Error(`${label}.compositionId must be a non-empty string of at most 128 characters`);
  }
}

function assertLifecycleEvent(step, label) {
  if (!LIFECYCLE_EVENTS.has(step.event)) {
    throw new Error(`${label}.event must be one of ${Array.from(LIFECYCLE_EVENTS).join(', ')}`);
  }
}

function assertCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100000) {
    throw new Error(`${label} must be an integer between 0 and 100000`);
  }
}

function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100000) {
    throw new Error(`${label} must be a number between 0 and 100000`);
  }
}

function validateStep(step, index, captureNames) {
  const label = `Scenario step ${index + 1}`;
  if (!isPlainObject(step)) throw new Error(`${label} must be an object`);
  if (!ACTIONS.has(step.action)) {
    throw new Error(`${label}.action must be one of ${Array.from(ACTIONS).join(', ')}`);
  }

  if (step.action === 'wait') {
    assertAllowedKeys(step, ['action', 'milliseconds'], label);
    if (!Number.isSafeInteger(step.milliseconds) || step.milliseconds < 0 || step.milliseconds > MAX_WAIT_MS) {
      throw new Error(`${label}.milliseconds must be an integer between 0 and ${MAX_WAIT_MS}`);
    }
    return;
  }

  if (step.action === 'setPayload') {
    assertAllowedKeys(step, ['action', 'compositionId', 'payload'], label);
    assertOptionalCompositionId(step, label);
    assertBoundedJsonValue(step.payload, `${label}.payload`);
    return;
  }

  if (step.action === 'sendMessage') {
    assertAllowedKeys(step, ['action', 'compositionId', 'message'], label);
    assertOptionalCompositionId(step, label);
    assertBoundedJsonValue(step.message, `${label}.message`);
    return;
  }

  if (step.action === 'playTo' || step.action === 'jumpTo') {
    assertAllowedKeys(step, ['action', 'compositionId', 'state'], label);
    assertOptionalCompositionId(step, label);
    if (typeof step.state !== 'string' || !step.state.length || step.state.length > 128) {
      throw new Error(`${label}.state must be a non-empty string of at most 128 characters`);
    }
    return;
  }

  if (step.action === 'waitForLifecycle') {
    assertAllowedKeys(step, ['action', 'event', 'minimum', 'timeoutMs'], label);
    assertLifecycleEvent(step, label);
    assertCount(step.minimum, `${label}.minimum`);
    if (step.timeoutMs !== undefined &&
        (!Number.isSafeInteger(step.timeoutMs) || step.timeoutMs < 1 || step.timeoutMs > MAX_STEP_TIMEOUT_MS)) {
      throw new Error(`${label}.timeoutMs must be an integer between 1 and ${MAX_STEP_TIMEOUT_MS}`);
    }
    return;
  }

  if (step.action === 'assertLifecycle') {
    assertAllowedKeys(step, ['action', 'event', 'equals', 'minimum', 'maximum'], label);
    assertLifecycleEvent(step, label);
    const constraints = ['equals', 'minimum', 'maximum'].filter(key => step[key] !== undefined);
    if (!constraints.length) throw new Error(`${label} requires equals, minimum, or maximum`);
    constraints.forEach(key => assertCount(step[key], `${label}.${key}`));
    if (step.minimum !== undefined && step.maximum !== undefined && step.minimum > step.maximum) {
      throw new Error(`${label}.minimum cannot exceed maximum`);
    }
    return;
  }

  if (step.action === 'assertState') {
    assertAllowedKeys(step, ['action', 'compositionId', 'equals'], label);
    assertOptionalCompositionId(step, label);
    if (step.equals === undefined) throw new Error(`${label}.equals is required`);
    let serialized;
    try {
      serialized = JSON.stringify(step.equals);
    } catch (error) {
      throw new Error(`${label}.equals must be JSON serializable`);
    }
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_VALUE_BYTES) {
      throw new Error(`${label}.equals must be a JSON value no larger than ${MAX_VALUE_BYTES} bytes`);
    }
    return;
  }

  if (step.action === 'assertDom') {
    assertAllowedKeys(step, [
      'action', 'textHash', 'textChangedFrom', 'minimumElementCount',
      'minimumVisibleElementCount', 'minimumWidth', 'minimumHeight'
    ], label);
    const constraints = [
      'textHash', 'textChangedFrom', 'minimumElementCount',
      'minimumVisibleElementCount', 'minimumWidth', 'minimumHeight'
    ].filter(key => step[key] !== undefined);
    if (!constraints.length) throw new Error(`${label} requires at least one DOM assertion`);
    if (step.textHash !== undefined &&
        (typeof step.textHash !== 'string' || !/^[a-f0-9]{16}$/.test(step.textHash))) {
      throw new Error(`${label}.textHash must be a 16-character lowercase hexadecimal hash`);
    }
    if (step.textChangedFrom !== undefined &&
        (typeof step.textChangedFrom !== 'string' || !captureNames.has(step.textChangedFrom))) {
      throw new Error(`${label}.textChangedFrom must name an earlier capture checkpoint`);
    }
    ['minimumElementCount', 'minimumVisibleElementCount'].forEach(key => {
      if (step[key] !== undefined) assertCount(step[key], `${label}.${key}`);
    });
    ['minimumWidth', 'minimumHeight'].forEach(key => {
      if (step[key] !== undefined) assertPositiveNumber(step[key], `${label}.${key}`);
    });
    return;
  }

  assertAllowedKeys(step, ['action', 'name'], label);
  if (typeof step.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(step.name)) {
    throw new Error(`${label}.name must use 1-64 letters, digits, periods, underscores, or hyphens`);
  }
  if (captureNames.has(step.name)) throw new Error(`${label}.name must be unique`);
  captureNames.add(step.name);
}

export function validateVerificationScenario(scenario) {
  if (!isPlainObject(scenario)) throw new Error('Verification scenario must be an object');
  assertAllowedKeys(scenario, ['version', 'steps'], 'Verification scenario');
  if (scenario.version !== 1 || !Array.isArray(scenario.steps) ||
      !scenario.steps.length || scenario.steps.length > MAX_STEPS) {
    throw new Error(`Verification scenario must contain version 1 and 1-${MAX_STEPS} steps`);
  }
  const captureNames = new Set();
  scenario.steps.forEach((step, index) => validateStep(step, index, captureNames));
  const totalWaitBudgetMs = scenario.steps.reduce(function (total, step) {
    if (step.action === 'wait') return total + step.milliseconds;
    if (step.action === 'waitForLifecycle') return total + (step.timeoutMs || 10000);
    return total;
  }, 0);
  if (totalWaitBudgetMs > MAX_WAIT_MS) {
    throw new Error(`Verification scenario wait budget exceeds ${MAX_WAIT_MS} milliseconds`);
  }
  return scenario;
}

export function readVerificationScenario(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (stat.size > MAX_SCENARIO_BYTES) {
    throw new Error(`Verification scenario exceeds ${MAX_SCENARIO_BYTES} bytes`);
  }
  return validateVerificationScenario(JSON.parse(fs.readFileSync(resolved, 'utf8')));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function runPlayerAction(page, step, defaultCompositionId) {
  return page.evaluate(async function (input) {
    if (!window.player || typeof window.player.getMainComposition !== 'function') {
      throw new Error('Player composition API is unavailable');
    }
    var target = window.player.getMainComposition();
    if (!target) throw new Error('Player main composition is unavailable');
    if (input.compositionId) {
      if (typeof target.getCompositionById !== 'function') {
        throw new Error('Player sub-composition lookup is unavailable');
      }
      target = target.getCompositionById(input.compositionId);
      if (!target) throw new Error('Requested Player composition was not found');
    }
    if (input.action === 'getState') return target.getState();
    if (input.action === 'setPayload') await target.setPayload(input.payload);
    else if (input.action === 'sendMessage') await target.sendMessage(input.message);
    else if (input.action === 'playTo') await target.playTo(input.state);
    else if (input.action === 'jumpTo') await target.jumpTo(input.state);
    else throw new Error('Unsupported Player scenario action');
    return true;
  }, { ...step, compositionId: step.compositionId === undefined ? defaultCompositionId : step.compositionId });
}

function lifecycleAssertion(step, actual) {
  if (step.equals !== undefined && actual !== step.equals) return false;
  if (step.minimum !== undefined && actual < step.minimum) return false;
  if (step.maximum !== undefined && actual > step.maximum) return false;
  return true;
}

function domAssertion(step, actual, checkpoints) {
  if (step.textHash !== undefined && actual.dom.textHash !== step.textHash) return false;
  if (step.textChangedFrom !== undefined &&
      actual.dom.textHash === checkpoints.get(step.textChangedFrom).dom.textHash) return false;
  if (step.minimumElementCount !== undefined && actual.dom.elementCount < step.minimumElementCount) return false;
  if (step.minimumVisibleElementCount !== undefined &&
      actual.dom.visibleElementCount < step.minimumVisibleElementCount) return false;
  if (step.minimumWidth !== undefined && actual.targetBounds.width < step.minimumWidth) return false;
  if (step.minimumHeight !== undefined && actual.targetBounds.height < step.minimumHeight) return false;
  return true;
}

export async function executeVerificationScenario(options) {
  const { scenario, page, sample, capture } = options;
  const checkpoints = new Map();
  const result = { requested: true, version: scenario.version, status: 'running', steps: [] };

  for (let index = 0; index < scenario.steps.length; index++) {
    const step = scenario.steps[index];
    const startedAt = Date.now();
    const entry = { index, action: step.action, status: 'running' };
    if (step.name) entry.name = step.name;
    if (step.event) entry.event = step.event;
    result.steps.push(entry);
    try {
      if (step.action === 'wait') {
        await page.waitForTimeout(step.milliseconds);
      } else if (['setPayload', 'sendMessage', 'playTo', 'jumpTo'].includes(step.action)) {
        await runPlayerAction(page, step, options.defaultCompositionId);
      } else if (step.action === 'waitForLifecycle') {
        await page.waitForFunction(function (input) {
          return window.__verificationLifecycle &&
            window.__verificationLifecycle[input.event] >= input.minimum;
        }, { event: step.event, minimum: step.minimum }, { timeout: step.timeoutMs || 10000 });
        entry.actual = await page.evaluate(event => window.__verificationLifecycle[event], step.event);
      } else if (step.action === 'assertLifecycle') {
        const actual = await page.evaluate(event => window.__verificationLifecycle[event], step.event);
        entry.actual = actual;
        if (!lifecycleAssertion(step, actual)) throw new Error('lifecycle assertion failed');
      } else if (step.action === 'assertState') {
        const actual = await runPlayerAction(page, {
          action: 'getState',
          compositionId: step.compositionId
        }, options.defaultCompositionId);
        if (stableJson(actual) !== stableJson(step.equals)) throw new Error('state assertion failed');
      } else if (step.action === 'assertDom') {
        const actual = await sample();
        if (!domAssertion(step, actual, checkpoints)) throw new Error('DOM assertion failed');
        entry.observed = {
          textHash: actual.dom.textHash,
          elementCount: actual.dom.elementCount,
          visibleElementCount: actual.dom.visibleElementCount,
          width: actual.targetBounds.width,
          height: actual.targetBounds.height
        };
      } else if (step.action === 'capture') {
        const captured = await capture(step.name);
        checkpoints.set(step.name, captured);
        entry.frameIndex = captured.index;
        entry.file = captured.file;
      }
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.durationMs = Date.now() - startedAt;
      result.status = 'failed';
      const scenarioError = new Error(`SCENARIO_STEP_FAILED: step ${index + 1} (${step.action})`);
      scenarioError.scenarioResult = result;
      throw scenarioError;
    }
    entry.durationMs = Date.now() - startedAt;
  }

  result.status = 'passed';
  return result;
}
