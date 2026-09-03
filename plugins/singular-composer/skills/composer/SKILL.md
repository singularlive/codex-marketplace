---
name: composer
description: Inspect, capture, create, and refine graphics in an open Singular Composer session, including composition elements, control nodes, layouts, timeline animations, and composition scripts. Use when AI needs to control Composer or develop and verify graphics and runtime behavior for a paired composition.
---

# Singular Composer

## Packaged runtime

This plugin includes the Composer helpers and their pinned npm dependencies, including
`playwright-core`. Do not run npm, npx, or install `@playwright/cli` to use this plugin.
Use Node.js 22 or newer. Resolve this skill directory from the installed SKILL.md path;
run the commands below from that directory, or use absolute paths to its scripts.
Before first use, run `node scripts/doctor.js`. For standalone capture or Player
verification, run `node scripts/doctor.js --browser` to check installed Chrome.
If a packaged dependency is missing, reinstall the complete plugin instead of repairing
it with npm. Chrome is a separate prerequisite; do not install or replace it silently.
Keep credentials, screenshots, and temporary files outside the installed plugin.


Control the user's currently open Singular Composer session through the bundled client.

```bash
node scripts/composer-agent.js <command> [options]
```

Every paired command checks the downloaded skill version against the server. If the CLI writes `COMPOSER_SKILL_UPDATE_AVAILABLE`, tell the user once in the current task that their Composer skill is older than the server and should be downloaded again. Continue the current task unless a separate command error prevents it.

## Pass structured CLI inputs through JSON files

Before the first command that needs a structured value, prefer a pre-approved agent-session temporary or scratch location that is already writable without another permission request. If none is available, fall back to the operating-system temporary directory only when it is writable under the agent's current permissions. Create one uniquely named task directory there, write each value as a descriptive UTF-8 JSON file, pass its path through `--value-file`, `--params-file`, `--easing-file`, `--layout-file`, or the command's existing `--file` option, and remove the task directory in finally-style cleanup after the related commands finish or fail. Relative paths resolve from the CLI working directory. If neither location is writable, report the blocker.

JSON value files may contain any valid JSON value, including a string, number, boolean, array, or object; the command's existing type validation remains authoritative. `get-many --ids` is deliberately comma-separated text rather than JSON.

For example, write `"Headline"` as the complete contents of a temporary `headline-value.json`, then run:

```bash
node scripts/composer-agent.js update --type tile --id <id> --path name --value-file <temporary-directory>/headline-value.json
```

The bundled CLIs are the only supported agent-facing interface, including for composition scripting. The client can inspect a scene, build and refine bounded or clipped overlay graphics, author sanitized AISVG paths and widget-driven vector animation, load Timeline-driven or continuously looping Bodymovin/Lottie JSON URL assets, manage scene and widget-owned sub-compositions, orchestrate keyed nested modules, configure Date / Time Countdown and Current Date and Time widgets and their templates, update supported Table and Grid widgets, expose and organize Control Nodes in native containers, link native Widget Node outputs inside templates, assign timeline, property-change Update, batched choreography, and continuous behavior animations, move elements between groups, and capture the rendered preview. It cannot replace raw composition JSON or read, write, or execute scripts through the paired editor relay. After the graphic structure exists, `script-handoff` packages the active composition, compact widget-document routes with observed widget versions, controls, links, host, Composition API token, paired agent authorization, and suggested script target for this skill's separate composition-script and Player phase. Widget documents own reusable payload knowledge; the live paired inspection remains authoritative for the loaded instance and version. The bundled composition-script helper uses the authenticated REST endpoints internally; those endpoints are transport implementation, not an alternative agent workflow. See [references/composition-scripts.md](references/composition-scripts.md).

Timer (`timer`) is also supported as an operator-controlled elapsed/count-up/count-down widget with a native Time Control input and widget-owned output template. Video Animation, Video Background, Video Clip, Video Clip with Audio, and Web Page are supported through the `video-animation`, `video-background`, `video-clip`, `video-clip-with-audio`, and `web-page` primitives.

## Composer is the source of truth for editor work

Never trust your own memory of scene state, prior command output, or assumptions about what an edit "should" have produced. Composer is the only authority on the current scene: re-`inspect` or `get` after every mutation before deciding what to do next, and resolve any mismatch between expectations and Composer's response in Composer's favor.

