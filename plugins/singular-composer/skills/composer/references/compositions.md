# Compositions, control nodes, and timelines

This reference covers ordinary scene sub-compositions. Widgets may also own compositions through fields of type `composition`; their renderer controls how those templates are instantiated. See [widget-subcompositions.md](widget-subcompositions.md) before navigating or editing one.

Composer opens at a root composition. A composition tile can contain another composition, producing a nested sub-composition. Root and sub-compositions share the same group/tile model.

Every command operates on the **currently active composition**. Run `inspect` and confirm `activeComposition.stack` before reading or updating anything.

## Structuring graphics with sub-compositions

The structural decision standard for tiles, groups, and sub-compositions lives in [authoring-quality.md](authoring-quality.md). This section describes the Composer-specific mechanics for applying it. When recreating a reference graphic, create one root-level sub-composition for each complete region a user is likely to take in or out, animate, edit, or reuse independently — for example a location/time bug, a story list, a centered lower third, and a bottom ticker.

- Build each module's primitives inside its sub-composition; do not place all reference elements directly in the root.
- Position primitives in scene coordinates. A sub-composition keeps the full Composer canvas coordinate system; it is not cropped to the module's bounds.
- Keep a separate declarative specification with its own stable keys per sub-composition. `apply` reconciles only the active composition.
- After assembly, return to the root and verify that every intended module appears as a separate composition tile and can be controlled independently.

## Creating, opening, and deleting

```bash
node scripts/composer-agent.js create-composition --name "Lower third"
node scripts/composer-agent.js create-composition --name "Lower third" --group-id <group-id>
node scripts/composer-agent.js open-composition --id <composition-tile-id>
node scripts/composer-agent.js open-composition --id root
node scripts/composer-agent.js delete-composition --id <composition-tile-id>
```

Creation uses Composer's normal on-the-fly path: a default group, default settings, an In state, and a disabled Out timeline. Navigation is scoped to compositions in the current scene.

Composer automatically links the timeline of an on-the-fly composition created inside another sub-composition. The child receives `settings.linkTimeline: true` and its immediate parent's composition ID in `settings.parentTimeline`, so playing the parent also plays the child. A composition created directly in the root is not linked automatically. Individual composition commands do not toggle these settings; `orchestrate` authors the requested relationship explicitly through each module's `linked` field.

Deletion removes the parent tile and recursively cleans up descendants, states, composition properties, and event references. A sub-composition cannot be deleted without its contents, so the response reports a `contents` count of the elements, nested sub-compositions, and control nodes that went with it. Confirm the scope with the user before deleting.

### Keyed nested orchestration

Prefer `orchestrate` when several related ordinary compositions must be created or refined together. Start at root. Modules are ordered parent-first, use stable keys within their parent, and are preserved on reapply; omission never deletes an existing module. Use serial create/open/apply/animate commands only for isolated repairs or structures the bounded manifest cannot represent.

```json
{
  "version": 1,
  "modules": [
    {
      "key": "card",
      "name": "Card",
      "parent": "root",
      "linked": false,
      "graphics": { "version": 2, "elements": [] }
    },
    {
      "key": "accent",
      "name": "Accent",
      "parent": "card",
      "linked": true,
      "graphics": { "version": 2, "elements": [] }
    }
  ]
}
```

The manifest supports at most 25 modules. `parent` is `root` or an earlier module key. `linked` explicitly controls `linkTimeline` and, when true, writes the resolved `parentTimeline`; it defaults to false for root children and true for nested children. Composer ignores an inert `parentTimeline` whenever linking is false, so orchestration does not repeatedly remove a value the editor may restore. Each optional `graphics` value is a complete version-2 specification.

Motion is separated by model and schema: `timelineAnimations`, `updateAnimations`, and `behaviors`. Each entry replaces its direct-command `id` with `elementKey`; Timeline animation may target the managed group with `"elementKey":"$group"`, while Update and Behavior require a tile. Motion entries require `graphics` in the same module so their stable element keys can be resolved. The operation returns to root and rolls back its shared Composer batch if any module, graphics apply, link, Timeline assignment, Update assignment, or Behavior assignment fails.

## Managing revisions

