# Widget scripting reference routing

For paired Composer construction and layout, use the separate [widget authoring index](../widgets.md). Each scripting widget document links to its dedicated authoring guide when one exists, or to the index and shared guidance with any creation limits stated explicitly. These links do not change the handoff routes or add supported primitives.

The script handoff and both token-helper summaries expose `widgetReferences`, a compact list of the widget IDs and loaded versions observed in their scope. Each entry has this shape:

```json
{
  "widgetId": 1022,
  "loadedVersions": [4],
  "document": "references/composition-scripting/widget-rectangle.md",
  "referenceStatus": "available",
  "versionPolicy": "live-inspection-authoritative"
}
```

Use `document` to select the payload reference before calling `widget.setPayload(...)`. The document defines the reusable runtime API contract; the composition structure defines the actual instance name, ID, group, and composition scope. Do not copy a complete widget schema or current payload into the handoff.

The current widget documents are keyed by widget ID and are not version-pinned. `loadedVersions` reports the versions actually present so version drift is visible. `versionPolicy: "live-inspection-authoritative"` means the live `get` result and widget schema inspected during the paired phase override a reference when fields, value shapes, or behavior differ. If `referenceStatus` is `missing`, do not infer payload keys: inspect the live schema and runtime implementation, then add a focused widget reference when the contract is established.

The fast handoff lists widgets only in the active composition. `summary --full` rebuilds `widgetReferences` across the token content when a script target or dependency lies outside that scope.