This rule applies to paired-editor work. For the common case where the script belongs to the active composition and uses the widgets and controls just inspected, pipe a fresh `script-handoff` to the composition-script helper and use its fast path instead of reloading all persisted content. For a known ordinary sub-composition, pass `script-handoff --composition-id <id>` to inspect it and restore the user's prior Composer scope automatically. Widget-owned templates still require `open-widget-subcomposition` because their IDs are ephemeral. If the target is ambiguous, outside the active composition, or the handoff lacks required context, use the same handoff with `summary --full`. Do not construct REST requests or invoke the script endpoints directly. Direct user-token operation is not supported. Every dedicated script request requires the active scene/account-scoped paired agent authorization carried by the handoff; cancellation, completion, or expiry revokes further script access. The dedicated script endpoint remains the persistence authority for script text, the bundled CLI helper is the only supported agent access path to it, and the Singular Player runtime remains authoritative for script behavior.

## Prefer atomic manifests for coordinated work

Use the highest-level bounded operation that represents the requested change:

1. For a graphic that creates or refines several related ordinary sub-compositions, prefer one stable-keyed `orchestrate --file <manifest.json>` run from root. Put each module's declarative graphics, `timelineAnimations`, `updateAnimations`, and `behaviors` in that manifest so creation/reuse, explicit timeline links, graphics, and all three motion families share one rollback batch.
2. Within one existing active composition, prefer `set-timeline-animations`, `set-update-animations`, or `set-behaviors` whenever two or more assignments from that family belong to one requested change. Timeline choreography alone supports stable `after` dependencies and signed relative `offset` values.
3. Use `create-composition`, `open-composition`, `apply`, `set-timeline-animation`, `set-update-animation`, and `set-behavior` as individual mutations only for one isolated edit, a targeted repair, readback-driven diagnosis, widget-owned template work, or a structure the bounded manifests cannot represent.

Command status is part of the operating contract. A command marked **Targeted only** in [references/commands.md](references/commands.md) has a distinct narrow use case and is not a fallback when a preferred batch fails. Do not use undocumented aliases or superseded command names; unreleased commands without a distinct supported use case are removed instead of retained for compatibility.

Atomic rollback does not replace verification. Inspect the correct scope before the operation, keep manifest keys stable on refinement, and read the returned IDs and final Composer state afterward.

## Authorize once

If no active credentials exist:

1. Ask the user to click **Composer AI** in the composition-editor header.
2. Ask for the six-character one-time pairing code Composer displays.
3. Run:

```bash
node scripts/composer-agent.js pair --code <pairing-code>
```

The server defaults to `https://beta.singular.live/`. Pass `--server <singular-server-url>` only when the user explicitly needs another environment. Never print or request the access token. It is stored in the user's home directory and expires after 30 days. Composer remembers the scene/user authorization for the same period and resumes its editor connection automatically after a reload, so the one-time code is not repeated for each task. The same scene/account-scoped credential authorizes the separate script endpoints until it expires or is explicitly disconnected.

On a successful claim, the bundled `pair` command automatically acknowledges the connection in Composer and tells the user to return to the AI Agent task. Confirm `"acknowledged": true` in its output; this means the editor applied a correlated, retryable connection-status message and returned its exact receipt through the Redis relay, not merely that the server accepted a publication. If it is false, do not imply that the user saw the connection; report the pairing state and wait for the editor to reconnect or for a fresh pairing. `credentialStorage` reports only `default`, `override`, or `temporary`. An explicit `COMPOSER_AGENT_CREDENTIALS` path always wins. Without an override, the CLI selects the newest complete unexpired credential by `pairedAt` across the default and workspace-keyed temporary locations; when the normal profile is permission-blocked, it writes the temporary location and removes that file on `complete`.

## Hold one work lease for the complete task

The saved JWT is authorization, not a permanent editor lock. At the start of every Composer task, before `inspect` or any other editor command, acquire one task-level work lease:

```bash
node scripts/composer-agent.js start-work
```

Composer locks for the lifetime of that lease, independent of the short-lived WebSocket used by each CLI command. Every editor command requires an active lease and renews its ten-minute fail-safe expiry. Composer opens its **Composer AI** modal, keeps it open and non-dismissible during active work, and blocks manual Composer input outside the modal until the lease is released or canceled. The modal activity log shows command progress and keeps **Cancel operation** available. When active work opened a previously hidden modal, releasing or canceling that work automatically hides it; a modal the user opened remains visible and clearly indicates that it can be closed while the agent is idle. If a non-editor phase such as script work or Player verification approaches ten minutes without a paired command, send a meaningful `status` update to renew the lease.