```bash
node scripts/composer-agent.js create-revision --description "Before sponsor changes"
node scripts/composer-agent.js list-revisions
node scripts/composer-agent.js read-revision --revision-id 12
node scripts/composer-agent.js compare-revision --revision-id 12
node scripts/composer-agent.js restore-revision --revision-id 12
node scripts/composer-agent.js delete-revision --revision-id 12
```

Revision commands use the visible per-scene revision number, not the internal database row ID. List output includes description, timestamps, creator, and size when available; it never exposes the storage URL or internal row ID. `read-revision` fetches and validates stored content but returns only totals for compositions, groups, elements, controls, and scripts. `compare-revision` returns those totals for the current Composer model and selected revision plus numeric deltas. It deliberately does not enumerate position, size, value, script, or nested-model differences.

Creating a revision saves the composition's last persisted version; it does not save unsaved edits in the current Composer tab or modify the active composition. Run `inspect` first, use a concise non-empty description (up to 500 characters), and create one only when the user explicitly asks for a snapshot. The command reads the current revision list, uses the next numeric revision ID, and returns that ID with the description. If another editor creates the same next revision first, Composer rejects the request rather than replacing a revision; re-inspect and ask the user before trying again.

Restoration replaces the complete scene. Run `inspect`, state that scope, and proceed only when the user explicitly requests the revision. The command validates and reads the target first, creates a persisted revision named `Automatic backup before restoring revision <number>`, waits for that backup to succeed, records the native restore audit action, then applies the stored scene with Composer's native save-script, restore, and reload flags. Its `restore-started` response reports both revision numbers; the editor reload is the final persistence transition, so reconnect and inspect afterward before claiming the restored content is active. If target reading, backup creation, or audit recording fails, scene replacement does not start. The automatic backup records the last persisted scene, not unsaved edits.

Revision deletion removes permanent server data. List immediately before deletion, identify the exact description and revision number to the user, require explicit deletion intent, and verify with another list afterward. Do not automatically delete the backup created by restore.

## Taking compositions in and out

```bash
node scripts/composer-agent.js control-composition --id <composition-id> --state in
node scripts/composer-agent.js control-composition --id <composition-id> --state out
```

For the root, use the exact `activeComposition.id` reported by `inspect`, not the literal `root` navigation alias. Quote the ID and pass it as a separate value, because Firebase-style root IDs can begin with `-`:

```bash
node scripts/composer-agent.js control-composition --id "<activeComposition.id>" --state in
```

Inspect immediately before and after. The response reports the previous and resulting state; sub-composition tile states also appear as `compositionState` in the following inspection. `out` resolves to `Out1` when **2 timelines** is disabled and `Out2` when it is enabled. Composer also applies linked-timeline and logic-layer behavior, so controlling one composition may transition related compositions.

## Timelines

Tiles and groups store animation data in `effects.In` / `keyframes.In` and `effects.Out` / `keyframes.Out`.

**2 timelines** is a per-composition setting, disabled by default for new compositions:

- disabled — taking the composition out reverses the In timeline;
- enabled — taking the composition out plays the separate Out timeline.

`inspect` reports it as `activeComposition.timeline2Active`.

```bash
node scripts/composer-agent.js timeline2 --active true
node scripts/composer-agent.js timeline2 --active false
```

### Timeline animation

Timeline animation is keyframed In/Out motion. Read its catalog independently, then use the single setter only for one isolated assignment:

```bash
node scripts/composer-agent.js timeline-animations
node scripts/composer-agent.js set-timeline-animation --id <id> --timeline In --effect translateNoFade --property left
node scripts/composer-agent.js set-timeline-animation --type group --id <id> --timeline Out --effect fade --start 0 --duration 0.4
```

The command accepts `--type`, `--timeline In|Out`, `--effect`, `--property`, `--params-file`, `--easing-file`, `--start`, and `--duration`. The two file options read UTF-8 JSON objects from the task's temporary JSON directory. It writes `effects` and `keyframes`, preserves the other timeline, and clears stale effect parameters when required. A `propertyType` of `selection` requires a returned property ID; `angle` requires a numeric degree value.

Prefer `set-timeline-animations --file` whenever two or more assignments form one choreography. It accepts `{ "timelineAnimations": [...] }`. Every entry needs a stable `key` plus the single-setter fields. An entry may set an absolute `start`, or reference another entry with `after` and an optional signed `offset`; resolved start is `dependency start + dependency duration + offset`.

