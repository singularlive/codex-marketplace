# Command reference

All commands run through the bundled client:

```bash
node scripts/composer-agent.js <command> [options]
```

Add `--compact` to `inspect`, `get`, `apply`, or `control-nodes` for minified output. Compact output still contains identities, names, runtime values, control links, and errors. For `apply`, the flag minifies JSON whitespace but intentionally does not reduce the response shape.

For widget `get` specifically, compact output also reshapes the result: widget data is under `values` and the reduced schema is under `fields`. Full output uses `data` and `widget.fields`. Do not assume `--compact` changes whitespace alone.

The client preserves stdout for command JSON and pipelines. After every relevant command success or failure, stderr emits `COMPOSER_FINALIZATION_REQUIRED` to remind the caller that any work lease acquired during the task must be released before yielding. A successful `finish-work` emits `COMPOSER_WORK_RELEASED` instead, and a successful `complete` reports authorization revocation. `pair` and `pair-intent` emit no lifecycle reminder because pairing does not acquire a work lease.

`--server <url>` is a global paired-command selector. When supplied, it must match the server stored during pairing; it never retargets credentials. This applies consistently to single and batch commands, including `set-timeline-animations`.

`--template-session <token>` is the global widget-template edit-session guard. Obtain the opaque token from `open-widget-subcomposition` or a full `inspect` while that template is active, then pass it on every command that reads or mutates the template or its descendants. Missing tokens fail with `WIDGET_TEMPLATE_SESSION_REQUIRED`; tokens from a closed, copied, reopened, or different template fail with `WIDGET_TEMPLATE_SESSION_STALE` before the operation runs. Do not derive, cache beyond the current edit session, or treat the token as a template identity. Full `inspect`, catalog reads, owner-relative template opening, and root navigation are recovery-safe exceptions.

The flags `--compact`, `--selection`, `--summary`, `--selected`, `--italic`, `--underline`, `--always-execute`, `--create`, and `--remove` are booleans: pass them with no value (enabled) or with an explicit `true`/`false`. `--remove` applies to `set-behavior`. `--active` always takes an explicit `true` or `false` value.

Structured JSON inputs use files. Prefer a pre-approved agent-session temporary or scratch location that is already writable without another permission request; fall back to the operating-system temporary directory only when current permissions already allow it. Create one unique task directory in the selected location, write descriptive UTF-8 JSON files there, pass their paths with `--value-file`, `--params-file`, `--easing-file`, `--layout-file`, or an existing `--file` option, and remove the task directory in finally-style cleanup after success or failure. Relative paths resolve from the CLI working directory. If neither location is writable, stop and report the blocker. Value files may contain any valid JSON value; existing command validation still determines which shapes and types are accepted. `get-many --ids` accepts comma-separated text only and rejects JSON-array syntax.

## Command selection policy

- **Preferred** commands are the normal path for the scope they represent.
- **Targeted only** commands remain supported because they have a distinct isolated-edit, repair, diagnosis, navigation, or unsupported-structure use case. Never decompose a supported batch or orchestration into these commands after the atomic operation fails; correct the manifest and rerun it.
- Superseded commands and aliases with no distinct use case are absent from the CLI and this reference. Do not infer or try old names.

## Session

| Command | Purpose |
| --- | --- |
| `pair [--server <url>] --code <code>` | Claim a one-time pairing code, store a 30-day scene/user JWT authorization, and automatically acknowledge it in Composer. `acknowledged: true` requires the editor to apply the retryable connection status and return its correlated receipt through the Redis relay. The editor resumes this authorization after reload. The server defaults to `https://beta.singular.live/`; output reports `acknowledged` and the sanitized `credentialStorage` category. |
| `pair-intent [--server <url>] --intent-id <id> [--intent-secret -] [--device-name <name>]` | Orchestrator-only automatic pairing. Claim an authenticated short-lived intent after Composer binds it. Supply the secret through `COMPOSER_AGENT_INTENT_SECRET` or pipe it on stdin with `--intent-secret -`; literal secret arguments are rejected. The command waits up to two minutes across valid-but-unbound `409` responses and shared-rate-limit `429` responses, then stores and acknowledges credentials like `pair`. Normal runtime users should use the visible-code `pair` flow. |
| `start-work` | Acquire or renew the ten-minute task-level work lease. Run once before the first editor command in every task; Composer remains locked across individual command sockets. |
| `finish-work` | Release the current work lease and Composer input while preserving the reusable JWT authorization. Run before every final handoff or wait for user input. |
| `status --message <text>` | Show a concise update and renew an active work lease. It does not acquire a missing lease. |
| `complete` | Revoke the saved authorization only after the user explicitly asks to disconnect the AI Agent. Ordinary task completion uses `finish-work`. |
| `inspect` | Read the scene, preview inputs, active composition stack, selection, groups, tile summaries, and a `summary` count of groups, tiles, compositions, and controls. |
| `inspect --selection` | Return only the currently selected item (`id`, `type`, `groupId`). |
| `inspect --summary` | Return only the `summary` counts; the full tile list is omitted, so the payload stays small even in large compositions. |
| `script-handoff [--composition-id <id\|root>]` | Inspect the active composition and its local Control Nodes once, then return versioned context for the scripting fast path. With `--composition-id`, temporarily inspect that root or ordinary sub-composition as the suggested script target and restore the prior Composer scope before returning. Widget-owned templates retain their owner-field navigation workflow. |