Before yielding a final response, waiting for user input, or otherwise ending the current task, release the lease in a `finally`-style cleanup:

```bash
node scripts/composer-agent.js finish-work
```

The CLI reinforces this gate on stderr after every relevant success or failure without changing its JSON stdout. Treat `COMPOSER_FINALIZATION_REQUIRED` as an immediate pre-yield check: if `start-work` succeeded in the current task, run `finish-work` and require its acknowledgement. Successful cleanup reports `COMPOSER_WORK_RELEASED`. Pairing is excluded because it does not acquire a work lease.

Do not leave the lease active merely because follow-up work is possible; the saved JWT remains authorized after release. If the agent exits unexpectedly, Composer releases the lock when the lease expires, and the user can release it immediately with **Cancel operation**. Before every Composer command, the bundled CLI reports the command being run automatically. Use status deliberately:

```bash
# Tell the user why you need them to return to this AI Agent task.
node scripts/composer-agent.js status --message "I need the team names before I can continue."

# Revoke the saved authorization only when the user explicitly asks to disconnect the agent.
node scripts/composer-agent.js complete
```

When the user clicks **Cancel operation**, the work lease is released, every active agent socket is interrupted, and the in-flight CLI command fails with `OPERATION_CANCELLED`. Stop the current task and do not run another Composer command until the user gives a new instruction. The saved authorization remains available for that later task. **Disconnect AI Agent** in Composer, or `complete` when the user explicitly requests disconnection, revokes the authorization; later commands then require a new one-time code.

At the start of a follow-up turn, run `start-work`, then use one cheap `inspect --summary` probe before parallelizing further Composer reads. If the probe reports revoked, expired, or disconnected authorization, stop and follow the pairing policy above. After a fresh successful `pair`, acquire a new work lease before resuming. Do not serialize reads during an otherwise healthy authorization and lease.

Do not call `complete` merely because a requested Composer change is complete. Use `finish-work` to release Composer while keeping the saved authorization ready for follow-up work. Use a `status` message to report completion or ask what to do next, then release the lease before yielding. Call `complete` only when the user explicitly asks to disconnect or revoke the agent.

### Ask through Composer first

Before asking the user any blocking question in the AI Agent task, send the same clear request to Composer first:

```bash
node scripts/composer-agent.js status --message "I need the team names before I can continue."
```

Then ask the user in the AI Agent task. Do not leave the Composer panel showing only a generic command name while waiting for a user decision. If sending the status fails because the session was canceled or disconnected, report that directly instead of claiming the Composer message was delivered.
After delivering the status, run `finish-work` before waiting for the answer.

## Always inspect before acting

```bash
node scripts/composer-agent.js inspect
```

`inspect` reports the scene, groups, tile summaries, selection, preview inputs, a `summary` count (groups, tiles, compositions, controls), and — critically — `activeComposition.stack`. Every other command operates on the **active composition only**. Confirm the scope before reading or writing anything, and read a full element with `get` before updating it.

Widget-owned sub-compositions have an intentional copy-on-exit lifecycle. When Composer exits standalone template editing, it replaces the template with a copy under a new composition ID and updates the owning widget field. Treat every widget-template ID as an ephemeral edit-session handle: never reuse it after returning to root, navigating out of the template, or starting a later operation. Re-resolve the current relationship from the owning widget with `widget-subcompositions` or `open-widget-subcomposition`. The widget tile ID and composition-valued field ID are the stable identities.

Apply the same edit-session boundary to every identity discovered inside a widget-owned template. Child tile/group IDs, Control Node model keys, Widget Node `keyId` values, link locations, and the active template ID may be used only while that exact template edit session remains open. They are command targets, not durable identities or diagnostic evidence. After leaving or reopening the template, or resuming it in a later task/turn, discard them all and inspect the newly resolved template again—even when a returned value happens to look unchanged. Address the template durably by owning widget tile ID plus composition-valued field ID; address Widget Node outputs semantically by declared field ID such as `format`, letting `link-widget-nodes` resolve the current internal `keyId`. Never diagnose a broken runtime link from an old/new ID comparison alone; confirm the current semantic link through readback and live Player behavior.

