# Graphics: primitives, layout, and declarative specifications

## Primitives

Video and embedded-page primitives additionally include `video-animation`, `video-background`, `video-clip`, `video-clip-with-audio`, and `web-page`; use their dedicated authoring guides from [widgets.md](widgets.md).

Use [widgets.md](widgets.md) to find the matching widget authoring reference. This document owns shared schema discovery, color, layout, and declarative-specification rules; widget-specific behavior and examples belong in the linked guides. Runtime payload updates belong to the separate composition-script workflow.

List the supported primitives and their control-field schemas before creating graphics:

```bash
node scripts/composer-agent.js primitives
```

Supported primitive names are `text`, `text-ticker`, `metric-text`, `metric-text-ticker`, `metric-text-style`, `metric-text-animation`, `metric-text-ml`, `rectangle`, `circle`, `gradient`, `html`, `image`, `aisvg`, `bodymovin`, `bodymovin-loop`, `sound`, `timer`, `date-time-countdown`, `current-date-time`, `grid`, and `table`. Use [Text Ticker](widgets/text-ticker.md) for legacy-font horizontal crawls and [Metric Text Ticker](widgets/metric-text-ticker.md) for Font 2.0 crawls. Use [Metric Text](widgets/metric-text.md) for single-line Font 2.0 text, or [Metric Text Animation](widgets/metric-text-animation.md) for native character/word effects. Use [Metric Text ML](widgets/metric-text-ml.md) (`metric-text-ml`) for explicit line breaks, wrapping, line limits and ellipsis; its live schema remains authoritative. Use [Metric Text Style](widgets/metric-text-style.md) for gradient-filled SVG text, outline, glow and looping sheen; configure dynamic style fields through inspected updates after base creation. Use [Sound](widgets/sound.md) for audio tied to In/Out transitions and [Timer](widgets/timer.md) for operator-controlled elapsed/count-up/count-down displays. AISVG is the bounded escape hatch for sanitized arbitrary SVG paths, masks, filters, and widget-driven vector animation; use standard primitives whenever they can keep the design independently editable. See [aisvg.md](widgets/aisvg.md). When you already know which primitive you need, filter to it so the schema stays small:

```bash
node scripts/composer-agent.js primitives --primitive text
```

Never assume a control value shape. Read each field's schema and `runtime` object from `primitives`; for non-color fields, the runtime value reports the exact type and a complete accepted value. For an existing tile, `get` returns current `data` plus the same schema populated from current values.

Datetime fields are schema-aware: an unset empty string may become an integer Unix millisecond timestamp within the JavaScript Date range, and an empty string may unset it again. Other strings and fractional or out-of-range numbers are rejected. This applies to direct data updates and declarative properties; Date Time Control Nodes require a configured numeric timestamp. See [Date / Time Countdown](widgets/date-time-countdown.md) for its widget-owned template and ticking behavior.

The [Gradient widget](widgets/gradient.md) uses a `css_string` textarea containing CSS declarations. It is distinct from schema fields typed `gradient` and from the unsupported native Gradient Control Node.

Color is another deliberate exception to runtime-shape preservation. For any widget field whose schema type is `color` or `gradient`, use an RGBA object as the primary solid-color format:

```json
{ "r": 0, "g": 74, "b": 173, "a": 1 }
```

RGBA is tinycolor2-compatible and Composer renders it directly as a color or converts it to a solid gradient as required by the widget. Do not copy a structured gradient from `get` or `primitives` merely because that is how Composer stores or reports the field. Use a complete structured gradient runtime object only when the user explicitly asks for a linear, radial, multi-stop, or otherwise non-solid gradient. Author that object directly on the compatible widget field; do not create a Gradient Control Node for it. Native Gradient controls are intentionally outside agent support because their complex payload is not a suitable external-control contract. Tinycolor2-compatible strings may be accepted by underlying widget paths, but RGBA remains the agent's default format.

Other shape-sensitive values still follow readback exactly: Text `font` is an object containing `fontData` and formatting, for example. Use the catalog-backed commands in [text.md](widgets/text.md) for font changes.