```json
{
  "timelineAnimations": [
    {
      "key": "shell",
      "id": "<tile-id>",
      "timeline": "In",
      "effect": "scale",
      "property": "y",
      "start": 0,
      "duration": 0.4
    },
    {
      "key": "headline",
      "id": "<tile-id>",
      "timeline": "In",
      "effect": "translateNoFade",
      "property": "up",
      "after": "shell",
      "offset": -0.15,
      "duration": 0.35,
      "easing": { "easing": "power1", "inOut": "out" }
    }
  ]
}
```

Keys are dependency identities, not Composer IDs. Dependencies may appear in any array order; cycles, missing references, negative resolved starts, duplicate keys, invalid effects, and invalid targets fail the batch.

### Implement the intended module exit

The required visual outcome and acceptance check live in [authoring-quality.md](authoring-quality.md). First determine from the prompt and supplied reference which elements leave and which persist. Use the following Composer mechanics to produce that intended settled Out frame:

- With **2 timelines** disabled, Out reverses the In timeline. Any visible child whose In effect is `none` has no hiding motion to reverse and can remain on screen after the animated siblings leave.
- Use one authoritative module-level hiding target, such as a containing group or composition, only when every visible child shares the same lifecycle and should leave together.
- For mixed lifecycles, never animate a containing group that also owns persistent content. Leave persistent elements such as an always-on background unanimated, and assign an effective In animation to every transient visible child, including dividers, accents, subtitles, labels, and decorative shapes, so Singular can resolve each one during Out playback.
- When an already-Out composition gains a new hiding animation, cycle it In and then Out so the new timeline takes effect before capture.

### Continuous behavior animation

Continuous behavior is separate from In, Out, and property-change Update phases. Read its shared catalog and the target tile before assignment:

```bash
node scripts/composer-agent.js behaviors
node scripts/composer-agent.js behaviors --id <tile-id>
node scripts/composer-agent.js set-behavior --id <tile-id> --property opacity --effect pingpong --value-min 60 --value-max 100 --duration 1 --easing-file <temporary-directory>/behavior-easing.json
node scripts/composer-agent.js set-behaviors --file <behavior-assignments.json>
```

One property can have one behavior. Supported effects are catalog-backed `drift`, `loop+`, `loop-`, and `pingpong`; properties include opacity, position, rotation, and scale axes. Assignment preserves every other behavior, enforces scale-versus-scale-axis exclusivity, sorts the stored array by property, and reports the previous value and whether state changed. Use `--remove` to delete only the named property behavior.

Prefer `set-behaviors` for two or more related assignments. Its file contains `{ "behaviors": [...] }`; every entry has a stable `key`, tile `id`, and the single-setter fields. Duplicate element/property targets are rejected, the full batch is validated before writing, and all affected tiles share one rollback batch.

For an In animation, `left` means the element starts offscreen left and translates into its layout position.

### Property-change Update animation

Update animation applies to supported widget tiles and runs when their properties change. Composer stores it at `element.layout.updateAnimation`; `get` and compact `get` return that complete object with `active`, `alwaysExecute`, `offset`, and the `in` / `out` phase settings. It is not available for groups, composition tiles, widgets with composition-valued fields, widgets with custom animation, or interactive widgets, matching Composer's Update tab.

Use `UpdateOut` to animate the old rendered value away and `UpdateIn` to animate the new value in. Both phases store `effect`, `property`, `easing`, and `duration` directly rather than using timeline keyframes. Setting one phase preserves the other. Shared flags are changed only when their options are supplied. If an older tile has no Update-animation object, the command initializes Composer's normal defaults before applying the requested phase.

Read and write Update animation through its own catalog and setters:

```bash
node scripts/composer-agent.js update-animations
node scripts/composer-agent.js set-update-animation --id <id> --phase out --effect fade --duration 0.25 --active true --offset 0.15
node scripts/composer-agent.js set-update-animation --id <id> --phase in --effect translate --property left --duration 0.3
node scripts/composer-agent.js set-update-animations --file <update-assignments.json>
```