`open-widget-subcomposition` and full `inspect` return an opaque `identityScope.sessionToken` for the current open template. Pass it as the global `--template-session <token>` option on every subsequent read or mutation that targets that template or anything inside it, including `get`, `apply`, Control Node commands, Widget Node commands, animation commands, and capture. Composer rejects a missing token with `WIDGET_TEMPLATE_SESSION_REQUIRED` and an old or out-of-scope token with `WIDGET_TEMPLATE_SESSION_STALE` before the requested operation runs. Full `inspect`, catalog reads, owner-relative `open-widget-subcomposition`, and `open-composition --id root` remain available without a token for discovery and recovery. The token is an edit-session guard, not a durable identity or authorization credential; discard it with the other internal handles on exit or reopen.

When a newly created widget has an empty composition-valued field, open it with `open-widget-subcomposition --id <widget-tile-id> --create` (and `--field <field-id>` when required). This invokes Composer's native hidden widget-template creation path. Never substitute `create-composition`: that creates an ordinary visible parent tile rather than a widget-owned template.

For cheaper reads, narrow the output:

- `inspect --summary` returns only the counts, staying small even in large compositions.
- `inspect --selection` returns only the currently selected item.
- `get --selected` reads the selected tile or group in full without a separate `inspect` first.
- `primitives --primitive text` lists only the primitive you are about to create.
- `fonts --family <query>` searches Composer's available font families before a Text font change.

## Widget-owned output bindings

Use [references/widget-nodes.md](references/widget-nodes.md) when an owning widget supplies values to its template. Discover fields with `widget-nodes`, create related native links with `link-widget-nodes`, and remove only matching links with `unlink-widget-nodes`. Widget Node schemas and sample payloads are read-only; do not substitute Control Nodes or write raw data links. Reinspect after linking and verify changing output in the Player.

## Building or refining a graphic

### Choose inspectable primitives by default

When choosing new elements, prefer Composer-native primitives whose complete visual content is authored and inspectable in the composition, such as Text, Metric Text, Rectangle, Circle, and Gradient. Do not add an opaque or externally hosted runtime dependency merely to make a sparse prompt look richer.

Unless the prompt, a supplied reference or asset, or the specifically targeted existing element requires the capability, do not create `bodymovin`, `bodymovin-loop`, `sound`, `video-animation`, `video-background`, `video-clip`, `video-clip-with-audio`, or `web-page`. These widgets depend on external animation, audio, video, or nested-page content that must be identified and understood before authoring. Never invent a media or page URL, choose an arbitrary placeholder asset, or treat stored URL readback or a screenshot as proof that the content behaves correctly.

Other specialized primitives are conditional rather than generally avoided:

- Use `image` only when the request needs an image slot and the source is supplied, already present, or otherwise explicitly identified. Do not invent a placeholder image dependency.
- Use `html` only when custom trusted markup is part of the requested result; prefer standard editable primitives for ordinary text and shapes.
- Use `aisvg` only when standard primitives cannot express the required vector geometry, mask, filter, or widget-driven vector animation.
- Use tickers, clocks, timers, Table, and Grid only when the requested content or behavior is actually scrolling, time-based, tabular, or repeated. Do not select them as decorative substitutes for static primitives.

This is a creation-default policy, not a ban on inspecting, preserving, or editing an existing specialized widget that the user targets. When one is justified, read its authoring guide, inspect its live schema and content source, and perform the required Player verification.

For single-line Font 2.0 text, use `metric-text` and [Metric Text authoring](references/widgets/metric-text.md). Preserve its inspected metric-font object; ordinary Text font commands do not apply.

For multiline Font 2.0 text, use `metric-text-ml` and [Metric Text ML authoring](references/widgets/metric-text-ml.md). Configure line limits, wrapping and ellipsis, preserve the inspected metric font, and use a Textarea Control Node for public input.

For SVG-styled Font 2.0 text with gradient fill, outline, glow and looping sheen, use `metric-text-style` and [Metric Text Style authoring](references/widgets/metric-text-style.md). Create base text, then inspect and update native dynamic style fields.

For a horizontal Font 2.0 news crawl, use `metric-text-ticker` and [Metric Text Ticker authoring](references/widgets/metric-text-ticker.md). Newlines separate queued messages; verify scrolling and eventual clearing in the Player.

For an existing legacy-font crawl or when Font 1.0 compatibility is required, use `text-ticker` and [Text Ticker authoring](references/widgets/text-ticker.md). Prefer Metric Text Ticker for new Font 2.0 work.