Table is an approved widget primitive rather than a flat shape. Creating it adds widget `1182` through Composer's normal widget path. Before adding rows, ensure its `composition` field points to a valid row-template composition, inspect that relationship with `widget-subcompositions`, and populate it with `update-table`; see [table.md](widgets/table.md). Do not guess a template ID or reuse one after leaving template edit mode.

Grid (`3284`) similarly repeats a hidden cell template, using `cols`/`rows`, spacing, pagination and validated `update-grid` content. See [Grid](widgets/grid.md). This widget is separate from the declarative `grids` layout definitions below, which place ordinary primitives at authoring time.

Bodymovin (`3367`) loads a hosted Lottie JSON URL and uses the Composer `widget` Timeline effect. For continuous playback with speed and direction controls, use `bodymovin-loop` (`3783`). See [Bodymovin](widgets/bodymovin.md) and [Bodymovin Loop](widgets/bodymovin-loop.md) for their separate asset, playback, and verification requirements.

For widget-supplied template output, build the target primitives first, then use a bounded [Widget Node link batch](widget-nodes.md). These links are separate from declarative public `control` declarations. Reapply stable-keyed graphics carefully: avoid explicitly resetting a field whose current value is driven by a Widget Node; inspect its native link first.

## Managed group and one-off primitives

`graphics.apply` is a reconciler: it deletes and reorders whatever it finds in the group it manages. That group, named `AI Generated`, is the boundary of the diff, not a permission boundary. Keep generated content in it so `apply` never reaches the rest of the scene.

Create primitives elsewhere when they are meant to be part of the user's own structure rather than reconciled output.

```bash
node scripts/composer-agent.js ensure-group
node scripts/composer-agent.js create --primitive text --name "Team name"
node scripts/composer-agent.js delete --id <tile-id>
```

Primitives are created with no In or Out animation. Read the returned tile before setting layout or control data.

Prefer declarative `apply` over one-off `create` for anything beyond a single scratch element.

## Layout math

Composer layout values are percentages of the active resolution. The default anchor is `{ "x": 50, "y": 50 }`, and `left`/`top` are offsets from the anchor-derived position — **not** absolute canvas coordinates:

```text
renderedLeft = left + (100 - width)  * anchor.x / 100
renderedTop  = top  + (100 - height) * anchor.y / 100
```

To place a box with top-left `(x, y)`:

```text
left = x - (100 - width)  * anchor.x / 100
top  = y - (100 - height) * anchor.y / 100
```

Do not treat `left: 50` as "centered" with a 50/50 anchor; a centered box commonly has `left: 0`. Ignoring this is the most frequent cause of off-screen or clipped graphics.

Common layout fields are `left`, `top`, `width`, `height`, `scaleX`, `scaleY`, `rotateZ`, and `anchor`. The complete active Effect layout model is authorable for tiles and groups. Start with the compact effective toolkit—shadow, opacity, blur, and X/Y skew—before reaching for the broader filters:

```json
{
  "layout": {
    "opacity": 85,
    "filterBlur": 2,
    "skewX": -12,
    "skewY": 0,
    "filterDropShadowMode": "box",
    "filterDropShadowX": 0.01,
    "filterDropShadowY": 6,
    "filterDropShadowBlur": 16,
    "filterDropShadowSpread": 0,
    "filterDropShadowColor": { "r": 0, "g": 0, "b": 0, "a": 0.35 }
  }
}
```

The full typed set includes visibility; scale and scale lock; skew; box/drop shadow including color, spread, and inset; opacity, blur, brightness, contrast, grayscale, hue rotation, invert, saturation, and sepia filters; and backface visibility. The exact ranges and enums are listed in [commands.md](commands.md). Use these broader properties only when they materially serve the requested design—being available does not make them preferable to clearer widget properties, gradients, or layered primitives.

Native limitations remain authoritative: drop shadow ignores spread and inset; backface visibility only affects 3D mode; and an exact shadow X/Y of `0` falls back to 5 pixels. Use a very small non-zero X/Y for a visually centered shadow and report the approximation. Disabled Effect features such as blend mode and image masks, plus the separate composition Style selector, are not part of this layout contract.

## Declarative specification

Save the specification in the session artifacts directory, then validate and apply it:

```bash
node scripts/composer-agent.js validate --file <spec.json>
node scripts/composer-agent.js apply --file <spec.json>
```

`graphics.validate` never mutates and reports every error with an element key and property path. `apply` validates the whole specification, then applies it in one undo batch and rolls back on an unexpected runtime error.

```json
{
  "elements": [
    {
      "key": "score-background",
      "primitive": "rectangle",
      "name": "Score background",
      "layout": { "left": 5, "top": 5, "width": 35, "height": 12 },
      "properties": { "width": 100, "height": 100 }
    }
  ]
}
```

Rules:

- `version: 2` is required. Missing or unsupported versions fail with `UNSUPPORTED_GRAPHICS_VERSION` at `version`.
- `elements` is required and holds at most 100 entries.
- `key` is required, unique, and stable across refinement passes. Keys are 1-100 characters of letters, numbers, dots, underscores, and hyphens.
- `name` is optional and defaults to the key.
- `layout` accepts the constrained geometry fields plus the complete documented Effect-property set.
- `properties` keys must exist in the selected primitive schema, and values must match the current or default field type. Schema fields typed `color` or `gradient` are the exception: use an RGBA object for a solid color even when the current/default value is a structured gradient.
- The array order is **back-to-front**: backgrounds first, foreground text last.

### Managed group bounds and clipping

A version-2 specification may configure the bounds of its existing `AI Generated` ownership group. All declarative elements are children of that group, so clipping applies to their rendered and animated content without adding a second reconciliation boundary:

```json
{
  "version": 2,
  "group": {
    "layout": {
      "anchor": { "x": 0, "y": 0 },
      "left": 10,
      "top": 10,
      "width": 30,
      "height": 12,
      "groupClipChildren": true,
      "groupBorderRadiusMode": true,
      "groupBorderRadiusValueTL": 4
    }
  },
  "elements": []
}
```

The group definition is optional and idempotent. It accepts the same constrained fields as `configure-group`; image masks remain unavailable because Composer's mask renderer is disabled. `groupClipChildren` is the supported masking primitive and renders as bounded overflow clipping. The apply response includes the authoritative managed-group ID and layout so it can be targeted by group animation or inspected afterward.

Reconciliation:

- Reapplying a key with the same primitive updates the same tile and preserves matching Control Node links.
- Changing the primitive for an unlinked key replaces only that managed tile.
- Omitting an unlinked prior declarative key deletes that managed tile.
- Changing or omitting a **linked** keyed primitive is rejected as a conflict instead of silently removing links.
- Manually created managed primitives without declarative keys are preserved, behind the declarative scene.
- A keyed element that has left the managed group by any route is released: `apply` clears its key, reports it under `released`, and rebuilds the key as a new element.
- An empty `elements` array clears declarative graphics but preserves unkeyed managed and user-created content.

The apply response maps stable keys to current Composer tile IDs, reports `created`, `updated`, `unchanged`, or `replaced`, and lists deleted keyed elements.

Before reapplying, inspect the managed scope and reconcile deliberate changes made after the previous apply. Treat the new response as authoritative: omitted keys are deleted, while `replaced` keys receive new tile IDs that invalidate ID-based references and motion assignments. Read the new tile, rebuild the required references and assignments—including the `widget` Timeline effect for AISVG internal timelines—and read it back.

### Version 2 semantic layout

Version 2 compiles semantic declarations into the same flat keyed reconciler before widget-schema validation. It does not create a second ownership or mutation path.

```json
{
  "version": 2,
  "canvas": { "width": 1920, "height": 1080 },
  "styles": [{
    "key": "roster.text",
    "primitive": "text",
    "layout": { "anchor": { "x": 0, "y": 0 } },
    "properties": { "color": { "r": 245, "g": 245, "b": 245, "a": 1 } }
  }],
  "regions": [{
    "key": "roster",
    "unit": "percent",
    "left": 69,
    "top": 14,
    "width": 31,
    "height": 86
  }],
  "elements": [{
    "key": "title",
    "primitive": "text",
    "style": "roster.text",
    "placement": {
      "region": "roster",
      "left": 8,
      "top": 4,
      "width": 84,
      "height": 8
    },
    "properties": { "text": "STARTING OFFENSE" }
  }]
}
```

