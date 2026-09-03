# Composition-script workflow

Use this workflow when a paired Composer task requires persisted JavaScript runtime behavior. Composition scripting is a second phase of the `composer` skill, not a separate skill and not a paired-editor command. The bundled CLIs are the only supported agent-facing interface: invoke `composer-agent.js script-handoff`, then pipe its output to `compositionScriptCli.js`. The helper calls authenticated REST endpoints internally, but agents must not treat those endpoints as an alternative workflow or construct requests to them directly.

The authorities remain separate:

- Composer owns composition structure, primitives, names, Control Nodes, links, and timelines.
- The dedicated Composition API script routes own persisted script discovery and script text, and require the unexpired scene/account-scoped agent authorization plus the handoff's composition credential. They are an internal transport reached through the bundled composition-script helper.
- `OnairScript` and the Singular Player own runtime behavior and verification.

The paired relay deliberately has no script command. Do not add script text to `graphics.apply`, write `compositionProps.scripts` through a generic update, or replace raw composition JSON.

## Source of truth by phase

| Phase | Authority | Supported agent path |
| --- | --- | --- |
| Build or change the graphic | Open Composer model | `inspect`, `get`, `control-nodes`, and the relevant primitive schemas |
| Hand off the active composition | Open Composer model | `composer-agent.js script-handoff` |
| Discover structure outside the handoff scope | Persisted composition content | `compositionScriptCli.js --handoff-file - --action summary --full` |
| Read script text | Dedicated composition-script endpoint | `compositionScriptCli.js --handoff-file - --action get-script --script-id <id>` |
| Prove script behavior | Singular Player runtime | The bundled Playwright verifier or a customized copy |

`script-handoff` is mandatory. It packages a versioned active-scope snapshot plus the Composition API host/token, the saved agent authorization, and the inspected composition ID as the suggested script target. Pass `--composition-id <id|root>` from a root or ordinary active scope to inspect another root or ordinary sub-composition without manually changing scope: the command uses normal Composer navigation and inspection, then restores the previously active composition before returning. It refuses to leave a widget-owned editing scope because Composer can replace that template ID on exit. Widget-owned templates must instead be opened through `open-widget-subcomposition`, followed by an unscoped handoff while the template is active. The server verifies that authorization is unexpired, has not been revoked or completed, matches the composition's scene and account, and still has an active task-level work lease before every script list/read/write request made by the helper. Each request renews the same lease and editor deadline. Use the helper's `summary --full` action when the requested target is global, overlay, outside the active scope, ambiguous, or requires composition-tree context absent from the handoff. Do not ask the user for a token, accept direct `--token`/`--host` operation, construct REST requests, or use the embedded `compositionProps.scripts` blob from content JSON as the primary source of script text.

## Composition-script helper contract

The helper actions are `summary`, `list-scripts`, `get-script`, `put-script`, and `clear-script`:

- `summary` uses the handoff's local active-composition context without requesting persisted content. Add `--full` only for global, overlay, ambiguous, or out-of-scope discovery.
- `list-scripts` returns only non-empty persisted scripts; an absent entry does not mean the target cannot accept a script.
- `get-script`, `put-script`, and `clear-script` default to the handoff's suggested script ID. Pass `--script-id` only for an intentional override discovered from the same handoff.
- Prefer `--script-file` for multiline `put-script` content. `clear-script` persists an empty body without deleting the script record.

The helper rejects direct `--token` and `--host` operation, omits both handoff credentials from normal output, and redacts token-bearing URL segments from request errors. Missing or invalid authorization returns 401; missing or expired work ownership returns 409. A revoked, completed, expired, scene-mismatched, or account-mismatched authorization cannot access scripts. `OPERATION_CANCELLED` releases the work lease without revoking the saved credential; stop the current task and discard its handoff instead of issuing another script request.

## End-to-end workflow

1. Pair, run `inspect`, and build the visual structure with `composer-agent`.
2. Put independently controlled modules in named sub-compositions. Give script-addressed widgets unambiguous names.
3. Create the intended public input surface as Control Nodes in the composition whose script consumes them. Use direct links for one-to-one property inputs and standalone controls for values the script interprets, combines, or forwards. Do not expose a structured gradient through a native Gradient Control Node; keep it as an internal widget-rendering value and use a complete widget-runtime gradient object in the script when needed. A Color control is appropriate only when the external input is intentionally one solid color. Run `control-nodes` and verify every field and payload value, every required `dataLink` or `nodeRef`, and the intentional absence of links for standalone script inputs.
4. Capture a structural baseline only when the existing layout must be preserved or compared. Otherwise verify structure through inspection and defer the single visual capture until the coherent layout is ready. At this stage, paired/editor capture proves layout only; it does not prove composition-script behavior.
5. Run `script-handoff --compact` after the final structural readback. Composer already lazily creates the Composition API token when the editor opens, so the handoff supplies the host, composition token, and paired agent authorization automatically. Pipe it directly to the helper; do not print or persist either credential.
6. For the common active-composition case, pass the handoff to the helper and read the suggested target directly:

   ```bash
   node scripts/composer-agent.js script-handoff --compact |
     node scripts/compositionScriptCli.js --handoff-file - --action get-script
   ```