For native animated Font 2.0 text, use `metric-text-animation` and [Metric Text Animation authoring](references/widgets/metric-text-animation.md). Create base text declaratively, configure Widget Timeline playback, then inspect and update the live dynamic effect fields.

For custom HTML fragments, use the `html` primitive and [HTML authoring](references/widgets/html.md). Its `source` textarea is unsanitized display markup; keep behavior in the separate composition-script phase and never interpolate untrusted HTML.

For CSS gradient surfaces, use the `gradient` primitive and [Gradient authoring](references/widgets/gradient.md). Its `css_string` textarea accepts CSS declarations; it is separate from structured gradient fields and the unsupported native Gradient Control Node.

For timeline-triggered audio, use the `sound` primitive and [Sound authoring](references/widgets/sound.md). Use an approved Player-reachable audio URL, keep volume in the inspected range, and verify playback and state transitions in the Player rather than through screenshots.

For video and embedded-page content, use the matching [Video Animation](references/widgets/video-animation.md), [Video Background](references/widgets/video-background.md), [Video Clip](references/widgets/video-clip.md), [Video Clip with Audio](references/widgets/video-clip-with-audio.md), or [Web Page](references/widgets/web-page.md) guide. Treat URLs as runtime dependencies, use timed Player verification, and verify media state or the nested page rather than relying on stored values alone.

For an operator-controlled elapsed timer, use the `timer` primitive and [Timer authoring](references/widgets/timer.md). Link an exact `timecontrol` Control Node to `timeControl`, build its widget-owned display template, and verify start/pause/reset plus ticking in the Player.

For prompt-, screenshot-, or reference-video-driven work, use this workflow. [references/authoring-quality.md](references/authoring-quality.md) owns the construction and visual-quality standard; the task references own exact commands and value shapes.

1. **Establish the target.** Read the authoring standard and interpret the user's request and supplied references. Run `inspect`, confirm `activeComposition.stack`, and read every existing target that may change. For sparse requests, use the inspected composition and your own design judgment to choose suitable content, layout, and motion. Record safe assumptions and continue; ask only when a missing decision materially changes composition boundaries, required controls, runtime behavior, or requested branding. Capture an untouched baseline only when the existing appearance must be preserved or compared, a supplied reference needs before/after evidence, or a rendering defect is being diagnosed. When an inspected target is structurally empty and no comparison is needed, skip capture and record `baseline: { "status": "baseline-not-applicable", "reason": "empty-target" }`.
2. **Plan the composition.** Derive tile, group, and sub-composition boundaries; public controls; dynamic-value requirements; layer order; and element lifecycles from the request and current composition before mutating. Improvise the visual design within those requirements and the authoring standard. For reference motion, read [references/video-reference.md](references/video-reference.md). Route widget authoring through [references/widgets.md](references/widgets.md), and widget-template and script work to their matching references. The live Composer schema remains authoritative for what can actually be authored.
3. **Discover live value contracts.** Run the narrowest applicable `primitives`, font, animation, Behavior, Control Node, or widget-schema read. Use the returned runtime shapes exactly, except for the documented solid-color RGBA rule. Never infer IDs, property paths, widget payloads, or catalog values from memory. When a requested public control belongs in root or another ancestor but its target is in the active descendant (including a widget-owned sub-composition), keep the target active and use the explicit ancestor-source option documented in [references/compositions.md](references/compositions.md); do not create a duplicate local control.
4. **Author one coherent change.** For several related ordinary modules, start at root and use one stable-keyed `orchestrate` manifest. For one composition, use one required-version-2 graphics specification, `validate` and `apply` it, then use the matching typed batch setter for each multi-assignment motion family. Keep keys stable, write every semantic placement unit explicitly as `"percent"` or `"px"`, and batch related work before capture.
5. **Verify the model.** Treat returned IDs and Composer readback as authoritative. Re-`inspect`, read changed elements, and verify composition scope, managed ownership, links, controls, motion assignments, and unrelated state before judging the rendered result.
6. **Render and refine only against evidence.** Capture only when pixels answer an acceptance question that model readback cannot. Follow [references/capture.md](references/capture.md) for standalone capture, readiness, and measurements. View every saved image, name each unresolved discrepancy, update the same specifications and keys, batch the related corrections, and capture again only after a material change.
7. **Apply the completion gate.** Use [references/authoring-quality.md](references/authoring-quality.md) to verify construction, rendered quality, dynamic content, motion, runtime behavior, and final restored state. Keep the best final artifact when one was needed, and report remaining visible differences or unverified requirements.