Pairing claims are rate limited to one request per second per client address across the claim endpoints. A `429` response has not consumed the pairing code; wait for its `Retry-After` interval and retry the same `pair` command. `pair-intent` performs this bounded retry internally.

`COMPOSER_AGENT_CREDENTIALS` has highest precedence and is never silently replaced when its configured file is unreadable or unwritable. Without that override, pairing first uses the normal profile file and falls back to a workspace-keyed file under the operating-system temporary directory only for `EACCES`, `EPERM`, or read-only-filesystem failures. Later commands discover that fallback deterministically, expired fallback credentials and `complete` remove it, and managed fallback identity is stable across working directories. Other read/write failures return `CREDENTIAL_READ_FAILED` or `CREDENTIAL_WRITE_FAILED` with a sanitized target category and remediation; no credential value or complete path is printed. Composer locks while the explicit work lease is active, not while individual sockets are connected. Editor commands without a lease fail with `WORK_NOT_STARTED`. **Cancel operation** releases the lease and interrupts active sockets without revoking the JWT; stop the current task on `OPERATION_CANCELLED`. **Disconnect AI Agent** revokes the authorization.

## Widget Nodes

Widget Nodes are owner-supplied template outputs, not public Control Nodes. See [widget-nodes.md](widget-nodes.md) for their read-only schema, native link formats, compatibility, source scope, and verification workflow.

| Command | Purpose |
| --- | --- |
| `widget-nodes [--source-composition <self\|root\|ancestor-id>] --template-session <token>` | Read declared Widget Node fields and editor samples from the selected source, plus native Widget Node links targeting the active composition. The result includes `identityScope`, marking internal IDs as current-template-session handles and declared field IDs as the semantic addressing contract. |
| `link-widget-nodes --file <links.json> --template-session <token>` | Atomically link 1–100 declared outputs to existing widget fields or supported tile/group layout properties. Same-source reapplication is idempotent; replacing a different link requires `replace: true` on that entry. The result repeats `identityScope`; the command resolves current `keyId` values from semantic `nodeId` inputs. |
| `unlink-widget-nodes --file <links.json> --template-session <token>` | Atomically remove only links matching the specified Widget Node source and target. Absent links are unchanged; unrelated links are conflicts. The result repeats the same edit-session identity boundary. |

## Elements

| Command | Purpose |
| --- | --- |
| `get --type <tile\|group> --id <id>` | Read one complete tile or group. Tiles include layout, widget control data, and the widget field schema. |
| `get --selected` | Read the currently selected tile or group in full, without a separate `inspect` first. Fails with a clear error when nothing is selected. |
| `get-many --type <tile\|group> --ids <id-1,id-2>` | **Preferred for related targets:** validate every ID first, then read all of them. Returns no partial result. |
| `select --type <tile\|group> --id <id>` | Select an existing element in Composer. The `selected` result includes its `id`, `name`, and `elementType`. |
| `move --id <tile-id> --group-id <group-id> [--index <n>]` | Move a tile into another group in the active composition, or reorder it within its group. |
| `update --type <tile\|group> --id <id> --path <path> --value-file <value.json>` | Update one existing property. The `updated` result includes `id`, `name`, `elementType`, `namespace`, `path`, `previousValue`, and the applied `value`. |
| `update ... --namespace data --path <field-id> --value-file <value.json>` | Update one existing widget control value and return the same named `updated` result shape. |
| `fonts [--source <user\|account>] [--family <substring>]` | List safe font summaries from Composer's current font catalogs. |
| `set-font --id <tile-id> [...]` | Set catalog-backed Text family, weight, italic, underline, or alignment properties. |