`placement` uses top-left coordinates and emits Composer geometry with `anchor: {"x":0,"y":0}`. Its `unit` accepts exactly `"percent"` or `"px"`; do not write `"pixel"`. Omitting `unit` defaults to `"percent"`, but authoring agents should always write it explicitly so pixel values from a screenshot cannot be interpreted as percentages. Percent placement is relative to its named region or the full canvas. Pixel placement and pixel regions require a positive integer design `canvas`; pixels normalize to full-canvas percentages and therefore scale with the active composition. A pixel placement may be inside a pixel region, but not a percent region. Do not combine placement with `cell`, raw `layout.left/top/width/height`, or a non-zero raw anchor. Other supported layout fields remain available.

For a reference measured in design-canvas pixels, declare both the canvas and `unit: "px"`:

```json
{
  "version": 2,
  "canvas": { "width": 1280, "height": 720 },
  "elements": [{
    "key": "scoreboard-shell",
    "primitive": "rectangle",
    "placement": {
      "unit": "px",
      "left": 31,
      "top": 27,
      "width": 355,
      "height": 99
    }
  }]
}
```

A style may contain only `key`, optional `primitive`, `layout`, and `properties`. One `style` reference is allowed per element. The style primitive, when present, must match. Layout and properties merge shallowly by field with explicit element fields winning. Nested non-color runtime objects such as `font` are atomic and must be supplied in their complete widget-runtime shape. For schema fields typed `color` or `gradient`, an RGBA object is the complete preferred solid-color value; supply a structured gradient only when the user explicitly requests one.

Validation and successful apply responses add:

```json
{
  "expansion": {
    "version": 2,
    "authoredEntries": 4,
    "explicitElements": 2,
    "repeatBlocks": 2,
    "expandedElements": 38,
    "stylesUsed": 3,
    "regionsUsed": 2
  }
}
```

Validation errors retain authored paths, including style, region, template, repeat item, and binding locations.

### Declarative control nodes

```json
{
  "key": "visalia-runs",
  "primitive": "text",
  "properties": { "text": "1" },
  "control": {
    "name": "Visalia R",
    "type": "text",
    "property": "text"
  }
}
```

The first apply creates and verifies the control and its link. Reapplying the stable key preserves the same tile and link. A different existing link, type, or control identity is a validation error.

Declarative widget-data controls support `text`, `textarea`, `number`, `normalizednumber`, `counter`, `color`, `image`, `checkbox`, `audio`, `video`, `data`, `jsonfile`, `json`, `datetime`, `location`, `selection`, and `timecontrol` when the primitive's widget field has the compatible type. Tile/group Transform and Effect controls are native node references rather than widget-data links; keyed managed graphics may declare them at the specification root, while ordinary Composer-ID targets use `create-control` or `create-controls` as described in [compositions.md](compositions.md). Their availability is not an authoring default: create them only when the user explicitly asks to expose the exact Transform/Effect property as a Control Node.

When the user explicitly requests public Transform/Effect inputs, declare them at the specification root and target stable declarative keys rather than transient tile IDs:

```json
{
  "version": 2,
  "elements": [{
    "key": "rectangle",
    "primitive": "rectangle",
    "layout": { "width": 30, "height": 20 }
  }],
  "controls": [
    {
      "key": "rectangle-width",
      "name": "rectangle_size_x",
      "type": "number",
      "target": { "elementKey": "rectangle", "property": "width" }
    },
    {
      "key": "rectangle-height",
      "name": "rectangle_size_y",
      "type": "number",
      "target": { "elementKey": "rectangle", "property": "height" }
    }
  ]
}
```

Use `{ "group": "managed", "property": "..." }` instead of `elementKey` to target the specification's `AI Generated` group. Root `controls` support only the documented Transform/Effect layout properties: `checkbox` for `visible`, and `number` for the supported numeric properties. Control keys, names, and targets must be unique. Apply creates missing controls, preserves an exact existing control/node-reference match, and rejects conflicting names or links without mutation. Omitting a previously declared control preserves it because declarative unlink is not supported; delete it only through the explicit inspected Control Node workflow.