The capture budget is authoritative here: use zero captures for nonvisual/model-only work and normally one for a straightforward visual build or fix. For reference-driven work, allow up to five successful refinement captures by default; baseline, settled In, settled Out, and required animation-state evidence are verification captures and do not consume that budget. More than five refinements is allowed only while every additional pass addresses a concrete remaining discrepancy, and ten successful refinement captures is the emergency ceiling. Failed captures do not count. Never recapture unchanged output. Stop when the result is close enough, the latest pass makes no meaningful improvement, two consecutive refinement passes fail to reduce the discrepancy, or Composer returns a non-recoverable apply or capture error.

If the request also requires runtime logic, finish and verify the composition structure and public Control Node inputs first, then follow [references/composition-scripts.md](references/composition-scripts.md). Pipe a fresh `script-handoff` directly to the bundled composition-script helper; never ask for a Composition API token, call the underlying REST endpoints directly, or attempt script writes through the paired relay. Prefer the Player verifier's version-1 declarative scenario file for bounded payload, message, state, lifecycle, DOM-hash, bounds, and checkpoint verification; customize a copied harness only when that contract cannot express the required trigger. Keep the saved authorization available for later structural changes.

## Safety rules

### Mutation integrity

- Inspect every target with `get`, `get-many`, or the matching typed read before mutation. Never guess element IDs, property paths, value shapes, animation catalogs, or stored models.
- Use the typed mutation path for each model. Never write `effects`, `keyframes`, `layout.updateAnimation`, or `layout.behavior` through generic `update`.
- Start `orchestrate` at root, keep module and element keys stable, and treat its returned IDs as authoritative. Each graphics specification is authoritative only for its own managed group.
- If a typed batch or orchestration fails, inspect Composer, correct the manifest, and rerun the atomic operation. Do not replace it with a serial mutation sequence or retry a failed mutation blindly.
- Report relay and command errors directly. Preserve the original failure and Composer state rather than hiding either behind speculative recovery.

### User content and destructive scope

- Change only the content and properties the user requested. Preserve unrelated elements, compositions, groups, controls, scripts, and states.
- Before deletion, inspect and state the complete scope. Ask first when the operation would remove anything beyond the user's explicit request.
- Treat revisions as permanent scene-level resources. Create one only on explicit request; list immediately before permanently deleting one and identify its visible number and description. Restore only on explicit request, let `restore-revision` create its mandatory persisted backup, then reconnect and inspect after Composer reloads before claiming success. Revision reads and comparisons are structural summaries, never raw composition or script output.
- Treat `delete-group` and `delete-composition` as recursive destruction of their contents; neither can be emptied on the way out.
- Keep declarative output inside `AI Generated`. Do not move a managed child out merely to change stacking, because that releases its stable key; move the containing group when the whole module needs a new layer position.
- Never replace raw composition JSON or expose arbitrary script execution through the paired relay.

### Controls and composition identity

