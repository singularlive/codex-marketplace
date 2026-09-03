// Scope only this verifier's private Player document. Never change saved content,
// target state, or target/ancestor transforms to manufacture a visible result.
export function resolveVerificationTarget(option, handoff) {
  if (typeof option !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(option)) {
    throw new Error('INVALID_PLAYER_TARGET: --composition-id requires root, active, or a composition ID');
  }
  if (option === 'root') return { requested: 'root', compositionId: null };
  const active = handoff.activeComposition;
  if (option === 'active') {
    if (!active || typeof active.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(active.id) ||
        !Array.isArray(active.stack) || !active.stack.length) {
      throw new Error('INVALID_PLAYER_TARGET: active requires an inspected composition in the handoff');
    }
    if (active.widgetSubComposition) {
      throw new Error('PLAYER_TARGET_UNSUPPORTED: widget-owned templates require instance-aware verification');
    }
    return { requested: 'active', compositionId: active.stack.length === 1 ? null : active.id };
  }
  if (active && active.id === option && active.widgetSubComposition) {
    throw new Error('PLAYER_TARGET_UNSUPPORTED: widget-owned templates require instance-aware verification');
  }
  return { requested: 'composition', compositionId: option };
}

export async function prepareVerificationTarget(page, frame, request, timeoutMs = 30000) {
  try {
    await page.waitForFunction(function (id) {
      if (!window.player || typeof player.getMainComposition !== 'function') return false;
      const main = player.getMainComposition();
      if (!main) return false;
      if (!id || main.id === id) return true;
      const target = typeof main.getCompositionById === 'function' && main.getCompositionById(id);
      return Boolean(target && target.id === id);
    }, request.compositionId, { timeout: timeoutMs });
  } catch (error) {
    throw new Error(request.compositionId
      ? 'PLAYER_TARGET_NOT_FOUND: requested SDK composition was unavailable before the deadline'
      : 'PLAYER_SDK_NOT_READY: main composition was unavailable before the deadline');
  }
  const rootId = await page.evaluate(() => player.getMainComposition().id || null);
  const isRoot = request.compositionId === null || request.compositionId === rootId;
  const selector = isRoot ? '.onair-renderer.root-onair'
    : `.onair-renderer.sub-composition[data-composition-id="${request.compositionId}"]`;
  const target = frame.locator(selector);
  // Check cardinality without choosing a visible instance or a first match.
  try {
    await frame.waitForFunction(selector => document.querySelectorAll(selector).length > 0,
      selector, { timeout: timeoutMs });
  } catch (error) {
    throw new Error('PLAYER_TARGET_NOT_FOUND: requested renderer was unavailable before the deadline');
  }
  if (await target.count() !== 1) {
    throw new Error('PLAYER_TARGET_AMBIGUOUS: expected exactly one requested renderer');
  }
  if (!isRoot) await isolateVerificationTarget(frame, selector);
  return { target, identity: {
    requested: request.requested,
    kind: isRoot ? 'root' : 'composition',
    compositionId: isRoot ? rootId : request.compositionId,
    isolated: !isRoot
  } };
}

async function isolateVerificationTarget(frame, selector) {
  const valid = await frame.evaluate(function (selector) {
    const roots = document.querySelectorAll('.onair-renderer.root-onair');
    const targets = document.querySelectorAll(selector);
    if (roots.length !== 1 || targets.length !== 1 || !roots[0].contains(targets[0])) return false;
    const attribute = 'data-composer-verification-hidden-' + Math.random().toString(36).slice(2);
    const style = document.createElement('style');
    // Opacity on a sibling branch cannot be overridden by a visible child and
    // keeps all layout/geometry intact. Target and ancestor styles are untouched.
    style.textContent = '[' + attribute + '] { opacity: 0 !important; }';
    document.head.appendChild(style);
    let hidden = [];
    function refresh() {
      hidden.forEach(element => element.removeAttribute(attribute));
      hidden = [];
      const candidates = document.querySelectorAll(selector);
      if (candidates.length !== 1) return;
      let branch = candidates[0];
      while (branch && branch !== document.body) {
        const parent = branch.parentElement;
        if (!parent) break;
        Array.from(parent.children).forEach(sibling => {
          if (sibling === branch || sibling === style || !sibling.style) return;
          sibling.setAttribute(attribute, '');
          hidden.push(sibling);
        });
        branch = parent;
      }
    }
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true });
    window.__composerVerificationIsolation = {
      refresh,
      restore() {
        observer.disconnect();
        hidden.forEach(element => element.removeAttribute(attribute));
        style.remove();
        delete window.__composerVerificationIsolation;
      }
    };
    return true;
  }, selector);
  if (!valid) throw new Error('PLAYER_TARGET_UNSUPPORTED: target must be an ordinary renderer inside the root');
}

export async function restoreVerificationTarget(frame) {
  if (!frame) return;
  await frame.evaluate(function () {
    if (window.__composerVerificationIsolation) window.__composerVerificationIsolation.restore();
  }).catch(() => {}); // Closing an already-disposed private page also discards isolation.
}
