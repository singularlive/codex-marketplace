# AISVG: agent-authored SVG and widget animation

Use the `aisvg` primitive when the requested artwork or motion cannot be represented cleanly by Composer's Text, Rectangle, Circle, Image, grouping, clipping, and Effect primitives. Typical cases are animated strokes, arbitrary paths, masks, gradients, SVG filters, and tightly coordinated vector effects. Do not use AISVG for ordinary panels, text, logos, or simple shapes that Composer can keep independently editable.

AISVG is internal widget `4763`. Its only widget-data field is the free-text field `SVGJSON`. Always inspect the live schema first:

```bash
node scripts/composer-agent.js primitives --primitive aisvg
```

Plain SVG text renders static artwork. Use the version-1 JSON envelope for animation, dynamic text, or dynamic attributes. The internal renderer sanitizes SVG elements and attributes, removes scripts, event handlers, external URLs, `foreignObject`, autonomous SMIL animation, and unsafe CSS. Animation is driven only by the JSON timeline definitions and AISVG's internal finite keyframe interpolator so Composer can start, stop, seek, jump, and reverse it deterministically, including in renderer versions without SVG Web Animations support. Invalid animation entries are skipped with one sanitized browser-console warning per target, keyframe, or unsupported property; malformed top-level input still clears the widget output.

## Version-1 input

```json
{
  "version": 1,
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\">...</svg>",
  "text": {
    "headline": "DYNAMIC TEXT"
  },
  "attributes": {
    "accent": {
      "stroke": "#ffffff",
      "stroke-width": 2
    }
  },
  "timelines": {
    "In": {
      "duration": 1000,
      "animations": []
    },
    "Out": {
      "duration": 600,
      "animations": []
    }
  }
}
```

Rules:

- `version` is optional but, when present, must be `1`.
- `svg` is required in JSON mode. Use a real `viewBox`; the SVG scales to the widget bounds.
- Address an element by its `id` or `data-aisvg-id`. Prefer `data-aisvg-id` so reusable identifiers do not affect paint-server references.
- `text` safely replaces `textContent` for up to 100 targets. This is the preferred dynamic-text mechanism.
- `attributes` sets sanitized SVG attributes for up to 100 targets. Use it for dynamic colors, path data, dimensions, or filter parameters that should change with payload updates rather than timeline time.
- `timelines.In` is the Out-to-In animation. In a one-timeline composition, Composer reverses it for Out.
- Add `timelines.Out` only when Composer's **2 timelines** mode is active and the design needs a distinct In-to-Out animation. AISVG holds the completed In state while driving the Out definition.
- Timeline `duration` and animation `options` are milliseconds. AISVG normalizes the whole declared duration onto the Composer event duration, so resizing the Composer effect stretches or compresses the SVG motion.
- A timeline supports at most 100 animations. Each animation supports 2–100 keyframes and a finite 1–100 iterations.
- Composer-agent authoring uses a 32 KB ceiling for one `SVGJSON` value. The internal widget has a separate 512 KB defensive parser limit for values arriving through other supported Composer paths; that larger internal limit is not the agent authoring contract. Keep markup concise, reuse gradients/filters in `defs`, and avoid generated point clouds.

Each animation has a target, sanitized CSS/SVG keyframes, and timing options:

```json
{
  "target": "outline",
  "keyframes": [
    { "strokeDashoffset": 1 },
    { "strokeDashoffset": 0 }
  ],
  "options": {
    "duration": 900,
    "delay": 100,
    "easing": "cubic-bezier(.2,.8,.2,1)"
  }
}
```

Supported animated style properties are `opacity`, `transform`, `transformOrigin`, `fill`, `fillOpacity`, `stroke`, `strokeOpacity`, `strokeWidth`, `strokeDasharray`, `strokeDashoffset`, `filter`, `clipPath`, `offsetDistance`, `offsetPath`, and `offsetRotate`.

Supported animated SVG-attribute properties are `x`, `y`, `x1`, `y1`, `x2`, `y2`, `cx`, `cy`, `r`, `rx`, `ry`, `width`, `height`, `dx`, `dy`, `rotate`, `stopOffset`, `stopColor`, `stopOpacity`, and `stdDeviation`. They map to native SVG attributes, making basic geometry, gradient-stop, and Gaussian-blur motion independent of CSS Motion Path support. `stopOffset` maps to the SVG `offset` attribute so it does not collide with the keyframe's normalized timing `offset`. Path `d` animation is intentionally unsupported; use transforms, masks, or stroke reveals instead.

Timing supports finite `duration`, `delay`, `iterations`, `iterationStart`, `easing`, and `direction`; fill is always `both` for deterministic seeking. Keyframe `composite` is rejected because AISVG implements replacement interpolation only. Numeric substrings in string values interpolate only when the complete surrounding function and unit structure matches—for example, `translate(0px, 10px)` to `translate(20px, 40px)`. Incompatible strings switch discretely at the endpoint instead of producing an incorrect intermediate value.

