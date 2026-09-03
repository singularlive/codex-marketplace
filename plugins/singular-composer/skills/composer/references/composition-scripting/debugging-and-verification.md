# Debugging and Verification

This document covers debugging techniques and Player verification for the paired composition-script phase. The entry workflow is [../composition-scripts.md](../composition-scripts.md).

---

## Debugging ladder

When a visual script change does not appear to work, debug in this order:

1. Add a small `console.log(...)` in `init()` to confirm the script is running at all.
2. Add a second `console.log(...)` inside the listener, timer, or branch that is supposed to drive the visible change.
3. Replace subtle visual changes with an obvious temporary sanity check:
   - for text widgets, toggle `widget.setPayload({ text: "..." })` versus `widget.setPayload({ text: "" })`
   - for payload-driven widgets, temporarily write a hardcoded visible value before restoring dynamic logic
4. If the obvious content change works but the intended transform does not, re-check whether the target property should be driven by a dedicated widget method or by widget payload.
5. Only after that, suspect control-node wiring, event propagation, or player-side triggering.

### Missing expected log = swallowed error

**This is the most important debugging insight for Singular scripts.**

If you see log A but the next expected log B never appears, the script hit a runtime error on the line between them. The Singular Player runtime catches script exceptions internally — they do **not** surface as `console.error` or `window.onerror`. Page-level `pageerror` listeners in Playwright also miss them because the error is caught inside the cross-origin iframe.

Mitigation: Add a `console.log()` after each suspect method call. If the log doesn't appear, that method call threw. Use `try/catch` around the suspect call to see the actual error message:

```javascript
try {
  suspectMethod(); // if this throws, you'd never know without the catch
} catch (e) {
  console.error("caught:", e.message); // now you'll see it
}
```

---

## Artifact storage convention

Save working artifacts generated during debugging or verification (HTML copies, JS snippets, screenshots, log dumps, extracted JSON, etc.) to the `temp/` subfolder of the current working directory (the repository root).

Do not assume `temp/` is git-ignored: the Singular repository ignores `tmp/`, not `temp/`. Keep generated artifacts out of commits and report retained artifact paths explicitly. Keep handoffs and credentials in memory throughout.

## Packaged Playwright runtime

Run `node scripts/doctor.js --browser` from the installed skill directory. The plugin
ships `playwright-core`; do not install Playwright CLI or npm packages. Use Node.js 22+
and installed Chrome. Run the verifier in place:

```powershell
node scripts/composer-agent.js script-handoff --compact |
  node scripts/verifyComposition.mjs --handoff-file -
```

Prefer `--scenario-file` for declarative verification. If custom logic is essential,
copy the complete plugin directory (including skills and runtime) into a
writable task directory, customize that copy, and remove it after the task. Copying
only verifyComposition.mjs loses its sibling helpers and packaged dependencies.
Never change the installed plugin for a composition-specific test.

### Screenshot output

The Playwright verification script saves frame screenshots to `temp/` by default as `frame-0.png`, `frame-1.png`, etc.

### Programmatic widget-property verification

When an AI agent cannot visually interpret screenshots, verify widget layout properties (position, size) by querying the player iframe DOM programmatically using Playwright. The player renders widgets as SVG elements inside a cross-origin iframe.

**Accessing the player iframe** — use Playwright's `page.frames().find()` which works across origins:

```js
const playerFrame = page.frames().find(f => f.url().includes('singularplayer/output'));
```

**Querying widget position and size from the iframe** — inspect SVG `rect` elements and their bounding boxes inside the player frame:

```js
const rectInfo = await playerFrame.evaluate(() => {
  const results = [];
  const svgRects = document.querySelectorAll('rect');
  svgRects.forEach(function(r) {
    const rect = r.getBoundingClientRect();
    results.push({
      fill: r.getAttribute('fill'),
      width: r.getAttribute('width'),
      height: r.getAttribute('height'),
      x: r.getAttribute('x'),
      y: r.getAttribute('y'),
      boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    });
  });
  return results;
});
```

The bounding rectangle values are relative to the player viewport. Use these to compute percentages and confirm expected layout (e.g. "bottom edge near 720px on a 720px canvas" = positioned at bottom).

**Custom scripts**: follow the complete-plugin copy procedure above. Keep custom scripts under that copy's skills/composer/scripts directory so local helper paths remain valid.

## Verification workflow

### Automated verification with Playwright

Use `scripts/verifyComposition.mjs` for headless visual verification after writing a script. It loads the composition via the player SDK, takes screenshots, and dumps the iframe DOM summary plus console logs — the agent interprets the results.

1. Pipe a fresh paired handoff into the bundled verification script:
   ```sh
   node scripts/composer-agent.js script-handoff --compact |
     node scripts/verifyComposition.mjs --handoff-file -
   ```

