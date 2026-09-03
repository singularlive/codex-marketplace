# Table widget

The supported Table widget is widget `1182`. It uses the composition stored in its `composition` field as a row/item template. Read the table and its template contract before updating it:

```bash
node scripts/composer-agent.js get --type tile --id <table-tile-id>
node scripts/composer-agent.js widget-subcompositions --id <table-tile-id>
```

Create a new managed Table with either `create --primitive table --name <label>` or a declarative element whose primitive is `table`. Creation follows Composer's normal widget defaults; it does not invent or replace the `composition` relationship. If the new Table has no assigned row template, run `open-widget-subcomposition --id <table-tile-id> --field composition --create`. This uses Composer's native hidden widget-template path and leaves the agent inside the new template for ordinary `apply` and Control Node work. Never use `create-composition` for the row template because it creates an ordinary visible parent tile.

## Rendering model

The Table widget creates one host box per visible item. It instantiates and resizes the selected widget sub-composition inside each box, then passes the corresponding row object to the instance with `setControlNode`.

- A dynamic template exposes Control Nodes; every row property is keyed by a control ID.
- A static template exposes no controls; empty row objects can still determine how many repeated instances render.
- `updateStyle: "update"` keeps one template instance per visible line and updates it in place.
- `updateStyle: "timeline"` keeps two instances per line so the old instance can animate out while the new instance animates in.
- `currentPage` is one-based for visible pages. Page `1` shows the first content page.
- `elementsPerPage` controls visible instance count and is capped at 100 by the widget.
- `lineSpacing` is a percentage distributed between visible instances.
- `layoutDirection: "horizontal"` advances hosts down the vertical axis; the alternate value advances them across the horizontal axis. Preserve the live selection values reported by `get`.
- Page transition style and offset stagger instance changes; the row template owns its own In/Out animation.

The widget accepts a direct array or an object with a `content` property, where `content` may itself be an array or a JSON string. The agent writes the canonical object form as a JSON string: `{ "content": [...] }`.

A Table Control Node payload is a direct JSON row array, so it may be linked to the widget's `tableContent` JSON field with `link-table-control`. The row keys and values must still match the widget-owned template's exposed controls. When linked, update the defining Table Control Node rather than calling `update-table`; the stored `tableContent` value remains the unlinked fallback and does not represent the effective linked value.

## Update a table

Use `update-table` for row data and table options instead of manually updating `tableContent`:

```bash
node scripts/composer-agent.js update-table --id <table-tile-id> --file <table.json>
```

Example for a dynamic two-control template:

```json
{
  "rows": [
    { "country": "1. Example", "gdp": "$1.23T" },
    { "country": "2. Sample", "gdp": "$1.00T" }
  ],
  "options": {
    "elementsPerPage": 2,
    "lineSpacing": 4,
    "currentPage": 1,
    "showLayout": false
  }
}
```

Color controls accept any tinycolor2-compatible row value. For example, if the template exposes `rowColor` from a Rectangle's `fillGradient`, a row may contain `"rowColor": "#004aad"` or `"rowColor": { "r": 0, "g": 74, "b": 173, "a": 1 }`. The Rectangle's existing gradient input renders the value as a solid gradient; no full gradient object is required. Stroke fields remain independent, so a shared thin white border can stay static while every row supplies its own fill color.

The command:

1. verifies that the tile is a Table widget;
2. resolves the current `composition` relationship from the owner;
3. validates every row against the template's complete exposed-control contract, rejecting unknown or missing keys and incompatible text, number, image, or tinycolor2-compatible color values;
4. validates supported options and preserves the widget's live runtime types;
5. rejects more than 1,000 rows or serialized content above 32 KB;
6. applies options followed by `tableContent`, rolling earlier fields back if a later update fails;
7. reads the table again and returns verified row count, options, content, and the template relationship.

Supported options are `layoutDirection`, `elementsPerPage`, `lineSpacing`, `updateStyle`, `pageTransitionStyle`, `pageTransitionOffset`, `showLayout`, and `currentPage`. The command never changes the `composition` relationship.

After an update, inspect the table and capture the root preview. If you edit the row template, returning to root intentionally triggers Composer's copy-on-exit lifecycle and replaces the template ID. Discard the edit-session ID, re-read the Table's `composition` relationship, and only then update or capture the table.