The single setter accepts `--phase in|out`, `--effect`, `--property`, `--params-file`, `--easing-file`, `--duration`, `--active`, `--always-execute`, and `--offset`. The two file options read UTF-8 JSON objects from the task's temporary JSON directory. It intentionally has no Timeline `--start`, `after`, element type, or group target. The batch file contains `{ "updateAnimations": [...] }`; every entry has a stable `key`, tile `id`, and the single-setter fields. Duplicate element/phase targets are rejected and all entries share one rollback batch.

## Control nodes

A control node is a composition-level input. It may directly expose a selected widget-data or tile/group Transform/Effect property, or it may remain standalone so an external payload can trigger composition-script processing. Supported agent-created types are `text`, `textarea`, `number`, `normalizednumber`, `counter`, `color`, `image`, `checkbox`, `audio`, `video`, `data`, `jsonfile`, `json`, `datetime`, `location`, `selection`, `button`, `timecontrol`, `infotext`, and `metricfont`.

Composer also has a native `gradient` Control Node type, but it is intentionally outside agent creation and mutation support. A complete structured gradient is a widget-rendering value with a complex implementation-specific shape, not an appropriate public API or external-control contract. Author solid, linear, radial, and multi-stop gradients directly on compatible widget fields; composition scripts may use complete widget-runtime gradient objects when the target widget API accepts them. Do not expose those objects through a Gradient Control Node. Use a `color` Control Node targeting a Gradient field only when the intended external input is one solid color.

Control fields belong to one composition, while a descendant composition may persist a link to a field defined in root or another ancestor. Targets are always resolved in the **active** composition. Unless the user explicitly asks for an ancestor-owned public control, create a linked control in the same composition as its target and a standalone control in the composition whose script consumes it. Open the target composition first, confirm it in `activeComposition.stack`, then inspect, create, and verify there. This keeps each module self-contained while still supporting intentional root-level control surfaces.

### Inspect first

```bash
node scripts/composer-agent.js inspect
node scripts/composer-agent.js control-nodes
node scripts/composer-agent.js get --type tile --id <tile-id>
```

`control-nodes` reports the ordered control fields, each field's complete persisted metadata except deprecated Number `unitName` and `unitCollection`, widget-data links, and tile/group layout node references. Identity and ordering remain top-level field properties; additional persisted properties are returned under `metadata`. Unknown metadata is read and preserved for forward compatibility but cannot be changed by the agent. For widget data, use the field `id` from the tile's schema as the property identifier — never the displayed field title. For Transform/Effect targets, use the supported persisted layout-property name below. Check existing links or node references for the same element and property before creating; commands reject an existing link unless replacement is explicitly requested. Never replace a link silently.

The same inspection determines how to fulfill ordinary visual-change requests. If the requested widget field appears in `links`, or the requested Transform/Effect field appears in `nodeRefs`, its defining Control Node is the authoritative input. Change that control with `set-control-value`; do **not** write the linked widget data or layout field directly. A direct property write bypasses the composition's public input contract and can be overwritten by the link. For example, when a Circle's `fillGradient` is linked to Color control `c1`, “change the circle to green” means setting `c1` to `{ "r": 0, "g": 255, "b": 0, "a": 1 }`, then verifying both `control-nodes` and the Circle readback.

For a local link, update the control in the active composition. If inspection identifies an inherited control, navigate to the composition that defines it, inspect that scope, and update the defining control there; never bypass an inherited link because its source is outside the current scope.

Conflict errors identify both sides of the disagreement. A rejected `apply`, `validate`, `create-control`, or `create-controls` reports the requested control name and type, the property, and the existing link's identity, for example `requested control "Headline" (type text) for property "text" conflicts with existing control "Inning" (type text, keyId ...)`. Existing links are classified so you can tell what you are up against:

- a **visible control** — a local control-node link whose field exists, reported with its `id`, `type`, and `keyId`;
- an **inherited control link** — a control-node link pointing at another composition's field;
- a **stale link** — a control-node link whose control field no longer exists;
- an **internal bookkeeping link** — any other link type (data nodes, formulas, internal wiring).

These messages also include the active composition ID.

### Create, with an optional link