The apply response reports widget-data controls on their element and root layout controls under the top-level `controls` object keyed by declarative control key. Each reports the real `id`, `keyId`, `type`, target, link value, and `status` `created` on first apply or `preserved` on an idempotent reapply. Confirm with `control-nodes` afterward: the field and its link must match the reported identities.

### Grids

Define named percentage-based grids at the specification root and place elements by cell:

```json
{
  "grids": [{
    "key": "scoreboard",
    "left": 10,
    "top": 20,
    "width": 80,
    "height": 40,
    "rows": 4,
    "columns": 3,
    "rowGap": 1,
    "columnGap": 1
  }],
  "elements": [{
    "key": "inning-1-visalia",
    "primitive": "text",
    "cell": { "grid": "scoreboard", "row": 1, "column": 1 },
    "properties": { "text": "1" }
  }]
}
```

Cells default to stretched exact bounds. Use `rowSpan`, `columnSpan`, `alignX`, `alignY`, `width`, and `height` for spanning or aligned content. Alignments are `stretch`, `start`, `center`, and `end`; `width` and `height` are percentages of the selected cell bounds.

A cell owns `layout.left`, `top`, `width`, and `height`. Do not mix manual geometry with cell placement.

In version 2, either axis may use positive weighted tracks instead of an equal count:

```json
{
  "key": "roster.columns",
  "left": 71,
  "top": 36,
  "width": 27,
  "height": 60,
  "rowTracks": [1, 1, 1, 1, 1],
  "columnTracks": [3, 18, 3],
  "rowGap": 0.4,
  "columnGap": 0.5
}
```

Do not combine `rows` with `rowTracks` or `columns` with `columnTracks`. Each axis accepts 1-100 positive weights. Gaps are absolute canvas percentages; the remaining space is distributed by weight, and spans include internal gaps.

### Templates and repeats

Version 2 templates are non-recursive arrays of primitive definitions. Each template element has a local `key`, a percent `box` inside one repeated item cell, and optional direct bindings:

```json
{
  "templates": [{
    "key": "roster-row",
    "elements": [{
      "key": "name",
      "primitive": "text",
      "style": "roster.text",
      "box": { "left": 12, "top": 0, "width": 72, "height": 100 },
      "bind": { "properties.text": "name" }
    }]
  }],
  "elements": [{
    "repeat": {
      "key": "starter",
      "template": "roster-row",
      "placement": { "region": "roster", "left": 5, "top": 26, "width": 90, "height": 70 },
      "flow": { "direction": "column", "gap": 0.5 },
      "items": [{ "key": "1", "values": { "name": "PLAYER NAME" } }]
    }
  }]
}
```

Only column flow is supported. The repeat placement is divided into equal-height item cells after subtracting absolute percentage gaps. A template `box` is top-left percent geometry inside its item cell. Expansion replaces the repeat block in place, ordered by item and then template element, and generates stable keys as `<repeat>.<item>.<template-element>`.

Bindings are direct item-value lookups only. Destinations are `name`, `properties.<widget-field-id>`, and `control.name`; sources are one safe item-value key. There is no interpolation, traversal, expression, arithmetic, or function language. Resolved values still pass the existing widget and Control Node type checks.

Limits are enforced before mutation: 100 expanded primitives; 100 root layout controls; 25 styles, regions, templates, and repeat blocks; 25 elements per template; 100 repeat items total; and 100 tracks per grid axis. Reapplying the same item keys preserves generated tile identities; reordering items changes layer order without changing those identities.

## Design guidance

Apply the construction rules, visual-quality requirements, and completion gate in [authoring-quality.md](authoring-quality.md). That document owns the authoring principles; the guidance below is limited to translating them into Composer graphics and declarative layout.

From a reference screenshot:

- Work in percentages of the active Composer resolution.
- Treat tables and grids semantically instead of calculating every position by hand.
- Use one text element per independently aligned or controlled value, aligned to exact cell bounds.
- Identify dynamic fields before building and give them stable keys and declarative controls.
- Identify large background shapes first, then accents, images, and text.

For Composer Text sizing, remember that an automatic overflow mode such as `adjustLetterSize` makes layout height strongly affect the resulting font size. Size the text box to the intended text line rather than stretching it over the full height of its background panel.
