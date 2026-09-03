# Metric Text authoring

Use `metric-text` (widget `4662`) for single-line Font 2.0 text, including scores aligned on a decimal separator. Use [Metric Text ML](metric-text-ml.md) for explicit multiple lines or wrapping. For native character/word effects, use [Metric Text Animation](metric-text-animation.md). Styled Metric Text remains separate.

Run `primitives --primitive metric-text` to discover the loaded schema and runtime values; use `get` before changing an existing tile. Normal toolbox metadata may already be loaded; the agent also loads missing metadata on demand. Prefer stable-keyed declarative graphics for coordinated authoring:

```json
{
  "key": "score",
  "primitive": "metric-text",
  "placement": { "unit": "percent", "left": 10, "top": 10, "width": 30, "height": 12 },
  "properties": {
    "text": "12.345",
    "alignment": "align.",
    "overflow": "fitScale",
    "color": { "r": 255, "g": 255, "b": 255, "a": 1 }
  }
}
```

`text` is a string. The renderer displays only the content before the first newline; it hides empty or whitespace-only text. Stored line breaks do not imply multiline rendering. Prefer plain text. The optional `<html>...</html>` wrapper renders unsanitized markup: escape untrusted content, avoid scripts, event handlers and executable URLs, and keep behavior in the separate composition-script phase.

The `font` field has schema type `metricfont` and contains a complete `fontData` object with Font 2.0 metrics (`mg`). Preserve its inspected value unless replacing it with a verified compatible Font 2.0 value. Ordinary Text `set-font` and its legacy font catalog do not support this field. Do not invent metric values or substitute a family-name string. Font size follows the widget height and metrics; change placement height to resize it.

`alignment` supports left, center, right, and character alignment such as `align.` (last decimal point, centered fallback if absent). `overflow` supports `none`, horizontal `clip`, uniform `fitScale`, and horizontal-only `fitWidth`. Fit modes shrink overflowing text, never enlarge it. Discover the live selection fields before choosing values; generic updates preserve types and size but do not validate every selection or numeric range.

Letter/word spacing and shadow distance/blur are percentages of widget height. Enabled left/right insets are percentages of widget width; top/bottom insets are percentages of height. These are widget properties, separate from Composer Transform/Effect properties.

Use a Text Control Node linked to `text` for a public single-line input. Creation and declarative application use the shared typed, size-limited, managed-group and rollback contracts. Standard Composer motion remains available; no widget-specific animation API is added. Verify font loading, first-line behavior, replacement/clearing, fitting, character alignment, and resize in the Player. See [Metric Text scripting](../composition-scripting/widget-metrictext.md) for runtime payloads and bounds messages.