```bash
node scripts/composer-agent.js create-control --name "name" --node-type text --tile-id <tile-id> --property text
node scripts/composer-agent.js create-control --name "Brand Color" --node-type color --tile-id <tile-id> --property fillGradient --source-composition root
node scripts/composer-agent.js create-control --name "visible" --node-type checkbox --target layout --element-type tile --element-id <tile-id> --property visible
node scripts/composer-agent.js create-control --name "External Headline" --node-type text --target standalone --value-file <temporary-directory>/initial-headline.json
node scripts/composer-agent.js create-control --name "Team" --node-type selection --target standalone --value-file <temporary-directory>/initial-team.json --options-file <temporary-directory>/team-options.json
node scripts/composer-agent.js create-control --name "Remote Team" --node-type selection --target standalone --value-file <temporary-directory>/initial-team.json --options-url <https-or-protocol-relative-url> --use-reload true
node scripts/composer-agent.js create-control --name "Game Clock" --node-type timecontrol --target standalone
node scripts/composer-agent.js create-control --name "Venue" --node-type location --target standalone --value-file <temporary-directory>/venue.json
node scripts/composer-agent.js create-control --name "Brand Font" --node-type metricfont --target standalone --family "Open Sans" --weight 700 --subset auto
node scripts/composer-agent.js create-control --name "Headline Font" --node-type metricfont --tile-id <metric-text-id> --property font
node scripts/composer-agent.js create-controls --file <controls.json>
```

Creation follows Composer's normal path. Linked controls initialize from the target property's current value, so linking does not change the rendered graphic. A standalone value control requires an explicit `--value-file`; Button and Time Control instead use their fixed native initial states. Standalone creation writes only the model field and payload, with no widget `dataLink` or layout `nodeRef`.

For an ancestor-owned linked control, leave the descendant target active and pass `--source-composition root` or the exact ID of an ancestor shown in `activeComposition.stack`. This works for ordinary descendants and widget-owned sub-compositions. The command creates the field and payload in that ancestor, writes the link in the active target composition using Composer's native `root`/ancestor location identity, and returns both `compositionId` (the defining source) and `targetCompositionId`. The source must be the active composition or one of its ancestors; sibling and unrelated compositions fail with `INVALID_CONTROL_SOURCE`. Cross-composition standalone creation is rejected because it has no active target relationship.

Use a standalone control when the value is an external/script input rather than a one-to-one property binding. A Player SDK `setPayload()` call can update it, the composition script can listen for `payload_changed`, read the authoritative payload with `comp.getPayload2()`, process the value, and update one or more widgets with their scripting APIs. Do not create a hidden backing widget for that pattern.

| Control type | Compatible widget field types | Initial value |
| --- | --- | --- |
| `text` | `text`, `textarea` | String |
| `textarea` | `textarea`, `text` | String |
| `number` | `number`, `normalizednumber`, numeric `text` | Finite number |
| `normalizednumber` | `normalizednumber`, `number` | Percentage from 0 to 100 |
| `counter` | `counter`, `number`, `normalizednumber` | Integer |
| `color` | `color`, `gradient` | Exact RGBA object with RGB from 0 to 255 and alpha from 0 to 1; gradient fields initialize from `solidColor` |
| `image` | `image` | String image URL/value |
| `checkbox` | `checkbox` | Boolean |
| `audio` | `audio` | String audio URL/value |
| `video` | `video` | String video URL/value |
| `data` | `data` | String data URL/value |
| `jsonfile` | `jsonfile` | String JSON-file URL/value |
| `json` | `json` | Empty or parseable JSON string |
| `datetime` | `datetime` | Integer Unix timestamp in milliseconds |
| `location` | `location` | `{text,long,lat}` with a string label and finite numeric coordinates |
| `selection` | `selection`, `text`, `textarea` | String option ID; text-valued fields require an explicit option source |
| `timecontrol` | `timecontrol` | Native `{UTC,isRunning,value}` elapsed-time state |
| `infotext` | Not linkable; standalone only | Sanitized HTML string |
| `metricfont` | `metricfont` | Complete Composer-resolved `{fontData:{family,weight,style,subset,mg,...}}` value |

Image, Audio, Video, Data, and JSON File values follow Composer's form limit of 2,048 characters. The agent rejects longer values instead of silently truncating them.

