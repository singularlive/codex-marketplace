# Image authoring

Use the `image` primitive for logos, photos, headshots, sponsor marks, and other image slots. This guide covers paired Composer authoring; shared placement and declarative rules live in [graphics.md](../graphics.md). Runtime payload changes belong to [composition-scripts.md](../composition-scripts.md).

## Inspect first

After pairing, acquiring a work lease, and inspecting the active composition:

```bash
node scripts/composer-agent.js primitives --primitive image
node scripts/composer-agent.js get --type tile --id <image-tile-id>
node scripts/composer-agent.js control-nodes
```

Skip `get` only for a new Image. Use the live schema for field types, available fit choices, and shift bounds. Renderer fallbacks are not Composer's creation defaults. If the image or another requested property is linked, change its defining Control Node instead of writing widget data directly; see [compositions.md](../compositions.md).

## Image and logo placeholders

Whenever a requested graphic includes an image, create an `image` primitive for that intended slot. Do not replace it with a Rectangle, omit it, or invent a logo from text and shapes because the final asset is unavailable.

The asset URL belongs in `properties.image` in a graphics specification, and appears under `data.image` in full `get` output. Unless the user explicitly asks for another image URL, use this default placeholder and no other external URL:

```text
https://app.singular.live/images/default-asset-icon.png
```

A URL supplied by the user, or an explicit request to use a named external URL, authorizes that URL for the requested slot. It does not authorize searching for or substituting unrelated assets. Preserve the stable key and intended final bounds so the image value can be replaced later without rebuilding the layout.

## Fit, alignment, and flipping

Tile layout or declarative `placement` defines the image slot. The widget sizes its image inside that box and clips overflow.

| Property | Authoring meaning |
| --- | --- |
| `image` | Asset URL. A changed URL starts an asynchronous load; successful readback does not establish that the image downloaded or became visible. |
| `objectFit` | `contain` preserves aspect ratio and fits the whole image, leaving space on one axis when ratios differ. `cover` preserves aspect ratio and fills the slot, cropping overflow. Select other modes only when returned by the live schema. |
| `shift` | Alignment along the axis with spare space (`contain`) or overflow (`cover`). The offset is half the size difference multiplied by `1 + shift / 100`; zero centers it. It is not an independent X/Y translation. |
| `flipX`, `flipY` | Boolean horizontal and vertical mirroring of the image inside its slot; the tile bounds do not change. |

Prefer `contain` for a logo whose complete mark must remain visible, and `cover` for a photo intended to fill its frame. For shift values allowed by the schema, `-100` aligns the image's leading edge with the slot's top or left, and `100` aligns its trailing edge with the bottom or right. The affected axis depends on image and slot aspect ratios. When the ratios match, shift has no visible effect.

The renderer handles `contain` and `cover` explicitly using the loaded image's natural dimensions. Its other branch stretches to the slot; that fallback is not permission to invent an enum value such as a CSS fit mode absent from the schema. Choose fit explicitly and verify the final crop with the actual asset.

## Declarative example

This version-2 example reserves a logo slot. Merge the element into the current managed specification when refining an existing graphic; applying it alone can remove omitted, unlinked declarative elements.

```json
{
  "version": 2,
  "elements": [{
    "key": "team-logo",
    "primitive": "image",
    "name": "Team logo placeholder",
    "placement": {
      "unit": "percent",
      "left": 5,
      "top": 5,
      "width": 10,
      "height": 10
    },
    "properties": {
      "image": "https://app.singular.live/images/default-asset-icon.png",
      "objectFit": "contain",
      "shift": 0,
      "flipX": false,
      "flipY": false
    }
  }]
}
```

Confirm the fields against the schema, validate and apply through [graphics.md](../graphics.md), then read back the returned tile ID. Fit and shift affect the image content, not the slot's placement. Keep the slot bounds across later asset replacement, but reconsider fit and shift when the replacement has a different aspect ratio.

## Verification and source

Read back the image property, fit, shift, flips, bounds, and defining controls. Use [capture.md](../capture.md) when verifying visibility, crop, alignment, or quality. The renderer hides a newly assigned image until loading succeeds with usable dimensions and may fade it in. Account for load readiness before diagnosing an empty slot; do not treat a stored URL or an immediate screenshot as proof of successful loading.

Image overflow is clipped to its own rectangular slot. That does not clip sibling elements or make a circular mask. Follow the supported group-clipping workflow in [graphics.md](../graphics.md#managed-group-bounds-and-clipping) for a shared clipped region; do not infer support for disabled image masks.

These notes come from source inspection of `app/components/widgets/WidgetImage.js` (`onSingularValue`, its load handler, `calculateImageLayout`, and `render`). They are not live verification of the paired widget version or of an asset's availability. Live schema discovery and rendered evidence remain authoritative.
