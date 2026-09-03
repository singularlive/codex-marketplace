# Rectangle Widget (widgetId 1022)

Payload reference for `widget.setPayload(...)` on Rectangle widgets.

For paired Composer construction, layout, bevels, outlines, and declarative specifications, use [Rectangle authoring](../widgets/rectangle.md). This document owns the scripting payload contract; the live instance and schema remain authoritative for its loaded version.

## Usage

```javascript
const rect = comp.findWidget("Rectangle")[0];
rect.setPayload({ fillGradient: "yellow" });
```

## Payload Properties

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `fillGradient` | string, object | `#cccccc` | Fill color or gradient. See [Color & Gradient Formats](#color--gradient-formats) below. |
| `strokeGradient` | string, object | `#cccccc` | Outline stroke color or gradient. Same formats as `fillGradient`. The fallback is visible only when `strokeWidth` is greater than `0`. |
| `strokeWidth` | number | `0` | Stroke width in pixels (does not use a unit property — always px). |
| `bevelSize` | number | `0` | Bevel/chamfer corner cut size. |
| `bevelSizeUnit` | string | `"%"` | Unit for `bevelSize`: `"%"` (percent of layout width) or `"px"`. |
| `bevelStyle` | string | `"flat"` | Corner treatment: `"flat"` (chamfer), `"outside"` (rounded out), `"inside"` (rounded in). |
| `outlineWidth` | number | `0` | Width of the outline ring (used when `renderStyle` is `"outline"`). |
| `outlineWidthUnit` | string | `"%"` | Unit for `outlineWidth`: `"%"` or `"px"`. |
| `renderStyle` | string | `"filled"` | Render mode: `"filled"` (solid filled shape) or `"outline"` (hollow ring). Use the live schema value `"filled"`; although the renderer treats any value other than `"outline"` as filled, undocumented aliases are not part of the payload contract. |
| `width` | number | `100` | Rectangle width as a percentage of the layout width (`0`–`100`). |
| `height` | number | `100` | Rectangle height as a percentage of the layout height (`0`–`100`). |
| `pivotX` | string | — | Horizontal anchor: `"left"`, `"center"`, `"right"`. |
| `pivotY` | string | — | Vertical anchor: `"top"`, `"center"`, `"bottom"`. |

### Color & Gradient Formats

The `fillGradient` and `strokeGradient` properties are processed by `SvgColorUtil.convertToGradient()`, which accepts:

#### 1. CSS color string (recommended for solid colors)

Any string parseable by [tinycolor2](https://github.com/bgrins/TinyColor).

```javascript
rect.setPayload({ fillGradient: "yellow" });
rect.setPayload({ fillGradient: "#FFFF00" });
rect.setPayload({ fillGradient: "rgb(255, 255, 0)" });
rect.setPayload({ fillGradient: "rgba(255, 255, 0, 0.8)" });
rect.setPayload({ fillGradient: "hsl(60, 100%, 50%)" });
```

#### 2. RGB object

```javascript
rect.setPayload({ fillGradient: { r: 255, g: 255, b: 0 } });
rect.setPayload({ fillGradient: { r: 255, g: 255, b: 0, a: 0.8 } });
```

#### 3. Color-picker object

```javascript
rect.setPayload({ fillGradient: { color: { r: 255, g: 255, b: 0, a: 1 } } });
```

#### 4. Solid gradient object

```javascript
rect.setPayload({
  fillGradient: {
    type: "solid",
    solidColor: { r: 255, g: 255, b: 0, a: 1 }
  }
});
```

#### 5. Linear gradient object

```javascript
rect.setPayload({
  fillGradient: {
    type: "linear",
    stops: [
      { offset: 0, color: "#ff0000", opacity: 1 },
      { offset: 1, color: "#0000ff", opacity: 1 }
    ],
    angle: 90,
    scale: 100,
    offset: 0,
    keepAspect: false,
    spreadMethod: "pad"
  }
});
```

#### 6. Radial gradient object

```javascript
rect.setPayload({
  fillGradient: {
    type: "radial",
    stops: [
      { offset: 0, color: "#ffffff", opacity: 1 },
      { offset: 1, color: "#000000", opacity: 1 }
    ],
    centerX: 50,
    centerY: 50,
    radius: 50,
    focalAngle: 0,
    focalDistance: 0,
    keepAspect: false,
    spreadMethod: "pad"
  }
});
```

## Source reference

- Widget code: `app/components/widgets/WidgetRectangle.js`
- Color parsing: `app/utils/SvgColorUtil.js`
- Default gradient: `app/utils/Util.js` (`.defaultGradient`)
