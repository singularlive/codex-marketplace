# Metric Text Style authoring

Use `metric-text-style` (widget `4758`) for single-line Font 2.0 text rendered as SVG with gradient fill, outline, glow, shadow and sheen. For character/word entrances and text-change animation, use [Metric Text Animation](metric-text-animation.md). Style's fill, glow and sheen animations loop while on screen; they are not Widget Timeline entrance effects.

Run `primitives --primitive metric-text-style` for catalog fields and defaults. Prefer stable-keyed declarative creation, then inspect the created tile with `get --type tile --id <id> --compact` for its native dynamic style fields. Missing catalog metadata loads on demand.

```json
{
  "key": "headline",
  "primitive": "metric-text-style",
  "placement": { "unit": "percent", "left": 10, "top": 20, "width": 80, "height": 15 },
  "properties": { "text": "CHAMPIONS", "alignment": "center", "overflow": "fitWidth" },
  "control": { "name": "Headline", "type": "text", "property": "text" }
}
```

This is one element in a version-2 graphics specification. Styles, templates and orchestration use the same catalog-only properties and shared ownership/rollback rules. Dynamic style fields belong to staged typed updates, not declarative `properties`. Do not substitute raw model writes or guess fields missing from discovery.

The widget publishes its custom UI on value delivery; unlike Metric Text Animation, it does not need a Widget Timeline assignment first. If the initial `get` has only catalog fields, re-read after initialization. Then:

1. Inspect current values and field types. Preserve the complete `font` metricfont object; ordinary Text font commands and invented font metrics do not apply.
2. Update a discovered style field using `update --type tile --id <id> --namespace data --path <field> --value-file <json-file>`, then read back. `color` and `outlineColor` are complete gradient objects. Preserve their inspected shape; do not replace them with CSS strings. A solid gradient is `{ "type": "solid", "solidColor": { "r": 255, "g": 210, "b": 70, "a": 1 } }`.
3. Select `fillAnimMode`, `sheenAnimMode` or `glowAnimMode` first, then `get` again before changing the newly exposed parameters. Compact discovery retains choices, ranges, units and runtime values. Hidden saved parameters may survive mode switches; their absence from the current schema does not mean they were deleted.
4. Enable `outlineActive`, `shadowActive`, `sheenActive`, `glowActive` or `insetActive` only as needed. Keep public text inputs as Text controls; do not expose structured gradients through a native Gradient Control Node.

Fill modes are none, move, colorcycle and breathe. Sheen modes are periodic and drift, gated by `sheenActive`. Glow modes are none, breathe, flicker, drift and colorshift, gated by `glowActive`. Use the live mode-specific choices/ranges rather than guessing parameter names. Generic updates enforce types and the shared 32 KB serialized-value limit, not all selection/range or gradient-internal constraints.

Only the first line renders. HTML-wrapped input is reduced to plain text for SVG; prefer plain text. Empty or whitespace-only text hides the layers and stops their animator. Font size follows widget height and font metrics. Letter/word spacing, outline width, shadow dimensions, glow size and vertical insets use percentages of widget height; horizontal insets use widget width. `gradientExtent` selects text or widget bounds. Leave room for effects that extend outside the glyph box, especially with clipping.

Verify gradient/outline/filter appearance, mode changes, text replacement/clearing and looping behavior in the Player. Use timed capture for continuous loops. See [Metric Text Style scripting](../composition-scripting/widget-metrictextstyle.md) for payload and lifecycle behavior.