For maximum compatibility with older renderers, prefer the portable core: opacity, fill/stroke color and opacity, stroke width/dashes, matching-structure basic transforms, and the native SVG-attribute properties above. Treat CSS `offsetPath`/`offsetDistance`, `transformOrigin`, complex `filter` strings, and `clipPath` interpolation as enhanced properties that require verification in the target renderer.

Geometry and gradient animation use the same keyframe shape:

```json
[
  {
    "target": "pulse",
    "keyframes": [
      { "cx": 80, "r": 4 },
      { "cx": 240, "r": 18 }
    ],
    "options": {
      "duration": 800,
      "easing": "ease-out"
    }
  },
  {
    "target": "gradient-stop",
    "keyframes": [
      { "stopOffset": 0, "stopOpacity": 0.2 },
      { "stopOffset": 0.75, "stopOpacity": 1 }
    ],
    "options": {
      "duration": 800,
      "easing": "linear"
    }
  }
]
```

## Center-out and directional geometry drawing

When the reference shows moving endpoints, animate native geometry attributes instead of approximating the motion with transform scaling. For a horizontal line that draws outward from its center, start `x1` and `x2` at the same coordinate and move them in opposite directions. For a vertical line that draws bottom-up or top-down, hold one endpoint and animate `y1` or `y2`. Split a frame into independently timed SVG segments when its edges appear in distinct phases.

```json
{
  "target": "center-line",
  "keyframes": [
    { "x1": 160, "x2": 160 },
    { "x1": 40, "x2": 280 }
  ],
  "options": { "duration": 400, "easing": "ease-out" }
}
```

Use `strokeDashoffset` for a continuous outline or path-following reveal. Use geometry attributes when the endpoints themselves move; these mechanisms describe different motion and neither is a universal replacement for the other.

## Delayed-segment visibility trap

A zero-length stroked line can still render as a dot, especially with round or square line caps. AISVG uses deterministic `fill: "both"`, so an animation's first keyframe applies before its delay. Collapsing future geometry to one point therefore does not make it visually absent.

When a delayed segment must be hidden, put `opacity: 0` in its first keyframe and change it to `opacity: 1` when drawing begins:

```json
{
  "target": "delayed-segment",
  "keyframes": [
    { "x1": 160, "x2": 160, "opacity": 0 },
    { "x1": 40, "x2": 280, "opacity": 1 }
  ],
  "options": { "delay": 600, "duration": 400, "easing": "ease-out" }
}
```

Capture one state before the delay and one during the draw to confirm that the segment is absent first and visible only as intended.

## Moving-outline pattern

Use normalized path length for a portable draw-on effect. `pathLength="1"` makes dash values independent of the path's pixel length. The following recreates the moving line from the supplied reference as a clockwise outline around a subtitle region; it intentionally omits the clip's final blur.

```json
{
  "version": 1,
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 360\"><path data-aisvg-id=\"outline\" d=\"M 70 252 H 566 V 304 H 70 Z\" pathLength=\"1\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"square\" stroke-linejoin=\"miter\" stroke-dasharray=\"1\" stroke-dashoffset=\"1\"/></svg>",
  "timelines": {
    "In": {
      "duration": 1100,
      "animations": [{
        "target": "outline",
        "keyframes": [
          { "strokeDashoffset": 1 },
          { "strokeDashoffset": 0 }
        ],
        "options": {
          "duration": 1100,
          "easing": "cubic-bezier(.22,.61,.36,1)"
        }
      }]
    }
  }
}
```

In a declarative graphics specification, JSON-stringify the complete AISVG object into `properties.SVGJSON`:

```json
{
  "version": 2,
  "elements": [{
    "key": "moving-outline",
    "primitive": "aisvg",
    "placement": {
      "left": 0,
      "top": 0,
      "width": 100,
      "height": 100
    },
    "properties": {
      "SVGJSON": "{\"version\":1,\"svg\":\"<svg ...>...</svg>\",\"timelines\":{\"In\":{\"duration\":1100,\"animations\":[...]}}}"
    }
  }]
}
```

Keep the outer specification's stable element key across refinement. Keep target names stable inside `SVGJSON` as well.

## Authoring and verification

1. Decide whether standard primitives can preserve the required independent editability. Route to AISVG only for the unsupported vector or motion portion; standard text and images can remain separate Composer elements.
2. Use one SVG `viewBox` matching the design coordinate system. Prefer paths and `defs` over many repeated elements.
3. Give every animated or payload-driven element a stable `data-aisvg-id`.
4. Express motion as paused JSON timeline animations. Do not embed `<animate>`, `<script>`, CSS keyframes, external images, or external paint servers.
5. Validate and apply the containing version-2 graphics specification, then `get` the tile and confirm the exact stored `SVGJSON` string.
6. For visual verification, seek or play the Composer timeline and capture representative start, middle, and end states. A settled capture alone cannot prove a stroke-draw animation.

If invalid input is supplied, AISVG clears its output and writes a sanitized warning to the browser console. Fix the JSON or SVG; do not work around sanitization with executable markup or external URLs.
