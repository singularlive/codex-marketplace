# Rectangle authoring

Use the `rectangle` primitive for panels, bars, borders, and rounded or beveled boxes. This guide covers paired Composer authoring; shared layout, RGBA colors, and declarative reconciliation rules live in [graphics.md](../graphics.md). Runtime payload changes belong to [composition-scripts.md](../composition-scripts.md).

## Inspect first

After pairing, acquiring a work lease, and inspecting the active composition:

```bash
node scripts/composer-agent.js primitives --primitive rectangle
node scripts/composer-agent.js get --type tile --id <rectangle-tile-id>
node scripts/composer-agent.js control-nodes
```

Skip `get` only for a new Rectangle. The live schema and existing tile version determine available fields, units, choices, and accepted values. Renderer fallbacks are not creation defaults. For a linked property, change the defining Control Node rather than writing widget data directly; see [compositions.md](../compositions.md).

## Geometry and appearance

Tile layout or declarative `placement` sets the bounding box. Widget `properties.width` and `properties.height` scale the shape inside it; they do not resize that box.

| Property | Authoring meaning |
| --- | --- |
| `width`, `height` | Shape dimensions as percentages of the corresponding tile dimensions. Use `100` for both when the shape should fill its box. |
| `pivotX`, `pivotY` | Align the scaled shape inside the tile: horizontal `left`, `center`, or `right`; vertical `top`, `center`, or `bottom`. These are widget alignment choices, not the tile's layout anchor. |
| `bevelSize`, `bevelSizeUnit` | Corner size. The renderer defaults a missing unit to `%`, measured against the full tile width, even for vertical corners or a scaled-down shape. Discover supported unit choices from the schema. |
| `bevelStyle` | `outside` rounds outward corners, `flat` cuts straight chamfers, and `inside` makes concave corners. Use a positive bevel size for these treatments; zero makes square corners. |
| `renderStyle`, `outlineWidth`, `outlineWidthUnit` | `renderStyle: "outline"` adds a hollow center when outline width is positive and both scaled shape dimensions exceed twice that width. A missing unit defaults to `%` of the full tile width. |
| `fillGradient` | Panel fill, or the frame band when rendering an outline. Use RGBA for solid colors. |
| `strokeWidth`, `strokeGradient` | A separate path stroke, with width in widget layout pixels. The renderer subtracts stroke width from the outer path dimensions before stroking; a hollow shape also has an inner stroked boundary. |

Rounded corners are Rectangle configuration, not a separate primitive. Set `bevelStyle: "outside"` and an explicit positive `bevelSize`. Corner size and radius are clamped to half the generated path dimensions. Do not reuse a fixed percentage across differently sized panels when the desired radius is constant; use the live schema's pixel unit when available or calculate the percentage from tile width.

For example, a 400-pixel-wide tile with `bevelSize: 3` in `%` gives a 12-pixel corner before clamping. Reducing widget `width` does not change that percentage's reference width.

An outline band is distinct from a stroke: `outlineWidth` cuts out an inner rectangle, while `strokeWidth` paints along the path boundaries. Keep an outline narrower than half the smaller scaled dimension. At or beyond that limit the renderer omits the hole, leaving a filled shape; it does not produce an empty frame. Keep stroke width below the smaller shape dimension to avoid an empty outer path.

## Declarative example

This version-2 example creates a rounded panel with no hole or stroke. Merge its element into the current specification when refining an existing managed graphic; applying it alone can remove omitted, unlinked declarative elements. Keep the key stable.

```json
{
  "version": 2,
  "elements": [{
    "key": "rounded-panel",
    "primitive": "rectangle",
    "name": "Rounded panel",
    "placement": {
      "unit": "px",
      "left": 80,
      "top": 80,
      "width": 400,
      "height": 120
    },
    "properties": {
      "width": 100,
      "height": 100,
      "bevelStyle": "outside",
      "bevelSize": 3,
      "bevelSizeUnit": "%",
      "outlineWidth": 0,
      "strokeWidth": 0,
      "fillGradient": { "r": 24, "g": 32, "b": 48, "a": 1 }
    }
  }]
}
```

Confirm these fields against the live schema, then validate, apply, and read back using [graphics.md](../graphics.md). For a frame, use the supported `renderStyle: "outline"` with an explicit positive outline width and unit. For a border around a solid panel, keep the hole disabled and configure the stroke.

## Verification and source

Read back placement, shape dimensions, pivot, bevels, outline, stroke, and any defining controls. Capture through [capture.md](../capture.md) when pixels must establish corner shape, band thickness, alignment, or clipping. A Rectangle behind other elements does not clip them; use the managed-group clipping contract in [graphics.md](../graphics.md#managed-group-bounds-and-clipping) when clipping is required.

These behavior notes come from source inspection of `app/components/widgets/WidgetRectangle.js` (`rebuildGeometry` and `generateRectangle`) and `app/utils/SvgColorUtil.js`. They are not live rendering evidence for the paired version; its loaded schema remains authoritative.