Selection controls support inline or URL-backed options. Standalone creation requires exactly one of `--options-file` or `--options-url`. A link to a `text` or `textarea` widget field also requires one explicit option source; a link to an exact `selection` field instead inherits that field's native options and rejects an override. An inline file contains a JSON array of 1 to 100 objects with unique, non-empty string `id` and `title` properties; the initial string value must match one option ID. A URL source accepts an absolute or protocol-relative HTTP(S) URL no longer than 2,048 characters and without embedded credentials; optional `--use-reload true` exposes Composer's native reload action. Composer fetches remote options asynchronously through its existing URL store, so the agent validates the source URL and string payload shape but cannot atomically prove that a value exists in a mutable remote response.

This compatibility table is the supported agent contract, not a copy of every orange **may work** pairing in Composer's link browser. The narrower set is intentional: add another compatible pairing only after its conversion, initialization, readback, update, and cleanup behavior are verified.

Button controls are standalone event inputs. Create one without a value file, then use `press-control --id <control-id>` for each activation. Composer persists the native `{__singularButton:true,ts}` marker with a fresh timestamp; generic `set-control-value` writes are rejected so callers cannot replay or fabricate button events. Button metadata supports `buttonWidth` values `auto`, `small`, `medium`, `large`, and `fill`, plus the common title, ordering, visibility, advanced-style, and display-variant fields. Buttons always use immediate updates and do not create data links or node references.

Time Controls persist `{UTC,isRunning,value}`, where `value` is accumulated elapsed milliseconds and `UTC` anchors the latest action. Standalone creation needs no value file and starts as `{UTC:0,isRunning:false,value:0}`. Use `timer-action` (`control-time` is a compatibility alias): `start` resets to zero and runs, `play` resumes the accumulated value, `pause` adds elapsed wall-clock time and stops, and `reset` stops at zero while stamping `UTC` with the current server-adjusted time. Repeating `play` while running or `pause` while stopped is idempotent. Generic `set-control-value` writes are rejected so callers cannot fabricate clock state. Time Controls always use immediate updates; they can link only to exact `timecontrol` widget fields.

Location controls use the native `{text,long,lat}` payload. `text` is a string and `long`/`lat` are finite numbers; the agent does not impose geographic coordinate ranges beyond that native contract. Use `set-control-value` to replace the complete object. Location controls link only to exact `location` widget fields.

Metric Font controls use Font 2 catalog values. Run `metric-fonts` to discover exact families, sources, weights, styles, and subsets, then use `set-control-font`; generic `set-control-value` is rejected so callers cannot persist stale metrics or inject custom-font URLs. Composer resolves `mg` geometry and account-font URLs internally. Omitted properties retain the current selection when compatible; changing family chooses compatible defaults for omitted weight, style, and subset. Linked creation copies one explicitly named target field and does not change its rendering. Standalone creation defaults to Open Sans when no family is supplied. Metric Font controls are available only to Font 2-eligible accounts. They cannot be created through `create-controls`, declarative graphics, or orchestration, and the native bulk **Connect to Metric Widgets** action is outside the agent contract.

Info Text is a form-only display rather than an operator input or widget link. Creation requires `target: "standalone"`, an explicit `static` or `dynamic` mode, and an HTML string. Static mode stores visible content in field `text` metadata and keeps payload empty; change it with `update-control --file` using a `text` patch. Dynamic mode stores visible content in the payload and accepts `set-control-value`, including later external `setPayload()` updates. Changing mode atomically transfers the current visible content between metadata and payload. Info Text always starts with `hideTitle: true`, has no default/reset blobs, and cannot target widget data or Transform/Effect properties.

Info Text HTML is sanitized both on agent writes and immediately before Control App rendering. Agent writes reject unsupported markup instead of silently changing it; defensive rendering strips unsupported content from legacy or external payloads. The bounded display subset includes `div`, `span`, paragraphs, basic emphasis and lists, table elements, and anchors. Inline styles support table, grid, flex, sizing, spacing, typography, color, background color, border, and overflow properties; positioning, transforms, CSS URLs, imports, variables, and executable values are excluded. Links require absolute `http://` or `https://` URLs no longer than 2,048 characters and without embedded credentials. Rendering forces `target="_blank"` and `rel="noopener noreferrer"`; relative, protocol-relative, `javascript:`, `data:`, and malformed URLs are rejected.

