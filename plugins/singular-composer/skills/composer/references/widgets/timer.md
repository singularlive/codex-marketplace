# Timer authoring

Use `timer` (widget `3558`) for an operator-controlled elapsed timer, count-up, or count-down display. Its catalog metadata loads on demand. Run `primitives --primitive timer` before creation and `get` before editing. Published version `11` was inspected during development; the loaded schema and instance remain authoritative.

| Property | Default | Purpose |
| --- | --- | --- |
| `timeControl` | `{ "UTC": 0, "isRunning": false, "value": 0 }` | Native elapsed-time state. Expose it through an exact `timecontrol` Control Node. |
| `beginHours`, `beginMinutes`, `beginSeconds` | `0` | Starting offset. Seconds may be fractional. |
| `endHours`, `endMinutes`, `endSeconds` | `0` | Optional terminal value. Seconds may be fractional. |
| `endActive` | `false` | Clamp at the end value when true. |
| `format` | `"HH:mm:ss"` | Moment UTC duration-display format. |
| `composition` | `""` | Widget-owned display template, resolved through the owner. |
| `frequency` | `"1000"` | Update interval; catalog choices are string milliseconds `"100"`, `"1000"`, and `"60000"`. |
| `leadingZeros` | `false` | Pad component outputs below ten. |

The timer counts up when the begin total is lower than the enabled end total. It counts down when the begin total is greater than or equal to the enabled end total. With `endActive: false`, elapsed time is added to the begin value without clamping. Catalog minima describe the intended non-negative hour/minute/second inputs, but generic paired validation preserves types and size rather than enforcing every range; use non-negative values and normalize minutes/seconds deliberately.

Prefer a stable-keyed declarative element for settings, but omit `timeControl` and `composition` unless intentionally replacing their inspected complete values:

```json
{
  "key": "game-timer",
  "primitive": "timer",
  "placement": { "unit": "percent", "left": 10, "top": 10, "width": 40, "height": 15 },
  "properties": {
    "beginMinutes": 45,
    "endMinutes": 90,
    "endActive": true,
    "format": "HH:mm:ss",
    "frequency": "1000",
    "leadingZeros": true
  }
}
```

Create one exact linked Time Control for operator actions:

```bash
node scripts/composer-agent.js create-control --name "Game Timer" --node-type timecontrol --tile-id <timer-id> --property timeControl
node scripts/composer-agent.js timer-action --id "Game Timer" --action start
```

Use `timer-action` for shell-safe Timer operation; `control-time` remains a compatibility alias. `start` resets and runs, `play` resumes, `pause` accumulates elapsed milliseconds, and `reset` stops at zero. Reset stamps `UTC` with the current server-adjusted time; `value`, not `UTC`, is the elapsed-time field. Repeating `play` while running or `pause` while stopped is idempotent. Do not fabricate `{UTC,isRunning,value}` with generic payload writes. Read [Control Nodes](../compositions.md#control-nodes) for the native Time Control contract.

Creation alone is not a finished visible timer. Open or create the `composition` widget-owned template, build Text or shape targets, inspect `widget-nodes`, and batch the required native links. Version 11 exposes 18 outputs: `format`, `hours`, `minutes`, `seconds`, `ms`, `secondsMs`, `hoursAngle`, `minutesAngle`, `secondsAngle`, `secondsMsAngle`, `hoursPercent`, `minutesPercent`, `secondsPercent`, `secondsMsPercent`, `totalMinutesSeconds`, `totalHours`, `totalMinutes`, and `totalSeconds`.

Numeric node declarations can emit padded strings when `leadingZeros` is enabled. `hours` wraps on a 24-hour Moment UTC clock while totals remain unbounded; use `totalHours`, `totalMinutes`, or `totalSeconds` for duration totals. `hoursAngle` uses a 12-hour dial; `hoursPercent` uses a 24-hour scale. `secondsMs` and its angle/percent include fractional milliseconds. `totalMinutesSeconds` combines unbounded total minutes with the seconds component.

Read back links, exit the template, and rediscover its copy-on-exit relationship. Verify start/play/pause/reset, count direction, clamping, formatting, padding, subsecond frequency, template replacement, and resize in the Player over multiple frames. Timeline seek does not control the native Time Control. See [Timer scripting](../composition-scripting/widget-timer.md) for payload and message behavior.
