# Bodymovin: Lottie assets on the Composer Timeline

Use `bodymovin` for an existing Bodymovin/Lottie JSON animation asset. It creates widget `3367` through Composer's normal widget path. [Bodymovin Loop](bodymovin-loop.md) (`3783`) is the separate `bodymovin-loop` primitive for continuous playback.

Before authoring, run `primitives --primitive bodymovin`; for an existing tile, also run `get --type tile --id <id>`. The loaded schema and current values are authoritative. The published version inspected during development was `17`, with one text field, `bodymovinJson`, defaulting to an empty string.

## Asset and layout

`bodymovinJson` is a **URL string**, not inline JSON, an object, or a local file path. Use a user-provided or approved hosted Lottie JSON asset accessible to the Player, including any referenced images or fonts. Do not invent a production URL, upload files implicitly, or treat this widget as an SVG/JavaScript injection path. Empty input supplies no animation; successful model readback does not prove that an asset loaded.

The widget uses Lottie's SVG renderer, with autoplay and looping disabled. The renderer fills the widget container; place and size that container with Composer layout. Standard Text and shape primitives can remain separate for independently editable content.

```json
{
  "version": 2,
  "elements": [{
    "key": "brand-animation",
    "primitive": "bodymovin",
    "name": "Brand animation",
    "placement": {
      "unit": "percent",
      "left": 10, "top": 10, "width": 30, "height": 30
    },
    "properties": {
      "bodymovinJson": "https://example.com/approved-animation.json"
    }
  }]
}
```

Replace the example URL before applying. Validate the specification, apply it, and read back the resulting tile and exact URL. Refinements retain the stable element key and use the same bounded validation and atomic rollback contract as other primitives. The normal 32 KB per-value limit applies. A public URL control uses type `text`, matching this widget field; do not infer `json` or `jsonfile` from the asset extension. For linked fields, update the defining Control Node instead of writing directly to the tile.

## Timeline setup and verification

Agent-created primitives start with both Timeline effects set to `none`, including Bodymovin. Supplying the asset URL alone does not configure playback. Inspect `timeline-animations`, then assign the catalog's `widget` effect with a positive duration:

```bash
node scripts/composer-agent.js set-timeline-animation --id <tile-id> --timeline In --effect widget --start 0 --duration 1
```

Use `set-timeline-animations` for coordinated assignments. See [compositions.md](../compositions.md) for the motion contract. Re-read effects and keyframes afterward; reattach assignments if a declarative replacement produces a new tile ID.

The source maps the Lottie frame range onto the Composer effect duration, changing playback speed to match. In a one-timeline composition, Out reverses In. With two timelines, the Out callback traverses the same asset in reverse; it does not select a second asset. Source callbacks handle `init`, `start`, `jump`, and `seek`; there is no explicit `stop` handler. Do not promise pause, hot-swap state restoration, or reverse-playback correctness without Player verification for the loaded widget version. Property-change Update animation is unavailable for this custom-animation widget; use Timeline animation instead.

Verify asset loading and representative start, middle, and end frames in the Player. A blank first frame may be intentional; one settled screenshot does not prove motion. Network/CORS failures and missing asset dependencies can leave a correctly stored widget blank. Timeline capture verifies only its documented target scope and clock; it is not a general Lottie load-completion guarantee.

For runtime payload changes, follow [composition-scripts.md](../composition-scripts.md) and [the Bodymovin scripting reference](../composition-scripting/widget-bodymovin.md). Never send script text through the paired editor relay.
