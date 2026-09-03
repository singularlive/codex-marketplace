# Current Date and Time authoring

Use `current-date-time` (widget `3616`) for a clock showing the current date or time. Its catalog metadata loads on demand; it is not a built-in toolbox shortcut. Run `primitives --primitive current-date-time` before creation and `get` before editing. Published version `3` was inspected during development; the loaded schema and instance remain authoritative.

| Property | Default | Purpose |
| --- | --- | --- |
| `offset` | `0` (number) | Additional time shift in seconds, including fractions and negative values. |
| `format` | `"HH:mm:ss"` | Moment format string for the formatted output. |
| `composition` | `""` | Widget-owned display template, resolved through the owner. |
| `frequency` | `"1000"` | Update interval in milliseconds; catalog choices are strings `"100"`, `"1000"`, and `"60000"`. |
| `timezone` | `"local"` | Player device time zone, or a fixed UTC offset in minutes. |
| `leadingZeros` | `false` | Pad component values below ten; formatted output uses the format string's own padding. |
| `language` | `"en"` | Catalog locale ID or `"device"` for the Player browser's language. |

The time-zone catalog contains numeric minute offsets alongside `"local"`, while the default runtime value is a string. For a newly created primitive, use a string such as `"0"` for UTC or `"420"` for UTC+07:00 so paired updates preserve that runtime type; the widget parses it numerically. Reinspect an existing instance before changing its type. These are fixed offsets, not IANA zone names or automatic daylight-saving rules. City labels in the catalog do not add seasonal adjustment. Confirm which time basis the user wants; `"local"` follows the playback device, not necessarily the author's machine.

Example element in a version-2 graphics specification:

```json
{
  "key": "clock",
  "primitive": "current-date-time",
  "placement": { "unit": "percent", "left": 10, "top": 10, "width": 80, "height": 20 },
  "properties": {
    "offset": 0,
    "format": "YYYY-MM-DD HH:mm:ss",
    "frequency": "1000",
    "timezone": "0",
    "leadingZeros": true,
    "language": "en"
  }
}
```

Creation alone does not produce a finished visible clock. Use `widget-subcompositions --id <tile-id>`, then `open-widget-subcomposition --id <tile-id> --field composition --create` when empty. Retain the returned `identityScope.sessionToken` only while that template remains open. Create a Text tile inside the template with `--template-session <token>`, run `widget-nodes --template-session <token>`, and use `link-widget-nodes --file <links.json> --template-session <token>` with `{ "nodeId": "format", "tileId": "<text-id>", "propertyId": "text" }`. For separate digits or clock hands, bind the appropriate native outputs. Do not substitute same-named Control Nodes. Read [Widget Nodes](../widget-nodes.md) and [widget-owned templates](../widget-subcompositions.md), exit to the parent, and discard the token before rediscovering the template relationship. Omitting `composition` on reapply preserves it.

The Text ID in that example is valid only for the exact open template session in which it was inspected. After returning to the parent, discard the template ID, Text ID, Widget Node `keyId`, and recorded link location. For any later check or repair, reopen through the Current Date and Time owner tile plus its `composition` field, rediscover the Text and Widget Nodes, and link by semantic `nodeId: "format"`. Never attribute partial or incorrect clock output to an internal-ID change alone; inspect the current link and verify multiple complete values in the Player before changing primitives or adding a script fallback.

Version 3 exposes 19 Widget Nodes: `format`, `years`, `months`, `days`, `hours`, `minutes`, `seconds`, `ms`, `secondsMs`, `hoursAngle12`, `hoursAngle24`, `minutesAngle`, `secondsAngle`, `secondsMsAngle`, `hoursPercent`, `minutesPercent`, `secondsPercent`, `secondsMsPercent`, and `monthName`. Numeric declarations do not guarantee numeric runtime values: padding can produce strings, and `secondsMs` is a string whose milliseconds are not zero-padded. `months` is 1-based; `days` is day of month. `hoursAngle12` can exceed 360 in the afternoon; minute/second angles are stepped, while `secondsMsAngle` includes fractional seconds. `hoursPercent` uses whole hours on a 24-hour scale.

The clock uses browser time plus the SDK's server offset and the requested extra offset. It has no custom Timeline animation, start/pause/reset fields, or countdown expiry event. Timeline seek does not freeze it. Match frequency to the display: minute updates cannot provide a ticking seconds display. Generic paired validation checks runtime types and size limits, not arbitrary selection membership; use the catalog's frequency and language choices.

Verify several displayed changes in the Player for ticking and the requested zone/locale, including rollover when relevant. Wait for the first complete formatted runtime value, then sample at bounded phase-offset times; when possible, allow at least two animation frames after the observed value change before capturing. A frame caught during repaint can differ from the value the user sees continuously, so compare the image with current runtime/DOM evidence and adjacent samples. Treat one isolated blank, partial, or otherwise grossly anomalous frame as inconclusive and retry with a shifted offset; diagnose a rendering or link failure only when it repeats beyond the intended transition or semantic evidence also fails. Inspect formatting, padding, template replacement, and resize behavior separately. Source inspection and stored values do not prove rendered timing, while one screenshot does not prove a runtime failure. See [Current Date and Time scripting](../composition-scripting/widget-current-date-time.md) for payload and message behavior.