7. Use the handoff's `suggestedScript`, active composition structure, `widgetReferences`, Control Node models, `datalinks`, and `noderefs`. Route every script-addressed widget through the matching `widgetReferences[].document` before authoring its payload. The route is compact context, not a schema copy: preserve the live `get` and widget-schema read from the paired phase as authority for the reported `loadedVersions`. If the reference is missing or conflicts with the live version, do not guess; return to paired inspection. If the active context is otherwise insufficient, pipe a fresh handoff to `--action summary --full` to discover `global`, `overlay`, root, or another sub-composition and its widget-reference routes.
8. Read the target script before editing. Preserve its wrapper and signatures, and use the smallest compatible whole-body write through the helper. Prefer `--script-file` for multiline content. A script write may close any currently open Composition Script Editor because the server invalidates active script-editing IDs.
9. Re-read the dedicated script endpoint through the helper after writing. A successful write is not proof that the code initialized or produced the intended output.
10. Verify in the Singular Player. Run `node scripts/doctor.js --browser` to check the packaged Playwright library and installed Chrome, then pipe a fresh handoff to `scripts/verifyComposition.mjs --handoff-file -`. Add `--scenario-file <path>` for version-1 declarative Player actions, bounded waits, lifecycle/state/DOM assertions, and named capture checkpoints. The bundled verifier runs in place against `playwright-core`; copy it to `temp/` only when the required trigger or assertion cannot be expressed by the declarative contract. Do not use a Composer canvas screenshot as runtime proof.
11. `composer-agent capture --wait-mode timed --settle <seconds>` opens the persisted public Player route and can provide a passive visual capture of the script result without requiring the scripted output to become still. Choose the bounded settle time from the initialization or data contract. It cannot by itself prove an event-driven path that was never triggered.
12. If verification exposes a structural problem, return to Composer, re-inspect before mutating, fix the composition or Control Node wiring, then generate a fresh handoff before editing the script again. Use a full composition-script summary only if the repaired target falls outside the fresh active scope.

Keep the saved authorization available for follow-up structural work unless the user explicitly asks to disconnect the agent. The script phase does not become a paired-editor command merely because it belongs to the same runtime skill.

## Required references

For widget-owned template outputs, read [widget-nodes.md](widget-nodes.md). The handoff and fast summary expose a separate `widgetNodes` snapshot; its values are editor samples, not public Control Node payloads or live Player state.

Read [composition-scripting/singular-scripting-doc.md](composition-scripting/singular-scripting-doc.md) before relying on runtime methods, listeners, or scripting patterns. Follow [composition-scripting/widget-references.md](composition-scripting/widget-references.md) to interpret handoff routes, and read the routed `composition-scripting/widget-*.md` file before authoring a widget payload. Use [composition-scripting/debugging-and-verification.md](composition-scripting/debugging-and-verification.md) for Player verification. Never guess widget APIs or payload keys.

## Designing scriptable graphics

Follow the construction, public-control, lifecycle, and completion requirements in [authoring-quality.md](authoring-quality.md). For script-specific implementation, preserve a clear boundary between public input and derived presentation:

- Control Nodes are the externally settable contract.
- Direct links are appropriate when an input maps directly to one widget property.
- When a script interprets or combines inputs, create those inputs as standalone controls, leave the derived widget property unlinked, and have the script read `comp.getPayload2()`, find the named widget, and update it with the exact widget API in the bundled scripting references. A hidden backing widget is unnecessary.
- Keep input fields and the widgets they drive in the same sub-composition unless cross-composition behavior is intentional.
- Treat widget and composition names as runtime lookup contracts once a script uses `findWidget()` or `find()`; rename them only together with the script.

### Real-time text recipe

For clocks, counters, scores, and other script-driven text, use the standard Text widget first. Resolve the widget once by its stable Composer name, call `widget.setPayload({ text: value })` only when the displayed string changes, and clear the scheduled update in `close()`. Use AISVG's version-1 `text` bindings only when the changing labels are part of coordinated vector artwork or several bounded SVG bindings; AISVG is not a general replacement for editable Text.

This ES2017-compatible clock aligns its next update to the second boundary and avoids redundant writes:

