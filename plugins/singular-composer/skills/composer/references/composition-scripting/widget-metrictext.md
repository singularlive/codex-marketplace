# MetricText Widget (widgetId 4662)

Single-line text widget using Font 2.0 (FontStore2 / SingularMetricFont).

For paired Composer creation, use `metric-text` and the [Metric Text authoring guide](../widgets/metric-text.md). Inspect an existing instance with `get`; ordinary Text font commands do not support its `metricfont` field. This document owns the scripting payload contract; the live instance and schema remain authoritative for its loaded version. Defaults below describe renderer fallbacks, not guaranteed catalog defaults.

## Usage

```javascript
const mt = comp.findWidget("MetricText")[0];
mt.setPayload({ text: "Hello", color: "yellow" });
```

## Payload Properties

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `text` | string | `""` | Text content. Only content before the first newline is rendered. Empty or whitespace-only text is hidden. Optional `<html>...</html>` markup is unsanitized; use trusted display markup only. |
| `font` | object | — | Font definition (see [Font Object](#font-object) below). |
| `color` | string, object | `"white"` | Text color. Same formats as Rectangle's `fillGradient`. |
| `alignment` | string | `"left"` | Horizontal alignment: `"left"`, `"center"`, `"right"`, or `"align"` + character (e.g. `"align."` aligns on the last `.`). |
| `overflow` | string | `"none"` | Overflow behavior: `"none"`, `"clip"` (clips horizontally), `"fitScale"` (uniform scale to fit width), `"fitWidth"` (scale X only to fit width). |
| `letterSpacing` | number | `0` | Letter spacing as percentage of widget height. |
| `wordSpacing` | number | `0` | Word spacing as percentage of widget height. |
| `transform` | string | — | Text transform: `"uppercase"`, `"lowercase"`, `"capitalize"`, `"small-caps"`. |
| `shadowActive` | boolean | — | Enable text shadow. |
| `shadowDirection` | number | — | Shadow direction in degrees. |
| `shadowDistance` | number | — | Shadow distance as percentage of widget height. |
| `shadowBlur` | number | — | Shadow blur radius as percentage of widget height. |
| `shadowColor` | string, object | — | Shadow color. Same formats as `color`. |
| `insetActive` | boolean | — | Enable inset padding. |
| `insetLeft` | number | — | Left inset as percentage of widget width. |
| `insetRight` | number | — | Right inset as percentage of widget width. |
| `insetTop` | number | — | Top inset as percentage of widget height. |
| `insetBottom` | number | — | Bottom inset as percentage of widget height. |
| `emitEvents` | boolean | — | If `true`, emits a `bounds` custom message with text bounding box. |

### Font Object

```javascript
{
  fontData: {
    family: "Arial",       // font family name
    weight: "400",         // font weight string
    subset: "auto",        // character subset key or "auto"
    style: "normal",       // font style string
    mg: { vhr, var, brh, loh, roh, hrc, arc },  // font metrics object
    custom: false,         // whether it's a custom font
    url: ""                // custom font URL (when custom is true)
  }
}
```

### Character Alignment

Use `alignment: "align" + separator` to align text on the last occurrence of that character. `align.` selects the decimal point; a missing separator falls back to centered text:

```javascript
mt.setPayload({
  text: "12.345",
  alignment: "align."
});
// Positions the "." at the horizontal center of the widget
```

### Overflow Modes

```javascript
// fitScale — uniform scale to fit width
mt.setPayload({ text: "Long text", overflow: "fitScale" });

// fitWidth — horizontal scale only
mt.setPayload({ text: "Long text", overflow: "fitWidth" });

// clip — horizontally clipped at widget bounds
mt.setPayload({ text: "Long text", overflow: "clip" });
```

## Runtime verification

Use a complete inspected `font.fontData`, including valid `mg` metrics, rather than fabricating the schematic font object above. `setPayload({ text: ... })` uses the normal merged widget payload path and preserves that font. For `emitEvents: true`, the renderer sends `event: "bounds"` with `leftPx`, `topPx`, `widthPx`, `heightPx` and percentage `left`, `top`, `width`, `height`. Empty text returns before this message, so clearing does not promise a zero-bounds event. Verify payload changes, clearing, font readiness and resize in the Player; stored values alone are insufficient evidence.

## Source reference

- Widget code: `app/components/widgets/WidgetMetricText.js`
- Font system: `stores/FontStore2.js`
