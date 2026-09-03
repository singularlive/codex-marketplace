# Text Widget (widgetId 1032)

Payload reference for `widget.setPayload(...)` on Text widgets.

For paired Composer construction, font discovery, formatting, and declarative authoring, use [Text authoring](../widgets/text.md). This document owns the scripting payload contract; the live instance and schema remain authoritative for its loaded version.

## Usage

```javascript
const text = comp.findWidget("Text")[0];
text.setPayload({ text: "Hello World", color: "yellow" });
```

## Payload Properties

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `text` | string | `""` | Text content. Wrap with `<html>...</html>` to render HTML. |
| `color` | string, object | `"white"` | Text color. See [Color Formats](#color-formats). |
| `font` | object | — | Font definition (see [Font Object](#font-object) below). |
| `lineHeight` | string | `"normal"` | Line height: `"normal"`, `"single"`, `"s1.15"`, `"s1.5"`, `"double"`, `"custom"`. |
| `lineHeightCustom` | number | — | Custom line height as percentage (used when `lineHeight` is `"custom"`). |
| `minimumOfLines` | number | — | Minimum number of lines to reserve space for. |
| `maximumOfLines` | number | — | Maximum number of lines before truncation. |
| `overflow` | string | — | Overflow behavior: `"adjustLetterSize"`, `"adjustLetterWidth"`, `"wrapWord"`, `"wrapLetter"`, `"clip"`, `"ellipsis"`. |
| `letterSpacing` | number | `0` | Letter spacing in pixels. |
| `wordSpacing` | number | `0` | Word spacing in pixels. |
| `indent` | number | `0` | Text indent in pixels (negative for hanging indent). |
| `verticalAlignment` | string | `"top"` | Vertical alignment: `"top"`, `"middle"`, `"bottom"`. |
| `verticalAdjustment` | number | — | Fine-tune vertical position adjustment. |
| `textDirection` | string | — | Text direction CSS value (e.g. `"rtl"`, `"ltr"`). |
| `transform` | string | — | Text transform: `"uppercase"`, `"lowercase"`, `"capitalize"`, `"small-caps"`. |
| `shadowActive` | boolean | `false` | Enable text shadow. |
| `shadowDistance` | number | — | Shadow offset distance. |
| `shadowDirection` | number | — | Shadow direction in degrees. |
| `shadowBlur` | number | — | Shadow blur radius. |
| `shadowColor` | string, object | — | Shadow color. Same formats as `color`. |
| `paddingActive` | boolean | `false` | Enable padding clipping. |
| `paddingLeft` | number | — | Left padding as percentage of widget width / 200. |
| `paddingRight` | number | — | Right padding as percentage of widget width / 200. |
| `paddingTop` | number | — | Top padding as percentage of widget height / 200. |
| `paddingBottom` | number | — | Bottom padding as percentage of widget height / 200. |

### Font Object

The `font` property is an object with the following structure:

```javascript
{
  fontData: {
    family: "Arial",      // font family name
    weight: "400"          // font weight string (e.g. "400", "700")
  },
  alignment: "left",       // "left", "center", "right"
  italic: false,           // boolean
  underline: false,        // boolean
  bold: false              // boolean (legacy, prefer weight)
}
```

### Color Formats

Same as the Rectangle widget fill color — any tinycolor2-compatible string or RGB object:

```javascript
text.setPayload({ color: "yellow" });
text.setPayload({ color: "#FF00FF" });
text.setPayload({ color: { r: 255, g: 255, b: 0 } });
```

See [Rectangle color and gradient formats](widget-rectangle.md#color--gradient-formats) for details.

### HTML Text

Text wrapped with `<html>...</html>` tags is rendered as innerHTML instead of textContent:

```javascript
text.setPayload({
  text: "<html><span style='color:red'>Hello</span> <b>World</b></html>"
});
```

## Source reference

- Widget code: `app/components/widgets/WidgetTextVer2.js`
- Color parsing: `app/utils/SvgColorUtil.js`
