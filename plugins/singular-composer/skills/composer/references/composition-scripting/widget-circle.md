# Circle Widget (widgetId 1052)

Payload reference for `widget.setPayload(...)` on Circle widgets.

For paired Composer construction, layout, ring thickness, and declarative specifications, use [Circle authoring](../widgets/circle.md). This document owns the scripting payload contract; the live instance and schema remain authoritative for its loaded version.

## Usage

```javascript
const circle = comp.findWidget("Circle")[0];
circle.setPayload({ fillGradient: "red" });
```

## Payload Properties

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `fillGradient` | string, object | `#cccccc` | Fill color or gradient. See [Rectangle color and gradient formats](widget-rectangle.md#color--gradient-formats). |
| `strokeGradient` | string, object | `"black"` | Outline stroke color or gradient. Same formats as `fillGradient`. |
| `strokeWidth` | number | `0` | Stroke width in pixels. |
| `radius` | number | `100` | Radius as a percentage of the layout size (`0`–`100`). |
| `holeSize` | number | `0` | Donut hole size as a percentage of the radius (`0`–`100`). `0` = solid circle. |
| `startAngle` | number | `0` | Arc start angle in degrees. |
| `endAngle` | number | `0` | Arc end angle in degrees. |
| `keepAspect` | boolean | `false` | If `true`, forces the circle to stay perfectly round regardless of layout aspect ratio. |

### Arc / Wedge

The circle widget draws an arc/wedge from `startAngle` to `endAngle`. On an unrotated widget, zero is at the top and increasing angles advance clockwise. Equal input angles draw nothing. Otherwise, endpoints at or above 360° are reduced modulo 360°, and the end wraps past the start when necessary. Use `startAngle: 0` and `endAngle: 360` for a full circle; larger spans are not necessarily full (for example, 0–450° normalizes to a quarter shape). Set both angles explicitly when a script must not depend on the instance's existing payload, and keep values within the loaded schema's range.

Examples:

```javascript
// full circle
circle.setPayload({ fillGradient: "blue", startAngle: 0, endAngle: 360 });

// half circle (right half)
circle.setPayload({ fillGradient: "green", startAngle: 0, endAngle: 180 });

// donut
circle.setPayload({
  fillGradient: "orange",
  holeSize: 40
});
```

### Color & Gradient Formats

Same as the Rectangle widget — see [Rectangle color and gradient formats](widget-rectangle.md#color--gradient-formats).

## Source reference

- Widget code: `app/components/widgets/WidgetCircle.js`
- Color parsing: `app/utils/SvgColorUtil.js`
