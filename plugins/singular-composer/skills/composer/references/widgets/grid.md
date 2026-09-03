# Grid widget

`grid` creates catalog widget `3284` (observed published version `10`). It repeats a widget-owned cell template in a two-dimensional layout. It is separate from declarative `grids`, which place ordinary primitives at authoring time.

```bash
node scripts/composer-agent.js primitives --primitive grid
node scripts/composer-agent.js create --primitive grid --name "Results Grid"
node scripts/composer-agent.js get --type tile --id <grid-tile-id>
node scripts/composer-agent.js open-widget-subcomposition --id <grid-tile-id> --field composition --create
```

Prefer a stable-keyed `apply` for a complete graphic. Build the cell inside the native hidden template; never substitute `create-composition`. Expose its per-cell fields as Control Nodes, then return to the owning scope and read the Grid again. Template IDs change on exit; use the owner tile plus `composition` field to reopen. Grid sends each item to the template's Control Nodes, not Widget Nodes.

## Content and options

Use `update-grid` to validate the complete item contract before writing:

```bash
node scripts/composer-agent.js update-grid --id <grid-tile-id> --file <grid.json>
```

```json
{
  "rows": [{ "title": "Alpha" }, { "title": "Beta" }, { "title": "Gamma" }],
  "options": {
    "cols": 2, "rows": 2,
    "colsSpacing": 4, "rowsSpacing": 4,
    "updateStyle": "update", "currentPage": 1,
    "pageTransitionStyle": "leftToRight", "pageTransitionOffset": 0,
    "showLayout": false
  }
}
```

Here top-level `rows` is the flat content list; `options.rows` is the visible row count. Replace `title` with the exact template control ID from readback. Each item must contain every exposed control and no unknown keys. Supported item controls are text, image, finite number, and tinycolor2-compatible color, matching `update-table`. Static templates accept empty item objects. An empty content list clears the cells. At most 1,000 items and 32 KB serialized content are accepted.

| Option | Accepted values |
| --- | --- |
| `cols`, `rows` | Integers 1–100; their product must not exceed 1,000 visible cells. |
| `colsSpacing`, `rowsSpacing` | Numbers −100–100, as a total percentage distributed between columns/rows. Negative spacing overlaps cells; 100 can collapse them. |
| `updateStyle` | `update` or `timeline`. |
| `pageTransitionStyle` | `topToBottom`, `bottomToTop`, `leftToRight`, `rightToLeft`, or `random`. |
| `pageTransitionOffset` | 0–30 seconds. |
| `currentPage` | Integer 0–99; 1 is the first content page and 0 hides the content. |
| `showLayout` | Boolean diagnostic cell outlines; normally false. |

The command preserves live runtime types: new Grid numeric fields currently hold strings, so numeric option inputs become strings. For direct `update` or declarative `properties`, preserve the exact type from `get`/`primitives`, for example `"cols": "2"`. Those generic paths enforce types and size, not Grid-specific numeric ranges or content-control compatibility; prefer `update-grid` for content and coordinated options.

The command verifies Grid identity and the current template, writes options before canonical `tableContent` (`JSON.stringify({content: items})`), and rolls earlier writes back in reverse order if a later write fails. Shrinking dimensions precede growing dimensions to avoid temporary allocation overflow. It never changes `composition`. Its response contains `grid`, `widgetSubComposition`, item count `rows`, verified `options`, and `tableContent`. As with Table, this is a CLI transaction across relay writes, not a single editor undo batch; a lost connection can also prevent rollback, which is reported explicitly.

## Rendering and verification

The companion Grid renderer fills down each column before advancing right. Each cell receives one flat-list item. `colsSpacing`/`rowsSpacing` divide the total gap budget between adjacent cells, rather than applying that percentage per gap. Update mode reuses one active instance per cell; Timeline mode alternates two instances for old/new content. The cell template owns its In/Out animation; Grid itself has no custom widget Timeline effect.

Reinspect after updates and verify the Player for cell order, partial pages, page 0, content clearing, negative spacing, and template resize. Template edits require re-resolving the copied relationship. Do not treat source inspection or successful content readback as rendering proof. For runtime payloads use [Grid scripting](../composition-scripting/widget-grid.md).
