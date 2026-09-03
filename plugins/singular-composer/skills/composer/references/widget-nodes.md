# Widget Nodes

Widget Nodes are outputs supplied by an owning widget to its visual template. They are different from Control Nodes, which are public inputs driven by an operator, external SDK, or composition script. For example, Date / Time Countdown sends seconds and other duration components through Widget Nodes; Table sends row values through Control Nodes. Matching names do not connect the two systems.

The owning widget declares the available fields through its native template-edit callback. Composer stores that schema and editor sample payload in the template. The Player supplies the actual values separately to each rendered instance. Do not create, rename, delete, or overwrite Widget Node fields or sample values. The paired commands below edit only native links and cannot run widget code or replace composition JSON.

## Discover the source and target

Open the owning widget's template with `open-widget-subcomposition`, retain its current `identityScope.sessionToken` only for this uninterrupted edit session, then inspect the active scope and its Widget Nodes:

```bash
node scripts/composer-agent.js inspect
node scripts/composer-agent.js widget-nodes --template-session <token>
node scripts/composer-agent.js get --type tile --id <text-tile-id> --template-session <token>
```

`widget-nodes` returns `compositionId`, `sourceCompositionId`, `widgetNode` (`id`, `name`, `fields`), `links`, and `readOnly: true`. Each field has its stable `id`, current model `keyId`, declared type and available schema metadata, and an editor `runtime: {type,value}` sample. `links` contains the active composition's existing Widget Node data and layout links, including native source locations. The flag describes source ownership; links can be authored using the dedicated operations.

Only the declared field `id` is the semantic Widget Node identity used by agent commands. A field's `keyId`, a target element ID, and a template composition ID are current-edit-session handles. Never cache them across closing, reopening, or revisiting a widget-owned template. A `keyId` difference after template copying is not by itself evidence of a broken connection: rediscover the current template, inspect its semantic source and target, and verify the rendered owner in the Player.

An empty field list means that the chosen source has no declared Widget Nodes. Do not invent fields or substitute Control Nodes. After opening a freshly initialized template, allow its native callback to populate the schema, then re-inspect. If fields remain absent, report that the owning widget has not provided a node contract.

For a target inside an ordinary child of the template, keep that child active and inspect the known ancestor explicitly:

```bash
node scripts/composer-agent.js widget-nodes --source-composition <ancestor-composition-id>
```

The default source is `self`. Explicit sources may be the active composition, `root`, or a composition on its current ancestor stack. Siblings, descendants, and unrelated scopes are rejected. Source selection affects the returned fields; the returned links still describe targets in the active composition.

## Link outputs in one batch

Use `link-widget-nodes --file <links.json> --template-session <token>` for one or more assignments. Prefer one batch for related digits. The file may contain a top-level array or an object with `links`:

```json
{
  "links": [
    { "nodeId": "minutes", "tileId": "<minutes-text-id>", "propertyId": "text" },
    { "nodeId": "seconds", "tileId": "<seconds-text-id>", "propertyId": "text" }
  ]
}
```

`nodeId` is the declared field ID, not its title or internal model key. The command resolves `keyId` from the current source schema. Data targets require `tileId` and an exact existing widget field `propertyId`; optional `target: "data"` is the default. Target tiles must be in the active composition. Specify `sourceCompositionId` on an entry only for an intentional ancestor source.

Use the resolved target `tileId` only during the uninterrupted template session in which it was inspected. For a later operation, reopen the template from its owner, locate the target again, and submit the semantic `nodeId` such as `format`; do not replay a stored `keyId`, template ID, or descendant ID.

Native Transform/Effect links use the same bounded layout-property catalog as Control Node links. Use them only when the requested graphic actually needs that output to drive that property:

```json
{
  "links": [{
    "nodeId": "progress",
    "target": "layout",
    "elementType": "group",
    "elementId": "<group-id>",
    "propertyId": "opacity",
    "sourceCompositionId": "<ancestor-composition-id>"
  }]
}
```

This is a shape example, not a claim that Countdown declares `progress`. Discover every source field first. Layout targets use `elementType` (`tile` or `group`) and `elementId`, without `tileId`. Arbitrary layout paths and standalone targets are unsupported.

Compatibility follows Composer's native recommended/compatible field-type table, including selection display format. A numeric Widget Node may drive a `text` or `textarea` field, including ordinary Text and Metric Multi Line Text, whose renderers convert input to text. This preserves padded countdown strings as well as numeric totals. Non-value fields such as info and buttons cannot be linked. Compatible types do not guarantee correct formatting, bounds, or later runtime values: some widgets declare number fields while emitting padded strings. Preserve the widget's contract and verify the output. The agent does not coerce values, clamp values, or write source payloads.

Exact reapplication is idempotent. A regenerated model key for the same source ID/location can be refreshed without replacing another source. An existing different Control Node, Widget Node, or other native link is rejected unless that entry explicitly sets `replace: true`. Replacement changes only the target link; it does not delete the old source field. Do not add replacement merely to bypass an unexplained conflict.

All 1–100 entries are preflighted before mutation. Unknown fields or targets, incompatible types, duplicate targets, invalid sources, and conflicts reject the entire batch. Writes share one undo batch and are rolled back together on failure. Results return each target, source ID/composition, and `status` (`linked`, `replaced`, or `unchanged`). Read `widget-nodes` and each changed target afterward.

## Unlink without changing the source

Use `unlink-widget-nodes --file <links.json>` with the same target/source entries. Omit `replace`; it is not accepted for unlinking. The command removes only a matching Widget Node link. A different source or a Control Node link is a conflict, not permission to remove it. An absent link returns `unchanged`; a removed link returns `unlinked`. Stale source field IDs can be unlinked when the recorded source location and ID still match.

Unlinking preserves the Widget Node schema and payload and leaves native target-value behavior to Composer. Inspect the target before setting an explicit unlinked value. Do not use `delete-control`, direct data updates, or raw data-link writes to disconnect a Widget Node.

## Template lifetime and verification

Follow [widget-subcompositions.md](widget-subcompositions.md): all identities discovered inside a widget-owned template are edit-session scoped, even if some values happen to survive a copy. Resolve the template again from the owner tile and field; rediscover target elements, fields, and links on reopening. Local native links use `self` or `<selfCompId>`, so they follow the copied template. Do not retain an ancestor template ID, descendant target ID, or Widget Node `keyId` across edit sessions.

The template relationship's `mode`/`controls` describe its Control Node contract only. A template labeled `static` there may still contain Widget Nodes and changing output. Inspect `widget-nodes` before deciding that it is static visually.

The script handoff includes a separate `widgetNodes` snapshot of the active source and target links; the helper's fast summary preserves it. This does not put Widget Nodes into `comp.getPayload2()` or make them public controls. Full persisted summaries retain native links but are not the dedicated Widget Node discovery API; use paired `widget-nodes` in the relevant scope. For script work, follow [composition-scripts.md](composition-scripts.md) and the owning widget's payload/message reference.

Model readback proves link persistence, not live behavior. Render the owning widget in the Singular Player, confirm the actual instance receives updates, and observe several frames for ticking or repeated content. An editor sample of `"0"` is not the current countdown value. Use timed capture for continuously changing widgets. After template edits, return to the parent, re-resolve the relationship, and verify the rendered owner. [Date / Time Countdown](widgets/date-time-countdown.md) documents its fields, signs, totals, and padding.