```javascript
(function() {
  var timer = null;
  var clock = null;
  var lastText = null;

  function formatTime() {
    return new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function schedule() {
    var value = formatTime();
    if (value !== lastText) {
      clock.setPayload({ text: value });
      lastText = value;
    }
    timer = setTimeout(schedule, Math.max(25, 1000 - (Date.now() % 1000)));
  }

  return {
    init: function(comp) {
      clock = comp.findWidget('Clock')[0];
      if (!clock) throw new Error('Clock Text widget was not found');
      schedule();
    },
    close: function() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      clock = null;
      lastText = null;
    }
  };
})();
```

Choose the locale, time zone, and format from the user's contract; do not silently use the browser's local time zone. Verify at least five displayed changes in the Singular Player. Use the bundled verifier's target capture and an explicit `--integrity-file` when the fixture has known invariant label/value regions. Runtime/DOM success and screenshot success are separate: a changing DOM hash does not prove every captured frame is visually complete.

For a real-time NYC weather lower third, a sound split is:

1. Build a named `NYC Weather Lower Third` sub-composition with Text/Image primitives and In/Out timelines.
2. Expose stable inputs such as location, temperature, condition, icon, and updated time through Control Nodes.
3. Verify the links and baseline layout in Composer.
4. Use the scripting phase to inspect the persisted composition structure and attach a root or sub-composition script that formats or fetches the weather data.
5. Verify first with deterministic mock payloads in the Player, then verify any user-approved live data source. Do not invent a weather provider, endpoint, credentials, or polling contract.
6. Clean up timers, listeners, data streams, and network activity in `close()`.

## Verification boundary

Composition scripts are installed by the Player runtime, not by the normal Composer graphic canvas. The runtime installs the global script before composition scripts and initializes child sub-compositions before the root. Use Player evidence for initialization order, listeners, widget changes, and animation calls.

For scoped ordinary-composition verification, pipe a fresh handoff to `verifyComposition.mjs --handoff-file - --composition-id active` (or pass an explicit composition ID). Root remains the default. The built-in target isolates sibling visuals in the private Player page and scopes DOM sampling, screenshots and default scenario actions; do not copy the verifier to change its selector. Drive target and ancestor In/Out states explicitly. Lifecycle counts remain page-wide, and widget-owned templates are unsupported. See [Player targeting and scenarios](composition-scripting/debugging-and-verification.md).

Choose verification based on behavior:

- passive initial state: standalone capture with enough settle time;
- Control Node transformation: Player harness calls `setPayload()` after script `init()` and checks the visible result plus logs;
- animation control: trigger `playTo()` or `jumpTo()` and record state/timeline evidence;
- timers or live data: capture multiple bounded frames and confirm cleanup behavior;
- subtle layout changes: query rendered widget bounds inside the Player iframe.

For animated or continuously changing output, judge a bounded temporal contract rather than one screenshot. Allow warm-up to the first meaningful runtime state, synchronize a checkpoint at least two animation frames after an observable DOM/payload change when possible, and sample nearby phase-offset moments. If one frame is grossly inconsistent while current DOM/runtime evidence and adjacent frames satisfy the contract, treat it as a capture anomaly or inconclusive result and retry with a shifted cadence. Report a runtime or rendering failure only when the violation repeats beyond the intended transition or independent semantic evidence also fails. Never infer an identity or link failure from an isolated pixel outlier.

Missing expected logs can mean the Player swallowed a script exception. Follow the bundled debugging ladder and place a log after each suspect runtime call or wrap that call in `try/catch`.

## Safety and persistence

- Treat the Composition API token and saved agent authorization as access to the persisted composition. Keep both only in the handoff pipeline; do not place either in specifications, committed files, screenshots, logs, or final responses.
- A composition-script write changes the persisted composition outside the paired editor command boundary. Read the target first, make one scoped change, and re-read it afterward.
- Never guess widget payload keys or script methods. Read the bundled scripting reference and the widget-specific payload reference derived from the codebase.
- Do not claim a script works from a successful `PUT`/`PATCH`, a Composer canvas view, or a single screenshot without triggering the relevant runtime path.
- Store temporary scripts, copied harnesses, logs, and screenshots only under `temp/`.

## Editing and reporting rules

- Preserve the existing IIFE wrapper and `init`/`close` signatures unless the task explicitly changes script type.
- Prefer ES5-style `var` and classic functions for compatibility, and clean up listeners, timers, intervals, and network activity in `close()`.
- Use `comp.playTo(state)` for animated transitions and `comp.jumpTo(state)` for immediate state changes. Prefer `timeline_event` evidence over `state_changed` because it captures animation start and completion.
- Use `clear-script` to disable behavior without deleting the script record.
- Report the script ID/name, relevant controls and links, the whole-body change, Player input used, observed behavior, and any remaining limitation. Never report the token.
