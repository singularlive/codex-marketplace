# Metric Text ML authoring

Use `metric-text-ml` (widget `4671`, Metric Multi Line Text) for Font 2.0 text with explicit line breaks, automatic wrapping, and bounded line counts. Use [Metric Text](metric-text.md) for single-line fitting or character alignment, and [Metric Text Animation](metric-text-animation.md) for native animated single-line text.

Run `primitives --primitive metric-text-ml` to discover the loaded fields and defaults; use `get` before changing an existing tile. Missing widget metadata loads on demand. Prefer stable-keyed declarative graphics:

```json
{
  "key": "description",
  "primitive": "metric-text-ml",
  "placement": { "unit": "percent", "left": 10, "top": 20, "width": 80, "height": 40 },
  "properties": {
    "text": "First line\nSecond line",
    "minLines": 2,
    "maxLines": 4,
    "lineHeight": 120,
    "ellipsis": true,
    "alignment": "left",
    "verticalAlignment": "top"
  },
  "control": { "name": "Description", "type": "textarea", "property": "text" }
}
```

This is one element inside a version-2 graphics specification. The optional Textarea Control Node provides a public multiline input. Pass strings containing real newline characters through JSON value files; empty or whitespace-only text hides the rendering. Plain text preserves line breaks and wraps at words, with long words allowed to break. The `<html>...</html>` wrapper inserts unsanitized markup: use only trusted content, never interpolate untrusted HTML, and keep scripts and event handlers out of authored markup.

The `font` field is `metricfont`, containing a complete Font 2.0 `fontData` object and metrics (`mg`). Preserve its inspected value; do not fabricate metrics, replace it with a family-name string, or use ordinary Text `set-font`. Font size follows available widget height, the selected line count, line spacing, and font metrics. Resize the placement rather than inventing a font-size property.

Use positive integer `minLines` and `maxLines` with `minLines <= maxLines`. The renderer starts from the explicit line count bounded by those limits, then increases the count and reduces font size when wrapping needs more lines. At `maxLines`, excess content is removed from the rendered DOM; `ellipsis: true` adds an ellipsis to the surviving text. It does not modify the saved text. `lineHeight` is a percentage of natural font line spacing (`100` is natural spacing); values below 100 can overlap lines. Generic authoring enforces types and the shared 32 KB serialized-value limit, not every numeric range or cross-field constraint.

Horizontal alignment is left, center, or right; single-line separator alignment and `overflow` fitting modes do not apply. Discover the live vertical-alignment choices before selecting top, center, or bottom. The renderer also accepts `middle` as a compatibility alias, but the current catalog uses `center`. Vertical alignment distributes unused height when fewer lines render than are reserved. Letter/word spacing and shadow distance/blur use percentages of widget height. Enabled left/right insets use widget width, and top/bottom insets use widget height.

Creation, styles/templates, declarative application, and orchestration use the shared managed-group, typed-value, idempotence and rollback contracts. Verify actual multiline rendering, wrapping/truncation, text replacement/clearing, font loading and resize in the Player; stored values alone do not prove layout. See [Metric Text ML scripting](../composition-scripting/widget-metrictextml.md) for payloads and bounds messages.
