# Widget sub-compositions

A widget sub-composition is a composition owned through a widget field whose schema type is `composition`. The widget decides how to instantiate and render it. This is different from an ordinary scene sub-composition tile: it may be repeated, resized, or driven with different data by the owning widget.

## Discover the relationship

Read the owning widget tile before navigation:

```bash
node scripts/composer-agent.js get --type tile --id <widget-tile-id>
node scripts/composer-agent.js widget-subcompositions --id <widget-tile-id>
```

`get` reports `widget.subCompositions`; the dedicated command returns the same relationships without the rest of the widget schema. Each relationship contains:

- `kind: "widget-subcomposition"`;
- the owning `tileId` and active `parentCompositionId`;
- the composition-valued `fieldId` and `fieldTitle`;
- the current `compositionId` and whether it exists;
- `mode: "static"` or `"dynamic"`;
- the dynamic template's ordered `controls`, including each control's `id`, `title`, `type`, current value, and model key.

The relationship mode describes Control Nodes only. A template with `mode: "static"` can still have changing [Widget Node](widget-nodes.md) outputs. Run `widget-nodes` inside it to discover those separate owner-supplied fields and native links.

A template is **dynamic** when its composition exposes Control Nodes. The widget may pass instance-specific values into those controls. A **static** template has no exposed controls; the widget can still instantiate it repeatedly, but there is no per-instance control contract.

Dynamic templates may expose a Rectangle or other Gradient-backed fill as a `color` control. The control initializes from the field's current `solidColor`; instance data may then supply a tinycolor2-compatible string or color object because the existing gradient input converts it to a solid gradient.

## Open safely

Prefer resolving the template from its owning widget rather than retaining a raw composition ID:

```bash
node scripts/composer-agent.js open-widget-subcomposition --id <widget-tile-id>
node scripts/composer-agent.js open-widget-subcomposition --id <widget-tile-id> --field <field-id>
node scripts/composer-agent.js open-widget-subcomposition --id <widget-tile-id> --field <field-id> --create
```

`--field` is required when the widget has more than one composition field. Without `--create`, the command refuses an empty relationship. With `--create`, an empty field is initialized through the same `onEditCompStandalone` workflow as Composer's **Edit** button, producing a widget-owned composition that has no visible parent tile, and the command navigates into it. A non-empty relationship that points to a missing composition is always rejected rather than overwritten. The result reports `created: true` for a newly initialized template together with the authoritative relationship and navigation result.

Do not use `create-composition` to initialize a widget field. That command intentionally creates an ordinary scene sub-composition tile in a group; it is a different ownership model and will render as a parent layer unless separately hidden.

By design, Composer rebuilds a widget sub-composition when its standalone edit session ends: it copies the composition to a new ID, removes the old one, and updates the owning widget field. This copy-on-exit lifecycle makes the composition ID an ephemeral handle for the current template-edit session, not the template's durable identity. The stable relationship is the owning widget tile plus its composition-valued field. After returning to root or otherwise exiting template editing, discard the old ID and re-read the owner or use `open-widget-subcomposition` before every later operation.

The lifetime boundary covers every identity read from inside that template, not only its composition ID. Treat descendant tile/group IDs, Control Node model keys, Widget Node `keyId` values, and recorded link locations as handles for the current uninterrupted edit session. They may remain textually equal after a copy, but an agent must not rely on that. Once the template closes, discard them; reopen through the owner tile plus field, then rediscover the descendants, nodes, and links before another command or diagnosis. Do not use differences between cached and current internal IDs as proof that a runtime link is broken.

Opening or fully inspecting the active template returns `identityScope.sessionToken`. Every later command that reads or changes this template must pass `--template-session <token>`. Composer validates the opaque token against the active owner/template session before executing the command. A missing token returns `WIDGET_TEMPLATE_SESSION_REQUIRED`; a token retained across close, copy, reopen, or another template returns `WIDGET_TEMPLATE_SESSION_STALE`. Use token-free full `inspect` to recover the current token, and token-free `open-composition --id root` to leave safely. The token is not a substitute for rediscovering element and node identities.

Once open, ordinary active-composition commands apply: `inspect`, `get`, `apply`, `control-nodes`, and the other scoped composition operations. Read the Control Nodes before changing a dynamic template. Commands within the same uninterrupted edit session may use the active ID reported by `inspect`. Return to root with `open-composition --id root`, then immediately invalidate that ID and re-read the owner to obtain the rebuilt relationship.

`capture --target active` is widget-aware. Standalone capture follows `activeComposition.widgetSubComposition.widgetTileId` into the owning widget iframe and captures the visually active runtime instance of the template. Paired capture uses Composer's dedicated standalone widget-template canvas. Root capture remains a capture of the full scene and widget-rendered result.

Do not infer widget rendering behavior from the template alone. The owning widget controls instance count, sizing, state, timing, and the values supplied to exposed controls. Use the widget-specific reference when one exists.
