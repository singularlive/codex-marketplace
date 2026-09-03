# Timer widget (widgetId 3558)

For paired creation, Time Control linking, count bounds, and widget-owned template authoring, use [Timer authoring](../widgets/timer.md). The primitive is `timer`. This contract comes from published version `11` and `singularwidgets/Timer/source/output.html`; the live schema and inspected instance remain authoritative.

| Payload field | Type | Meaning |
| --- | --- | --- |
| `timeControl` | object | Native `{UTC,isRunning,value}` state; normally preserve the linked Control Node value. |
| `beginHours`, `beginMinutes`, `beginSeconds` | number | Starting offset components. |
| `endHours`, `endMinutes`, `endSeconds` | number | Optional terminal components. |
| `endActive` | boolean | Clamp at the end value when true. |
| `format` | string | Moment UTC formatting string. |
| `composition` | string | Widget-owned template ID; preserve unless intentionally replacing it. |
| `frequency` | string | Update interval in milliseconds: `"100"`, `"1000"`, or `"60000"`. |
| `leadingZeros` | boolean | Pad component outputs below ten. |

Resolve the inspected widget by name and use public `widget.setPayload` only for deliberate setting changes. Preserve `timeControl` and `composition` in partial updates unless the public Player API is known to merge them for the loaded version. Do not synthesize a running clock from `Date.now()` when the operator-facing Time Control should own start/play/pause/reset.

The widget computes elapsed milliseconds from `timeControl.value` plus the server-adjusted interval since `timeControl.UTC` while running. With an active end, lower begin totals count up and higher-or-equal begin totals count down; the result clamps at the configured end. Without an active end it counts upward from the begin offset. Formatting uses Moment UTC, so component hours wrap while total outputs do not.

The widget supplies its 18 display values through internal `setWidgetNode`; ordinary Control Nodes with the same names do not receive them. Bind `format`, components, angles, percentages, or totals during the paired phase using [Widget Nodes](../widget-nodes.md). Numeric declarations may receive padded strings. Internal Time Control helpers, Moment objects, interval callbacks, and template instances are not composition-script APIs.

Each update emits `{ type: "timeChanged", payload: <Widget Node outputs>, time: <elapsed seconds>, limit: <boolean> }`. The Player composition `message` listener receives it at `params.data` in the `event: "custom"` widget envelope. Filter the observed originating tile and widget IDs. `limit` remains true on repeated clamped updates, so guard state transitions against repetition rather than treating it as a one-shot event.

Changing settings can force an immediate template update; changing `timeControl` drives the timer's native interval behavior. Timeline pause/seek does not pause the Time Control. Verify several Player frames, operator actions, both count directions, end clamping, reset, format changes, subsecond updates, template replacement, and any script message consumer. Stored payload and a single screenshot are not runtime proof.