2. The script outputs:
   - Frame screenshots saved to `temp/` (e.g. `temp/frame-0.png`, `temp/frame-1.png`)
   - A sanitized `verification-report.json` containing renderer bounds, screenshot dimensions, DOM text length/hash, lifecycle counters, and console counts for every frame
   - Separate runtime, screenshot, and optional visual-integrity status

3. Interpret the output:
   - **Runtime changes**: compare DOM text hashes and lifecycle counters without exposing rendered text
   - **Screenshot success**: confirm every frame has the expected dimensions and byte count
   - **Visual completeness**: supply an explicit integrity file for deterministic fixtures; do not infer it for arbitrary designs
   - **Timing**: compare screenshots across frames to confirm animations or toggles at the expected intervals

4. CLI flags:
   - `--handoff-file PATH|-` — required version-1 handoff; prefer `-` so credentials stay in the pipeline
   - `--frames N` — number of screenshots (default: 3)
   - `--interval MS` — milliseconds between screenshots (default: 3000)
   - `--out DIR` — output directory for screenshots and temp files (default: `./temp` relative to cwd)
   - `--composition-id root|active|<id>` — select the root (default), the handoff's active composition, or an ordinary sub-composition by ID; selects both the renderer and the default scenario action target
   - `--capture-mode target|page` — capture the selected Player renderer (`target`, default) or retain the full-page path for boundary diagnosis; page mode keeps the selected scope isolated but does not crop to its bounds
   - `--fresh-page-per-frame` — reload the Player in a new isolated page for every sampled frame; diagnostic only because initialization restarts each time
   - `--disable-gpu` — launch Chrome with GPU acceleration disabled to isolate compositor behavior; diagnostic only
   - `--report PATH` — sanitized JSON report path (default: `<out>/verification-report.json`)
   - `--scenario-file PATH` — optional version-1 declarative Player verification scenario
   - `--integrity-file PATH` — optional version-1 deterministic pixel-region assertions; a failure exits nonzero
   - `--no-headless` — show the browser window for debugging

   The verifier creates the host page in memory from the handoff and accepts only a successful Player load callback. It does not write either handoff credential to an HTML file. It waits for the requested SDK composition and exactly one matching renderer, then waits for two animation frames before each image. Root remains the default.

   For an ordinary sub-composition, unrelated sibling branches are hidden only inside the private Player page, including siblings added later. Target descendants, layout, transforms, opacity, and ancestor state are preserved. No saved composition or editor state changes. Isolation is restored when the page is replaced or closed. The verifier does **not** automatically jump the target or its ancestors to In: drive the intended states explicitly in a scenario. Parent backgrounds, clipping and transforms still affect the result.

   `active` requires active-composition metadata in a fresh handoff; active root selects root. Widget-owned templates are unsupported because they require instance-aware targeting. Missing SDK compositions or renderers fail with `PLAYER_TARGET_NOT_FOUND`; multiple matching renderers fail with `PLAYER_TARGET_AMBIGUOUS`. The verifier never falls back to root or chooses the first visible instance. Load failure, timeout and unavailable main SDK have separate `PLAYER_LOAD_FAILED`, `PLAYER_LOAD_TIMEOUT` and `PLAYER_SDK_NOT_READY` errors. The sanitized report's `target` records requested mode, resolved kind/ID, isolation and readiness status. Fresh-page sampling resolves and isolates the same target on every page.

   Verify a known ordinary sub-composition without changing the user's editor scope:

   ```sh
   node scripts/composer-agent.js script-handoff --composition-id <id> --compact |
     node scripts/verifyComposition.mjs --handoff-file - --composition-id active --scenario-file temp/scenario.json
   ```

### Declarative Player scenario

Use a scenario when runtime proof requires public Player inputs or specific checkpoints. The verifier validates the complete file before opening Player. A scenario is limited to version 1, 50 steps, 64 KiB total, 32 KiB for each payload/message/expected-state value, ten minutes of aggregate wait budget, and 60 seconds for one lifecycle wait.

```json
{
  "version": 1,
  "steps": [
    { "action": "capture", "name": "before" },
    { "action": "setPayload", "payload": { "Score": "2" } },
    {
      "action": "waitForLifecycle",
      "event": "payload_changed",
      "minimum": 1,
      "timeoutMs": 3000
    },
    {
      "action": "assertDom",
      "textChangedFrom": "before",
      "minimumVisibleElementCount": 1
    },
    { "action": "jumpTo", "state": "In" },
    { "action": "assertState", "equals": "In" },
    { "action": "capture", "name": "after" }
  ]
}
```

Run it without placing either handoff credential on disk:

```sh
node scripts/composer-agent.js script-handoff --compact |
  node scripts/verifyComposition.mjs --handoff-file - --scenario-file temp/scenario.json
```

Supported actions are:

