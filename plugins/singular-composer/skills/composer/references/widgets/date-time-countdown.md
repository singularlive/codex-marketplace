# Date / Time Countdown authoring

Use `date-time-countdown` (widget `3617`) for time remaining until an absolute date, optionally continuing as elapsed time after the date. Run `primitives --primitive date-time-countdown` before creation and `get` before editing. Published version `5` was inspected during development; the loaded schema and instance remain authoritative.

| Property | Value | Purpose |
| --- | --- | --- |
| `anchorTime` | Integer Unix milliseconds, or `""` when unset | Absolute target instant. An unset anchor does not produce valid countdown data. |
| `stopAtZero` | Boolean, default `true` | Clamp at zero after the target; `false` continues elapsed time. |
| `leadingZeros` | Boolean, default `false` | Pad component outputs below ten; totals remain numbers. |
| `composition` | Widget-owned composition ID, initially empty | Visual template, resolved through the owner. |

Resolve the user's date and time zone into an explicit timestamp. Do not pass formatted date strings, seconds, fractional milliseconds, or infer a time zone. Native datetime widget fields permit the empty-string default to become an integer timestamp; the agent rejects other strings and values outside the JavaScript Date range. Empty string clears the date value without deleting the field. A linked Date Time Control Node requires a valid timestamp, so configure the anchor before creating that control.

Example element in a version-2 graphics specification (replace the example target with the requested instant):

```json
{
  "key": "event-countdown",
  "primitive": "date-time-countdown",
  "placement": { "unit": "percent", "left": 10, "top": 10, "width": 80, "height": 20 },
  "properties": { "anchorTime": 1893456000000, "stopAtZero": true, "leadingZeros": true }
}
```

Creation alone is not a finished visible countdown. Read `widget-subcompositions --id <tile-id>` and open the template using `open-widget-subcomposition --id <tile-id> --field composition --create` when empty. Never substitute an ordinary `create-composition` or invent the field's ID. See [widget-subcompositions.md](../widget-subcompositions.md) for navigation and copy-on-exit identity rules. Reapplication with `composition` omitted preserves the existing template.

The widget supplies **Widget Node** outputs to its template, not ordinary Control Nodes: `weeks`, `days`, `hours`, `minutes`, `seconds`, `sign`, and `totalWeeks`, `totalDays`, `totalHours`, `totalMinutes`, `totalSeconds`. Component values are strings at runtime despite the native numeric node declarations; totals are numbers. These are Moment duration components: do not assume `days` means total days or days modulo seven. Use `totalDays` for an unbounded day display. The output also computes `months` and `totalMonths`, but version 5 does not expose them in its native template node schema.

Preserve existing bindings and use [Widget Nodes](../widget-nodes.md) to author new ones. After creating the digit Text tiles, run `widget-nodes` and batch `link-widget-nodes` entries such as `{ "nodeId": "seconds", "tileId": "<seconds-text-id>", "propertyId": "text" }`. Link days/hours/minutes/seconds or the required totals to their corresponding Text fields. Do not create same-named Control Nodes as substitutes or write raw data links. Read back the bindings, exit the template, re-resolve its relationship, and verify several Player frames.

Timing uses `Date.now()` adjusted by the widget SDK's server offset and updates approximately once a second. The future sign is `-` (empty below one second); after expiry it is empty when clamped, or `+` when continuing. Continuing elapsed time includes a one-second adjustment in version 5. `stopAtZero` clamps output but does not stop the timer or repeated messages. There are no start/pause/reset payload buttons, and Composer Timeline seek does not freeze this clock.

Use timed capture and several Player observations to verify ticking, padding, expiry, continuation, template replacement, and resizing. A single frame or successful readback proves neither timing nor correct bindings. Empty or invalid anchors can leave a blank or stale template; dependency loading and clock synchronization also affect rendering. For payload scripting and messages, see [Date / Time Countdown scripting](../composition-scripting/widget-date-time-countdown.md).
