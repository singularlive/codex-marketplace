# Preview capture

Use standalone capture when a rendered image will answer a visual question that Composer model readback cannot. Use the Player-verification workflow when the question requires an authoritative runtime sequence or script behavior.

Before every capture, identify the unresolved visual question. Use model readback instead for names, IDs, hierarchy, stored values, animation configuration, Control Node links, Table rows/options, and other state the CLI can verify authoritatively. Capture a baseline only when the existing appearance must be preserved or compared, a supplied reference needs before/after evidence, or a rendering defect is being diagnosed. After `inspect` confirms that the requested target is structurally empty and no before/after preservation is required, skip the command and report `baseline: { "status": "baseline-not-applicable", "reason": "empty-target" }`; this is a workflow result, not a renderer error. Skip baselines for other disposable compositions and nonvisual work as well. A non-empty target that fails to attach or render still returns its normal capture error. Batch related mutations before capturing and never recapture output that has not materially changed.

The capture budget in [`../SKILL.md`](../SKILL.md), under **Building or refining a graphic**, is authoritative. This reference does not define a second numeric budget: classify each successful image as refinement or required verification, name the unresolved visual question before every refinement capture, and stop under the limits and early-termination rules in the skill. Failed captures and unchanged output are handled there as well.

Standalone is the unified CLI capture path. It uses a private headless Chrome worker and never changes the user's active tab. The worker stays warm for five minutes after a capture so later standalone commands avoid another Chrome launch, while every capture uses and closes a fresh isolated browser context.

## Unified capture command

```bash
node scripts/composer-agent.js capture \
  --target <root|active> \
  [--template-session <token>] \
  [--wait-mode <smart|timed>] \
  [--timeline <In|Out> --at <seconds>] \
  [--measurements <path.json>] \
  --timeout 30 \
  --settle 0 \
  [--server <url>] \
  --output <path.png>
```

- `--target` defaults to `root`. `active` captures the active scene or widget-owned sub-composition when one is open and otherwise resolves to root. An active widget-owned target requires the current opaque `--template-session <token>` from full `inspect` or `open-widget-subcomposition`; missing or stale tokens fail before Player startup.
- `--wait-mode` defaults to `smart`. `smart` waits for finite Singular timelines and a short target-scoped visual quiet window. `timed` waits for core lifecycle and assets, then captures after `--settle` without requiring the output to stop moving.
- `--timeline` and `--at` capture an exact paused position of the root or an ordinary active composition's `In` or `Out` timeline. They must be supplied together, require `smart` mode, do not support widget-owned active compositions, and reject positions beyond the selected timeline duration instead of silently clamping them.
- `--measurements` writes an optional version-1 Player measurement snapshot immediately before the screenshot. Use it for a named geometry question, not as a default sidecar for every capture.
- `--timeout` is the overall renderer-readiness deadline in seconds and defaults to `30`.
- `--settle` adds a non-negative delay after core readiness. It defaults to `0` in `smart` mode and `2` seconds in `timed` mode.
- `--server` is optional and must normalize to the server stored in the paired credentials. It supports environment-explicit invocations but cannot retarget an existing access token; a mismatch fails with `CAPTURE_SERVER_MISMATCH` and requires pairing with the intended server.
- `standalone` runs `inspect` internally, keeps the Composition API token in the CLI process, and captures at the reported composition resolution.

Successful output contains the absolute path, source and target, PNG dimensions and byte size, composition identity, editor resolution, and readiness metadata. When requested, `measurements` adds the absolute JSON path, schema version, measured element count, truncation state, and byte size. The retained `fallback` field is always `null`. Output never contains a token, preview URL, data URL, browser command line, or raw browser error.

Standalone core readiness requires a visible positive target box; target-owned DownloadStore cycles to finish; composition-script evaluation to reach `ok` or `error`; a short payload/resource quiet period; loaded fonts; decoded target images; and completed or failed CSS background assets. The listener is injected before navigation into every frame, so events emitted by nested widget frames can be collected from their immediate parents. All gates share the one caller-provided deadline.