`--value-file` must point to a readable valid JSON file whose value preserves the existing property's type. Exact widget fields with schema type `datetime` additionally allow a native unset empty string to become an integer Unix millisecond timestamp within the JavaScript Date range, or return to the empty-string sentinel. Other date strings, fractional timestamps, and out-of-range timestamps are rejected. Null and undefined are rejected, so `update` can never act as a delete.

```bash
node scripts/composer-agent.js update --type tile --id <id> --path layout.left --value-file <temporary-directory>/left.json
node scripts/composer-agent.js update --type tile --id <id> --path name --value-file <temporary-directory>/headline.json
node scripts/composer-agent.js update --type tile --id <id> --namespace data --path <field-id> --value-file <temporary-directory>/team-name.json
```

Before using `update` on widget data or a linkable layout property, run `control-nodes` and match the requested `(elementId, propertyId)` against its `links` and `nodeRefs`. If a Control Node drives that property, do not call `update` for the linked target. Use `set-control-value` on the defining Control Node and verify both the control and linked element readback. Also inspect `widget-nodes` for owner-supplied output links. Do not overwrite a Widget Node-driven target: change the owning widget's inputs, or deliberately unlink the matching output first. Direct property updates are only for unlinked targets.

Use `fonts` and `set-font` for Text font changes; they validate catalog families and weights and supply required account-font metadata. See [text.md](widgets/text.md).

### Moving between groups

```bash
node scripts/composer-agent.js move --id <tile-id> --group-id <group-id>
node scripts/composer-agent.js move --id <tile-id> --group-id <group-id> --index 0
```

Both the tile and the target group must be in the active composition. `--index` is the 0-based position in the group's layer order, where `0` is front-most; omit it to append behind the group's existing items. Passing the tile's current group reorders it in place.

The move rewrites the target group's item priorities and each moved tile's `layout.zindex`, exactly as a layer-list drag does. It leaves the source group's remaining priorities untouched, and does not touch the tile's data, links, keyframes, or effects.

Any tile can be moved into or out of any group. Moving a declarative graphic out of the `AI Generated` group releases it from `graphics.apply`: its spec key is cleared, it becomes an ordinary element, and the response reports `releasedKey`. A later `apply` whose spec still lists that key will build a new element for it rather than reclaim the moved one.

## Groups

| Command | Purpose |
| --- | --- |
| `create-group --name <name>` | **Targeted only:** create one ordinary group outside a declarative managed specification. |
| `create-group --name <name> --layout-file <layout.json>` | **Targeted only:** create one ordinary group and atomically assign supported bounds, clipping, or appearance fields. |
| `configure-group --id <group-id> --layout-file <layout.json>` | **Targeted only:** atomically update one existing ordinary group, or repair managed-group geometry/appearance after readback. |
| `move-group --id <group-id> --index <n>` | Reorder one existing group without moving its children or changing managed metadata; index `0` is front-most. |
| `delete-group --id <group-id>` | Delete a group and everything in it. |

`delete-group` uses Composer's normal group deletion. As in the UI, a group cannot be deleted without its tiles: each one's data, links, and node references go with it, and any sub-composition it holds is removed too. The response lists the deleted tiles by id and name. Move anything worth keeping into another group first, and confirm the scope with the user before running it. It also refuses to delete a composition's last remaining group.

`AI Generated` is reserved as a group name — use `ensure-group` for it.

`move-group` follows Composer's native group-sort path. It rewrites every group's contiguous `priority` and `layout.zindex` values in one editor batch, preserving group contents, animation, Control Nodes, and managed ownership. Read the target group first and use the returned `groupOrder` as authoritative readback.

To rename a group, use the existing update command; group `name` is not immutable:

```bash
node scripts/composer-agent.js update --type group --id <group-id> --path name --value-file <temporary-directory>/group-name.json
```

Supported group layout fields are `left`, `top`, `width`, `height`, `rotateX/Y/Z`, `anchor`, the complete Effect-property set below, `groupClipChildren`, `groupBorderRadiusMode`, and the four `groupBorderRadiusValue*` fields. Read the complete group with `get --type group` before configuration. Move children with the existing `move` command; group membership remains Composer's hierarchy source of truth.

The Effect-property contract for tiles and groups is:

- visibility and transform: `visible`; `scaleX/Y` from -10000 to 10000 with `lockScale`; and `skewX/Y` from -89.9 to 89.9 degrees;
- shadow: `filterDropShadowMode` (`"none"`, `"box"`, or `"drop"`), `filterDropShadowX/Y` (-100 to 100 pixels), `filterDropShadowBlur` (0 to 100 pixels), `filterDropShadowSpread` (-50 to 50 pixels), `filterDropShadowColor` as `{r,g,b,a}`, and `filterDropShadowInset`;
- filters: `opacity` (0–100), `filterBlur` (0–300), `filterBrightness` and `filterContrast` (0–200), `filterGrayscale`, `filterInvert`, and `filterSepia` (0–100), `filterHueRotate` (0–360), and `filterSaturate` (0–500);
- render options: `backfaceVisibility`, active when the composition uses 3D perspective.

Prefer shadow, opacity, blur, and X/Y skew as the compact effective toolkit for routine graphic construction. The remaining properties are available when a specific design calls for them; do not add them speculatively. Renderer limitations and authoring workarounds—including the shadow zero-offset behavior—are defined once in [graphics.md](graphics.md#layout-math).

## Timeline animations

| Command | Purpose |
| --- | --- |
| `timeline-animations` | Read the In/Out effect, easing, and parameter catalog. |
| `set-timeline-animation --id <id> --timeline <In\|Out> --effect <id> [...]` | **Targeted only:** assign one isolated keyframed In/Out animation atomically. |
| `set-timeline-animations --file <choreography.json>` | **Preferred for related assignments:** assign up to 100 keyed Timeline animations in one rollback-safe batch, with optional `after` dependencies and relative `offset` values. |

Always read `timeline-animations` before assigning one. Timeline animation supports `--start`, `--duration`, `--params-file`, and `--easing-file`. Prefer the batch command whenever two or more assignments form one choreography. See [compositions.md](compositions.md).

## Property-change Update animations

| Command | Purpose |
| --- | --- |
| `update-animations` | Read the Update effect, easing, phase, and shared-setting catalog. |
| `set-update-animation --id <id> --phase <in\|out> --effect <id> [...]` | **Targeted only:** assign one isolated property-change Update phase and any explicitly supplied shared settings. |
| `set-update-animations --file <assignments.json>` | **Preferred for related assignments:** assign up to 100 keyed Update phases in one rollback-safe batch. |

Update animation supports `--duration`, `--params-file`, `--easing-file`, `--active`, `--always-execute`, and `--offset`. It has no Timeline `start` or `after` fields. Prefer the batch command for two or more related Update assignments.

## Continuous behaviors

| Command | Purpose |
| --- | --- |
| `behaviors` | Read the shared Composer behavior property, effect, easing, and limit catalog. |
| `behaviors --id <tile-id>` | Return the tile's current behaviors together with the catalog. |
| `set-behavior --id <tile-id> --property <id> [...]` | **Targeted only:** add or replace one isolated continuous behavior by property. |
| `set-behavior --id <tile-id> --property <id> --remove` | **Targeted only:** remove one isolated behavior without replacing the rest of the array. |
| `set-behaviors --file <assignments.json>` | **Preferred for related assignments:** upsert or remove up to 100 keyed behavior assignments in one rollback-safe batch. |

`set-behavior` accepts `--effect`, `--active <true|false>`, `--value-min`, `--value-max`, `--duration`, `--duration-range`, `--delay`, `--delay-range`, and `--easing-file`. Values are checked against the live shared catalog before one sorted behavior array is written.

## Compositions

| Command | Purpose |
| --- | --- |
| `create-composition --name <name> [--group-id <id>]` | **Targeted only:** create one ordinary on-the-fly sub-composition outside a representable orchestration. |
| `orchestrate --file <manifest.json>` | **Preferred for related ordinary modules:** from root, create or reuse up to 25 keyed modules, apply graphics plus separate Timeline, Update, and Behavior assignments, and set explicit parent timeline links in one rollback-safe operation. |
| `create-revision --description <text>` | Save the last persisted composition version as a numbered revision. |
| `list-revisions` | List sanitized revision metadata without storage URLs or internal database IDs. |
| `read-revision --revision-id <number>` | Read a bounded structural summary of one revision. |
| `compare-revision --revision-id <number>` | Compare current and revision structure as totals and numeric deltas. |
| `restore-revision --revision-id <number>` | Create an automatic backup, then start native whole-scene restoration. |
| `delete-revision --revision-id <number>` | Permanently delete one revision by its visible revision number. |
| `open-composition --id <id\|root>` | **Targeted only:** navigate for inspection, an isolated edit, widget work, or a structure orchestration cannot represent. |
| `widget-subcompositions --id <widget-tile-id>` | Inspect a widget's composition-valued fields, static/dynamic mode, and exposed template controls. |
| `open-widget-subcomposition --id <widget-tile-id> [--field <field-id>] [--create]` | Resolve and open the widget's current hidden template, or create it through Composer's native widget-owned path when the field is empty and `--create` is passed. Its `identityScope` reports the durable owner locator and marks the active template and descendant IDs as current-edit-session handles. |
| `delete-composition --id <id>` | Recursively delete a sub-composition. |
| `control-composition --id <id> --state <in\|out>` | Take the root or a sub-composition in or out. |
| `timeline2 --active <true\|false>` | Enable or disable the dedicated Out timeline on the active composition. |

Prefer `orchestrate` when constructing or refining several related ordinary modules. It replaces a serial create/open/apply/animate sequence with one bounded rollback batch. Use the individual composition commands for isolated changes, widget-owned templates, or structures the version-1 manifest cannot represent.

See [compositions.md](compositions.md).

By design, widget-owned templates are copied when Composer exits standalone edit mode. Treat the owner tile plus field as stable and every identity discovered inside the open template as edit-session scoped, including the raw composition ID, descendant element IDs, node model keys, Widget Node `keyId` values, and link locations. Discard them on exit or reopen and prefer `open-widget-subcomposition` for every later navigation. `inspect`, `open-widget-subcomposition`, and Widget Node command responses expose this contract as `identityScope`; use its opaque `sessionToken` with `--template-session` on subsequent template commands. See [widget-subcompositions.md](widget-subcompositions.md).

## Tables and Grids

| Command | Purpose |
| --- | --- |
| `update-table --id <table-tile-id> --file <table.json>` | Validate rows against the Table's current template controls, update supported table options and content, roll back partial failure, and verify the stored result. |
| `update-grid --id <grid-tile-id> --file <grid.json>` | Validate items against the Grid's current template controls and bounded rows/columns, update options and content with rollback, and verify readback. |

See [table.md](widgets/table.md) and [grid.md](widgets/grid.md). Grid uses `cols`/`rows` and separate spacing fields; Table's `elementsPerPage`, `lineSpacing`, and `layoutDirection` are not Grid options.

## Control nodes

| Command | Purpose |
| --- | --- |
| `control-nodes` | Read ordered local control fields with their persisted metadata, widget-property data links, and tile/group layout node references. |
| `metric-fonts [--source <catalog\|account>] [--family <query>]` | List bounded Font 2 families with available weights, styles, and metric subsets; URLs and metric geometry are omitted. |
| `set-control-value --id <control-id> --value-file <value.json>` | Set one existing supported local control value after type validation and authoritative readback. |
| `set-control-font --id <control-id> [--family <name>] [--weight <weight>] [--style <style>] [--subset <subset\|auto>] [--font-source <catalog\|account>]` | Resolve and set one Metric Font control from the authoritative Font 2 catalog. Caller-supplied metrics and URLs are not accepted. |
| `create-table-control --file <table-control.json> [--source-composition <root\|ancestor-id>]` | **Targeted only:** atomically create one Table group, field, column schema, options, and strict initial row set in the active composition or an active-stack ancestor. |
| `set-table-control --id <control-id> --file <rows.json>` | Replace all rows of one existing Table control after strict validation against its persisted schema. The file may be an array or `{ "rows": [...] }`. |
| `update-table-control --id <control-id> --file <update.json> [--preview]` | Preview or atomically apply schema, option, and optional whole-row changes with explicit rename and data-loss rules. |
| `link-table-control --id <control-id> --tile-id <id> --property <field-id> [--source-composition <root\|ancestor-id>] [--replace]` | Link an existing Table control row-array payload to a native `table` or `json` widget field. |
| `unlink-table-control --tile-id <id> --property <field-id>` | Remove a Table Control Node link from a native `table` or `json` widget field without changing its value or source control. |
| `press-control --id <control-id>` | Atomically press one Button control by persisting a fresh, monotonic native event timestamp. |
| `timer-action --id <control-id> --action <start\|play\|pause\|reset>` | Apply one native Time Control action with elapsed-time accounting and authoritative readback. Prefer this shell-safe spelling; `control-time` remains a compatibility alias. |
| `update-control --id <control-id> --file <patch.json>` | Atomically patch supported metadata, rename the public ID with payload/link migration, or reorder one supported local control. |
| `create-control-container --file <container.json>` | Create one native ordinary Control Node container with ordered control membership and optional editor metadata. Same-title reapplication is idempotent only when the supplied definition already matches. |
| `configure-control-container --id <container-id> --file <configuration.json>` | Atomically update one ordinary container's metadata, order, and/or complete ordered membership. Table groups are rejected. |
| `delete-control-container --id <container-id>` | Delete one ordinary Control Node container while preserving its controls, values, and links. Table groups are rejected. |
| `create-control --name <name> --node-type <type> --target standalone --value-file <value.json>` | **Targeted only:** create one unlinked composition input for external payloads or script processing. |
| `create-control --name <name> --node-type button --target standalone` | **Targeted only:** create one native Button event input. It does not accept `--value-file`. |
| `create-control --name <name> --node-type timecontrol --target standalone` | **Targeted only:** create one native Time Control stopped at zero. It does not accept `--value-file`. |
| `create-control --name <name> --node-type location --target standalone --value-file <value.json>` | **Targeted only:** create one Location input from `{text,long,lat}` with a string label and finite numeric coordinates. |
| `create-control --name <name> --node-type metricfont --target standalone [--family <name>] [--weight <weight>] [--style <style>] [--subset <subset\|auto>] [--font-source <catalog\|account>]` | **Targeted only:** create one catalog-resolved Metric Font input; defaults to Open Sans and a compatible native variant. |
| `create-control --name <name> --node-type json --target standalone --value-file <value.json>` | **Targeted only:** create JSON Text from a JSON file whose top-level value is an empty or parseable JSON string, not an object. |
| `create-control --name <name> --node-type infotext --target standalone --info-mode <static\|dynamic> --value-file <value.json>` | **Targeted only:** create one sanitized form-only data display. Static content is metadata-owned; dynamic content can be replaced through the payload. |
| `create-control --name <name> --node-type <type> --tile-id <id> --property <field-id> [--source-composition <root\|ancestor-id>]` | **Targeted only:** create and link one isolated widget-data control. The target stays in the active composition; the optional source defines the control in root or another active-stack ancestor. |
| `create-control --name <name> --node-type <number\|checkbox> --target layout --element-type <tile\|group> --element-id <id> --property <layout-property> [--source-composition <root\|ancestor-id>]` | **Targeted only:** create and link one explicitly requested Transform/Effect public control; never use as a graphic-authoring default. The optional source follows the same ancestor rule. |
| `create-controls --file <controls.json>` | **Preferred for related controls:** validate, create, optionally link, and verify a batch atomically. Linked entries may set `sourceCompositionId` to `root` or an active-stack ancestor ID. |
| `delete-control --id <control-id>` | Delete one supported control through the normal cleanup path. |

### Control Node containers

Control Node containers are flat editor groups for organizing public controls; they are unrelated to composition graphic groups. Create one from a semantic specification:

```json
{
	"title": "Player controls",
	"width": "double",
	"toolTip": "Controls for the selected player",
	"controlIds": ["Enabled", "Name", "Score"],
	"activeId": "Enabled",
	"index": 0
}
```

`controlIds` accepts public control IDs or internal `keyId` values and defines the complete ordered membership. Every control can belong to at most one ordinary container, so listed controls are removed from other ordinary containers. Former children omitted from the target list become ungrouped. An omitted `controlIds` preserves membership. `activeId` must be empty or identify a Checkbox in the resulting membership; moving the active Checkbox out clears it unless the same request explicitly supplies an invalid replacement.

Supported metadata is `title`, `width` (`""` for Small or `"double"` for Large), `toolTip`, `activeId`, `usePreset`, `presetSourceUrl`, `usePresetFilter`, `usePresetReload`, and `displayVariantRelevance`. `presetSourceUrl`, when supplied, must be an absolute or protocol-relative credential-free HTTP(S) URL no longer than 2,048 characters; explicitly enabling `usePreset` requires a valid effective URL. `index` is the zero-based position in the flat container list. Create defaults to Large width, empty tooltip and active Checkbox, no children, and the end of the list. Existing same-title containers are returned unchanged only when every supplied property already matches; a different definition is a conflict. Configure preserves every omitted property.

For one large Textarea or JSON editor that uses the complete panel body, create a Large ordinary container with exactly one child and apply this pattern:

```json
{
	"container": {
		"title": "My Text",
		"width": "double",
		"controlIds": ["My Text"]
	},
	"control": {
		"id": "My Text",
		"type": "textarea",
		"hideTitle": true
	}
}
```

The example combines the relevant shapes; create or update the control and container through their separate typed commands. Match the container title to the child control's public name, set the child's `hideTitle` metadata with `update-control`, and keep it as the container's only child. The container supplies the visible panel title, while the hidden child title makes the Textarea or JSON field span both form columns. Use `textarea` for unrestricted multi-line text. Use `json` for the validated Ace JSON editor and set its `height` metadata to `100px`, `150px`, `200px`, `250px`, `300px`, or `400px` when needed. Do not use `jsonfile`; that type renders a file/URL picker rather than an inline JSON editor. A standalone child is valid when an external payload or composition script consumes it and no widget link is required.

Table groups and Table fields are specialized compound Control Nodes and cannot be created, configured, moved, or deleted through ordinary-container commands. Use the dedicated Table commands instead. Deleting an ordinary Control Node container preserves all child fields, payload values, data links, and node references; this deliberately differs from recursive composition graphic-group deletion. Reinspect with `control-nodes` after every mutation and treat its ordered `groups` result as authoritative.

Metric Font controls may be linked only to one explicitly named `metricfont` widget field. Linked creation copies that field's current complete value and does not accept font-selection flags. `create-controls` does not accept Metric Font entries because catalog resolution must finish before mutation. The native bulk **Connect to Metric Widgets** UI action is intentionally not exposed.

The native `gradient` Control Node type is intentionally unsupported by these commands. Author structured gradients directly on compatible widget fields or use complete widget-runtime gradient objects inside composition scripts; do not expose their implementation-specific payload through an external control surface. A supported `color` control may target a Gradient field only when the public input is intentionally one solid color.

### Table Control Nodes

Table Control Nodes are a compound Control App input, distinct from the Table widget and `update-table`. Create one from a semantic specification:

```json
{
	"name": "Players",
	"columns": [
		{ "id": "Name", "title": "Player", "type": "text" },
		{ "id": "Score", "type": "number", "defaultValue": 0 },
		{
			"id": "Status",
			"type": "selection",
			"selections": [
				{ "id": "ready", "title": "Ready" },
				{ "id": "out", "title": "Out" }
			]
		}
	],
	"rows": [
		{ "Name": "Alice", "Score": 10, "Status": "ready" }
	],
	"options": {
		"height": "auto",
		"maxLines": 20,
		"minRows": 0,
		"maxRows": 20,
		"allowAddDeleteRows": true,
		"allowSorting": true
	}
}
```

Supported column types are `text`, `textarea`, `image`, `number`, `normalizednumber`, `counter`, `color`, `checkbox`, `selection`, `datetime`, and `location`. Column IDs must be unique normalized Control Node names. Optional widths are `tiny`, `small`, `medium`, `large`, and `x-large`. Number columns accept a positive finite `step`; normalized numbers additionally accept finite `low <= high`; Selection requires 1–100 unique `{id,title}` options. Optional `defaultValue` must exactly match the declared type.

Every row must be an object containing every declared column exactly once. Values are never coerced, clamped, padded, truncated, or silently removed. Row count must remain within `minRows` and `maxRows`, and the complete schema/options/rows request is limited by the normal 32 KiB Control Node value bound. `datetime` uses an integer Unix millisecond timestamp; `color` uses an RGBA object; `location` uses `{text,long,lat}` with finite coordinates.

Creation defaults to auto height, 20 UI lines, 0–20 data rows, operator row add/delete enabled, and sorting enabled. Reapplying an identical creation is idempotent; a same-name different definition is a conflict. `--source-composition` may place the complete Table group/field/payload in root or another active-stack ancestor.

For schema or option changes, run `update-table-control --preview` first with a JSON object containing any of `columns`, `options`, `rows`, `renames`, and `allowDataLoss`. Unchanged column IDs preserve cells. Renames use an explicit old-ID-to-new-ID object. New columns default every retained row from the new column's validated default. Removed columns report discarded cell counts and require `allowDataLoss: true` when rows exist. A retained or renamed type change must validate every preserved value, or the request must supply a complete replacement `rows` array. Preview performs the complete validation and returns the migrated rows/report without mutation; apply writes field metadata and payload in one verified rollback batch. Reapplication is idempotent.

Table payloads are JSON row arrays and may link to native `table` fields or compatible `json` fields. In particular, the Table widget accepts that array directly through `tableContent`; no `{content: ...}` wrapper is required for a linked value. The source may be local, root, or an active-stack ancestor. A matching link is idempotent, a different link requires explicit `--replace`, and unlink preserves the target value and source control. Table remains unsupported in `create-control`, `create-controls`, generic value/metadata commands, and declarative graphics. Row-level edits, nested/unsupported column types, and dormant `sortByColumn` metadata remain unsupported. Use `control-nodes` to inspect metadata, rows, ownership, and links, and `delete-control` for native field/group/payload/link cleanup.

See [compositions.md](compositions.md).

## Graphics

| Command | Purpose |
| --- | --- |
| `primitives` | List supported primitive widgets and their field schemas. |
| `primitives --primitive text` | List only one primitive: `text`, `text-ticker`, `metric-text`, `metric-text-ticker`, `metric-text-style`, `metric-text-animation`, `metric-text-ml`, `rectangle`, `circle`, `gradient`, `html`, `image`, `aisvg`, `bodymovin`, `bodymovin-loop`, `sound`, `video-animation`, `video-background`, `video-clip`, `video-clip-with-audio`, `web-page`, `timer`, `date-time-countdown`, `current-date-time`, `grid`, or `table`. |
| `ensure-group` | Return or create the `AI Generated` group. |
| `create --primitive <name> --name <label>` | **Targeted only:** create one unkeyed managed primitive for diagnosis or an isolated edit that cannot be represented declaratively. |
| `delete --id <tile-id>` | Delete one primitive. |
| `validate --file <spec.json>` | Validate a complete required-version-2 specification, including explicit stable-keyed Transform/Effect controls, without mutating anything. |
| `apply --file <spec.json>` | **Preferred for one existing composition:** compile semantic layout when present, then reconcile keyed graphics, grids, widget-data controls, and explicit root layout controls in one batch. |

The CLI commands are `apply` and `validate`; `graphics.apply` and `graphics.validate` are internal relay method names, not CLI aliases. Version 2 responses include expansion counts; all generated primitives retain the existing per-key reconciliation statuses. See [graphics.md](graphics.md).

## Capture

| Command | Purpose |
| --- | --- |
| `capture --target <root\|active> [--wait-mode <smart\|timed>] [--measurements <path.json>] --output <path.png> [--timeout <seconds>] [--settle <seconds>] [--server <url>]` | Capture the root or active renderer through the standalone Player. `smart` is the default for script-free, finite output; use `timed` for scripts or continuous motion. `--measurements` writes a bounded version-1 Player geometry snapshot immediately before the PNG. Optional `--server` must match the server stored by pairing; it cannot retarget existing credentials. |

Use standalone capture for rendered visual evidence. See [capture.md](capture.md).

## Composition scripts

There is intentionally no paired Composer-agent command for reading, writing, or executing composition scripts. Build the composition and its Control Node contract with the commands above, then create the active-composition context once:

```bash
node scripts/composer-agent.js script-handoff --compact
```

To target an ordinary sub-composition without leaving Composer navigated there:

```bash
node scripts/composer-agent.js script-handoff --composition-id <sub-composition-id> --compact
```

The target and the initially active scope must be root or ordinary sub-compositions in the current scene. The command uses Composer's normal navigation and inspection paths, rejects widget-owned templates, and restores the composition that was active before the command. It refuses to navigate away from a widget-owned editing scope because exiting can replace that template with a new composition ID. Use `open-widget-subcomposition` for a widget-owned template, then run the unscoped handoff while that template is active.

Pipe fresh `script-handoff` output directly to `scripts/compositionScriptCli.js --handoff-file -`; use a path only for an intentionally managed short-lived handoff. This CLI pipeline is the only supported agent interface for composition scripts. The helper uses the dedicated REST endpoints internally; do not construct or invoke those requests directly. The handoff suggests the active composition as the script target and carries the scene/account-scoped authorization required by every dedicated script endpoint, so `get-script`, `put-script`, and `clear-script` do not require `--script-id` unless the caller intentionally overrides it. Explicit disconnection, `complete`, and credential expiry prevent later script access. Use `summary --full` with the same handoff for global, overlay, ambiguous, or out-of-scope discovery. Direct `--token` and `--host` operation is unsupported. See [composition-scripts.md](composition-scripts.md).

## Interruption and disconnection

Canceling the unclaimed pairing modal invalidates its one-time code. During active work, **Cancel operation** interrupts current agent sockets, restores Composer input, and returns `OPERATION_CANCELLED`; stop the current task and do not reconnect until the user gives a new instruction. It does not revoke the reusable JWT. **Disconnect AI Agent** or explicit `complete` revokes the authorization on the server and prevents later socket and script access with that token.

Use `status` when you need input from the user. Before asking a blocking question in the AI Agent task, send that question or request through `status` first, including an instruction to return to the AI Agent task, then run `finish-work` before waiting. Do not call `complete` when an operation ends unless the user explicitly asks to disconnect the agent. A normal completion message is `status` followed by `finish-work`, not authorization revocation.
