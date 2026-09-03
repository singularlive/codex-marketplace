# Circle authoring

Use the `circle` primitive for disks, ellipses, rings, wedges, and partial rings. This reference covers paired Composer authoring. For runtime payload changes, follow [composition-scripts.md](../composition-scripts.md) and the [Circle scripting reference](../composition-scripting/widget-circle.md).

## Inspect first

After the normal pairing, work-lease, and composition inspection steps:

```bash
node scripts/composer-agent.js primitives --primitive circle
node scripts/composer-agent.js get --type tile --id <circle-tile-id>
node scripts/composer-agent.js control-nodes
```

Skip `get` only when creating a new Circle. The primitive maps to widget `1052`, but the live schema and the existing tile's loaded version remain authoritative for field availability, types, ranges, and current values. Do not treat the renderer's fallback values as Composer's creation defaults. When a requested property is linked, update its defining Control Node instead of writing the widget property directly; see [compositions.md](../compositions.md).

## Geometry and appearance

Position and bounding size belong to tile layout or declarative `placement`. The fields below belong to widget `properties` in a graphics specification; current values appear under `data` in full `get` output.

| Property | Authoring meaning |
| --- | --- |
| `keepAspect` | `true` uses the smaller layout dimension for both axes, keeping the shape round and centered. `false` uses both dimensions independently, allowing an ellipse. |
| `radius` | Percentage scale applied to both shape dimensions after aspect correction. `100` fills the available dimensions before stroke inset; `50` halves them. It is not a pixel radius and does not resize the tile. |
| `holeSize` | Inner radius as a percentage of the outer path radius. `0` makes a disk or wedge; a positive value makes a ring or partial ring. `100` or greater produces no path. |
| `startAngle`, `endAngle` | Angular endpoints in degrees. For an unrotated tile, `0` is the top, `90` the right, `180` the bottom, and `270` the left. Increasing angles advance clockwise. Set both endpoints explicitly for a new shape. |
| `fillGradient` | Fill for the disk, wedge, or ring band. Use an RGBA object for a solid color, following [graphics.md](../graphics.md). |
| `strokeWidth` | Outline width in widget layout pixels. The renderer subtracts this width from both scaled shape dimensions before constructing the path, then strokes that path. Keep it below the smaller scaled dimension to avoid degenerate geometry. |
| `strokeGradient` | Outline color or gradient; visible only with nonzero `strokeWidth`. Use RGBA for a solid outline. |

Use `holeSize` to control a filled ring's thickness. With no stroke, a round shape of outer diameter `D` has band thickness `(D / 2) * (1 - holeSize / 100)`. For example, a 200-pixel diameter with `holeSize: 80` gives a 20-pixel band. Larger hole values make thinner bands.

Stroke follows the shape boundary: on a partial ring it outlines the inner and outer arcs and the radial ends. It is not a separate rounded-cap progress line. The renderer exposes no line-cap property here; do not invent one. Use [AISVG](aisvg.md) when the requested geometry requires an independently stroked open path or rounded arc ends.

## Choose explicit angles

| Shape | `startAngle` | `endAngle` | `holeSize` |
| --- | --- | --- | --- |
| Complete disk | `0` | `360` | `0` |
| Complete ring | `0` | `360` | For example, `80` |
| Right half | `0` | `180` | `0` for a wedge, positive for a band |
| Top half, crossing zero | `270` | `90` | `0` for a wedge, positive for a band |
| Empty shape | Equal endpoints | Equal endpoints | Any |

Equal input angles produce no path. Otherwise, endpoints at or above `360` are reduced modulo `360`, and the end is advanced by one turn when needed to wrap past the start. Use `0` and `360` for a complete shape; do not assume every span of at least one turn stays full. For example, the renderer normalizes `0` to `450` into a quarter shape, not a full circle. Keep authored endpoints within the live schema's range, and use tile rotation when a complete ring needs a different visual origin.

## Declarative example

This version-2 specification authors one static ring. In an existing managed graphic, merge this element into its current specification: applying it alone can remove omitted, unlinked declarative elements. Keep the key stable during refinement.

```json
{
  "version": 2,
  "elements": [
    {
      "key": "status-ring",
      "primitive": "circle",
      "name": "Status ring",
      "placement": {
        "unit": "px",
        "left": 80,
        "top": 80,
        "width": 200,
        "height": 200
      },
      "properties": {
        "keepAspect": true,
        "radius": 100,
        "holeSize": 80,
        "startAngle": 0,
        "endAngle": 360,
        "fillGradient": { "r": 0, "g": 174, "b": 239, "a": 1 },
        "strokeWidth": 0
      }
    }
  ]
}
```

Validate and apply through the workflow in [graphics.md](../graphics.md), then read the returned tile ID with `get`. For related background and foreground rings, author both together with matching placement, aspect, radius, and hole values; place the foreground later in the element array. A static partial ring needs only different endpoints. A live metric requires the separate scripting workflow.

## Verification and source

Read back the changed geometry, fill, stroke, and any defining controls. When appearance is the acceptance question, capture and inspect the result using [capture.md](../capture.md): check roundness, thickness, angular origin and direction, clipping, and outline behavior. A stored value alone does not prove rendering, and a static capture does not prove scripted progress.

These geometry notes come from repository source inspection of `app/components/widgets/WidgetCircle.js` (`rebuildGeometry`, `polarToCartesian`, and `generateArc`) and `app/utils/SvgColorUtil.js`. They are not a live verification of the paired widget version. The renderer supplies behavior, while Composer's loaded widget model supplies the editable schema.