- `wait`: bounded `milliseconds`.
- `setPayload` and `sendMessage`: call the public Player composition API with an object. Omit `compositionId` for the selected verification target (root by default), or provide an explicit SDK composition ID to override it. An override changes only that action, not capture or DOM scope.
- `playTo` and `jumpTo`: call the public Player composition API with `state`; they accept the same optional `compositionId`.
- `waitForLifecycle`: wait for an allowed lifecycle counter to reach `minimum`, with an optional `timeoutMs`.
- `assertLifecycle`: require `equals`, `minimum`, or `maximum` for one allowed lifecycle counter.
- `assertState`: compare the selected target's `getState()` with the JSON value in `equals`; accepts the same optional `compositionId` override.
- `assertDom`: check a 16-character `textHash`, a text change from an earlier checkpoint, minimum element/visible-element counts, or minimum target width/height. It never exposes rendered text.
- `capture`: save a named checkpoint. Names are unique and use up to 64 letters, digits, periods, underscores, or hyphens.

Allowed lifecycle counters are `compositionLoaded`, `message`, `state_changed`, `payload_changed`, `datanode_payload_changed`, `error`, `composition_script_event`, `download_start`, and `download_complete`. A failed action reports only its step number and action type. The sanitized report includes statuses, durations, safe counters, DOM hashes, bounds, and checkpoint filenames; it never records payload/message values, expected state values, script text, rendered text, tokens, or preview URLs.

Lifecycle counters remain page-wide even with a scoped target. Use target state and DOM assertions for scope-specific proof; sibling scripts continue running. DOM sampling covers the selected renderer's same-document descendants, not the internals of child widget iframes.

When a scenario contains `capture` steps, those checkpoints replace the ordinary `--frames`/`--interval` sampler, so do not combine those flags. `--fresh-page-per-frame` is also incompatible because reloading would discard the scenario state. With no `capture` step, the normal periodic sampler runs after the scenario. A supplied integrity contract applies to every resulting screenshot.

### Optional visual-integrity contract

Use this only for deterministic fixtures whose required occupied regions are known. Coordinates are relative to the saved PNG; `unit` is `px` or `percent`. Pixels that differ from `background` by more than `tolerance` count as foreground.

```json
{
  "version": 1,
  "assertions": [{
    "name": "stable label",
    "region": { "x": 10, "y": 10, "width": 40, "height": 15, "unit": "percent" },
    "background": { "r": 0, "g": 0, "b": 0 },
    "tolerance": 8,
    "minimumForegroundPixels": 100,
    "minimumOccupiedColumns": 80,
    "minimumOccupiedRows": 12
  }]
}
```

The report records the failed frame, measured foreground pixels, occupied rows/columns, and requested thresholds. It never records either handoff credential, a preview URL, script text, rendered text, or image data.

5. **Cross-origin iframe limitation**: The player renders inside an iframe from a different origin (`alpha.singular.live`, `app.singular.live`, etc.). Note these two separate behaviors:
   - **`console.log()` calls from inside the composition script ARE captured** by Playwright's `page.on('console')` — the player SDK bridges them to the top-level page.
   - **Runtime errors / uncaught exceptions** thrown inside that iframe are **not captured** by `page.on('pageerror')`. The Singular Player runtime catches script exceptions internally and they do not surface.
   To debug errors inside the player:
   - Use `--no-headless` and open DevTools on the iframe directly, OR
   - Add explicit `console.log()` after each suspect line in the composition script, OR
   - Wrap suspect calls in `try/catch` with `console.error()` inside the catch block