Use `textarea` when longer free-form input or explicit line breaks are part of the public input contract; use `text` for concise single-line input. Prefer linking a textarea control to a widget field whose live schema type is `textarea`, such as the `text` field of the `metric-text-ml` primitive. A compatible `text` target accepts the same string value but does not guarantee multiline rendering. Textarea `rows` and `cols` configure the Control App input only; rendered line count, wrapping, and truncation remain properties of the target widget.

When a Color control targets a Gradient field, the control initializes from the field's current `solidColor`. The existing widget gradient input accepts tinycolor2-compatible values and renders them as a solid gradient, so a driving widget can send a color string or RGBA object without reproducing the full gradient runtime object. This is appropriate only when the public control is intentionally a single color; it must not be used as a substitute for externally editing a structured gradient.

Layout targets use Composer's native node-reference model rather than widget `dataLinks`. They work for tiles and groups and initialize from the current effective layout value, including false and zero, so creating the link does not change the rendered graphic.

Transform/Effect controls are not part of normal graphic construction or refinement. Do not create them by default, infer them from an element's likely usefulness, or expose every supported layout property. Use direct typed layout authoring for ordinary visual changes. Create a layout-target control only when the user explicitly requests a public Control Node for that exact property and target element. For keyed managed graphics, root-level declarative `controls` may target an `elementKey` or the `managed` group; use direct `create-control`/`create-controls` for ordinary tiles and groups identified by Composer IDs.

| Control type | Linkable Transform/Effect properties |
| --- | --- |
| `checkbox` | `visible` |
| `number` | `left`, `top`, `width`, `height`, `rotateZ`, `opacity`, `filterBrightness`, `filterBlur`, `filterContrast`, `filterGrayscale`, `filterHueRotate`, `filterInvert`, `filterSaturate`, `filterSepia` |

For a related batch, layout entries use `target: "layout"`, `elementType`, `elementId`, and `propertyId`; widget-data entries keep `tileId` and `propertyId` and default to `target: "data"`; standalone entries use `target: "standalone"` and an explicit `value`. A linked entry may add `sourceCompositionId: "root"` or an exact ancestor ID.

```json
{
  "controls": [
    { "name": "rectangle_size_x", "type": "number", "target": "layout", "elementType": "tile", "elementId": "<rectangle-id>", "propertyId": "width" },
    { "name": "rectangle_size_y", "type": "number", "target": "layout", "elementType": "tile", "elementId": "<rectangle-id>", "propertyId": "height" },
    { "name": "Brand Color", "type": "color", "tileId": "<descendant-rectangle-id>", "propertyId": "fillGradient", "sourceCompositionId": "root" },
    { "name": "External Headline", "type": "text", "target": "standalone", "value": "Initial headline" }
  ]
}
```

Composer removes invalid control-name characters and appends a numeric suffix when the requested ID already exists. The result reports the actual control `id`, its internal `keyId`, the initialized value, and either the new link or `target: "standalone"` with a null link value.

`create-controls` accepts `{ "controls": [...] }` or a bare array, validates the whole batch before mutation, creates everything in one undo batch, and rolls back if creation or verification fails. Selection entries use `selections` for inline options or `sourceUrl` plus optional `useReload` for URL-backed options.

Creation and optional linking are one batched operation; the previous control-node model and property link are restored if either write fails. Afterward, run `control-nodes` again. For linked controls, verify the returned `id`, value, `tileId`, `propertyId`, and link `keyId`. For standalone controls, verify the field and payload value exist and that neither `links` nor `nodeRefs` contains its `keyId`.

### Change metadata

Inspect first, then pass one JSON object containing only the properties to change:

```bash
node scripts/composer-agent.js update-control --id <control-id> --file <patch.json>
```

The common writable metadata contract applies to the fifteen ordinary value controls, including Date Time and Selection. Textarea controls additionally accept positive-integer `rows` and `cols`; Number controls additionally accept `step`, `format`, `unit`, `min`, `max`, and `showSlider`; Normalized Number controls accept `step`, `format`, `unit`, `low`, `high`, and `showSlider`; Counter controls accept integer `min`/`max` and optional set/modify button values `s1`–`s7` and `m1`–`m7`. Selection controls accept `format` (`text`, `color`, or `image`), boolean `useFilter`, and either inline `selections` or URL-source metadata `source: "url"`, `sourceUrl`, and boolean `useReload`. Changing inline options is rejected unless the current/default/reset IDs remain present. Switching to URL mode removes inline options; switching back to manual mode requires valid inline options. JSON Text narrows metadata to `id`, `title`, `index`, `height`, `hideTitle`, and `displayVariantRelevance`; height must be `100px`, `150px`, `200px`, `250px`, `300px`, or `400px`. Info Text is the sixteenth supported type and intentionally narrows metadata to `id`, `title`, `index`, `hideTitle`, `displayVariantRelevance`, `mode`, and static `text`. `unitName` and `unitCollection` are deprecated and intentionally neither reported nor writable. `type` and internal `keyId` are immutable.

