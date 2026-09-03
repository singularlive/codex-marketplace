# Grid widget (widgetId 3284)

For paired creation, native template ownership, validated item updates, and option bounds, see [Grid authoring](../widgets/grid.md). The primitive is `grid`; observed published version `10` exposes eleven fields. Live inspection overrides this reference when the loaded version differs.

```javascript
var grid = comp.findWidget('Results Grid')[0];
if (grid) {
  grid.setPayload({
    cols: '2', rows: '2', colsSpacing: '4', rowsSpacing: '4',
    updateStyle: 'update', currentPage: '1',
    pageTransitionStyle: 'leftToRight', pageTransitionOffset: '0',
    showLayout: false,
    tableContent: JSON.stringify({ content: [
      { title: 'Alpha' }, { title: 'Beta' }, { title: 'Gamma' }
    ] })
  });
}
```

Use exact Control Node IDs from the cell template instead of assuming `title` exists. Set public inputs on the owning composition, validate them in its script, and derive the Grid payload. Keep the `composition` relationship established by Composer; do not guess or persist an edit-session template ID. `update-grid` is a paired CLI command and is not a method on the runtime widget.

The localhost-served published v10 output matches `singularwidgets/Grid/source/output.html` after newline normalization. That renderer converts dimension, spacing, and delay inputs to numbers. It accepts a JSON string, direct array, or object with a `content` array (also a stringified array); canonical authoring uses the JSON-string object form above. It instantiates the cell composition and calls its `setControlNode(item)` for each cell. Items fill down a column before moving right. Omitted payload fields preserve current settings; `tableContent: '{"content":[]}'` clears content. Page 1 starts at item zero, page 2 at `cols * rows`, and page 0 hides all cells.

The companion renderer uses template `playTo`/`jumpTo` states internally. Do not invent Grid `start`, `stop`, or Widget Node methods. Timeline mode maintains alternating template instances; update mode changes the active instance in place. `pageTransitionOffset` is a total stagger in seconds; left/right variants change the stagger traversal, not the item layout. Changes to dimensions, template, or update mode may rebuild instances. Window resize propagates cell pixel dimensions to them.

The renderer caps allocations at 1,000 cells but has no complete input validator. Scripts must enforce positive integer dimensions and the same total cap before sending payloads. It also logs malformed content values; do not use sensitive data in debugging fixtures or retain raw browser logs. Template instantiation is asynchronous, so verify initial population and later changes in the actual Player. These source-derived details do not establish equivalence with every deployed widget version.

Use the [composition-script workflow](../composition-scripts.md), then verify a non-square grid, column-first content order, partial and hidden pages, both update styles, template replacement, and resizing. Successful `setPayload` calls alone do not prove rendering.