In `smart` mode, standalone additionally waits until Singular's finite In/Out timelines are inactive and no timeline reports an unfinished transition, then requires 350 ms of unchanged target-scoped visual state. For a requested timeline position, it first lets that normal finite-timeline gate complete, seeks the existing runtime, verifies the exact paused time, and applies the same visual-stability check without requiring the intentionally incomplete timeline to finish again. Root capture uses Composer's phase-aware runtime timeline-position path, preserving linked descendants and timeline-aware widget callbacks. Ordinary active capture uses the existing Player composition seek API and confirms the selected runtime timeline position before capture. The sample hashes text content, relevant HTML/SVG attributes, computed visibility, opacity, transforms, backgrounds, fonts, bounds, resources, and the complete target-owned Playwright frame tree. This targets Singular timelines specifically; it does not use global `TweenMax.getAllTweens()`, which cannot distinguish finite timeline motion from continuous Behavior or script tweens. If visual changes continue for three seconds after the finite-timeline gate, capture fails early with `PREVIEW_CONTINUOUS_ACTIVITY` and directs the caller to timed mode instead of consuming the complete overall timeout. Canvas presence is reported in readiness metadata, but canvas pixels are not used as proof of stability.

In `timed` mode, capture performs its resource gates, waits `--settle`, rechecks resources, then samples one visible state without requiring timelines or rendered output to become still. Standalone bootstraps from either the preview-ready console signal or an attached `#SingularPlayer` iframe. The iframe is resolved from the element itself, with its stable `/singularplayer/output` URL and top-level child-frame relationship as compatibility fallbacks, rather than assuming its `name` attribute matches its ID. For a widget-owned active composition, capture enters the owning widget iframe and selects the visually active runtime instance of the template. Empty compositions are valid; readiness does not require text or descendants.

Readiness metadata includes the selected wait mode, lifecycle event counts and wait duration, script-error count, payload activity, per-resource gate durations, inspected timeline counts and wait duration in smart mode, stability resets/quiet duration, canvas count, image counts, and the requested settle time. `imageGateComplete` reports that every image reached loaded or failed terminal state and any decodable image completed its decode gate. `allImagesLoaded` is true only when the final target sample has no failed or pending images, while `imageStatus` contains the loaded, failed, and pending counts. The retained `imagesReady` field is a backward-compatible alias for gate completion and does not by itself prove successful image rendering. Readiness never contains script text, event payloads, tokens, image URLs, or preview URLs.

## Standalone prerequisites

Run `node scripts/doctor.js --browser` from the skill directory. The plugin includes
`playwright-core`; no Playwright CLI or npm installation is needed. Node.js 22+ and
installed Google Chrome are required. If a packaged dependency is missing, reinstall
the complete plugin. If Chrome is unavailable, report that specific prerequisite.

The bundled library starts a localhost-only headless Chrome worker. Subsequent captures
within its five-minute idle window reuse the process with a fresh context and page.
The worker accepts authenticated local requests only and exits after its idle window.
Do not substitute Chromium unless Chrome is unavailable and the user approves it.

The headless browser must be able to reach the preview endpoint and the external origins used by that preview, including its CDN bootstrap dependencies and any data or asset URLs required by the composition script. In a restricted browser-network context, the outer preview page can fail before attaching `#SingularPlayer` and surface as `PREVIEW_FRAME_NOT_FOUND`. Re-run the same supported command from a network-enabled execution context before treating that error as a renderer defect.

## Standalone capture

The unified command runs `inspect` internally. For direct legacy-script use, run `inspect` first and read its `preview` object:

```json
{
  "preview": {
    "endpoint": "http://localhost:3000",
    "compositionToken": "<composition-api-token>",
    "width": 1920,
    "height": 1080
  }
}
```

Capture the full live composition preview:

```bash
node scripts/capture-composition-preview.js <endpoint> <width> <height> <composition-token> <output-path> [--measurements <path.json>] [--wait-mode <smart|timed>] [--delay <seconds>] [--timeout <seconds>] [--timeline <In|Out> --at <seconds>] [--json]
```

Capture a paused root Timeline frame, for example halfway through `In`:

```bash
node scripts/composer-agent.js capture --target root --timeline In --at 0.5 --output <path.png>
```

Timeline-position capture deliberately excludes widget-owned active compositions, timed mode, continuous Behavior time, script timers, and video clocks. A paused root Timeline frame includes timeline-aware widget seek callbacks and linked descendants. An ordinary active composition uses the Player composition seek path. Neither form freezes independent runtime clocks.

Capture one isolated sub-composition at the same resolution:

```bash
node scripts/capture-composition-preview.js <endpoint> <width> <height> <composition-token> <output-path> --composition-id <composition-id> [--wait-mode <smart|timed>] [--delay <seconds>] [--timeout <seconds>] [--json]
```

For direct debugging of a widget-owned composition, also pass its owning tile ID:

```bash
node scripts/capture-composition-preview.js <endpoint> <width> <height> <composition-token> <output-path> --composition-id <composition-id> --widget-tile-id <widget-tile-id> [--wait-mode <smart|timed>] [--delay <seconds>] [--timeout <seconds>] [--json]
```

The token is the composition's public **Composition API Token**, not the Composer-agent access token. If `compositionToken` is empty, ask the user to generate one in Composer's composition properties, then inspect again. Do not print, quote, or share either token unnecessarily.

The legacy executable keeps its one-second `--delay` default for compatibility and maps that delay to post-readiness settling. Its wait mode defaults to `smart`. `--json` emits the same structured metadata as the unified command. By default it captures `.onair-renderer.root-onair` from the `SingularPlayer` iframe. With `--composition-id`, it targets `#onair<composition-id>`, temporarily hides sibling DOM branches, waits for deterministic readiness, and captures the isolated full-canvas renderer. With both composition and widget tile IDs, it instead finds the owning widget iframe and captures the best visible matching `.composition-instance` renderer.

### Capture measurement snapshot

Add `--measurements <path.json>` when capture must answer a concrete layout question:

```bash
node scripts/composer-agent.js capture --target root --output <path.png> --measurements <path.measurements.json>
```

Capture samples the ready private Player target immediately before taking the PNG. Version 1 uses capture-target coordinates and contains the target dimensions plus up to 500 Singular group, widget, and sub-composition wrappers. Each element records its runtime ID, name, type, composition identity, pixel and percentage bounds, visible clipped bounds, visibility, opacity, transform, z-index, and transformed quad when the browser exposes it. Widget entries additionally record text length and rendered line count, bounded image geometry without image URLs, and SVG/canvas counts. Names are limited to 200 characters, images to ten per widget, and the complete file to 1 MB. The summary reports the measured and total element counts and whether truncation occurred.

The snapshot contains no text values, image URLs, DOM dump, script text, event payload, token, or preview URL. Runtime IDs plus composition identity disambiguate repeated elements. `summary.contentBounds` and `contentBoundsPercent` union the visible bounds of measured non-group elements so full-canvas structural groups do not hide the actual foreground extent; `contentBoundsTruncated` is true when the element cap prevents that union from being complete. `summary.imageStatus` reports total, measured, loaded, failed, and pending image counts plus truncation. Each bounded image item reports `status` (`loaded`, `failed`, or `pending`) and a sanitized failure reason without its source URL or raw browser error. Standalone request tracking can additionally report safe HTTP/network/decode variants and an optional numeric status. Iframe-backed widget internals remain opaque in version 1; their Singular wrapper is still measured, while internally rendered text or images may not appear in the widget detail fields.

In smart mode—including an explicitly sought Timeline position—the target has passed visual stability before measurement. In timed mode, the snapshot is sampled immediately before the screenshot, but continuous Behavior, script, timer, video, or live-data clocks are not frozen and can advance between those two browser operations. Use the snapshot for geometry and clipping evidence; use the PNG for glyph rendering, filters, gradients, shadows, canvas pixels, video content, and overall visual comparison.

Write output to the session artifacts directory when one is available.

### Choosing a wait mode and delay

Use `smart` when the target is script-free and its intended Singular Timeline animations are finite. It normally avoids the former unconditional two-second quiet wait: once downloads, scripts, payload propagation, fonts, images, finite timelines, and 350 ms of visual stability complete, capture proceeds.

Use `timed` when the target has any known persisted composition, global, or overlay script; continuous Behavior; Bodymovin Loop; a ticker; timer; polling; live data; video; or another output that may never become visually still. Also use it when script presence cannot be ruled out. Choose `--settle` from the intended capture moment rather than increasing the overall timeout. The unified command defaults timed settling to two seconds; specify a different bounded value when the script or data contract requires one.

Use timed capture for one sampled state of continuous output. Use the Player-verification workflow when a frame sequence must prove composition-script or runtime behavior.

When starting from a paired workflow and script presence is unknown, pipe `script-handoff` to the bundled composition-script helper's read-only `list-scripts` path. Because that endpoint can be empty even when a composition script is readable, probe the suggested active/root script target when necessary. Do not expose script text or move script inspection into the paired relay. If smart mode reports ongoing timeline or visual activity, inspect the target and retry once with timed mode; do not make a continuously moving composition satisfy smart mode by extending `--timeout`.

### Temporal evidence for animated and live output