**Prerequisite**: the packaged runtime and installed Chrome must pass [the runtime check](#packaged-playwright-runtime) above.

## Player SDK API reference

The verifier loads the Player SDK from the handoff host at `/libs/singularplayer/0.1.2/singularplayer.js`.

Useful player-level methods verified from the SDK source:

- `loadComposition(compositionId, callback)`
- `renderComposition(compositionObject, callback)`
- `renderAppOutput(appId, output, callback)`
- `getCompositionInfo()`
- `getMainComposition()`
- `getCompositionById(compId)`
- `addListener(event, callback)`
- `removeListener(event, callback)`
- `setAdaptationGlobals(data)`
- `setFrameNumber(frame)`

Useful supported player events verified from the SDK source:

- `message`
- `state_changed`
- `payload_changed`
- `datanode_payload_changed`
- `error`
- `adaptation_globals_changed`
- `composition_script_event`
- `download_start`
- `download_complete`

Useful composition-instance methods verified from the SDK source:

- `find(...)`
- `getCompositionById(subCompId)`
- `listSubcompositions()`
- `getModel()`
- `getPayload()`
- `getPayload2()`
- `getControlNode()`
- `setPayload(payload)`
- `sendMessage(message)`
- `jumpTo(state)`
- `playTo(state)`
- `seek(state)`
- `getState()`

Important distinctions:

- **Player SDK script ≠ composition script.** A composition script runs inside the player iframe and has access to the full `comp` API including `findWidget()`, widget instance methods, and direct widget payload manipulation. The player SDK runs on the host page and only communicates with the player runtime through a narrow public interface.
- The player-side composition instance returned by `player.getMainComposition()` is not the same object as the in-script `comp`. It exposes composition navigation and payload methods, but not editor-style helpers such as `findWidget()`.
- **Player SDK `setPayload()` targets only the composition's control nodes.** You cannot set a payload directly on individual widgets or sub-composition elements from the player SDK. If the composition does not expose a control node linked to a specific element's property, you cannot update that property through the player SDK — you must write a composition script to reach it (e.g. `comp.findWidget("widgetId").setPayload({...})`).
- In short: the player SDK gives you `comp.setPayload()` (composition-level control nodes), the composition script gives you `widget.setPayload()` (individual widget content), `comp.findWidget()`, layout helpers, and everything else listed in the scripting reference.

**Primary purpose of the player SDK in debugging and verification:** the player SDK is the external trigger. It drives and triggers the composition script — you push payloads from the host page to fire the script's event listeners (`payload_changed`, `state_changed`, etc.) and to drive animation state changes (`playTo`, `jumpTo`). The composition script reacts; the player SDK is how you provoke that reaction so you can visually debug and verify the result in the player.

### Triggering and verifying `payload_changed`

The `payload_changed` event fires whenever control-node values are updated. The only documented way to trigger it externally is through the **Player SDK** — there is no REST endpoint for updating composition payload via the composition token API.

**From the host page (Player SDK):**
```javascript
// 1. Get the main composition instance
var main = player.getMainComposition();

// 2. Set a control node value — this triggers payload_changed in the script
main.setPayload({ Text_Color: { r: 255, g: 0, b: 0, a: 1 } });
```

**Two levels receive the event:**

| Level | How to listen | Captured by Playwright? |
|---|---|---|
| Composition script (inside iframe) | `comp.addListener('payload_changed', cb)` | Yes (SDK bridges it) |
| Host page (top-level) | `player.addListener('payload_changed', cb)` | Yes |

**Listener callback contracts** (reconciled against `app/components/onair/OnairScript.js` and `public/libs/singularplayer/0.1.2/singularplayer.js`):

Do not conflate the composition-script API with the host-page Player SDK. They intentionally have different callback shapes:

| Level | Callback shape | `payload_changed` data |
|---|---|---|
| Composition script inside the Player iframe | `function(event, msg, propagationEvent)` | `event` is `"payload_changed"`; `msg` contains `compositionId`, `compId`, `payload`, and composition names when available; call `comp.getPayload2()` for authoritative current values. The third argument exposes `stopPropagation()`. |
| Host page using the Player SDK | `function(event, msg)` | `event` is `"payload_changed"`; `msg` contains the forwarded composition identity and payload. There is no propagation object. |

Use this canonical composition-script pattern:

```javascript
comp.addListener('payload_changed', function(event, msg, propagationEvent) {
  if (msg.compositionId !== comp.id) return;
  var payload = comp.getPayload2();
  // React to the authoritative current payload here.
  propagationEvent.stopPropagation();
});
```

At the host level, inspect the second argument rather than treating the first event-name string as the message:

```javascript
player.addListener('payload_changed', function(event, msg) {
  console.log(msg.compositionId, msg.payload);
});
```

This source inspection corrects the earlier Playwright note that described both levels as receiving one string argument. A fresh live Player verification remains desirable when repository instructions authorize tests, but generated listeners must follow the runtime implementation above rather than the superseded note.

**Verification pattern:**
1. Add `console.log` inside the `payload_changed` listener (both comp-level and player-level)
2. Call `player.getMainComposition().setPayload({ ... })` from the host page
3. Run Playwright — it will capture the console logs from both levels
4. Confirm the expected payload values appear in the log output

**Important timing note:** The composition script's `init()` does **not** run synchronously inside the `loadComposition` callback. The callback fires first, then `init()` runs asynchronously afterward. If you call `setPayload()` immediately inside `loadComposition`, the script's `payload_changed` listener may not be registered yet. Wait for `init` console output or add a short delay before triggering payloads:

```javascript
player.loadComposition(token, function(obj) {
  console.log('Loaded — init() may not have run yet');
  // SAFE: wait a beat for init() to register listeners
  setTimeout(function() {
    player.getMainComposition().setPayload({ ... });
  }, 500);
});
```

**Important**: There is no REST endpoint at `apiv1/compositions/{token}/...` for updating payload. The separate `apiv2/controlapps/{token}/control` API exists in Singular but addresses control apps, not composition payloads — do not conflate them.