New metadata values use strict current shapes: default/reset values match the control type; booleans are booleans; numeric `step` is positive and finite; Number bounds are finite with `min <= max`; Normalized Number output bounds are finite with `low <= high`; Counter bounds are integers with `min <= max`, and its button values are integers or signed integer strings; Number `showSlider: true` requires both `min` and `max`; `unit` is at most three characters; and display-variant relevance is a string or an array of non-empty strings. Existing legacy shapes remain readable and are preserved when omitted. Set an optional property to `null` to remove it; `title` cannot be removed. Omitted and unknown properties remain unchanged.

An `id` change atomically migrates the payload key, matching local and cross-composition widget links, tile/group node references, and control-group membership. An `index` change reorders the field and normalizes every field index. The operation verifies readback and rolls back all writes on failure. Re-run `control-nodes` and verify the field, payload, links, ordering, and unrelated metadata.

### Change a value

Inspect the active composition's controls first, then address one existing local control by its reported public `id` (preferred) or internal `keyId`:

```bash
node scripts/composer-agent.js control-nodes
node scripts/composer-agent.js set-control-value --id <control-id> --value-file <temporary-directory>/green.json
node scripts/composer-agent.js control-nodes
```

The value must match the existing control type: string for text/textarea/image/audio/video/data/jsonfile, a string option ID present in inline options for manual Selection, any string for URL-backed Selection, empty or parseable JSON string for JSON Text, finite number for Number, percentage from 0 to 100 for Normalized Number, integer for Counter, integer Unix millisecond timestamp within the JavaScript Date range for Date Time, boolean for Checkbox, and an exact `{r,g,b,a}` object with RGB from 0 to 255 and alpha from 0 to 1 for Color. Metric Font, Button, and Time Control values use their dedicated commands rather than raw value files. Date Time does not accept formatted date strings; convert them to milliseconds before writing. JSON Text preserves valid source text verbatim and uses the standard 32 KB agent update limit; pass a JSON string in `--value-file`, not an object. Dynamic Info Text accepts only valid sanitized HTML strings; static Info Text rejects this command and must be changed through its `text` metadata. URL-valued controls are limited to 2,048 characters. Null is never a delete. The command changes only `dataSources/composition/controlNode/payload/<control-id>`, verifies the persisted value, and reports the previous value plus whether a write occurred. A failed write rolls back its batch. Re-read `control-nodes` after the mutation and confirm unrelated controls are unchanged.

### Delete

```bash
node scripts/composer-agent.js delete-control --id <control-id>
```

The reported `id` is the user-facing field identity; `keyId` is the generated internal model key. Prefer `id` in commands.

Deletion matches local and cross-composition links by stable `keyId`/`sourceKeyId`, with public-name fallback only for legacy references. Link cleanup, payload/model/group cleanup, and Table-group cleanup share one native batch. The adapter verifies field and payload removal and restores the complete affected composition collection if cleanup or verification fails.

Deletion follows Composer's normal cleanup path: it removes the field schema and payload, removes the field from control groups, and clears matching widget data links and node references across the scene when they resolve to the defining composition. It does **not** delete linked tiles or their widget property values. The response reports how many data links and node references were removed.

Delete only the explicitly requested control, from the composition where it is defined. Verify with `control-nodes` afterward: the field and its links must be gone while unrelated controls, tiles, and widget values remain.

## Extending a composition with scripts

Finish and verify composition structure, widget names, and Control Node wiring in Composer before switching to the scripting phase. Script discovery and writes use the bundled composition-script helper after a paired handoff; its content JSON differs from paired `inspect`, and runtime behavior must be verified in the Singular Player rather than the Composer canvas. See [composition-scripts.md](composition-scripts.md) for the complete workflow.