For continuous animation, clocks, timers, tickers, video, polling, and live data, the acceptance target is a behavior over time rather than one globally stable frame. Timed readiness proves that lifecycle and resources reached a sampleable state; it does not prove that the chosen instant is representative or that a screenshot backend did not sample during a compositor update.

Define the invariant before sampling—for example, a clock always presents one complete formatted value while its seconds advance, or a ticker remains clipped to its viewport while moving. Then:

1. Allow bounded warm-up until runtime/DOM evidence shows the first meaningful state. Initial blank frames before that state are readiness evidence, not automatically rendering failures.
2. When the relevant DOM or payload change can be observed, allow the browser at least two animation frames before the visual checkpoint. This is a synchronization aid, not a promise that continuous output becomes still.
3. Collect a small bounded sequence at phase-offset times appropriate to the behavior. If one sample differs sharply from the invariant, retry at a deliberately shifted offset instead of repeating the same cadence against the same update boundary.
4. Compare screenshot evidence with current runtime/DOM state, lifecycle evidence, Composer readback, and adjacent frames. Do not weaken the invariant or select only favorable frames.
5. Report `pass` when the required behavior has representative visual and semantic evidence; `fail` when the same violation persists across adjacent or phase-shifted samples beyond any intended transition, or semantic evidence also fails; and `inconclusive` when pixel and semantic evidence conflict after the bounded retry.

An isolated anomalous frame is useful diagnostic evidence but is not sufficient by itself to identify a broken link, stale identity, incorrect runtime value, or visible user-facing defect. Pausing or disabling animation can answer a static layout question, but it changes the runtime contract and cannot serve as the sole proof of animated behavior. Use the Player-verification workflow for multi-frame behavior.

## Isolating a sub-composition

For a screenshot of one sub-composition, prefer `--composition-id`. Its DOM visibility changes exist only in the temporary Playwright page, so it changes no persistent animation settings or playback states and requires no restoration.

Use state-based root capture only when the actual on-air combination of root and sub-compositions matters:

1. Inspect the relevant elements and confirm they have an effective In or Out animation.
2. Take unrelated root or sibling compositions out.
3. Take the target composition in.
4. Run the standalone script without `--composition-id`.

Taking the root composition out hides animated elements directly in the root; nested sub-compositions remain governed by their own composition states and timelines.

An `Out1` or `Out2` state is not inherently invisible. Elements whose applicable timeline effect is `none`, or whose animation otherwise leaves them visible, still render while their composition reports an Out state. If a composition is already Out when its timeline changes from `none` to a hiding animation, cycle it In and then Out before capture so the new timeline plays.

Avoid changing animation solely for a screenshot. If state-based isolation is explicitly required, snapshot and restore every changed animation and composition state.

## Capture errors

Stable error codes include `PLAYWRIGHT_UNAVAILABLE`, `BROWSER_LAUNCH_FAILED`, `PREVIEW_NAVIGATION_FAILED`, `PREVIEW_READY_TIMEOUT`, `PREVIEW_CONTINUOUS_ACTIVITY`, `PREVIEW_FRAME_NOT_FOUND`, `PREVIEW_TARGET_NOT_FOUND`, `PREVIEW_TARGET_NOT_VISIBLE`, `PREVIEW_ASSET_TIMEOUT`, `PREVIEW_TIMELINE_SEEK_FAILED`, `CAPTURE_FAILED`, `CAPTURE_TOO_LARGE`, `MEASUREMENT_TOO_LARGE`, `MEASUREMENT_WRITE_FAILED`, `INVALID_CAPTURE_TARGET`, `INVALID_CAPTURE_WAIT_MODE`, `INVALID_CAPTURE_TIMELINE`, and `COMPOSITION_TOKEN_REQUIRED`.

Playwright, Chrome, token, navigation, renderer, target, and asset failures are reported directly with the applicable code.

## Reading results

- Open every saved image with the available image-viewing tool before assessing or comparing.
- Captures exclude Composer controls, selection boxes, and snap guides.
- Standalone capture uses the requested root render resolution. An isolated scene sub-composition keeps its full canvas and replaces hidden sibling content with the preview background color; a widget-owned composition uses the dimensions of the selected runtime template instance.
- A standalone measurement snapshot is structural evidence from that same ready Player page, sampled immediately before its PNG. Read `summary.truncated` before assuming every runtime element is present, and do not substitute its axis-aligned bounds for visual review of transformed, filtered, canvas, or video output.