- Before changing widget data or a linkable Transform/Effect property, inspect `control-nodes`. When the property is linked, change the defining Control Node with `set-control-value`, or `set-control-font` for Metric Font; never bypass the public input contract with a direct property write.
- Create, replace, change, or delete a Control Node only after readback confirms the field, compatible type, defining composition, current value, and existing links. Treat `CONTROL_LINK_CONFLICT` as a reason to inspect and decide, not as permission to relink automatically.
- Change Control Node metadata with `update-control`, never generic `update`. Preserve omitted and unknown metadata, keep `type` and `keyId` immutable, and verify rename migrations and reordered indexes through `control-nodes` readback.
- Organize ordinary controls with `create-control-container` and `configure-control-container`. Treat `controlIds` as the container's complete ordered membership: listed controls move out of other ordinary containers, omitted former children become ungrouped, and Table fields/groups are protected. Delete a Control Node container only with `delete-control-container`; unlike a graphic group deletion, it preserves the contained controls.
- When a large Textarea or JSON editor should fill one titled Control App panel, use one Large ordinary container whose title matches its only child control, and set that child's `hideTitle` metadata to `true`. Use `textarea` for free text or `json` for the validated JSON editor; `jsonfile` is a file/URL picker and does not provide this editor. See [references/commands.md](references/commands.md#control-node-containers).
- Use a standalone Control Node only for an intentional external or composition-script input. Give it an explicit initial value, keep it in the composition whose script consumes it, and verify that it has no `dataLink` or `nodeRef`; do not create a hidden backing widget.
- Do not create native Gradient Control Nodes. Structured gradients are widget-rendering values, not suitable public API or external-control inputs. Author them directly on supported widget fields or use complete widget-runtime gradient objects inside composition scripts. A Color control may target a Gradient field only when the intended public input is one solid color.
- Resolve Metric Font values through `metric-fonts` and `set-control-font`; never supply metric geometry, custom-font URLs, or raw Metric Font values. Link only the exact widget field the user requests. Do not use batch/declarative control creation or infer the native bulk **Connect to Metric Widgets** action.
- Create Table Control Nodes only through `create-table-control`, optionally with `--source-composition root|<ancestor-id>`, then use `set-table-control` for strict whole-row replacement or `update-table-control --preview` followed by apply for atomic schema/options migration. Renames must be explicit, and removals require `allowDataLoss: true` after preview. Link through `link-table-control` to a native `table` or `json` widget field; the Table payload is a JSON row array and the Table widget accepts it directly through `tableContent`. Do not use generic value/metadata commands, batch/declarative creation, row-level edits, unsupported nested columns, or dormant `sortByColumn` metadata for Tables.
- Expose a Transform/Effect Control Node only when the user explicitly asks for that exact public input. Omission from a declarative specification preserves an existing control; it does not unlink or delete it.
- Never cache a widget-owned sub-composition ID after leaving template edit mode or starting a later operation. Rediscover the current relationship from its owning widget and composition-valued field.

### Capture and runtime evidence

- Treat capture as a visual assertion, not a progress heartbeat. Use Composer readback for structure, IDs, stored values, links, and motion configuration; use pixels only for rendered questions.
- Treat one timed screenshot of animated, live-data, timer, ticker, video, or script-driven output as one temporal sample, not as proof of the complete runtime behavior. A continuously changing target may never have a globally still frame.
- When one frame differs sharply from the expected result but current model readback, runtime/DOM evidence, user observation, or adjacent samples do not agree with that failure, classify it as a capture anomaly or inconclusive evidence first. Collect a bounded set of phase-offset samples and compare the intended invariant before diagnosing the graphic. Do not attribute an isolated visual outlier to composition, element, link, or Widget Node identities without independent current-session evidence.
- Follow [references/capture.md](references/capture.md) for standalone capture, target validation, wait modes, and measurement limits.
- Measurements are structural evidence and screenshots are visual evidence. Neither replaces model inspection, image review, or Player verification.
- Do not treat a capture, a successful script write, or one settled image as proof that a composition script ran. Verify script behavior and runtime sequences in Singular Player through [references/composition-scripts.md](references/composition-scripts.md).

## Reference

Read the file matching the task instead of loading everything up front.

| File | Read it for |
| --- | --- |
| [references/commands.md](references/commands.md) | Every CLI command, its flags, and output options. |
| [references/authoring-quality.md](references/authoring-quality.md) | Authoritative two-part standard for effective Composer construction, final graphic quality, and the completion gate before user handoff. |
| [references/video-reference.md](references/video-reference.md) | Conditional coarse-to-fine analysis for recreating motion, reveal order, masking, timing, or persistence from a reference clip. |
| [references/graphics.md](references/graphics.md) | Primitives, layout math, the declarative specification format, grids, and design guidance. |
| [references/widgets.md](references/widgets.md) | Widget authoring index: Text variants, Rectangle, Circle, Gradient, HTML, Image, AISVG, Bodymovin, Bodymovin Loop, Sound, Date / Time Countdown, Current Date and Time, Grid, and Table references. |
| [references/compositions.md](references/compositions.md) | Sub-composition structure and navigation, taking compositions in/out, timeline effects, and control nodes. |
| [references/composition-scripts.md](references/composition-scripts.md) | Paired Composer-to-script workflow, scripting references, authenticated handoff, and Player verification. |
| [references/widget-subcompositions.md](references/widget-subcompositions.md) | Widget-owned templates, static vs. dynamic contracts, discovery, navigation, and composition-ID rebuilds. |
| [references/capture.md](references/capture.md) | Standalone capture, readiness, measurements, sub-composition isolation, and delays. |
